import pandas as pd
import numpy as np
import pytest

from ml.data_prep import (
    load_raw_dataset,
    inspect_dataset_stats,
    construct_prediction_pairs,
    chronological_train_test_split,
    FEATURE_COLUMNS,
)
from ml.predict import TrafficPredictor


@pytest.fixture
def sample_traffic_df():
    """Generates synthetic multi-day traffic observations for 2 roads."""
    records = []
    base_time = pd.Timestamp("2026-10-15 08:00:00+05:30")
    for road in ["Central Pune", "Hinjawadi"]:
        base_ff = 50.0 if road == "Central Pune" else 60.0
        for i in range(40):
            t = base_time + pd.Timedelta(minutes=5 * i)
            # Speed varies realistically
            speed = base_ff - 10.0 + (5.0 if i % 2 == 0 else -5.0)
            congestion = round(max(0.0, 100.0 * (1.0 - speed / base_ff)), 1)
            records.append(
                {
                    "timestamp": t.isoformat(),
                    "city": "Pune",
                    "area": road,
                    "latitude": 18.5204 if road == "Central Pune" else 18.5913,
                    "longitude": 73.8567 if road == "Central Pune" else 73.7389,
                    "current_speed_kmh": speed,
                    "free_flow_speed_kmh": base_ff,
                    "current_travel_time_seconds": 300,
                    "free_flow_travel_time_seconds": 250,
                    "confidence": 0.9,
                    "congestion_percent": congestion,
                }
            )
    return pd.DataFrame(records)


def test_inspect_dataset_stats(sample_traffic_df):
    sample_traffic_df["dt"] = pd.to_datetime(sample_traffic_df["timestamp"])
    stats = inspect_dataset_stats(sample_traffic_df)
    assert stats["total_rows"] == 80
    assert stats["unique_roads"] == 2
    assert stats["roads_with_repeated_observations"] == 2
    assert stats["has_sufficient_history"] is True


def test_target_construction_and_no_future_leakage(sample_traffic_df):
    sample_traffic_df["dt"] = pd.to_datetime(sample_traffic_df["timestamp"])
    pairs = construct_prediction_pairs(sample_traffic_df, target_horizon_min=15)
    assert not pairs.empty
    assert len(pairs) > 30

    # Verify no future leakage: for every sample, target timestamp is strictly after current timestamp
    for _, row in pairs.iterrows():
        assert row["target_timestamp"] > row["timestamp"]
        diff_min = (row["target_timestamp"] - row["timestamp"]).total_seconds() / 60.0
        assert 10.0 <= diff_min <= 25.0
        # Target speed is physically valid
        assert row["target_speed_15m"] > 0


def test_chronological_split_prevents_temporal_leakage(sample_traffic_df):
    sample_traffic_df["dt"] = pd.to_datetime(sample_traffic_df["timestamp"])
    pairs = construct_prediction_pairs(sample_traffic_df, target_horizon_min=15)
    train_df, test_df = chronological_train_test_split(pairs, test_ratio=0.25)

    assert len(train_df) > 0
    assert len(test_df) > 0
    # Total samples may be less than pairs due to purging boundary overlap (embargo gap)
    assert len(train_df) + len(test_df) <= len(pairs)

    # Maximum timestamp in train must be <= minimum timestamp in test
    assert train_df["timestamp"].max() <= test_df["timestamp"].min()

    # Embargo boundary verification: training targets must never leak into the test evaluation period
    assert train_df["target_timestamp"].max() <= test_df["timestamp"].min()


def test_predictor_segment_inference():
    predictor = TrafficPredictor()
    res = predictor.predict_segment(
        current_speed_kmh=35.0,
        free_flow_speed_kmh=50.0,
        congestion_percent=30.0,
        road_id="Test Road",
    )
    assert "predicted_speed_kmh" in res
    assert "predicted_congestion_percent" in res
    assert res["horizon_minutes"] == 15
    assert res["predicted_speed_kmh"] is not None
    assert 0 <= res["predicted_congestion_percent"] <= 100


def test_predictor_missing_inputs():
    predictor = TrafficPredictor()
    res = predictor.predict_segment(
        current_speed_kmh=None,
        free_flow_speed_kmh=None,
    )
    assert res["model_status"] == "invalid_input"
    assert res["predicted_speed_kmh"] is None
