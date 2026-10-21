import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_predictions_endpoint_default(client):
    """Verifies default prediction response schema and types."""
    res = client.get("/api/traffic/predictions")
    assert res.status_code == 200
    data = res.json()

    assert "forecast_available" in data
    assert "data_available" in data
    assert "location" in data
    assert "live_traffic" in data
    assert "predictions" in data

    if data["forecast_available"]:
        fc = data["forecast"]
        assert fc is not None
        assert "predicted_congestion_percent" in fc
        assert "predicted_speed_kmh" in fc
        assert "direction" in fc
        assert fc["direction"] in ["improving", "worsening", "stable"]
        assert "confidence" in fc
        assert 0 <= fc["predicted_congestion_percent"] <= 100

        # Multi-horizon outlooks present
        assert "outlooks" in data
        for h in ["15m", "30m", "60m"]:
            assert h in data["outlooks"]
            assert data["outlooks"][h]["horizon_minutes"] == int(h[:-1])


def test_predictions_supported_horizons(client):
    """Verifies predictions work across 15, 30, and 60 minute horizons."""
    for h in [15, 30, 60]:
        res = client.get(f"/api/traffic/predictions?horizon_minutes={h}")
        assert res.status_code == 200
        data = res.json()
        if data["forecast_available"]:
            assert data["forecast"]["horizon_minutes"] == h


def test_predictions_unsupported_horizon_rejected(client):
    """Verifies unsupported horizons return 400 Bad Request."""
    res = client.get("/api/traffic/predictions?horizon_minutes=45")
    assert res.status_code == 400
    assert "Unsupported horizon" in res.json()["detail"]


def test_prediction_locations_endpoint(client):
    """Verifies /api/traffic/predictions/locations returns coverage list."""
    res = client.get("/api/traffic/predictions/locations")
    assert res.status_code == 200
    data = res.json()
    assert "locations" in data
    assert data["total_locations"] > 0

    loc0 = data["locations"][0]
    assert "city" in loc0
    assert "area" in loc0
    assert "observation_count" in loc0
    assert "has_sufficient_history" in loc0
    assert loc0["has_sufficient_history"] == (loc0["observation_count"] >= 15)


def test_roads_outlook_endpoint(client):
    """Verifies /api/traffic/predictions/roads-outlook returns sorted multi-road comparison."""
    res = client.get("/api/traffic/predictions/roads-outlook?horizon_minutes=15&sort_by=worsening")
    assert res.status_code == 200
    data = res.json()
    assert "roads" in data
    assert data["total_roads"] > 0
    assert data["horizon_minutes"] == 15

    r0 = data["roads"][0]
    assert "road_name" in r0
    assert "current_congestion_percent" in r0
    assert "direction" in r0


def test_prediction_data_status_endpoint(client):
    """Verifies /api/traffic/predictions/data-status returns pipeline health."""
    res = client.get("/api/traffic/predictions/data-status")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "total_cleaned_rows" in data
    assert data["total_cleaned_rows"] > 0
    assert "model_training_status" in data


def test_model_status_endpoint(client):
    """Verifies /api/model/status exposes evaluation metrics and baseline comparisons."""
    res = client.get("/api/model/status")
    assert res.status_code == 200
    data = res.json()
    assert data["is_available"] is True
    meta = data["metadata"]
    assert meta["model_name"] in ["Persistence", "RandomForestRegressor", "HistGradientBoosting", "Ridge"]
    assert "supported_horizons" in meta
    assert set(meta["supported_horizons"]) == {15, 30, 60}
    assert "evaluation_by_horizon" in meta


# =====================================================================
# MUMBAI / CSMT SCENARIO VERIFICATION (Cases A, B, C, D)
# =====================================================================

def test_mumbai_csmt_scenario(client):
    """
    Rigorously verifies behavior for Mumbai/CSMT without fabricating synthetic predictions
    and without substituting Pune observations.
    """
    # 1. Query for CSMT Mumbai
    res = client.get("/api/traffic/predictions?city=Mumbai&area=CSMT")
    assert res.status_code == 200
    data = res.json()

    # Never substitute Pune data!
    assert data["location"]["city"] != "Pune"
    assert "CSMT" in data["location"]["area"] or "Mumbai" in data["location"]["city"]

    # In our dataset, CSMT has 56 observations:
    # Case A: Sufficient history accumulated -> returns genuine prediction with confidence
    if data["data_status"]["has_sufficient_history"]:
        assert data["forecast_available"] is True
        assert data["forecast"] is not None
        assert 0 <= data["forecast"]["predicted_congestion_percent"] <= 100
        assert data["data_status"]["total_observations"] >= 15
    else:
        # Case B: If history had been < 15, must report exact observation count without fake forecast
        assert data["forecast_available"] is False
        assert "Insufficient historical data" in data["message"]


def test_zero_history_unmonitored_location_never_substitutes(client):
    """
    Case C: A location with zero recorded history (e.g., remote coordinates)
    must NOT fabricate predictions or substitute Pune data.
    """
    # Query an unmonitored location (e.g. remote ocean or unmonitored city)
    res = client.get("/api/traffic/predictions?city=Atlantis&area=SunkenHighway&latitude=0.0&longitude=0.0")
    assert res.status_code == 200
    data = res.json()

    # Must NOT substitute Pune
    assert data["location"]["city"] != "Pune"
    assert data["location"]["area"] != "Central Pune"

    # Forecast must be unavailable
    assert data["forecast_available"] is False
    assert data["predictions"] == []
