import csv
import io
import math
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_FILE = DATA_DIR / "live_traffic.csv"

# Module-level thread lock and cache
_cache_lock = threading.Lock()
_cached_mtime: Optional[float] = None
_cached_records: List[Dict[str, Any]] = []
_cached_raw_count: int = 0
_cached_corrupted_count: int = 0


def _parse_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


def _parse_int(val: Any) -> Optional[int]:
    f = _parse_float(val)
    return int(round(f)) if f is not None else None


def _parse_iso_datetime(val: str) -> Optional[datetime]:
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    try:
        # Handle ISO with timezone like 2026-10-15T08:49:27+05:30 or Z
        if val.endswith("Z"):
            val = val[:-1] + "+00:00"
        return datetime.fromisoformat(val)
    except (ValueError, TypeError):
        # Fallback to date-only
        try:
            return datetime.strptime(val[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None


def get_time_of_day_bucket(hour: int) -> str:
    """
    Standard TrafficWatch time-of-day buckets:
    - Morning: 05:00 - 11:59 (hours 5..11)
    - Afternoon: 12:00 - 16:59 (hours 12..16)
    - Evening: 17:00 - 20:59 (hours 17..20)
    - Night: 21:00 - 04:59 (hours 21..23, 0..4)
    """
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def get_severity_bucket(congestion: Optional[float]) -> str:
    """
    TrafficWatch congestion severity classification:
    - Low: < 20%
    - Moderate: 20% to < 40%
    - High: 40% to < 60%
    - Severe: >= 60%
    - Unknown/None: unavailable
    """
    if congestion is None or math.isnan(congestion):
        return "unknown"
    if congestion < 20.0:
        return "low"
    elif congestion < 40.0:
        return "moderate"
    elif congestion < 60.0:
        return "high"
    else:
        return "severe"


def load_dataset(force_reload: bool = False) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Thread-safe, cached loader for live_traffic.csv.
    Returns (valid_records, raw_row_count, corrupted_row_count).
    """
    global _cached_mtime, _cached_records, _cached_raw_count, _cached_corrupted_count

    if not CSV_FILE.exists():
        return [], 0, 0

    try:
        current_mtime = CSV_FILE.stat().st_mtime
    except OSError:
        return [], 0, 0

    with _cache_lock:
        if not force_reload and _cached_mtime == current_mtime and _cached_records:
            return list(_cached_records), _cached_raw_count, _cached_corrupted_count

        records: List[Dict[str, Any]] = []
        raw_count = 0
        corrupted_count = 0

        try:
            with open(CSV_FILE, "r", newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row_idx, row in enumerate(reader, start=1):
                    raw_count += 1
                    raw_ts = row.get("timestamp")
                    parsed_dt = _parse_iso_datetime(raw_ts)
                    if not parsed_dt:
                        corrupted_count += 1
                        continue

                    city = (row.get("city") or "Unknown").strip()
                    area = (row.get("area") or "Unknown Area").strip()
                    lat = _parse_float(row.get("latitude"))
                    lon = _parse_float(row.get("longitude"))
                    cur_speed = _parse_float(row.get("current_speed_kmh"))
                    free_speed = _parse_float(row.get("free_flow_speed_kmh"))
                    cur_time = _parse_float(row.get("current_travel_time_seconds"))
                    free_time = _parse_float(row.get("free_flow_travel_time_seconds"))
                    conf = _parse_float(row.get("confidence"))
                    congestion = _parse_float(row.get("congestion_percent"))

                    # If congestion is missing or invalid, calculate using speed if both speeds available
                    if congestion is None and cur_speed is not None and free_speed is not None and free_speed > 0:
                        congestion = round(max(0.0, min(100.0, 100.0 * (1.0 - cur_speed / free_speed))), 1)

                    # Compute delay seconds
                    delay_sec: Optional[float] = None
                    if cur_time is not None and free_time is not None:
                        delay_sec = max(0.0, cur_time - free_time)

                    # Compute speed deficit
                    speed_deficit: Optional[float] = None
                    if free_speed is not None and cur_speed is not None:
                        speed_deficit = max(0.0, free_speed - cur_speed)

                    hour = parsed_dt.hour
                    # Day of week: 0=Monday, 6=Sunday
                    dow = parsed_dt.weekday()
                    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                    day_name = day_names[dow]

                    record = {
                        "id": f"rec-{row_idx}",
                        "timestamp": raw_ts,
                        "datetime": parsed_dt,
                        "date_str": parsed_dt.strftime("%Y-%m-%d"),
                        "city": city,
                        "area": area,
                        "latitude": lat,
                        "longitude": lon,
                        "current_speed_kmh": cur_speed,
                        "free_flow_speed_kmh": free_speed,
                        "current_travel_time_seconds": cur_time,
                        "free_flow_travel_time_seconds": free_time,
                        "delay_seconds": delay_sec,
                        "speed_deficit_kmh": speed_deficit,
                        "confidence": conf,
                        "congestion_percent": congestion,
                        "hour": hour,
                        "day_of_week": dow,
                        "day_name": day_name,
                        "time_of_day": get_time_of_day_bucket(hour),
                        "severity": get_severity_bucket(congestion),
                        "source": "TomTom Flow API Historical Log",
                    }
                    records.append(record)

            # Sort records chronologically
            records.sort(key=lambda r: r["datetime"])

            _cached_mtime = current_mtime
            _cached_records = records
            _cached_raw_count = raw_count
            _cached_corrupted_count = corrupted_count

            return list(_cached_records), _cached_raw_count, _cached_corrupted_count

        except OSError:
            return [], 0, 0


def get_filter_options(records: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Extracts all genuine filter options present in the dataset.
    Guarantees no fabricated cities or roads.
    """
    if records is None:
        records, _, _ = load_dataset()

    if not records:
        return {
            "cities": [],
            "roads_by_city": {},
            "all_roads": [],
            "default_city": "Pune",
            "min_date": None,
            "max_date": None,
            "total_records": 0,
            "time_of_day_options": [
                {"id": "all", "label": "All Day"},
                {"id": "morning", "label": "Morning (05:00 - 11:59)"},
                {"id": "afternoon", "label": "Afternoon (12:00 - 16:59)"},
                {"id": "evening", "label": "Evening (17:00 - 20:59)"},
                {"id": "night", "label": "Night (21:00 - 04:59)"},
            ],
            "severity_options": [
                {"id": "all", "label": "All Severities"},
                {"id": "low", "label": "Low (< 20%)"},
                {"id": "moderate", "label": "Moderate (20% - 39.9%)"},
                {"id": "high", "label": "High (40% - 59.9%)"},
                {"id": "severe", "label": "Severe (≥ 60%)"},
            ],
        }

    cities_counts: Dict[str, int] = {}
    roads_by_city: Dict[str, List[Dict[str, Any]]] = {}
    all_roads_dict: Dict[str, int] = {}

    for r in records:
        c = r["city"]
        a = r["area"]
        cities_counts[c] = cities_counts.get(c, 0) + 1
        all_roads_dict[a] = all_roads_dict.get(a, 0) + 1

        if c not in roads_by_city:
            roads_by_city[c] = {}
        roads_by_city[c][a] = roads_by_city[c].get(a, 0) + 1

    # Format cities list sorted by observation count descending
    cities = [
        {"name": c, "record_count": count}
        for c, count in sorted(cities_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Format roads by city
    formatted_roads_by_city: Dict[str, List[Dict[str, Any]]] = {}
    for c, r_dict in roads_by_city.items():
        formatted_roads_by_city[c] = [
            {"name": r, "record_count": cnt}
            for r, cnt in sorted(r_dict.items(), key=lambda x: x[1], reverse=True)
        ]

    # All roads
    all_roads = [
        {"name": r, "record_count": cnt}
        for r, cnt in sorted(all_roads_dict.items(), key=lambda x: x[1], reverse=True)
    ]

    # Check if Pune is present to make it default
    has_pune = any(c["name"].lower() == "pune" for c in cities)
    default_city = "Pune" if has_pune else (cities[0]["name"] if cities else "")

    min_date = records[0]["date_str"] if records else None
    max_date = records[-1]["date_str"] if records else None

    return {
        "cities": cities,
        "roads_by_city": formatted_roads_by_city,
        "all_roads": all_roads,
        "default_city": default_city,
        "min_date": min_date,
        "max_date": max_date,
        "total_records": len(records),
        "time_of_day_options": [
            {"id": "all", "label": "All Day"},
            {"id": "morning", "label": "Morning (05:00 - 11:59)"},
            {"id": "afternoon", "label": "Afternoon (12:00 - 16:59)"},
            {"id": "evening", "label": "Evening (17:00 - 20:59)"},
            {"id": "night", "label": "Night (21:00 - 04:59)"},
        ],
        "severity_options": [
            {"id": "all", "label": "All Severities"},
            {"id": "low", "label": "Low (< 20%)"},
            {"id": "moderate", "label": "Moderate (20% - 39.9%)"},
            {"id": "high", "label": "High (40% - 59.9%)"},
            {"id": "severe", "label": "Severe (≥ 60%)"},
        ],
    }


def filter_readings(
    records: List[Dict[str, Any]],
    city: Optional[str] = None,
    road: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    time_of_day: Optional[str] = None,
    severity: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Applies all active filters to the records list.
    """
    filtered = records

    # City filter
    if city and city.strip() and city.lower() != "all":
        city_lower = city.strip().lower()
        filtered = [
            r for r in filtered
            if city_lower == r["city"].lower()
            or city_lower in r["city"].lower()
        ]

    # Road / Area filter
    if road and road.strip() and road.lower() != "all":
        road_lower = road.strip().lower()
        filtered = [
            r for r in filtered
            if road_lower == r["area"].lower()
            or road_lower in r["area"].lower()
        ]

    # Start date filter (matches >= start_date)
    if start_date and start_date.strip():
        sd = start_date.strip()
        filtered = [r for r in filtered if r["date_str"] >= sd[:10]]

    # End date filter (matches <= end_date)
    if end_date and end_date.strip():
        ed = end_date.strip()
        filtered = [r for r in filtered if r["date_str"] <= ed[:10]]

    # Time of day filter
    if time_of_day and time_of_day.strip() and time_of_day.lower() != "all":
        tod_lower = time_of_day.strip().lower()
        filtered = [r for r in filtered if r["time_of_day"] == tod_lower]

    # Severity filter
    if severity and severity.strip() and severity.lower() != "all":
        sev_lower = severity.strip().lower()
        filtered = [r for r in filtered if r["severity"] == sev_lower]

    return filtered


def calculate_summary(filtered_records: List[Dict[str, Any]], total_raw_count: int, corrupted_count: int) -> Dict[str, Any]:
    """
    Calculates primary summary cards and metrics from filtered records.
    Never fabricates missing metrics or averages.
    """
    count = len(filtered_records)
    if count == 0:
        return {
            "records_analyzed": 0,
            "total_records_available": total_raw_count,
            "corrupted_records": corrupted_count,
            "avg_congestion_percent": None,
            "avg_speed_kmh": None,
            "avg_free_flow_speed_kmh": None,
            "avg_delay_seconds": None,
            "avg_delay_minutes": None,
            "highest_congestion_percent": None,
            "peak_traffic_period": None,
            "peak_traffic_detail": None,
            "most_congested_road": None,
            "date_range": None,
            "coverage_note": "No observations match the selected filter criteria.",
        }

    # Congestion values
    valid_congestions = [r["congestion_percent"] for r in filtered_records if r["congestion_percent"] is not None]
    avg_congestion = round(sum(valid_congestions) / len(valid_congestions), 1) if valid_congestions else None
    max_congestion = round(max(valid_congestions), 1) if valid_congestions else None

    # Speed values
    valid_speeds = [r["current_speed_kmh"] for r in filtered_records if r["current_speed_kmh"] is not None]
    avg_speed = round(sum(valid_speeds) / len(valid_speeds), 1) if valid_speeds else None

    valid_free_speeds = [r["free_flow_speed_kmh"] for r in filtered_records if r["free_flow_speed_kmh"] is not None]
    avg_free_speed = round(sum(valid_free_speeds) / len(valid_free_speeds), 1) if valid_free_speeds else None

    # Delays
    valid_delays = [r["delay_seconds"] for r in filtered_records if r["delay_seconds"] is not None]
    avg_delay_sec = round(sum(valid_delays) / len(valid_delays), 1) if valid_delays else None
    avg_delay_min = round(avg_delay_sec / 60.0, 1) if avg_delay_sec is not None else None

    # Peak Traffic Period: calculate by grouping by day + hour
    period_groups: Dict[Tuple[str, int], List[float]] = {}
    for r in filtered_records:
        if r["congestion_percent"] is not None:
            key = (r["day_name"], r["hour"])
            if key not in period_groups:
                period_groups[key] = []
            period_groups[key].append(r["congestion_percent"])

    peak_traffic_period = None
    peak_traffic_detail = None
    if period_groups:
        # Find period with highest average congestion (minimum 2 readings for statistical significance)
        best_period = None
        best_avg = -1.0
        best_count = 0

        # Pass 1: periods with >= 2 readings
        for (day, hr), vals in period_groups.items():
            if len(vals) >= 2:
                avg_val = sum(vals) / len(vals)
                if avg_val > best_avg:
                    best_avg = avg_val
                    best_period = (day, hr)
                    best_count = len(vals)

        # Fallback to any period if all have 1 reading
        if best_period is None:
            for (day, hr), vals in period_groups.items():
                avg_val = sum(vals) / len(vals)
                if avg_val > best_avg:
                    best_avg = avg_val
                    best_period = (day, hr)
                    best_count = len(vals)

        if best_period is not None:
            day, hr = best_period
            peak_traffic_period = f"{day} {hr:02d}:00 - {hr+1:02d}:00"
            peak_traffic_detail = f"{round(best_avg, 1)}% avg congestion ({best_count} readings)"

    # Most congested road
    road_groups: Dict[str, List[float]] = {}
    for r in filtered_records:
        if r["congestion_percent"] is not None:
            area = r["area"]
            if area not in road_groups:
                road_groups[area] = []
            road_groups[area].append(r["congestion_percent"])

    most_congested_road = None
    if road_groups:
        sorted_roads = sorted(
            [
                (area, sum(vals) / len(vals), len(vals))
                for area, vals in road_groups.items()
            ],
            key=lambda x: x[1],
            reverse=True,
        )
        top_road = sorted_roads[0]
        most_congested_road = {
            "name": top_road[0],
            "avg_congestion_percent": round(top_road[1], 1),
            "sample_count": top_road[2],
        }

    date_range = {
        "start": filtered_records[0]["timestamp"],
        "end": filtered_records[-1]["timestamp"],
        "days_covered": len(set(r["date_str"] for r in filtered_records)),
    }

    return {
        "records_analyzed": count,
        "total_records_available": total_raw_count,
        "corrupted_records": corrupted_count,
        "avg_congestion_percent": avg_congestion,
        "avg_speed_kmh": avg_speed,
        "avg_free_flow_speed_kmh": avg_free_speed,
        "avg_delay_seconds": avg_delay_sec,
        "avg_delay_minutes": avg_delay_min,
        "highest_congestion_percent": max_congestion,
        "peak_traffic_period": peak_traffic_period,
        "peak_traffic_detail": peak_traffic_detail,
        "most_congested_road": most_congested_road,
        "date_range": date_range,
        "coverage_note": f"Analysis covers {count} valid recorded traffic observations.",
    }


def calculate_trends(filtered_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Builds chronological congestion and speed trend points.
    Bins observations into 30-minute intervals to provide smooth, readable trends
    without falsifying or interpolating across multi-hour missing gaps.
    """
    if not filtered_records:
        return []

    # Bin into 30-minute slots: YYYY-MM-DDTHH:00 or YYYY-MM-DDTHH:30
    bins: Dict[str, List[Dict[str, Any]]] = {}

    for r in filtered_records:
        dt = r["datetime"]
        minute_bin = "00" if dt.minute < 30 else "30"
        bin_key = f"{dt.strftime('%Y-%m-%d %H')}:{minute_bin}"

        if bin_key not in bins:
            bins[bin_key] = []
        bins[bin_key].append(r)

    trend_points: List[Dict[str, Any]] = []

    for bin_key, items in sorted(bins.items(), key=lambda x: x[0]):
        congestions = [it["congestion_percent"] for it in items if it["congestion_percent"] is not None]
        speeds = [it["current_speed_kmh"] for it in items if it["current_speed_kmh"] is not None]
        free_speeds = [it["free_flow_speed_kmh"] for it in items if it["free_flow_speed_kmh"] is not None]
        delays = [it["delay_seconds"] for it in items if it["delay_seconds"] is not None]

        # Representative timestamp is the first observation's timestamp
        first_ts = items[0]["timestamp"]

        trend_points.append({
            "bin": bin_key,
            "timestamp": first_ts,
            "label": bin_key[-11:],  # e.g. "10-15 09:00"
            "congestion_percent": round(sum(congestions) / len(congestions), 1) if congestions else None,
            "current_speed_kmh": round(sum(speeds) / len(speeds), 1) if speeds else None,
            "free_flow_speed_kmh": round(sum(free_speeds) / len(free_speeds), 1) if free_speeds else None,
            "avg_delay_seconds": round(sum(delays) / len(delays), 1) if delays else None,
            "sample_count": len(items),
            "primary_road": items[0]["area"] if len(set(i["area"] for i in items)) == 1 else "Multiple roads",
        })

    return trend_points


def calculate_heatmap(filtered_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Builds the 7 days of week x 24 hours of day matrix.
    CRITICAL: Does NOT fill unobserved cells with 0.
    Unobserved cells have avg_congestion = None and count = 0.
    True 0% congestion cells have avg_congestion = 0.0 and count > 0.
    """
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    # Initialize empty 7 x 24 matrix
    matrix_data: Dict[Tuple[int, int], List[float]] = {}
    speed_data: Dict[Tuple[int, int], List[float]] = {}

    for r in filtered_records:
        dow = r["day_of_week"]
        hr = r["hour"]
        key = (dow, hr)

        if r["congestion_percent"] is not None:
            if key not in matrix_data:
                matrix_data[key] = []
            matrix_data[key].append(r["congestion_percent"])

        if r["current_speed_kmh"] is not None:
            if key not in speed_data:
                speed_data[key] = []
            speed_data[key].append(r["current_speed_kmh"])

    cells: List[Dict[str, Any]] = []
    observed_cells_count = 0
    total_cells = 7 * 24

    for dow in range(7):
        day_cells = []
        for hr in range(24):
            key = (dow, hr)
            congestions = matrix_data.get(key, [])
            speeds = speed_data.get(key, [])
            cnt = len(congestions)

            if cnt > 0:
                observed_cells_count += 1
                avg_c = round(sum(congestions) / cnt, 1)
                avg_s = round(sum(speeds) / len(speeds), 1) if speeds else None
                status = "observed"
            else:
                avg_c = None
                avg_s = None
                status = "unobserved"

            cell_obj = {
                "day_index": dow,
                "day_name": day_names[dow],
                "hour": hr,
                "hour_label": f"{hr:02d}:00",
                "avg_congestion": avg_c,
                "avg_speed_kmh": avg_s,
                "count": cnt,
                "status": status,
            }
            cells.append(cell_obj)

    # Calculate overall observed day names
    observed_days = sorted(list(set(r["day_name"] for r in filtered_records)))

    return {
        "days": day_names,
        "hours": list(range(24)),
        "cells": cells,
        "observed_cells_count": observed_cells_count,
        "unobserved_cells_count": total_cells - observed_cells_count,
        "coverage_percentage": round(100.0 * observed_cells_count / total_cells, 1),
        "observed_days": observed_days,
        "coverage_note": (
            f"Observed data covers {observed_cells_count} of 168 weekly hour slots "
            f"across {', '.join(observed_days) if observed_days else 'no days'}. "
            f"Unshaded cells represent periods without recorded traffic sampling."
        ),
    }


def calculate_road_comparison(filtered_records: List[Dict[str, Any]], limit: int = 20) -> List[Dict[str, Any]]:
    """
    Ranks roads by average congestion descending.
    Includes average recorded speed, free-flow speed, speed deficit, and delay.
    """
    if not filtered_records:
        return []

    groups: Dict[str, Dict[str, Any]] = {}

    for r in filtered_records:
        area = r["area"]
        if area not in groups:
            groups[area] = {
                "road": area,
                "city": r["city"],
                "congestions": [],
                "speeds": [],
                "free_speeds": [],
                "delays": [],
                "speed_deficits": [],
            }

        if r["congestion_percent"] is not None:
            groups[area]["congestions"].append(r["congestion_percent"])
        if r["current_speed_kmh"] is not None:
            groups[area]["speeds"].append(r["current_speed_kmh"])
        if r["free_flow_speed_kmh"] is not None:
            groups[area]["free_speeds"].append(r["free_flow_speed_kmh"])
        if r["delay_seconds"] is not None:
            groups[area]["delays"].append(r["delay_seconds"])
        if r["speed_deficit_kmh"] is not None:
            groups[area]["speed_deficits"].append(r["speed_deficit_kmh"])

    roads_list = []
    for area, g in groups.items():
        c_vals = g["congestions"]
        s_vals = g["speeds"]
        f_vals = g["free_speeds"]
        d_vals = g["delays"]
        sd_vals = g["speed_deficits"]

        avg_c = round(sum(c_vals) / len(c_vals), 1) if c_vals else 0.0
        avg_s = round(sum(s_vals) / len(s_vals), 1) if s_vals else 0.0
        avg_f = round(sum(f_vals) / len(f_vals), 1) if f_vals else 0.0
        avg_d = round(sum(d_vals) / len(d_vals), 1) if d_vals else 0.0
        avg_sd = round(sum(sd_vals) / len(sd_vals), 1) if sd_vals else 0.0

        roads_list.append({
            "road": area,
            "city": g["city"],
            "avg_congestion_percent": avg_c,
            "avg_speed_kmh": avg_s,
            "free_flow_speed_kmh": avg_f,
            "speed_deficit_kmh": avg_sd,
            "avg_delay_seconds": avg_d,
            "avg_delay_minutes": round(avg_d / 60.0, 1),
            "sample_count": len(c_vals),
            "severity": get_severity_bucket(avg_c),
        })

    # Sort descending by congestion
    roads_list.sort(key=lambda x: (x["avg_congestion_percent"], x["sample_count"]), reverse=True)

    return roads_list[:limit]


def calculate_speed_delay_analysis(filtered_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes speed deficit and delay statistics across the filtered dataset.
    Documents the formula: congestion = 100 * (1 - current_speed / free_flow_speed).
    """
    if not filtered_records:
        return {
            "overall_avg_speed": None,
            "overall_free_flow_speed": None,
            "overall_speed_deficit": None,
            "overall_avg_delay_sec": None,
            "speed_distribution": [],
            "formula_documentation": (
                "Congestion percentage = 100 × (1 − current_speed / free_flow_speed), bounded between 0% and 100%. "
                "Calculated only when free_flow_speed > 0 to prevent division by zero. "
                "Delay is the recorded difference between currentTravelTime and freeFlowTravelTime."
            ),
        }

    speeds = [r["current_speed_kmh"] for r in filtered_records if r["current_speed_kmh"] is not None]
    free_speeds = [r["free_flow_speed_kmh"] for r in filtered_records if r["free_flow_speed_kmh"] is not None]
    deficits = [r["speed_deficit_kmh"] for r in filtered_records if r["speed_deficit_kmh"] is not None]
    delays = [r["delay_seconds"] for r in filtered_records if r["delay_seconds"] is not None]

    # Speed distribution brackets: < 20 km/h, 20-35 km/h, 35-50 km/h, >= 50 km/h
    b_under_20 = sum(1 for s in speeds if s < 20)
    b_20_35 = sum(1 for s in speeds if 20 <= s < 35)
    b_35_50 = sum(1 for s in speeds if 35 <= s < 50)
    b_50_plus = sum(1 for s in speeds if s >= 50)

    total_s = len(speeds)
    speed_distribution = [
        {"range": "< 20 km/h", "count": b_under_20, "percentage": round(100.0 * b_under_20 / total_s, 1) if total_s else 0},
        {"range": "20 - 34 km/h", "count": b_20_35, "percentage": round(100.0 * b_20_35 / total_s, 1) if total_s else 0},
        {"range": "35 - 49 km/h", "count": b_35_50, "percentage": round(100.0 * b_35_50 / total_s, 1) if total_s else 0},
        {"range": "≥ 50 km/h", "count": b_50_plus, "percentage": round(100.0 * b_50_plus / total_s, 1) if total_s else 0},
    ]

    return {
        "overall_avg_speed": round(sum(speeds) / len(speeds), 1) if speeds else None,
        "overall_free_flow_speed": round(sum(free_speeds) / len(free_speeds), 1) if free_speeds else None,
        "overall_speed_deficit": round(sum(deficits) / len(deficits), 1) if deficits else None,
        "overall_avg_delay_sec": round(sum(delays) / len(delays), 1) if delays else None,
        "speed_distribution": speed_distribution,
        "formula_documentation": (
            "Congestion percentage = 100 × (1 − current_speed / free_flow_speed), bounded between 0% and 100%. "
            "Calculated only when free_flow_speed > 0 to prevent division by zero. "
            "Delay is the recorded difference between currentTravelTime and freeFlowTravelTime."
        ),
    }


def get_paginated_records(
    filtered_records: List[Dict[str, Any]],
    search: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 10,
) -> Dict[str, Any]:
    """
    Search, sort, and paginate historical records matching the active filters.
    """
    records = filtered_records

    # Apply search filter across area, city, road
    if search and search.strip():
        q = search.strip().lower()
        records = [
            r for r in records
            if q in r["area"].lower() or q in r["city"].lower()
        ]

    total_count = len(records)

    # Sort key mapping
    def sort_key(item: Dict[str, Any]) -> Any:
        val = item.get(sort_by)
        if val is None:
            # None values at the end regardless of direction
            return "" if isinstance(sort_by, str) else -999999
        return val

    reverse = (sort_order.lower() == "desc")
    try:
        sorted_records = sorted(records, key=sort_key, reverse=reverse)
    except TypeError:
        # Fallback if types cannot be compared directly
        sorted_records = sorted(records, key=lambda x: str(x.get(sort_by, "")), reverse=reverse)

    # Pagination calculation
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    total_pages = max(1, math.ceil(total_count / page_size))

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paged_items = sorted_records[start_idx:end_idx]

    # Clean records for JSON output (exclude datetime object)
    cleaned_items = [
        {
            "id": r["id"],
            "timestamp": r["timestamp"],
            "city": r["city"],
            "area": r["area"],
            "current_speed_kmh": r["current_speed_kmh"],
            "free_flow_speed_kmh": r["free_flow_speed_kmh"],
            "speed_deficit_kmh": r["speed_deficit_kmh"],
            "delay_seconds": r["delay_seconds"],
            "congestion_percent": r["congestion_percent"],
            "confidence": r["confidence"],
            "severity": r["severity"],
            "source": r["source"],
        }
        for r in paged_items
    ]

    return {
        "records": cleaned_items,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def export_csv_string(filtered_records: List[Dict[str, Any]]) -> str:
    """
    Renders filtered records to an RFC 4180 compliant CSV string
    with properly quoted values.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "timestamp",
        "city",
        "area",
        "current_speed_kmh",
        "free_flow_speed_kmh",
        "speed_deficit_kmh",
        "delay_seconds",
        "congestion_percent",
        "confidence",
        "severity",
        "source",
    ])

    for r in filtered_records:
        writer.writerow([
            r.get("timestamp", ""),
            r.get("city", ""),
            r.get("area", ""),
            r.get("current_speed_kmh", ""),
            r.get("free_flow_speed_kmh", ""),
            r.get("speed_deficit_kmh", ""),
            r.get("delay_seconds", ""),
            r.get("congestion_percent", ""),
            r.get("confidence", ""),
            r.get("severity", ""),
            r.get("source", ""),
        ])

    return output.getvalue()
