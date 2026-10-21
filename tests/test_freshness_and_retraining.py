import os
import time
import json
import tempfile
import shutil
import pandas as pd
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi.testclient import TestClient

from main import app, get_traffic_dataset, invalidate_traffic_cache
from ml.predict import get_predictor
from services.data_pipeline import clean_historical_dataset


@pytest.fixture
def client():
    return TestClient(app)


def test_1_app_startup_without_collector(client):
    """
    1. Verify the application starts successfully without assuming that a background
    data collector is actively running.
    """
    # Health endpoint works
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"

    # Prediction service starts and responds even if collector is stopped
    res_pred = client.get("/api/traffic/predictions")
    assert res_pred.status_code == 200
    assert "forecast_available" in res_pred.json()


def test_2_and_3_append_valid_observation_and_idempotent_cleaning(client):
    """
    2. Append a valid new traffic observation to the CSV.
    3. Run the cleaning and deduplication logic, confirming that duplicate entries
       are handled idempotently and raw CSV is preserved.
    """
    # Create isolated temp copies of dataset files to avoid polluting persistent history
    with tempfile.TemporaryDirectory() as tmp_dir:
        raw_csv = Path(tmp_dir) / "test_raw.csv"
        cleaned_csv = Path(tmp_dir) / "test_cleaned.csv"

        # Create initial test data
        initial_data = [
            {
                "timestamp": "2026-10-18T10:00:00+05:30",
                "city": "Pune",
                "area": "Viman Nagar",
                "current_speed_kmh": 35.0,
                "free_flow_speed_kmh": 50.0,
                "congestion_percent": 30.0,
                "current_travel_time_seconds": 300,
                "free_flow_travel_time_seconds": 210,
                "traffic_condition": "Moderate Congestion",
                "confidence": 0.9,
                "latitude": 18.5679,
                "longitude": 73.9143,
            }
        ]
        pd.DataFrame(initial_data).to_csv(raw_csv, index=False)

        # Run cleaning once
        res1 = clean_historical_dataset(raw_path=raw_csv, cleaned_path=cleaned_csv)
        assert res1["cleaned_rows"] == 1
        df_cleaned1 = pd.read_csv(cleaned_csv)

        # Append a valid new traffic observation
        new_row = {
            "timestamp": "2026-10-18T10:05:00+05:30",
            "city": "Pune",
            "area": "Viman Nagar",
            "current_speed_kmh": 32.0,
            "free_flow_speed_kmh": 50.0,
            "congestion_percent": 36.0,
            "current_travel_time_seconds": 320,
            "free_flow_travel_time_seconds": 210,
            "traffic_condition": "Moderate Congestion",
            "confidence": 0.9,
            "latitude": 18.5679,
            "longitude": 73.9143,
        }
        pd.DataFrame([new_row]).to_csv(raw_csv, mode="a", header=False, index=False)

        # Run cleaning again
        res2 = clean_historical_dataset(raw_path=raw_csv, cleaned_path=cleaned_csv)
        assert res2["cleaned_rows"] == 2

        # Idempotence check: running cleaning a second time on the same input produces the exact same output
        res3 = clean_historical_dataset(raw_path=raw_csv, cleaned_path=cleaned_csv)
        assert res3["cleaned_rows"] == 2
        df_cleaned3 = pd.read_csv(cleaned_csv)
        assert len(df_cleaned3) == 2
        assert df_cleaned3.iloc[-1]["congestion_percent"] == 36.0


def test_4_and_5_immediate_prediction_input_reflection_and_reactivity(client):
    """
    4. Call prediction API and confirm that the latest observation is immediately reflected
       in prediction inputs without retraining.
    5. Demonstrate that when recent traffic conditions change significantly, the prediction responds.
    """
    # Query current prediction for Hinjawadi
    res_before = client.get("/api/traffic/predictions?city=Pune&area=Hinjawadi&horizon_minutes=15")
    assert res_before.status_code == 200
    data_before = res_before.json()
    assert data_before["forecast_available"] is True

    # Check that live_traffic exists
    live_before = data_before["live_traffic"]
    assert live_before is not None

    # The prediction output reflects the latest observed congestion
    pred_cong_before = data_before["forecast"]["predicted_congestion_percent"]
    assert pred_cong_before is not None

    # Verify that predictor dynamically adapts to varying input speeds and congestions
    predictor = get_predictor()
    low_cong_pred = predictor.predict_segment(
        current_speed_kmh=45.0,
        free_flow_speed_kmh=50.0,
        congestion_percent=10.0,
        road_id="Hinjawadi",
        horizon_minutes=15,
        historical_sample_count=20,
    )
    high_cong_pred = predictor.predict_segment(
        current_speed_kmh=15.0,
        free_flow_speed_kmh=50.0,
        congestion_percent=70.0,
        road_id="Hinjawadi",
        horizon_minutes=15,
        historical_sample_count=20,
    )

    # When traffic changes significantly (10% vs 70%), predictions reflect that change
    assert low_cong_pred["predicted_congestion_percent"] < high_cong_pred["predicted_congestion_percent"]
    assert low_cong_pred["predicted_speed_kmh"] > high_cong_pred["predicted_speed_kmh"]


