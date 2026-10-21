from unittest.mock import patch, MagicMock
import pytest

from services.routing_service import calculate_routes_tomtom, _haversine_distance_km


def test_haversine_distance():
    # Distance between Pune Station and Swargate is ~4-5 km
    dist = _haversine_distance_km(18.5284, 73.8743, 18.5018, 73.8586)
    assert 3.0 < dist < 6.0


@patch("services.routing_service.requests.get")
def test_calculate_routes_success(mock_get):
    # Mock successful TomTom calculateRoute response with 2 routes
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            {
                "summary": {
                    "lengthInMeters": 15000,
                    "travelTimeInSeconds": 1800,
                    "noTrafficTravelTimeInSeconds": 1500,
                    "trafficDelayInSeconds": 300,
                },
                "legs": [
                    {
                        "points": [
                            {"latitude": 18.5284, "longitude": 73.8743},
                            {"latitude": 18.5500, "longitude": 73.8000},
                            {"latitude": 18.5913, "longitude": 73.7389},
                        ]
                    }
                ],
                "sections": [
                    {
                        "startPointIndex": 0,
                        "endPointIndex": 1,
                        "sectionType": "TRAFFIC",
                        "simpleCategory": "JAM",
                        "effectiveSpeedInKmh": 12,
                        "delayInSeconds": 150,
                    }
                ],
            },
            {
                "summary": {
                    "lengthInMeters": 17000,
                    "travelTimeInSeconds": 2100,
                    "noTrafficTravelTimeInSeconds": 1800,
                    "trafficDelayInSeconds": 100,
                },
                "legs": [
                    {
                        "points": [
                            {"latitude": 18.5284, "longitude": 73.8743},
                            {"latitude": 18.5600, "longitude": 73.8100},
                            {"latitude": 18.5913, "longitude": 73.7389},
                        ]
                    }
                ],
                "sections": [],
            },
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=18.5284,
        start_lon=73.8743,
        dest_lat=18.5913,
        dest_lon=73.7389,
        preference="fastest",
        include_alternatives=True,
        api_key="mock_key",
    )

    assert len(res["routes"]) >= 2
    r1 = res["routes"][0]
    assert r1["distance_km"] == 15.0
    assert r1["travel_time_seconds"] == 1800
    assert r1["traffic_delay_seconds"] == 300
    assert r1["traffic_available"] is True
    assert r1["is_recommended"] is True
    assert "fastest" in r1["recommendation_reason"].lower()
    assert len(r1["geometry"]) == 3
    assert len(r1["segments"]) > 0


@patch("services.routing_service.requests.get")
def test_calculate_routes_shortest_preference(mock_get):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            {
                "summary": {
                    "lengthInMeters": 20000,
                    "travelTimeInSeconds": 1500,
                    "noTrafficTravelTimeInSeconds": 1400,
                    "trafficDelayInSeconds": 100,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}, {"latitude": 18.59, "longitude": 73.73}]}],
                "sections": [],
            },
            {
                "summary": {
                    "lengthInMeters": 14000,
                    "travelTimeInSeconds": 1900,
                    "noTrafficTravelTimeInSeconds": 1600,
                    "trafficDelayInSeconds": 300,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}, {"latitude": 18.59, "longitude": 73.73}]}],
                "sections": [],
            },
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=18.52,
        start_lon=73.85,
        dest_lat=18.59,
        dest_lon=73.73,
        preference="shortest",
        include_alternatives=True,
        api_key="mock_key",
    )

    # Shortest route (14 km) must be recommended over faster route (20 km)
    assert res["routes"][0]["distance_km"] == 14.0
    assert res["routes"][0]["is_recommended"] is True
    assert "shortest driving distance" in res["routes"][0]["recommendation_reason"].lower()


def test_missing_api_key():
    with pytest.raises(ValueError, match="TomTom API key is required"):
        calculate_routes_tomtom(
            start_lat=18.52,
            start_lon=73.85,
            dest_lat=18.59,
            dest_lon=73.73,
            api_key=None,
        )


@patch("services.routing_service.requests.get")
def test_routing_provider_error(mock_get):
    import requests
    mock_get.side_effect = requests.RequestException("TomTom Gateway Timeout")

    with pytest.raises(RuntimeError, match="TomTom routing request failed"):
        calculate_routes_tomtom(
            start_lat=18.52,
            start_lon=73.85,
            dest_lat=18.59,
            dest_lon=73.73,
            api_key="mock_key",
        )


