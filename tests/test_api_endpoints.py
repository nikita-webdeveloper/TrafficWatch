from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import pytest

from main import app

client = TestClient(app)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "healthy"}


def test_model_status_endpoint():
    resp = client.get("/api/model/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_available" in data
    assert "metadata" in data


def test_routes_endpoint_validation():
    # Identical coordinates
    payload = {
        "source": {"latitude": 18.5204, "longitude": 73.8567},
        "destination": {"latitude": 18.5204, "longitude": 73.8567},
        "preference": "fastest",
    }
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 400
    assert "must be different" in resp.json()["detail"]

    # Invalid latitude
    bad_payload = {
        "source": {"latitude": 999.0, "longitude": 73.8567},
        "destination": {"latitude": 18.5204, "longitude": 73.8567},
    }
    resp = client.post("/api/routes", json=bad_payload)
    assert resp.status_code == 422


@patch("main.calculate_routes_tomtom")
def test_routes_endpoint_success(mock_calc):
    mock_calc.return_value = {
        "routes": [
            {
                "id": "route-1",
                "distance_km": 12.5,
                "travel_time_seconds": 1500,
                "traffic_delay_seconds": 120,
                "traffic_available": True,
                "is_recommended": True,
                "recommendation_reason": "Fastest route",
                "geometry": [[18.52, 73.85], [18.59, 73.73]],
                "segments": [],
                "prediction": {
                    "route_prediction_available": False,
                    "coverage_status": "no_monitored_segments",
                    "coverage_percent": 0.0,
                    "segment_predictions": [],
                },
            }
        ],
        "generated_at": "2026-10-16T12:00:00Z",
        "provider": "TomTom Routing API",
    }

    payload = {
        "source": {"latitude": 18.5204, "longitude": 73.8567, "name": "Start"},
        "destination": {"latitude": 18.5913, "longitude": 73.7389, "name": "Dest"},
        "preference": "fastest",
        "alternatives": True,
    }
    resp = client.post("/api/routes", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["routes"]) == 1
    assert data["routes"][0]["distance_km"] == 12.5


def test_predictions_endpoint():
    resp = client.get("/api/traffic/predictions?city=Pune&area=Central%20Pune&horizon_minutes=15")
    assert resp.status_code == 200
    data = resp.json()
    assert "predictions" in data
    assert "model_name" in data
    assert "model_status" in data


@patch("main.requests.get")
def test_hotspots_endpoint(mock_get):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "flowSegmentData": {
            "frc": "FRC1",
            "currentSpeed": 25,
            "freeFlowSpeed": 50,
            "currentTravelTime": 120,
            "freeFlowTravelTime": 60,
            "confidence": 0.95,
            "coordinates": {
                "coordinate": [
                    {"latitude": 18.5204, "longitude": 73.8567},
                    {"latitude": 18.5214, "longitude": 73.8577},
                ]
            },
        }
    }
    mock_get.return_value = mock_resp

    resp = client.get("/api/traffic/hotspots?latitude=18.5204&longitude=73.8567&city=Pune")
    assert resp.status_code == 200
    data = resp.json()
    assert data["city"] == "Pune"
    assert "hotspots" in data
    assert "total_monitored" in data
    assert "generated_at" in data
    if data["hotspots"]:
        h = data["hotspots"][0]
        assert "name" in h
        assert "congestion_percent" in h
        assert "current_speed_kmh" in h
        assert "free_flow_speed_kmh" in h
        assert "delay_seconds" in h


def test_saved_locations_crud():
    # 1. GET initial list
    resp = client.get("/api/saved-locations")
    assert resp.status_code == 200
    data = resp.json()
    assert "locations" in data
    assert isinstance(data["locations"], list)

    # 2. POST new location
    new_loc = {
        "name": "Bandra Kurla Office",
        "label": "Work",
        "address": "BKC, Bandra East, Mumbai, Maharashtra",
        "city": "Mumbai",
        "area": "Bandra Kurla Complex",
        "latitude": 19.0657,
        "longitude": 72.8687,
    }
    resp = client.post("/api/saved-locations", json=new_loc)
    assert resp.status_code == 200
    created = resp.json()["location"]
    assert created["name"] == "Bandra Kurla Office"
    assert created["label"] == "Work"
    assert created["latitude"] == 19.0657
    loc_id = created["id"]

    # 3. Duplicate check - same coordinates
    resp = client.post("/api/saved-locations", json=new_loc)
    assert resp.status_code == 409
    assert "already saved" in resp.json()["detail"].lower()

    # 4. PUT update location
    update_payload = {
        "name": "BKC Headquarters",
        "label": "Office",
    }
    resp = client.put(f"/api/saved-locations/{loc_id}", json=update_payload)
    assert resp.status_code == 200
    updated = resp.json()["location"]
    assert updated["name"] == "BKC Headquarters"
    assert updated["label"] == "Office"

    # 5. DELETE location
    resp = client.delete(f"/api/saved-locations/{loc_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted_id"] == loc_id

    # 6. Verify deleted
    resp = client.delete(f"/api/saved-locations/{loc_id}")
    assert resp.status_code == 404


