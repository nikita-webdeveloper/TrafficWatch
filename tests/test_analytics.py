import csv
import io
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from main import app
from services.analytics_service import (
    load_dataset,
    filter_readings,
    calculate_summary,
    calculate_trends,
    calculate_heatmap,
    calculate_road_comparison,
    calculate_speed_delay_analysis,
    get_paginated_records,
    export_csv_string,
    get_time_of_day_bucket,
    get_severity_bucket,
)

client = TestClient(app)


def test_time_of_day_buckets():
    assert get_time_of_day_bucket(5) == "morning"
    assert get_time_of_day_bucket(11) == "morning"
    assert get_time_of_day_bucket(12) == "afternoon"
    assert get_time_of_day_bucket(16) == "afternoon"
    assert get_time_of_day_bucket(17) == "evening"
    assert get_time_of_day_bucket(20) == "evening"
    assert get_time_of_day_bucket(21) == "night"
    assert get_time_of_day_bucket(23) == "night"
    assert get_time_of_day_bucket(0) == "night"
    assert get_time_of_day_bucket(4) == "night"


def test_severity_buckets():
    assert get_severity_bucket(0.0) == "low"
    assert get_severity_bucket(19.9) == "low"
    assert get_severity_bucket(20.0) == "moderate"
    assert get_severity_bucket(39.9) == "moderate"
    assert get_severity_bucket(40.0) == "high"
    assert get_severity_bucket(59.9) == "high"
    assert get_severity_bucket(60.0) == "severe"
    assert get_severity_bucket(95.0) == "severe"
    assert get_severity_bucket(None) == "unknown"


def test_analytics_filters_endpoint():
    resp = client.get("/api/traffic/analytics/filters")
    assert resp.status_code == 200
    data = resp.json()

    assert "cities" in data
    assert "roads_by_city" in data
    assert "all_roads" in data
    assert "default_city" in data
    assert "total_records" in data
    assert data["total_records"] >= 800

    # Pune must be in cities and default
    city_names = [c["name"] for c in data["cities"]]
    assert "Pune" in city_names
    assert data["default_city"] == "Pune"

    # Verify time-of-day and severity options
    assert len(data["time_of_day_options"]) == 5
    assert len(data["severity_options"]) == 5


def test_analytics_overview_default():
    resp = client.get("/api/traffic/analytics/overview")
    assert resp.status_code == 200
    data = resp.json()

    assert "summary" in data
    assert "trends" in data
    assert "heatmap" in data
    assert "road_comparison" in data
    assert "speed_delay" in data
    assert "active_filters" in data

    summary = data["summary"]
    assert summary["records_analyzed"] >= 800
    assert summary["avg_congestion_percent"] is not None
    assert summary["avg_speed_kmh"] is not None
    assert summary["records_analyzed"] > 0
    assert "peak_traffic_period" in summary

    # Verify heatmap structure
    heatmap = data["heatmap"]
    assert len(heatmap["days"]) == 7
    assert len(heatmap["hours"]) == 24
    assert len(heatmap["cells"]) == 7 * 24
    assert heatmap["observed_cells_count"] > 0
    assert heatmap["unobserved_cells_count"] > 0

    # Ensure unobserved cells have null avg_congestion
    unobserved = [c for c in heatmap["cells"] if c["status"] == "unobserved"]
    assert len(unobserved) > 0
    for c in unobserved:
        assert c["avg_congestion"] is None
        assert c["count"] == 0


def test_analytics_overview_city_filter():
    resp = client.get("/api/traffic/analytics/overview?city=Pune")
    assert resp.status_code == 200
    data = resp.json()

    summary = data["summary"]
    assert summary["records_analyzed"] > 0
    # Every road in road_comparison must belong to Pune
    for r in data["road_comparison"]:
        assert r["city"].lower() == "pune"


def test_analytics_overview_road_filter():
    resp = client.get("/api/traffic/analytics/overview?city=Pune&road=Central%20Pune")
    assert resp.status_code == 200
    data = resp.json()

    summary = data["summary"]
    assert summary["records_analyzed"] > 0
    assert summary["most_congested_road"]["name"] == "Central Pune"


