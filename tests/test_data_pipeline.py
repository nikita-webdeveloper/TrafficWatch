import os
import csv
import tempfile
from pathlib import Path
import pytest
import pandas as pd

from services.data_pipeline import (
    validate_reading_fields,
    normalize_city_name,
    normalize_area_name,
    create_location_key,
    clean_historical_dataset,
    process_new_reading,
    get_data_quality_status,
)


def test_normalize_city_and_area():
    assert normalize_city_name("pune") == "Pune"
    assert normalize_city_name("delhi south") == "New Delhi"
    assert normalize_city_name("MUMBAI") == "Mumbai"
    assert normalize_city_name(None) == "Unknown"

    assert normalize_area_name("CSMT, Chhatrapati Shivaji Maharaj Terminus, Mumbai") == "CSMT, Mumbai"
    assert normalize_area_name("Central Pune") == "Central Pune"
    assert normalize_area_name(None) == "Central Road"


def test_create_location_key():
    k1 = create_location_key(18.520412, 73.856743)
    k2 = create_location_key(18.520449, 73.856699)
    # Both round to 18.5204, 73.8567
    assert k1 == k2 == "18.5204,73.8567"

    k3 = create_location_key(18.5913, 73.7389)
    assert k1 != k3


def test_validate_reading_fields():
    # Valid record
    valid_rec = {
        "timestamp": "2026-10-18T10:00:00Z",
        "city": "Pune",
        "area": "Central Pune",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "current_speed_kmh": 25.0,
        "free_flow_speed_kmh": 50.0,
        "congestion_percent": 50.0,
        "confidence": 0.9,
    }
    is_valid, reason, sanitized = validate_reading_fields(valid_rec)
    assert is_valid is True
    assert reason is None
    assert sanitized["city"] == "Pune"
    assert sanitized["current_speed_kmh"] == 25.0

    # Invalid timestamp
    bad_ts = dict(valid_rec, timestamp="invalid-date")
    assert validate_reading_fields(bad_ts)[0] is False

    # Out of range coordinates
    bad_lat = dict(valid_rec, latitude=120.0)
    assert validate_reading_fields(bad_lat)[0] is False

    # Unrealistic speed
    bad_spd = dict(valid_rec, current_speed_kmh=400.0)
    assert validate_reading_fields(bad_spd)[0] is False

    # Out of range congestion is automatically recomputed
    bad_cong = dict(valid_rec, congestion_percent=150.0)
    ok, _, s_cong = validate_reading_fields(bad_cong)
    assert ok is True
    assert 0 <= s_cong["congestion_percent"] <= 100


def test_clean_historical_dataset_preserves_raw_and_deduplicates(tmp_path):
    raw_csv = tmp_path / "raw_traffic.csv"
    cleaned_csv = tmp_path / "cleaned_traffic.csv"

    # Create raw CSV with exact dups, logical dups, and distinct roads at same timestamp
    rows = [
        # Road A at t1
        {"timestamp": "2026-10-18T10:00:00Z", "city": "Pune", "area": "Road A", "latitude": 18.5204, "longitude": 73.8567, "current_speed_kmh": 30.0, "free_flow_speed_kmh": 50.0, "current_travel_time_seconds": 100, "free_flow_travel_time_seconds": 80, "confidence": 0.8, "congestion_percent": 40.0},
        # Exact duplicate of Road A at t1
        {"timestamp": "2026-10-18T10:00:00Z", "city": "Pune", "area": "Road A", "latitude": 18.5204, "longitude": 73.8567, "current_speed_kmh": 30.0, "free_flow_speed_kmh": 50.0, "current_travel_time_seconds": 100, "free_flow_travel_time_seconds": 80, "confidence": 0.8, "congestion_percent": 40.0},
        # Road B at SAME timestamp t1 (MUST NOT BE REMOVED!)
        {"timestamp": "2026-10-18T10:00:00Z", "city": "Pune", "area": "Road B", "latitude": 18.5913, "longitude": 73.7389, "current_speed_kmh": 45.0, "free_flow_speed_kmh": 60.0, "current_travel_time_seconds": 90, "free_flow_travel_time_seconds": 75, "confidence": 0.9, "congestion_percent": 25.0},
        # Conflicting measurement for Road A at t1 with higher confidence
        {"timestamp": "2026-10-18T10:00:05Z", "city": "Pune", "area": "Road A", "latitude": 18.5204, "longitude": 73.8567, "current_speed_kmh": 32.0, "free_flow_speed_kmh": 50.0, "current_travel_time_seconds": 95, "free_flow_travel_time_seconds": 80, "confidence": 0.95, "congestion_percent": 36.0},
        # Road A at t2
        {"timestamp": "2026-10-18T10:15:00Z", "city": "Pune", "area": "Road A", "latitude": 18.5204, "longitude": 73.8567, "current_speed_kmh": 28.0, "free_flow_speed_kmh": 50.0, "current_travel_time_seconds": 105, "free_flow_travel_time_seconds": 80, "confidence": 0.85, "congestion_percent": 44.0},
    ]

    fieldnames = list(rows[0].keys())
    with open(raw_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    raw_before_size = raw_csv.stat().st_size
    raw_before_content = raw_csv.read_text(encoding="utf-8")

    # Run cleaning
    summary = clean_historical_dataset(raw_path=raw_csv, cleaned_path=cleaned_csv)

    # 1. Raw file MUST be strictly preserved (never overwritten or modified)
    assert raw_csv.stat().st_size == raw_before_size
    assert raw_csv.read_text(encoding="utf-8") == raw_before_content

    # 2. Check summary metrics
    assert summary["input_rows"] == 5
    assert summary["exact_duplicates_removed"] == 1
    assert summary["conflicts_resolved"] == 1
    # Cleaned rows: Road A at t1 (resolved to higher confidence speed=32), Road B at t1, Road A at t2 -> 3 rows
    assert summary["cleaned_rows"] == 3

    # 3. Verify Road B at same timestamp was preserved
    cleaned_df = pd.read_csv(cleaned_csv)
    assert len(cleaned_df) == 3
    assert set(cleaned_df["area"].unique()) == {"Road A", "Road B"}

    # 4. Verify conflict resolution kept higher confidence reading
    road_a_t1 = cleaned_df[(cleaned_df["area"] == "Road A") & (cleaned_df["timestamp"].str.contains("10:00"))]
    assert len(road_a_t1) == 1
    assert road_a_t1.iloc[0]["confidence"] == 0.95
    assert road_a_t1.iloc[0]["current_speed_kmh"] == 32.0

    # 5. Idempotence: running cleaning again on raw dataset produces identical output
    summary2 = clean_historical_dataset(raw_path=raw_csv, cleaned_path=cleaned_csv)
    assert summary2["cleaned_rows"] == 3