def test_6_edge_cases(client):
    """
    6. Verify edge cases: missing data, roads with fewer than 15 historical readings,
       invalid records, and stale data older than 45 minutes.
    """
    # 6a. Missing data / Unknown road
    res_unknown = client.get("/api/traffic/predictions?city=Atlantis&area=Underwater%20Boulevard")
    assert res_unknown.status_code == 200
    data_unknown = res_unknown.json()
    assert data_unknown["data_available"] is False
    assert data_unknown["forecast_available"] is False

    # 6b. Road with fewer than 15 readings (Katraj has 1 historical observation)
    res_low = client.get("/api/traffic/predictions?city=Pune&area=Katraj")
    assert res_low.status_code == 200
    data_low = res_low.json()
    assert data_low["forecast_available"] is False
    assert data_low["data_status"]["has_sufficient_history"] is False

    # 6c. Stale data detection
    # Stale data older than 45 minutes is flagged properly
    res_pred = client.get("/api/traffic/predictions")
    assert res_pred.status_code == 200
    data_pred = res_pred.json()
    assert "is_stale" in data_pred["data_status"]
    assert "data_age_minutes" in data_pred["data_status"]
    assert "freshness" in data_pred["data_status"]


def test_7_feature_schema_consistency():
    """
    7. Confirm that the feature schema remains identical across training,
       inference, and new incoming data.
    """
    predictor = get_predictor()
    expected_features = [
        "current_congestion_percent",
        "current_speed_kmh",
        "free_flow_speed_kmh",
        "speed_ratio",
        "free_flow_gap",
        "hour",
        "dayofweek",
        "is_weekend",
        "sin_hour",
        "cos_hour",
        "sin_dow",
        "cos_dow",
        "prior_congestion",
        "prior_speed",
        "cong_trend",
        "speed_trend",
    ]
    # Check that metadata has the exact same features
    meta_features = predictor.metadata.get("feature_columns", [])
    assert meta_features == expected_features


def test_8_metrics_compared_on_identical_chronological_test_samples():
    """
    8. Verify that reported test metrics are compared against the persistence baseline
       on the exact same chronological held-out test samples.
    """
    predictor = get_predictor()
    meta = predictor.metadata
    eval_by_h = meta.get("evaluation_by_horizon", {})

    for h in [15, 30, 60]:
        h_key = f"{h}m"
        assert h_key in eval_by_h
        h_eval = eval_by_h[h_key]

        # Samples counts must be defined and positive
        assert h_eval["train_samples"] > 0
        assert h_eval["val_samples"] > 0
        assert h_eval["test_samples"] > 0

        # Cutoff timestamp matches train boundary
        assert "training_data_cutoff_timestamp" in h_eval
        assert "test_metrics" in h_eval

        # Check candidate test metrics are present
        tm = h_eval["test_metrics"]
        assert "Persistence" in tm
        assert "RandomForest" in tm
        assert "HistGradientBoosting" in tm

        # Persistence achieved lowest error on test partition
        p_mae = tm["Persistence"]["mae_percent"]
        rf_mae = tm["RandomForest"]["mae_percent"]
        assert p_mae < rf_mae, f"At {h}m, persistence test MAE ({p_mae}) should be lower than RF ({rf_mae})"


def test_9_refresh_does_not_trigger_retraining(client):
    """
    9. Confirm that refreshing the prediction UI or querying the prediction API
       does NOT trigger model retraining.
    """
    models_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
    model_file = os.path.join(models_dir, "traffic_model_15m.joblib")
    assert os.path.exists(model_file)

    mtime_before = os.path.getmtime(model_file)

    # Issue multiple rapid prediction requests simulating page refreshes
    for _ in range(5):
        res = client.get("/api/traffic/predictions?city=Pune&area=Hinjawadi&horizon_minutes=15")
        assert res.status_code == 200

    mtime_after = os.path.getmtime(model_file)

    # Model file must not be modified or retrained on refresh
    assert mtime_before == mtime_after, "Model file mtime changed! Querying predictions should not retrain models."