@patch("services.routing_service.requests.get")
def test_calculate_routes_tomtom_zero_delay_computed_correctly(mock_get):
    """
    When TomTom returns trafficDelayInSeconds=0 but travelTimeInSeconds > noTrafficTravelTimeInSeconds,
    the route must calculate traffic_delay_seconds = travelTime - noTrafficTravelTime.
    For Bandra Kurla to CSMT (Route 1): 1765s vs 1609s => delay = 156s, congestion = 8.8% (Low Congestion).
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            {
                "summary": {
                    "lengthInMeters": 21550,
                    "travelTimeInSeconds": 1765,
                    "noTrafficTravelTimeInSeconds": 1609,
                    "trafficDelayInSeconds": 0,
                },
                "legs": [{"points": [{"latitude": 19.0669, "longitude": 72.8686}, {"latitude": 18.9401, "longitude": 72.8347}]}],
                "sections": [],
            }
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=19.0669,
        start_lon=72.8686,
        dest_lat=18.9401,
        dest_lon=72.8347,
        api_key="mock_key",
        include_alternatives=False,
    )

    r = res["routes"][0]
    assert r["travel_time_seconds"] == 1765
    assert r["free_flow_time_seconds"] == 1609
    assert r["traffic_delay_seconds"] == 156  # 1765 - 1609 = 156 seconds (2 min 36 sec)
    assert r["congestion_percent"] == 8.8
    assert r["traffic_condition"] == "Low Congestion"
    assert r["traffic_available"] is True


@patch("services.routing_service.requests.get")
def test_calculate_routes_zero_delay_ideal_flow(mock_get):
    """When travel time equals free flow time, delay should be 0 and congestion 0%."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            {
                "summary": {
                    "lengthInMeters": 10000,
                    "travelTimeInSeconds": 600,
                    "noTrafficTravelTimeInSeconds": 600,
                    "trafficDelayInSeconds": 0,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}, {"latitude": 18.55, "longitude": 73.87}]}],
                "sections": [],
            }
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=18.52,
        start_lon=73.85,
        dest_lat=18.55,
        dest_lon=73.87,
        api_key="mock_key",
        include_alternatives=False,
    )

    r = res["routes"][0]
    assert r["travel_time_seconds"] == 600
    assert r["free_flow_time_seconds"] == 600
    assert r["traffic_delay_seconds"] == 0
    assert r["congestion_percent"] == 0.0
    assert r["traffic_condition"] == "Low Congestion"
    assert r["traffic_available"] is True


@patch("services.routing_service.requests.get")
def test_calculate_routes_threshold_classifications(mock_get):
    """
    Test application thresholds:
    - Below 30%: Low Congestion
    - 30% to below 60%: Moderate Congestion
    - 60% and above: Heavy Congestion
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            # Route 1: 1000s travel, 750s free-flow -> (1 - 750/1000) = 25.0% -> Low
            {
                "summary": {
                    "lengthInMeters": 15000,
                    "travelTimeInSeconds": 1000,
                    "noTrafficTravelTimeInSeconds": 750,
                    "trafficDelayInSeconds": 250,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}]}],
                "sections": [],
            },
            # Route 2: 1000s travel, 600s free-flow -> (1 - 600/1000) = 40.0% -> Moderate
            {
                "summary": {
                    "lengthInMeters": 16000,
                    "travelTimeInSeconds": 1000,
                    "noTrafficTravelTimeInSeconds": 600,
                    "trafficDelayInSeconds": 400,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}]}],
                "sections": [],
            },
            # Route 3: 1000s travel, 350s free-flow -> (1 - 350/1000) = 65.0% -> Heavy
            {
                "summary": {
                    "lengthInMeters": 17000,
                    "travelTimeInSeconds": 1000,
                    "noTrafficTravelTimeInSeconds": 350,
                    "trafficDelayInSeconds": 650,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}]}],
                "sections": [],
            },
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=18.52,
        start_lon=73.85,
        dest_lat=18.60,
        dest_lon=73.90,
        api_key="mock_key",
        include_alternatives=True,
    )

    routes = res["routes"]
    assert routes[0]["congestion_percent"] == 25.0
    assert routes[0]["traffic_condition"] == "Low Congestion"

    assert routes[1]["congestion_percent"] == 40.0
    assert routes[1]["traffic_condition"] == "Moderate Congestion"

    assert routes[2]["congestion_percent"] == 65.0
    assert routes[2]["traffic_condition"] == "Heavy Congestion"


@patch("services.routing_service.requests.get")
def test_calculate_routes_missing_traffic_data(mock_get):
    """When TomTom does not return free-flow time, traffic should be marked unavailable."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "routes": [
            {
                "summary": {
                    "lengthInMeters": 12000,
                    "travelTimeInSeconds": 1200,
                    "noTrafficTravelTimeInSeconds": None,
                    "trafficDelayInSeconds": None,
                },
                "legs": [{"points": [{"latitude": 18.52, "longitude": 73.85}]}],
                "sections": [],
            }
        ]
    }
    mock_get.return_value = mock_resp

    res = calculate_routes_tomtom(
        start_lat=18.52,
        start_lon=73.85,
        dest_lat=18.60,
        dest_lon=73.90,
        api_key="mock_key",
        include_alternatives=False,
    )

    r = res["routes"][0]
    assert r["free_flow_time_seconds"] is None
    assert r["congestion_percent"] is None
    assert r["traffic_condition"] == "Traffic data unavailable"
    assert r["traffic_available"] is False

