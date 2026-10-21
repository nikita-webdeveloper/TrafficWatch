"""
TrafficWatch Reliable Traffic Data Pipeline
Handles:
- Raw data preservation (data/live_traffic.csv is never destructively modified).
- Idempotent cleaning and normalization into data/cleaned_traffic.csv.
- Exact duplicate removal and logical duplicate observation resolution.
- Conflict detection and resolution.
- Incremental validation for newly collected observations.
- Data-quality status reporting.
"""

import csv
import logging
import math
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

logger = logging.getLogger("trafficwatch.data_pipeline")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [DataPipeline] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_CSV_FILE = DATA_DIR / "live_traffic.csv"
CLEANED_CSV_FILE = DATA_DIR / "cleaned_traffic.csv"

_pipeline_lock = threading.Lock()

CANONICAL_COLUMNS = [
    "timestamp",
    "city",
    "area",
    "latitude",
    "longitude",
    "current_speed_kmh",
    "free_flow_speed_kmh",
    "current_travel_time_seconds",
    "free_flow_travel_time_seconds",
    "confidence",
    "congestion_percent",
]


def normalize_city_name(city: Optional[str], lat: Optional[float] = None, lon: Optional[float] = None) -> str:
    """Standardizes city names to prevent duplicate categories or invalid UI entries."""
    if city and isinstance(city, str):
        cleaned = city.strip()
        lower = cleaned.lower()
        if "pune" in lower:
            return "Pune"
        if "mumbai" in lower:
            return "Mumbai"
        if "delhi" in lower:
            return "New Delhi"
        if "mulshi" in lower:
            return "Mulshi Subdistrict"
        if "jalgaon" in lower:
            return "Jalgaon"
        if "chalisgaon" in lower:
            return "Chalisgaon"
        if "shimla" in lower:
            return "Shimla"

    # If city is missing, Unknown, or Map selection, resolve from coordinates if available
    if lat is not None and lon is not None:
        try:
            flat = float(lat)
            flon = float(lon)
            if 18.3 <= flat <= 18.7 and 73.6 <= flon <= 74.1:
                return "Pune"
            if 18.8 <= flat <= 19.3 and 72.7 <= flon <= 73.3:
                return "Mumbai"
            if 28.3 <= flat <= 28.9 and 76.9 <= flon <= 77.5:
                return "New Delhi"
            if 20.8 <= flat <= 21.2 and 75.4 <= flon <= 75.8:
                return "Jalgaon"
            if 20.4 <= flat <= 20.6 and 74.9 <= flon <= 75.1:
                return "Chalisgaon"
            if 31.0 <= flat <= 31.3 and 77.0 <= flon <= 77.3:
                return "Shimla"
        except (ValueError, TypeError):
            pass

    return "Unknown"


def normalize_area_name(area: Optional[str], lat: Optional[float] = None, lon: Optional[float] = None) -> str:
    """Standardizes area names and shortens verbose Nominatim addresses while preserving identity."""
    cleaned = area.strip() if area and isinstance(area, str) else ""

    lower = cleaned.lower()
    if "central pune" in lower:
        return "Central Pune"
    if "connaught place" in lower:
        return "Connaught Place"
    if "hinjawadi" in lower:
        return "Hinjawadi"
    if "bibwewadi" in lower:
        return "Bibwewadi"
    if "csmt" in lower or "chhatrapati shivaji maharaj" in lower or "bori bunder" in lower:
        return "CSMT, Mumbai"
    if "sarasbaug" in lower or "swargate" in lower:
        return "Swargate / Sarasbaug"
    if "baner" in lower:
        return "Baner"
    if "shivajinagar" in lower:
        return "Shivajinagar"
    if "katraj" in lower:
        return "Katraj"
    if "fort" in lower:
        return "Fort, Mumbai"

    # Resolve raw coordinate or map selection strings to actual corridors
    if "map selection" in lower or (cleaned and cleaned[0].isdigit() and "," in cleaned):
        if lat is not None and lon is not None:
            try:
                flat = float(lat)
                flon = float(lon)
                if abs(flat - 18.5248) < 0.01 and abs(flon - 73.8428) < 0.01:
                    return "Deccan / Shivajinagar, Pune"
                if abs(flat - 19.0472) < 0.02 and abs(flon - 72.8372) < 0.02:
                    return "Bandra / Mahim, Mumbai"
                if abs(flat - 18.47) < 0.03 and abs(flon - 73.86) < 0.03:
                    return "Bibwewadi Corridor, Pune"
            except (ValueError, TypeError):
                pass
        return "Monitored Corridor"

    # If verbose Nominatim comma-separated address, take first 2 components
    if "," in cleaned and len(cleaned) > 50:
        parts = [p.strip() for p in cleaned.split(",") if p.strip()]
        if len(parts) >= 2:
            return f"{parts[0]}, {parts[1]}"
        return parts[0]

    return cleaned if cleaned else "Central Road"