def test_analytics_overview_time_of_day_filter():
    resp = client.get("/api/traffic/analytics/overview?time_of_day=morning")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["records_analyzed"] > 0


def test_analytics_overview_severity_filter():
    resp = client.get("/api/traffic/analytics/overview?severity=low")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["records_analyzed"] > 0
    # If filtered to low (< 20%), average congestion should be < 20%
    if data["summary"]["avg_congestion_percent"] is not None:
        assert data["summary"]["avg_congestion_percent"] < 20.0


def test_analytics_overview_date_range():
    # Test valid sub-range
    resp = client.get("/api/traffic/analytics/overview?start_date=2026-10-16&end_date=2026-10-16")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["records_analyzed"] > 0


def test_analytics_overview_empty_filter():
    # A date with no observations
    resp = client.get("/api/traffic/analytics/overview?start_date=2020-01-01&end_date=2020-01-02")
    assert resp.status_code == 200
    data = resp.json()

    summary = data["summary"]
    assert summary["records_analyzed"] == 0
    assert summary["avg_congestion_percent"] is None
    assert summary["avg_speed_kmh"] is None
    assert summary["peak_traffic_period"] is None
    assert summary["most_congested_road"] is None
    assert len(data["trends"]) == 0
    assert len(data["road_comparison"]) == 0


def test_analytics_records_pagination_and_search():
    # Page 1 with page_size=5
    resp = client.get("/api/traffic/analytics/records?page=1&page_size=5&city=Pune")
    assert resp.status_code == 200
    data = resp.json()

    assert data["page"] == 1
    assert data["page_size"] == 5
    assert len(data["records"]) <= 5
    assert data["total_count"] > 0
    assert data["total_pages"] >= 1

    # Search for specific area
    resp_search = client.get("/api/traffic/analytics/records?search=Bibwewadi")
    assert resp_search.status_code == 200
    data_search = resp_search.json()
    assert data_search["total_count"] > 0
    for r in data_search["records"]:
        assert "bibwewadi" in r["area"].lower() or "bibwewadi" in r["city"].lower()


def test_analytics_records_sorting():
    # Sort by speed ascending
    resp_asc = client.get("/api/traffic/analytics/records?sort_by=current_speed_kmh&sort_order=asc&page_size=20")
    assert resp_asc.status_code == 200
    records_asc = resp_asc.json()["records"]
    speeds_asc = [r["current_speed_kmh"] for r in records_asc if r["current_speed_kmh"] is not None]
    assert speeds_asc == sorted(speeds_asc)

    # Sort by speed descending
    resp_desc = client.get("/api/traffic/analytics/records?sort_by=current_speed_kmh&sort_order=desc&page_size=20")
    assert resp_desc.status_code == 200
    records_desc = resp_desc.json()["records"]
    speeds_desc = [r["current_speed_kmh"] for r in records_desc if r["current_speed_kmh"] is not None]
    assert speeds_desc == sorted(speeds_desc, reverse=True)


def test_analytics_export_csv():
    resp = client.get("/api/traffic/analytics/export?city=Pune")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]

    content = resp.text
    lines = content.strip().split("\r\n") if "\r\n" in content else content.strip().split("\n")
    assert len(lines) > 1

    # Header check
    header = lines[0].split(",")
    assert "timestamp" in header
    assert "city" in header
    assert "area" in header
    assert "current_speed_kmh" in header
    assert "congestion_percent" in header


def test_analytics_service_empty_or_corrupt_data():
    # Test handling of empty list
    summary = calculate_summary([], 0, 0)
    assert summary["records_analyzed"] == 0
    assert summary["avg_congestion_percent"] is None

    trends = calculate_trends([])
    assert trends == []

    heatmap = calculate_heatmap([])
    assert heatmap["observed_cells_count"] == 0
    assert len(heatmap["cells"]) == 168

    roads = calculate_road_comparison([])
    assert roads == []

    speed_delay = calculate_speed_delay_analysis([])
    assert speed_delay["overall_avg_speed"] is None

    csv_data = export_csv_string([])
    assert "timestamp" in csv_data

    # Test filtering with None
    filtered = filter_readings([], city="Pune", road="All", time_of_day="all")
    assert filtered == []