def create_location_key(lat: float, lon: float, city: Optional[str] = None, area: Optional[str] = None) -> str:
    """
    Creates a stable spatial key rounded to ~11 meters (4 decimal places),
    guaranteeing that separate roads or cities are never accidentally merged.
    """
    lat_r = f"{round(float(lat), 4):.4f}"
    lon_r = f"{round(float(lon), 4):.4f}"
    if city and area:
        return f"{city.strip().lower()}:{area.strip().lower()}:{lat_r},{lon_r}"
    return f"{lat_r},{lon_r}"



def parse_iso_datetime(val: Any) -> Optional[datetime]:
    """Parses timestamps with consistent timezone awareness."""
    if not val:
        return None
    s = str(val).strip()
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def validate_reading_fields(reading: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Strict validation of incoming or historical traffic records.
    Returns (is_valid, error_reason, sanitized_record).
    """
    ts = parse_iso_datetime(reading.get("timestamp"))
    if ts is None:
        return False, "Invalid or missing timestamp", reading

    # Coordinate validation
    try:
        lat = float(reading["latitude"])
        lon = float(reading["longitude"])
        if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
            return False, f"Coordinates out of bounds: ({lat}, {lon})", reading
    except (KeyError, ValueError, TypeError):
        return False, "Missing or invalid latitude/longitude", reading

    # Speed & Congestion validation
    try:
        cur_speed = float(reading["current_speed_kmh"])
        ff_speed = float(reading["free_flow_speed_kmh"])
        if cur_speed < 0 or cur_speed > 250:
            return False, f"Unrealistic current speed: {cur_speed}", reading
        if ff_speed <= 0 or ff_speed > 250:
            return False, f"Invalid free flow speed: {ff_speed}", reading
    except (KeyError, ValueError, TypeError):
        return False, "Missing or non-numeric speed values", reading

    try:
        cong = float(reading.get("congestion_percent", 0.0))
        if cong < 0 or cong > 100:
            # Recompute if out of range or inconsistent
            cong = max(0.0, min(100.0, 100.0 * (1.0 - cur_speed / ff_speed)))
    except (ValueError, TypeError):
        cong = max(0.0, min(100.0, 100.0 * (1.0 - cur_speed / ff_speed)))

    cur_time = reading.get("current_travel_time_seconds")
    ff_time = reading.get("free_flow_travel_time_seconds")
    conf = reading.get("confidence")

    sanitized = {
        "timestamp": ts.isoformat(),
        "city": normalize_city_name(reading.get("city"), lat=lat, lon=lon),
        "area": normalize_area_name(reading.get("area"), lat=lat, lon=lon),
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "current_speed_kmh": round(cur_speed, 1),
        "free_flow_speed_kmh": round(ff_speed, 1),
        "current_travel_time_seconds": int(round(float(cur_time))) if cur_time is not None and not math.isnan(float(cur_time)) else None,
        "free_flow_travel_time_seconds": int(round(float(ff_time))) if ff_time is not None and not math.isnan(float(ff_time)) else None,
        "confidence": round(float(conf), 3) if conf is not None and not math.isnan(float(conf)) else 0.8,
        "congestion_percent": round(cong, 1),
    }

    return True, None, sanitized


def clean_historical_dataset(
    raw_path: Path = RAW_CSV_FILE,
    cleaned_path: Path = CLEANED_CSV_FILE,
) -> Dict[str, Any]:
    """
    Executes a complete, idempotent cleaning pass on the raw dataset.
    Preserves raw_path. Writes the validated, deduplicated records to cleaned_path.
    """
    with _pipeline_lock:
        if not raw_path.exists():
            raise FileNotFoundError(f"Raw dataset not found at {raw_path}")

        raw_df = pd.read_csv(raw_path)
        input_rows = len(raw_df)

        # 1. Exact duplicate rows
        exact_dups = int(raw_df.duplicated().sum())

        validated_records: List[Dict[str, Any]] = []
        invalid_rows = 0

        for _, row in raw_df.iterrows():
            is_valid, reason, rec = validate_reading_fields(row.to_dict())
            if is_valid:
                validated_records.append(rec)
            else:
                invalid_rows += 1

        # 2. Logical deduplication:
        # Key = (location_key, timestamp_truncated_to_minute)
        # Avoid removing readings from different roads at the same timestamp!
        seen_keys: Dict[Tuple[str, str], Dict[str, Any]] = {}
        conflicts_detected = 0
        logical_dups = 0

        for r in validated_records:
            loc_key = create_location_key(r["latitude"], r["longitude"], r.get("city"), r.get("area"))
            ts_key = r["timestamp"][:16]  # Match within same minute
            dedup_key = (loc_key, ts_key)

            if dedup_key in seen_keys:
                existing = seen_keys[dedup_key]
                # Check for conflict: differing speed or congestion
                if abs(existing["current_speed_kmh"] - r["current_speed_kmh"]) > 0.5 or \
                   abs(existing["congestion_percent"] - r["congestion_percent"]) > 1.0:
                    conflicts_detected += 1
                    # Conflict resolution policy: keep record with higher confidence or latest
                    if (r["confidence"] or 0) > (existing["confidence"] or 0):
                        seen_keys[dedup_key] = r
                else:
                    logical_dups += 1
            else:
                seen_keys[dedup_key] = r

        cleaned_records = list(seen_keys.values())

        # Chronological sort
        cleaned_records.sort(key=lambda x: x["timestamp"])

        # Write atomically via temp file to avoid race conditions with concurrent readers
        cleaned_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cleaned_path.with_suffix(".tmp")
        with open(tmp_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CANONICAL_COLUMNS)
            writer.writeheader()
            for row in cleaned_records:
                writer.writerow(row)
        os.replace(tmp_path, cleaned_path)

        summary = {
            "input_rows": input_rows,
            "exact_duplicates_removed": exact_dups,
            "invalid_rows_removed": invalid_rows,
            "logical_duplicates_removed": logical_dups,
            "conflicts_resolved": conflicts_detected,
            "cleaned_rows": len(cleaned_records),
            "cleaned_file": str(cleaned_path),
            "raw_file": str(raw_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(
            f"Cleaned dataset generated: {input_rows} raw -> {len(cleaned_records)} clean "
            f"(Exact dups: {exact_dups}, Invalid rows: {invalid_rows}, Logical dups: {logical_dups}, Conflicts: {conflicts_detected})"
        )

        return summary


def process_new_reading(reading: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Incrementally validates and appends a single newly collected observation
    to data/cleaned_traffic.csv in a thread-safe manner, preventing duplicate insertion.
    """
    is_valid, reason, sanitized = validate_reading_fields(reading)
    if not is_valid:
        return False, f"Validation failed: {reason}"

    with _pipeline_lock:
        if not CLEANED_CSV_FILE.exists():
            clean_historical_dataset()

        # Check against entire canonical history to prevent duplicate entry
        try:
            df = pd.read_csv(CLEANED_CSV_FILE)
            if not df.empty:
                loc_key = create_location_key(sanitized["latitude"], sanitized["longitude"], sanitized.get("city"), sanitized.get("area"))
                ts_min = sanitized["timestamp"][:16]
                ts_match = df["timestamp"].astype(str).str.slice(0, 16) == ts_min
                lat_match = df["latitude"].round(4) == round(sanitized["latitude"], 4)
                lon_match = df["longitude"].round(4) == round(sanitized["longitude"], 4)
                if (ts_match & lat_match & lon_match).any():
                    return False, "Duplicate observation already recorded in canonical cleaned history"
        except Exception as e:
            logger.warning(f"Canonical history check error, proceeding safely: {e}")

        # Append to cleaned CSV
        with open(CLEANED_CSV_FILE, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CANONICAL_COLUMNS)
            writer.writerow(sanitized)

        return True, "Appended to cleaned historical dataset"


def get_data_quality_status() -> Dict[str, Any]:
    """
    Exposes comprehensive dataset quality, coverage periods, and location history stats.
    """
    if not CLEANED_CSV_FILE.exists():
        if RAW_CSV_FILE.exists():
            clean_historical_dataset()
        else:
            return {
                "status": "no_data",
                "message": "No traffic dataset available.",
                "total_rows": 0,
            }

    try:
        df = pd.read_csv(CLEANED_CSV_FILE)
        if df.empty:
            return {"status": "empty", "total_rows": 0}

        df["dt"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.dropna(subset=["dt"]).sort_values("dt").reset_index(drop=True)

        earliest = df["dt"].min().isoformat()
        latest = df["dt"].max().isoformat()
        time_span_h = round((df["dt"].max() - df["dt"].min()).total_seconds() / 3600.0, 1)

        # Freshness calculation
        now = datetime.now().astimezone()
        latest_dt = df["dt"].max()
        if latest_dt.tzinfo is None:
            latest_dt = latest_dt.replace(tzinfo=now.tzinfo)
        age_minutes = round((now - latest_dt).total_seconds() / 60.0, 1)
        freshness_status = "fresh" if age_minutes < 15 else "stale" if age_minutes < 120 else "historical"

        # Unique locations summary
        locations_summary = []
        for (city, area), grp in df.groupby(["city", "area"]):
            if city in ("Unknown", "Map selection"):
                continue
            cnt = len(grp)
            first_ts = grp["dt"].min().isoformat()
            last_ts = grp["dt"].max().isoformat()
            g_sorted = grp.sort_values("dt")
            diffs = g_sorted["dt"].diff().dt.total_seconds() / 60.0
            med_step = round(diffs.median(), 1) if len(diffs) > 1 else None

            locations_summary.append({
                "city": city,
                "area": area,
                "latitude": round(grp["latitude"].iloc[0], 4),
                "longitude": round(grp["longitude"].iloc[0], 4),
                "observation_count": cnt,
                "has_sufficient_history": cnt >= 15,
                "earliest": first_ts,
                "latest": last_ts,
                "median_sampling_interval_min": med_step,
            })

        locations_summary.sort(key=lambda x: x["observation_count"], reverse=True)
        valid_cities = sorted([c for c in df["city"].unique().tolist() if c not in ("Unknown", "Map selection")])

        return {
            "status": "ready",
            "total_cleaned_rows": len(df),
            "earliest_observation": earliest,
            "latest_observation": latest,
            "time_span_hours": time_span_h,
            "data_age_minutes": age_minutes,
            "freshness": freshness_status,
            "unique_cities": valid_cities,
            "unique_locations_count": len(locations_summary),
            "locations": locations_summary,
        }
    except Exception as e:
        logger.error(f"Error computing data quality status: {e}")
        return {"status": "error", "error": str(e)}
