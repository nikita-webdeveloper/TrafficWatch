
import os
import csv
import json
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

import requests
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi import Request
from fastapi.responses import Response
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.routing_service import calculate_routes_tomtom, _fetch_tomtom_flow
from ml.predict import get_predictor
from services.data_pipeline import (
    process_new_reading,
    get_data_quality_status,
    CLEANED_CSV_FILE,
    normalize_area_name,
    normalize_city_name,
)
from services.analytics_service import (
    load_dataset,
    get_filter_options,
    filter_readings,
    calculate_summary,
    calculate_trends,
    calculate_heatmap,
    calculate_road_comparison,
    calculate_speed_delay_analysis,
    get_paginated_records,
    export_csv_string,
)

load_dotenv()

# -----------------------------
# Configuration
# -----------------------------

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

CSV_FILE = DATA_DIR / "live_traffic.csv"
LOCATIONS_FILE = DATA_DIR / "monitored_locations.json"
SAVED_LOCATIONS_FILE = DATA_DIR / "saved_locations.json"

csv_lock = threading.Lock()
saved_locations_lock = threading.Lock()

def load_monitored_locations():
    if not LOCATIONS_FILE.exists():
        return []

    try:
        with open(LOCATIONS_FILE, "r", encoding="utf-8") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return []

def save_monitored_locations(locations):
    with open(LOCATIONS_FILE, "w", encoding="utf-8") as file:
        json.dump(locations, file, indent=4)

DEFAULT_SAVED_LOCATIONS = [
    {
        "id": "loc-pune-home",
        "name": "My Home",
        "label": "Home",
        "address": "Central Pune, Maharashtra, India",
        "city": "Pune",
        "area": "Central Pune",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "created_at": "2026-10-15T09:00:00Z",
        "updated_at": "2026-10-15T09:00:00Z",
    },
    {
        "id": "loc-pune-office",
        "name": "Tech Office",
        "label": "Work",
        "address": "Hinjawadi Rajiv Gandhi Infotech Park, Pune, Maharashtra",
        "city": "Pune",
        "area": "Hinjawadi",
        "latitude": 18.5913,
        "longitude": 73.7389,
        "created_at": "2026-10-15T09:30:00Z",
        "updated_at": "2026-10-15T09:30:00Z",
    },
]

def load_saved_locations():
    if not SAVED_LOCATIONS_FILE.exists():
        save_saved_locations(DEFAULT_SAVED_LOCATIONS)
        return list(DEFAULT_SAVED_LOCATIONS)

    try:
        with open(SAVED_LOCATIONS_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []

def save_saved_locations(locations):
    with saved_locations_lock:
        with open(SAVED_LOCATIONS_FILE, "w", encoding="utf-8") as file:
            json.dump(locations, file, indent=4)

# Initial monitored road location: central Pune
PUNE_LAT = 18.5204
PUNE_LON = 73.8567

scheduler = BackgroundScheduler()


# -----------------------------
# Save readings to CSV (Thread-Safe)
# -----------------------------

def save_traffic_reading(reading):
    with csv_lock:
        file_exists = CSV_FILE.exists()

        with open(CSV_FILE, "a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=reading.keys())

            if not file_exists or CSV_FILE.stat().st_size == 0:
                writer.writeheader()

            writer.writerow(reading)

    # Incrementally validate and append to cleaned dataset
    try:
        process_new_reading(reading)
    except Exception as exc:
        print(f"Warning: Cleaned data pipeline incremental update error: {exc}")


# -----------------------------
# Fetch traffic and save it
# -----------------------------

_collection_health_lock = threading.Lock()
_collection_health_status = {
    "is_collector_running": False,
    "scheduler_active": False,
    "last_attempt_at": None,
    "last_successful_collection_at": None,
    "last_collection_status": "idle",
    "last_collection_message": "Collector initialized",
    "successful_reads_last_run": 0,
    "failed_reads_last_run": 0,
    "monitored_locations_count": 0,
    "tomtom_api_configured": bool(TOMTOM_API_KEY),
}

# Pre-populate last successful collection from CSV if records exist
if CSV_FILE.exists() and CSV_FILE.stat().st_size > 0:
    try:
        with open(CSV_FILE, "r", encoding="utf-8") as _f:
            _lines = _f.readlines()
            if len(_lines) > 1:
                _last_col = _lines[-1].strip().split(",")
                if _last_col and _last_col[0]:
                    _collection_health_status["last_successful_collection_at"] = _last_col[0]
                    _collection_health_status["last_attempt_at"] = _last_col[0]
                    _collection_health_status["last_collection_status"] = "healthy"
                    _collection_health_status["last_collection_message"] = "Historical collection recorded"
    except Exception:
        pass


def collect_traffic_automatically():
    now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    with _collection_health_lock:
        _collection_health_status["last_attempt_at"] = now_iso
        _collection_health_status["scheduler_active"] = scheduler.running if 'scheduler' in globals() else True

    if not TOMTOM_API_KEY:
        with _collection_health_lock:
            _collection_health_status["last_collection_status"] = "skipped"
            _collection_health_status["last_collection_message"] = "TomTom API key is not configured"
            _collection_health_status["is_collector_running"] = False
        print("Traffic collection skipped: TomTom API key is missing.")
        return

    locations = load_monitored_locations()
    with _collection_health_lock:
        _collection_health_status["monitored_locations_count"] = len(locations)

    if not locations:
        with _collection_health_lock:
            _collection_health_status["last_collection_status"] = "skipped"
            _collection_health_status["last_collection_message"] = "No monitored locations saved"
        print("Traffic collection skipped: No monitored locations saved.")
        return

    url = (
        "https://api.tomtom.com/traffic/services/4/"
        "flowSegmentData/absolute/10/json"
    )

    success_count = 0
    fail_count = 0

    for location in locations:
        latitude = location["latitude"]
        longitude = location["longitude"]

        try:
            response = requests.get(
                url,
                params={
                    "point": f"{latitude},{longitude}",
                    "key": TOMTOM_API_KEY,
                },
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            flow = data.get("flowSegmentData", {})
            current_speed = flow.get("currentSpeed")
            free_flow_speed = flow.get("freeFlowSpeed")

            congestion_percent = None

            if (
                isinstance(current_speed, (int, float))
                and isinstance(free_flow_speed, (int, float))
                and free_flow_speed > 0
            ):
                congestion_percent = round(
                    max(
                        0,
                        min(
                            100,
                            100 * (1 - current_speed / free_flow_speed),
                        ),
                    ),
                    1,
                )

            reading = {
                "timestamp": datetime.now().astimezone().isoformat(
                    timespec="seconds"
                ),
                "city": location.get("city", "Unknown"),
                "area": location.get("name", "Selected location"),
                "latitude": latitude,
                "longitude": longitude,
                "current_speed_kmh": current_speed,
                "free_flow_speed_kmh": free_flow_speed,
                "current_travel_time_seconds": flow.get(
                    "currentTravelTime"
                ),
                "free_flow_travel_time_seconds": flow.get(
                    "freeFlowTravelTime"
                ),
                "confidence": flow.get("confidence"),
                "congestion_percent": congestion_percent,
            }

            save_traffic_reading(reading)
            success_count += 1
            print(
                f"Traffic reading saved for {reading['area']} "
                f"at {reading['timestamp']}"
            )

        except (requests.RequestException, ValueError, KeyError) as error:
            fail_count += 1
            print(
                f"Traffic collection failed for "
                f"{location.get('name', 'Unknown location')}: {error}"
            )

    finish_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    with _collection_health_lock:
        _collection_health_status["successful_reads_last_run"] = success_count
        _collection_health_status["failed_reads_last_run"] = fail_count
        if success_count > 0:
            _collection_health_status["last_successful_collection_at"] = finish_iso
            _collection_health_status["last_collection_status"] = "healthy" if fail_count == 0 else "partial"
            _collection_health_status["last_collection_message"] = (
                f"Successfully collected {success_count} of {len(locations)} locations"
            )
            _collection_health_status["is_collector_running"] = True
        else:
            _collection_health_status["last_collection_status"] = "failed"
            _collection_health_status["last_collection_message"] = f"Failed to collect readings for all {len(locations)} locations"



# -----------------------------
# Scheduler lifecycle
# -----------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Collect one reading shortly after the server starts.
    scheduler.add_job(
        collect_traffic_automatically,
        trigger="date",
        id="initial_traffic_collection",
        replace_existing=True,
    )

    # Continue collecting every five minutes.
    scheduler.add_job(
        collect_traffic_automatically,
        trigger="interval",
        minutes=5,
        id="traffic_collection",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="TrafficWatch API",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# -----------------------------
# API endpoints
# -----------------------------

@app.get("/api/monitored-locations")
def get_monitored_locations():
    return {"locations": load_monitored_locations()}


@app.post("/api/monitored-locations")
def add_monitored_location(location: dict):
    locations = load_monitored_locations()

    latitude = location.get("latitude")
    longitude = location.get("longitude")

    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=400,
            detail="Latitude and longitude are required."
        )

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Latitude and longitude must be numbers."
        )

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(
            status_code=400,
            detail="Invalid latitude or longitude."
        )

    for saved_location in locations:
        if (
            abs(saved_location["latitude"] - latitude) < 0.0001
            and abs(saved_location["longitude"] - longitude) < 0.0001
        ):
            return {
                "message": "Location is already monitored.",
                "locations": locations
            }

    new_location = {
        "name": str(location.get("name") or "Selected location"),
        "city": str(location.get("city") or location.get("name") or "Unknown"),
        "latitude": latitude,
        "longitude": longitude,
    }

    locations.append(new_location)
    save_monitored_locations(locations)

    return {
        "message": "Location added successfully.",
        "locations": locations
    }


# -----------------------------
# Saved Locations (My Locations)
# -----------------------------

class SavedLocationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    label: Optional[str] = Field(default="Other", max_length=50)
    address: Optional[str] = Field(default="", max_length=300)
    city: Optional[str] = Field(default="Unknown", max_length=100)
    area: Optional[str] = Field(default="", max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class SavedLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    label: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=100)
    area: Optional[str] = Field(default=None, max_length=100)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


@app.get("/api/saved-locations")
def get_saved_locations():
    return {"locations": load_saved_locations()}


@app.post("/api/saved-locations")
def add_saved_location(payload: SavedLocationCreate):
    locations = load_saved_locations()

    clean_name = payload.name.strip()
    clean_city = (payload.city or "Unknown").strip()
    clean_area = (payload.area or clean_name.split(",")[0]).strip()
    clean_address = (payload.address or clean_name).strip()

    # Check for duplicate coordinates (within ~11 meters) or exact name & city
    for existing in locations:
        if (
            abs(existing["latitude"] - payload.latitude) < 0.0001
            and abs(existing["longitude"] - payload.longitude) < 0.0001
        ):
            raise HTTPException(
                status_code=409,
                detail=f"A location with these coordinates is already saved as '{existing.get('name', 'Saved location')}'.",
            )
        if (
            existing.get("name", "").strip().lower() == clean_name.lower()
            and existing.get("city", "").strip().lower() == clean_city.lower()
            and existing.get("area", "").strip().lower() == clean_area.lower()
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Location '{clean_name}' is already in your saved places.",
            )

    now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    new_location = {
        "id": f"loc-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "name": clean_name,
        "label": (payload.label or "Other").strip(),
        "address": clean_address,
        "city": clean_city,
        "area": clean_area,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    locations.append(new_location)
    save_saved_locations(locations)

    return {
        "message": f"'{clean_name}' was saved to your locations.",
        "location": new_location,
        "locations": locations,
    }


@app.put("/api/saved-locations/{location_id}")
def update_saved_location(location_id: str, payload: SavedLocationUpdate):
    locations = load_saved_locations()

    target_idx = None
    for idx, item in enumerate(locations):
        if item.get("id") == location_id:
            target_idx = idx
            break

    if target_idx is None:
        raise HTTPException(status_code=404, detail="Saved location not found.")

    target = dict(locations[target_idx])

    new_lat = payload.latitude if payload.latitude is not None else target["latitude"]
    new_lon = payload.longitude if payload.longitude is not None else target["longitude"]

    # Check for duplicate coordinates on other saved locations
    for idx, other in enumerate(locations):
        if idx != target_idx:
            if (
                abs(other["latitude"] - new_lat) < 0.0001
                and abs(other["longitude"] - new_lon) < 0.0001
            ):
                raise HTTPException(
                    status_code=409,
                    detail=f"Another location with these coordinates is already saved as '{other.get('name')}'.",
                )

    if payload.name is not None and payload.name.strip():
        target["name"] = payload.name.strip()
    if payload.label is not None and payload.label.strip():
        target["label"] = payload.label.strip()
    if payload.address is not None:
        target["address"] = payload.address.strip()
    if payload.city is not None:
        target["city"] = payload.city.strip()
    if payload.area is not None:
        target["area"] = payload.area.strip()
    if payload.latitude is not None:
        target["latitude"] = payload.latitude
    if payload.longitude is not None:
        target["longitude"] = payload.longitude

    target["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")

    locations[target_idx] = target
    save_saved_locations(locations)

    return {
        "message": f"'{target['name']}' was updated successfully.",
        "location": target,
        "locations": locations,
    }


@app.delete("/api/saved-locations/{location_id}")
def delete_saved_location(location_id: str):
    locations = load_saved_locations()

    target = None
    for item in locations:
        if item.get("id") == location_id:
            target = item
            break

    if not target:
        raise HTTPException(status_code=404, detail="Saved location not found.")

    updated_list = [item for item in locations if item.get("id") != location_id]
    save_saved_locations(updated_list)

    return {
        "message": f"'{target.get('name', 'Location')}' was removed from your saved places.",
        "deleted_id": location_id,
        "locations": updated_list,
    }



@app.get("/")
def home():
    return {"message": "TrafficWatch backend is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}



@app.get("/api/search-location")
def search_location(q: str = Query(..., min_length=1, max_length=100)):
    cleaned_q = q.strip()
    if not cleaned_q:
        return {"locations": []}

    # 1. Try TomTom Search API if key is available and query length >= 2
    if TOMTOM_API_KEY and len(cleaned_q) >= 2:
        try:
            tomtom_url = f"https://api.tomtom.com/search/2/search/{requests.utils.quote(cleaned_q)}.json"
            tomtom_resp = requests.get(
                tomtom_url,
                params={
                    "key": TOMTOM_API_KEY,
                    "countrySet": "IN",
                    "limit": 5,
                },
                timeout=6,
            )
            if tomtom_resp.ok:
                data = tomtom_resp.json()
                results = data.get("results", [])
                if results:
                    locations = []
                    for item in results:
                        address = item.get("address", {})
                        poi = item.get("poi", {})
                        pos = item.get("position", {})
                        if "lat" not in pos or "lon" not in pos:
                            continue

                        freeform = address.get("freeformAddress", "")
                        poi_name = poi.get("name", "")
                        disp_name = poi_name if poi_name and freeform and poi_name in freeform else (f"{poi_name}, {freeform}" if poi_name and freeform else (freeform or poi_name or cleaned_q))

                        city = (
                            address.get("municipality")
                            or address.get("countrySecondarySubdivision")
                            or address.get("countrySubdivision")
                            or ""
                        )
                        area = (
                            poi_name
                            or address.get("municipalitySubdivision")
                            or address.get("neighbourhood")
                            or address.get("streetName")
                            or (disp_name.split(",")[0].strip() if disp_name else "Selected area")
                        )
                        locations.append({
                            "name": disp_name,
                            "city": city,
                            "area": area,
                            "latitude": float(pos["lat"]),
                            "longitude": float(pos["lon"]),
                        })
                    if locations:
                        return {"locations": locations}
        except Exception as exc:
            print("TomTom location search error, falling back to OSM Nominatim:", repr(exc))

    # 2. OpenStreetMap Nominatim search (supports single-character queries like 'S' with countrycodes='in')
    url = "https://nominatim.openstreetmap.org/search"
    try:
        response = requests.get(
            url,
            params={
                "q": cleaned_q,
                "countrycodes": "in",
                "format": "jsonv2",
                "limit": 5,
                "addressdetails": 1,
            },
            headers={
                "User-Agent": "TrafficWatchStudentProject/1.0"
            },
            timeout=15,
        )

        print("Location search HTTP status:", response.status_code)
        response.raise_for_status()

        results = response.json()
        print("Location search returned:", len(results), "results")

        locations = []
        for item in results:
            address = item.get("address", {})
            locations.append({
                "name": item.get("display_name", ""),
                "city": (
                    address.get("city")
                    or address.get("town")
                    or address.get("municipality")
                    or address.get("village")
                    or address.get("county")
                    or ""
                ),
                "area": (
                    address.get("suburb")
                    or address.get("neighbourhood")
                    or address.get("road")
                    or (item.get("display_name", "").split(",")[0].strip())
                    or "Selected area"
                ),
                "latitude": float(item["lat"]),
                "longitude": float(item["lon"]),
            })

        return {"locations": locations}

    except requests.RequestException as e:
        print("Location search error:", repr(e))
        raise HTTPException(
            status_code=502,
            detail=str(e)
        )
    except (ValueError, KeyError, TypeError) as e:
        print("Location search data error:", repr(e))
        raise HTTPException(
            status_code=502,
            detail="Could not process the location search response."
        )



@app.get("/api/traffic")
def get_live_traffic(
    city: str = Query(default="Pune", min_length=1),
    area: str = Query(default="Central Pune", min_length=1),
    latitude: float = Query(default=18.5204, ge=-90, le=90),
    longitude: float = Query(default=73.8567, ge=-180, le=180),
):
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TomTom API key is missing from .env",
        )

    url = (
        "https://api.tomtom.com/traffic/services/4/"
        "flowSegmentData/absolute/10/json"
    )

    try:
        response = requests.get(
            url,
            params={
                "point": f"{latitude},{longitude}",
                "key": TOMTOM_API_KEY,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

    
    
    except requests.RequestException as e:
        print("Traffic API error:", repr(e))
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch live traffic from TomTom."
        )


    flow = data.get("flowSegmentData", {})
    current_speed = flow.get("currentSpeed")
    free_flow_speed = flow.get("freeFlowSpeed")

    congestion_percent = None

    if (
        isinstance(current_speed, (int, float))
        and isinstance(free_flow_speed, (int, float))
        and free_flow_speed > 0
    ):
        congestion_percent = round(
            max(
                0,
                min(
                    100,
                    100 * (1 - current_speed / free_flow_speed),
                ),
            ),
            1,
        )

    reading = {
        "timestamp": datetime.now().astimezone().isoformat(
            timespec="seconds"
        ),
        "city": city,
        "area": area,
        "latitude": latitude,
        "longitude": longitude,
        "current_speed_kmh": current_speed,
        "free_flow_speed_kmh": free_flow_speed,
        "current_travel_time_seconds": flow.get(
            "currentTravelTime"
        ),
        "free_flow_travel_time_seconds": flow.get(
            "freeFlowTravelTime"
        ),
        "confidence": flow.get("confidence"),
        "congestion_percent": congestion_percent,
    }

    save_traffic_reading(reading)
    return reading


@app.get("/api/traffic/segments")
def get_traffic_segments(
    latitude: float = Query(default=18.5204, ge=-90, le=90),
    longitude: float = Query(default=73.8567, ge=-180, le=180),
):
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TomTom API key is missing from .env",
        )

    url = (
        "https://api.tomtom.com/traffic/services/4/"
        "flowSegmentData/absolute/10/json"
    )

    try:
        response = requests.get(
            url,
            params={
                "point": f"{latitude},{longitude}",
                "key": TOMTOM_API_KEY,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

    except requests.RequestException as exc:
        print("TomTom segment error:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch traffic segment.",
        ) from exc

    flow = data.get("flowSegmentData", {})
    coordinates = flow.get("coordinates", {}).get("coordinate", [])

    current_speed = flow.get("currentSpeed")
    free_flow_speed = flow.get("freeFlowSpeed")

    congestion = None
    if (
        isinstance(current_speed, (int, float))
        and isinstance(free_flow_speed, (int, float))
        and free_flow_speed > 0
    ):
        congestion = round(
            max(0, min(100, 100 * (1 - current_speed / free_flow_speed))),
            1,
        )

    return {
        "coordinates": [
            [point["latitude"], point["longitude"]]
            for point in coordinates
            if "latitude" in point and "longitude" in point
        ],
        "current_speed_kmh": current_speed,
        "free_flow_speed_kmh": free_flow_speed,
        "congestion_percent": congestion,
    }


_REVERSE_GEO_CACHE: dict = {}

def _get_road_name(lat: float, lon: float, frc: Optional[str] = None) -> str:
    cache_key = (round(lat, 3), round(lon, 3))
    if cache_key in _REVERSE_GEO_CACHE:
        return _REVERSE_GEO_CACHE[cache_key]

    fallback = {
        "FRC0": "Expressway Corridor",
        "FRC1": "Major Arterial Highway",
        "FRC2": "Primary Arterial Corridor",
        "FRC3": "Secondary Arterial Road",
        "FRC4": "Connecting Corridor",
        "FRC5": "Local Collector Road",
        "FRC6": "Local Access Road",
    }.get(frc or "", "Monitored Road Corridor")

    if not TOMTOM_API_KEY:
        return fallback

    url = f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json"
    try:
        resp = requests.get(url, params={"key": TOMTOM_API_KEY}, timeout=4)
        if resp.status_code == 200:
            addr = resp.json().get("addresses", [{}])[0].get("address", {})
            street = addr.get("streetName") or addr.get("street")
            subdivision = addr.get("municipalitySubdivision") or addr.get("subdivision") or addr.get("municipality")
            if street and subdivision:
                name = f"{street}, {subdivision}"
            elif street:
                name = street
            elif subdivision:
                name = f"{subdivision} Corridor"
            else:
                name = fallback
            _REVERSE_GEO_CACHE[cache_key] = name
            return name
    except Exception as e:
        print(f"Reverse geocode error near {lat},{lon}: {e}")

    _REVERSE_GEO_CACHE[cache_key] = fallback
    return fallback


@app.get("/api/traffic/nearby-segments")
def get_nearby_traffic_segments(
    latitude: float = Query(default=18.5204, ge=-90, le=90),
    longitude: float = Query(default=73.8567, ge=-180, le=180),
):
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TomTom API key is missing from .env",
        )

    # Sample points covering central road and immediate surroundings
    offsets = [
        (0, 0),
        (0.008, 0),
        (-0.008, 0),
        (0, 0.008),
        (0, -0.008),
        (0.006, 0.006),
        (-0.006, 0.006),
        (0.006, -0.006),
        (-0.006, -0.006),
    ]

    def fetch_point_flow(lat_offset, lon_offset):
        point_lat = latitude + lat_offset
        point_lon = longitude + lon_offset
        url = (
            "https://api.tomtom.com/traffic/services/4/"
            "flowSegmentData/absolute/10/json"
        )
        try:
            response = requests.get(
                url,
                params={
                    "point": f"{point_lat},{point_lon}",
                    "key": TOMTOM_API_KEY,
                },
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            print("TomTom nearby segment error:", repr(exc))
            return None

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=9) as executor:
        results = list(executor.map(lambda o: fetch_point_flow(o[0], o[1]), offsets))

    segments = []
    seen = set()

    for data in results:
        if not data:
            continue

        flow = data.get("flowSegmentData", {})
        points = flow.get("coordinates", {}).get("coordinate", [])

        coordinates = [
            [p["latitude"], p["longitude"]]
            for p in points
            if "latitude" in p and "longitude" in p
        ]

        if len(coordinates) < 2:
            continue

        # Prevent duplicates based on approximate start and midpoint coordinates
        midpoint = coordinates[len(coordinates) // 2]
        segment_key = (
            round(coordinates[0][0], 4),
            round(coordinates[0][1], 4),
            round(midpoint[0], 4),
            round(midpoint[1], 4),
        )

        if segment_key in seen:
            continue
        seen.add(segment_key)

        current_speed = flow.get("currentSpeed")
        free_flow_speed = flow.get("freeFlowSpeed")
        congestion = None

        if (
            isinstance(current_speed, (int, float))
            and isinstance(free_flow_speed, (int, float))
            and free_flow_speed > 0
        ):
            congestion = round(
                max(
                    0,
                    min(
                        100,
                        100 * (1 - current_speed / free_flow_speed),
                    ),
                ),
                1,
            )

        current_travel_time = flow.get("currentTravelTime")
        free_flow_travel_time = flow.get("freeFlowTravelTime")
        delay_seconds = None
        if (
            isinstance(current_travel_time, (int, float))
            and isinstance(free_flow_travel_time, (int, float))
        ):
            delay_seconds = max(0, int(current_travel_time - free_flow_travel_time))

        road_name = _get_road_name(midpoint[0], midpoint[1], flow.get("frc"))
        seg_id = f"seg-{round(coordinates[0][0], 4)}-{round(coordinates[0][1], 4)}"

        segments.append({
            "id": seg_id,
            "name": road_name,
            "coordinates": coordinates,
            "current_speed_kmh": current_speed,
            "free_flow_speed_kmh": free_flow_speed,
            "congestion_percent": congestion,
            "current_travel_time_seconds": current_travel_time,
            "free_flow_travel_time_seconds": free_flow_travel_time,
            "delay_seconds": delay_seconds,
            "confidence": flow.get("confidence"),
            "frc": flow.get("frc"),
            "last_updated": datetime.now().astimezone().isoformat(timespec="seconds"),
        })

    return {"segments": segments}


@app.get("/api/traffic/hotspots")
def get_traffic_hotspots(
    latitude: float = Query(default=18.5204, ge=-90, le=90),
    longitude: float = Query(default=73.8567, ge=-180, le=180),
    city: Optional[str] = Query(default=None),
):
    result = get_nearby_traffic_segments(latitude=latitude, longitude=longitude)
    segments = result.get("segments", [])
    return {
        "city": city,
        "latitude": latitude,
        "longitude": longitude,
        "hotspots": segments,
        "total_monitored": len(segments),
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


@app.get("/api/traffic/history")
def get_traffic_history(
    city: str | None = Query(default=None),
    area: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
):
    import csv

    if not CSV_FILE.exists():
        return []

    readings = []

    def parse_float(val):
        if val is None or val == "":
            return None
        try:
            f = float(val)
            return int(f) if f.is_integer() else f
        except (ValueError, TypeError):
            return None

    try:
        with open(CSV_FILE, "r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)

            for row in reader:
                row_city = row.get("city", "")
                row_area = row.get("area", "")

                if city and city.lower() not in row_city.lower() and row_city.lower() not in city.lower():
                    continue

                if area and area.lower() not in row_area.lower() and row_area.lower() not in area.lower():
                    continue

                timestamp = row.get("timestamp", "")

                if start_date and timestamp[:10] < start_date:
                    continue

                if end_date and timestamp[:10] > end_date:
                    continue

                readings.append({
                    "timestamp": timestamp,
                    "city": row_city,
                    "area": row_area,
                    "latitude": parse_float(row.get("latitude")),
                    "longitude": parse_float(row.get("longitude")),
                    "current_speed_kmh": parse_float(row.get("current_speed_kmh")),
                    "free_flow_speed_kmh": parse_float(row.get("free_flow_speed_kmh")),
                    "current_travel_time_seconds": parse_float(row.get("current_travel_time_seconds")),
                    "free_flow_travel_time_seconds": parse_float(row.get("free_flow_travel_time_seconds")),
                    "confidence": parse_float(row.get("confidence")),
                    "congestion_percent": parse_float(row.get("congestion_percent")),
                })

    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to read historical traffic data.",
        ) from exc

    return readings


# -----------------------------
# Traffic Analytics Endpoints
# -----------------------------

@app.get("/api/traffic/analytics/filters")
def get_analytics_filters():
    records, raw_count, corrupt_count = load_dataset()
    options = get_filter_options(records)
    options["raw_records_count"] = raw_count
    options["corrupted_records_count"] = corrupt_count
    return options


@app.get("/api/traffic/analytics/overview")
def get_analytics_overview(
    city: Optional[str] = Query(default=None),
    road: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    time_of_day: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
):
    records, raw_count, corrupt_count = load_dataset()
    filtered = filter_readings(
        records=records,
        city=city,
        road=road,
        start_date=start_date,
        end_date=end_date,
        time_of_day=time_of_day,
        severity=severity,
    )

    summary = calculate_summary(filtered, raw_count, corrupt_count)
    trends = calculate_trends(filtered)
    heatmap = calculate_heatmap(filtered)
    road_comparison = calculate_road_comparison(filtered, limit=25)
    speed_delay = calculate_speed_delay_analysis(filtered)

    return {
        "summary": summary,
        "trends": trends,
        "heatmap": heatmap,
        "road_comparison": road_comparison,
        "speed_delay": speed_delay,
        "active_filters": {
            "city": city or "All",
            "road": road or "All",
            "start_date": start_date,
            "end_date": end_date,
            "time_of_day": time_of_day or "all",
            "severity": severity or "all",
        },
        "total_filtered_records": len(filtered),
        "dataset_source": "TomTom Flow API Historical Dataset",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


@app.get("/api/traffic/analytics/records")
def get_analytics_records(
    city: Optional[str] = Query(default=None),
    road: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    time_of_day: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    sort_by: str = Query(default="timestamp"),
    sort_order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    records, raw_count, corrupt_count = load_dataset()
    filtered = filter_readings(
        records=records,
        city=city,
        road=road,
        start_date=start_date,
        end_date=end_date,
        time_of_day=time_of_day,
        severity=severity,
    )

    return get_paginated_records(
        filtered_records=filtered,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )


@app.get("/api/traffic/analytics/export")
def get_analytics_export(
    city: Optional[str] = Query(default=None),
    road: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    time_of_day: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
):
    records, _, _ = load_dataset()
    filtered = filter_readings(
        records=records,
        city=city,
        road=road,
        start_date=start_date,
        end_date=end_date,
        time_of_day=time_of_day,
        severity=severity,
    )

    csv_data = export_csv_string(filtered)
    filename = f"trafficwatch_analytics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/traffic/tiles/{z}/{x}/{y}.png")
def get_traffic_tile(z: int, x: int, y: int):
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TomTom API key is missing from .env",
        )

    if not (0 <= z <= 22):
        raise HTTPException(status_code=400, detail="Invalid zoom level.")

    max_tile = 2 ** z
    if not (0 <= x < max_tile and 0 <= y < max_tile):
        raise HTTPException(status_code=400, detail="Invalid tile coordinates.")

    url = (
        f"https://api.tomtom.com/traffic/map/4/"
        f"tile/flow/relative0/{z}/{x}/{y}.png"
    )

    try:
        response = requests.get(
            url,
            params={"key": TOMTOM_API_KEY},
            timeout=15,
        )
        response.raise_for_status()

        return Response(
            content=response.content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=60"},
        )
    except requests.RequestException as exc:
        print("TomTom traffic tile error:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch traffic tiles from TomTom.",
        ) from exc


# -----------------------------
# Route Planning & ML Prediction Endpoints
# -----------------------------

class RouteLocationSchema(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    name: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None

class RoutePlanRequest(BaseModel):
    source: RouteLocationSchema
    destination: RouteLocationSchema
    preference: str = Field(default="fastest", pattern="^(fastest|shortest|least-congested)$")
    alternatives: bool = True
    depart_at: Optional[str] = None


# @app.post("/api/routes")
# def plan_routes(request: RoutePlanRequest):
#     if not TOMTOM_API_KEY:
#         raise HTTPException(
#             status_code=500,
#             detail="TomTom API key is missing from environment.",
#         )

#     # Validate coordinate difference
#     if (
#         abs(request.source.latitude - request.destination.latitude) < 0.0001
#         and abs(request.source.longitude - request.destination.longitude) < 0.0001
#     ):
#         raise HTTPException(
#             status_code=400,
#             detail="Source and destination coordinates must be different.",
#         )

#     try:
#         monitored = load_monitored_locations()
#         result = calculate_routes_tomtom(
#             start_lat=request.source.latitude,
#             start_lon=request.source.longitude,
#             dest_lat=request.destination.latitude,
#             dest_lon=request.destination.longitude,
#             start_name=request.source.name,
#             dest_name=request.destination.name,
#             preference=request.preference,
#             include_alternatives=request.alternatives,
#             depart_at=request.depart_at,
#             api_key=TOMTOM_API_KEY,
#             monitored_locations=monitored,
#         )
#         return result
#     except Exception as exc:
#         print("Route planning error:", repr(exc))
#         raise HTTPException(
#             status_code=502,
#             detail=f"Unable to calculate routes: {str(exc)}",
#         ) from exc


@app.post("/api/routes")
def plan_routes(request: RoutePlanRequest):
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="TomTom API key is missing from environment.",
        )

    if (
        abs(request.source.latitude - request.destination.latitude) < 0.0001
        and abs(request.source.longitude - request.destination.longitude) < 0.0001
    ):
        raise HTTPException(
            status_code=400,
            detail="Source and destination coordinates must be different.",
        )

    try:
        monitored = load_monitored_locations()
        result = calculate_routes_tomtom(
            start_lat=request.source.latitude,
            start_lon=request.source.longitude,
            dest_lat=request.destination.latitude,
            dest_lon=request.destination.longitude,
            start_name=request.source.name,
            dest_name=request.destination.name,
            preference=request.preference,
            include_alternatives=request.alternatives,
            depart_at=request.depart_at,
            api_key=TOMTOM_API_KEY,
            monitored_locations=monitored,
        )

        # Print the actual traffic values returned for each route.
        for route in result.get("routes", []):
            print(
                "TRAFFIC DEBUG:",
                {
                    "route": route.get("name"),
                    "travel_time_seconds": route.get("travel_time_seconds"),
                    "free_flow_time_seconds": route.get("free_flow_time_seconds"),
                    "traffic_delay_seconds": route.get("traffic_delay_seconds"),
                    "congestion_percent": route.get("congestion_percent"),
                    "traffic_condition": route.get("traffic_condition"),
                },
            )

        return result

    except Exception as exc:
        print("Route planning error:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Unable to calculate routes: {str(exc)}",
        ) from exc


# -----------------------------
# Safe Thread-Safe Dataset Caching with Invalidation
# -----------------------------
_traffic_dataset_cache: Optional[pd.DataFrame] = None
_traffic_dataset_mtime: float = 0.0
_traffic_dataset_size: int = 0
_traffic_dataset_file: Optional[str] = None
_traffic_cache_lock = threading.Lock()


def get_traffic_dataset(csv_path: Optional[Path] = None) -> Optional[pd.DataFrame]:
    """
    Returns the parsed and validated traffic dataset using mtime and file-size
    caching. When new records are appended or dataset cleaning runs, the cache
    is automatically invalidated without requiring a server restart.
    """
    global _traffic_dataset_cache, _traffic_dataset_mtime, _traffic_dataset_size, _traffic_dataset_file
    target_csv = Path(csv_path) if csv_path else (CLEANED_CSV_FILE if CLEANED_CSV_FILE.exists() else CSV_FILE)
    if not target_csv.exists():
        return None

    try:
        stat = target_csv.stat()
        mtime = stat.st_mtime
        size = stat.st_size
        file_key = str(target_csv)

        with _traffic_cache_lock:
            if (
                _traffic_dataset_cache is not None
                and _traffic_dataset_file == file_key
                and _traffic_dataset_mtime == mtime
                and _traffic_dataset_size == size
            ):
                return _traffic_dataset_cache

            # Invalidate and reload
            import pandas as pd
            df = pd.read_csv(target_csv)
            df["dt"] = pd.to_datetime(df["timestamp"], errors="coerce")
            df = df.dropna(subset=["dt"]).sort_values("dt").reset_index(drop=True)
            _traffic_dataset_cache = df
            _traffic_dataset_mtime = mtime
            _traffic_dataset_size = size
            _traffic_dataset_file = file_key
            return df
    except Exception as exc:
        print(f"Error loading traffic dataset cache: {exc}")
        return None


def invalidate_traffic_cache():
    """Explicitly clears the in-memory traffic dataframe cache."""
    global _traffic_dataset_cache, _traffic_dataset_mtime, _traffic_dataset_size
    with _traffic_cache_lock:
        _traffic_dataset_cache = None
        _traffic_dataset_mtime = 0.0
        _traffic_dataset_size = 0


@app.get("/api/traffic/predictions")
def get_traffic_predictions(
    city: Optional[str] = Query(default=None),
    area: Optional[str] = Query(default=None),
    latitude: Optional[float] = Query(default=None, ge=-90, le=90),
    longitude: Optional[float] = Query(default=None, ge=-180, le=180),
    horizon_minutes: int = Query(default=15),
):
    """
    Returns forward traffic speed & congestion predictions across 15m, 30m, and 60m horizons.
    Separates live traffic observations from ML forecasts with honest handling of missing history.
    """
    supported_horizons = [15, 30, 60]
    if horizon_minutes not in supported_horizons:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported horizon: {horizon_minutes}m. Supported horizons are {supported_horizons} minutes.",
        )

    predictor = get_predictor()
    if not predictor.is_available:
        predictor.load()

    # Load cleaned historical dataset using mtime cache
    df = get_traffic_dataset()

    # Resolve location identity and historical subset
    loc_subset = None
    resolved_city = city or "Unknown"
    resolved_area = area or "Central Road"
    resolved_lat = latitude
    resolved_lon = longitude

    if df is not None and not df.empty:
        if latitude is not None and longitude is not None:
            # Match within ~0.03 deg (~3.3 km)
            dist_sq = (df["latitude"] - latitude) ** 2 + (df["longitude"] - longitude) ** 2
            closest_idx = dist_sq.idxmin()
            if dist_sq.loc[closest_idx] < (0.04 ** 2):
                matched_row = df.loc[closest_idx]
                matched_lat = matched_row["latitude"]
                matched_lon = matched_row["longitude"]
                loc_subset = df[
                    (df["latitude"].round(4) == round(matched_lat, 4)) &
                    (df["longitude"].round(4) == round(matched_lon, 4))
                ]
                resolved_city = matched_row.get("city", resolved_city)
                resolved_area = matched_row.get("area", resolved_area)
                resolved_lat = matched_lat
                resolved_lon = matched_lon
        elif area:
            loc_subset = df[df["area"].str.contains(area.strip(), case=False, na=False)]
            if not loc_subset.empty:
                r0 = loc_subset.iloc[-1]
                resolved_city = r0.get("city", resolved_city)
                resolved_area = r0.get("area", resolved_area)
                resolved_lat = float(r0["latitude"])
                resolved_lon = float(r0["longitude"])
        elif city:
            loc_subset = df[df["city"].str.contains(city.strip(), case=False, na=False)]
            if not loc_subset.empty:
                r0 = loc_subset.iloc[-1]
                resolved_city = r0.get("city", resolved_city)
                resolved_area = r0.get("area", resolved_area)
                resolved_lat = float(r0["latitude"])
                resolved_lon = float(r0["longitude"])
        else:
            # Default to location with greatest observation count
            top_loc = df.groupby(["city", "area"]).size().idxmax()
            loc_subset = df[(df["city"] == top_loc[0]) & (df["area"] == top_loc[1])]
            r0 = loc_subset.iloc[-1]
            resolved_city = top_loc[0]
            resolved_area = top_loc[1]
            resolved_lat = float(r0["latitude"])
            resolved_lon = float(r0["longitude"])

    observation_count = len(loc_subset) if loc_subset is not None else 0
    has_sufficient_history = observation_count >= 15

    # Prioritize latest observation from the validated historical dataset
    current_speed = None
    free_flow_speed = None
    congestion = None
    confidence = 0.85
    live_timestamp = None

    if loc_subset is not None and not loc_subset.empty:
        last_row = loc_subset.iloc[-1]
        current_speed = float(last_row["current_speed_kmh"])
        free_flow_speed = float(last_row["free_flow_speed_kmh"])
        congestion = float(last_row["congestion_percent"])
        confidence = float(last_row.get("confidence", 0.85)) if pd.notna(last_row.get("confidence")) else 0.85
        live_timestamp = str(last_row["timestamp"])
    elif resolved_lat is not None and resolved_lon is not None and TOMTOM_API_KEY:
        # Fallback to direct TomTom flow query only when no dataset history exists for this point
        flow_data = _fetch_tomtom_flow(resolved_lat, resolved_lon, TOMTOM_API_KEY)
        if flow_data:
            current_speed = flow_data.get("current_speed_kmh")
            free_flow_speed = flow_data.get("free_flow_speed_kmh")
            congestion = flow_data.get("congestion_percent")
            confidence = flow_data.get("confidence", 0.85)
            live_timestamp = datetime.now().astimezone().isoformat()

    # Determine traffic condition badge
    traffic_condition = "Unknown"
    if congestion is not None:
        if congestion < 25:
            traffic_condition = "Low Congestion"
        elif congestion < 50:
            traffic_condition = "Moderate Congestion"
        else:
            traffic_condition = "Heavy Congestion"

    location_info = {
        "city": resolved_city,
        "area": resolved_area,
        "road_name": resolved_area,
        "latitude": round(resolved_lat, 6) if resolved_lat is not None else None,
        "longitude": round(resolved_lon, 6) if resolved_lon is not None else None,
    }

    # Case: Zero history and no live data available
    if current_speed is None or free_flow_speed is None:
        return {
            "forecast_available": False,
            "data_available": False,
            "model_status": "no_data",
            "message": "No live observation or recorded history found for this road segment.",
            "location": location_info,
            "live_traffic": None,
            "forecast": None,
            "outlooks": {},
            "recent_history": [],
            "data_status": {
                "total_observations": 0,
                "has_sufficient_history": False,
                "required_observations": 15,
            },
            "predictions": [],
        }

    # Determine data freshness and staleness
    now = datetime.now().astimezone()
    is_stale = False
    data_age_minutes = 0.0
    if live_timestamp:
        try:
            obs_dt = datetime.fromisoformat(str(live_timestamp))
            if obs_dt.tzinfo is None:
                obs_dt = obs_dt.replace(tzinfo=now.tzinfo)
            data_age_minutes = round((now - obs_dt).total_seconds() / 60.0, 1)
            is_stale = data_age_minutes > 45.0
        except Exception:
            pass

    freshness_status = "fresh" if data_age_minutes < 15.0 else ("stale" if is_stale else "moderate")

    live_traffic_info = {
        "timestamp": live_timestamp or datetime.now().astimezone().isoformat(),
        "current_speed_kmh": round(current_speed, 1),
        "free_flow_speed_kmh": round(free_flow_speed, 1),
        "congestion_percent": round(congestion, 1) if congestion is not None else None,
        "traffic_condition": traffic_condition,
        "confidence": confidence,
        "is_stale": is_stale,
        "data_age_minutes": data_age_minutes,
        "freshness": freshness_status,
    }

    # Check whether location is actively monitored by the background collector
    monitored_locs = load_monitored_locations()
    is_monitored = False
    for ml in monitored_locs:
        if resolved_lat is not None and resolved_lon is not None:
            if abs(ml.get("latitude", 0) - resolved_lat) < 0.005 and abs(ml.get("longitude", 0) - resolved_lon) < 0.005:
                is_monitored = True
                break
        elif (resolved_city and ml.get("city", "").lower() == resolved_city.lower()) and (resolved_area and ml.get("name", "").lower() == resolved_area.lower()):
            is_monitored = True
            break

    estimated_readiness_min = max(0, 15 - observation_count) * 5 if is_monitored else None
    readiness_note = (
        f"~{estimated_readiness_min} minutes via background polling (5-minute intervals)"
        if is_monitored
        else "Unmonitored corridor: add to Monitored Locations to accumulate automated 5-minute readings"
    )

    # Case: Incomplete history (< 15 readings)
    if not has_sufficient_history:
        recent_pts = []
        if loc_subset is not None and not loc_subset.empty:
            for _, r in loc_subset.tail(10).iterrows():
                recent_pts.append({
                    "timestamp": str(r["timestamp"]),
                    "congestion_percent": float(r["congestion_percent"]),
                    "current_speed_kmh": float(r["current_speed_kmh"]),
                    "free_flow_speed_kmh": float(r["free_flow_speed_kmh"]),
                })

        return {
            "forecast_available": False,
            "data_available": True,
            "model_status": "insufficient_history",
            "message": (
                f"Insufficient historical data for {resolved_area} "
                f"({observation_count} readings available, 15 required)."
            ),
            "explanation": (
                "Forecasting models require at least 15 verified historical observations on this segment "
                "to generate reliable traffic forecasts. Live traffic conditions are reported directly."
            ),
            "location": location_info,
            "live_traffic": live_traffic_info,
            "forecast": None,
            "outlooks": {},
            "recent_history": recent_pts,
            "data_status": {
                "total_observations": observation_count,
                "has_sufficient_history": False,
                "required_observations": 15,
                "is_monitored": is_monitored,
                "estimated_readiness_minutes": estimated_readiness_min,
                "readiness_note": readiness_note,
            },
            "predictions": [],
        }

    # Sufficient history: produce multi-horizon ML predictions
    prior_speed = current_speed
    prior_cong = congestion
    recent_pts = []
    if loc_subset is not None and len(loc_subset) >= 2:
        prior_row = loc_subset.iloc[-2]
        prior_speed = float(prior_row["current_speed_kmh"])
        prior_cong = float(prior_row["congestion_percent"])

        for _, r in loc_subset.tail(10).iterrows():
            recent_pts.append({
                "timestamp": str(r["timestamp"]),
                "congestion_percent": float(r["congestion_percent"]),
                "current_speed_kmh": float(r["current_speed_kmh"]),
                "free_flow_speed_kmh": float(r["free_flow_speed_kmh"]),
            })

    # Predict requested horizon
    pred_res = predictor.predict_segment(
        current_speed_kmh=current_speed,
        free_flow_speed_kmh=free_flow_speed,
        congestion_percent=congestion,
        prior_speed_kmh=prior_speed,
        prior_congestion=prior_cong,
        road_id=resolved_area,
        horizon_minutes=horizon_minutes,
        city=resolved_city,
        area=resolved_area,
        sensor_confidence=confidence,
        historical_sample_count=observation_count,
    )

    # Predict all horizons for outlook cards
    outlooks = predictor.predict_multi_horizon(
        current_speed_kmh=current_speed,
        free_flow_speed_kmh=free_flow_speed,
        congestion_percent=congestion,
        prior_speed_kmh=prior_speed,
        prior_congestion=prior_cong,
        road_id=resolved_area,
        city=resolved_city,
        area=resolved_area,
        sensor_confidence=confidence,
        historical_sample_count=observation_count,
    )

    now = datetime.now().astimezone()
    future_time = now + timedelta(minutes=horizon_minutes)

    forecast_info = {
        "timestamp": future_time.isoformat(),
        "predicted_congestion_percent": pred_res.get("predicted_congestion_percent"),
        "predicted_speed_kmh": pred_res.get("predicted_speed_kmh"),
        "congestion_delta": pred_res.get("congestion_delta", 0.0),
        "speed_delta": pred_res.get("speed_delta", 0.0),
        "direction": pred_res.get("direction", "stable"),
        "direction_label": pred_res.get("direction_label", "Conditions steady"),
        "horizon_minutes": horizon_minutes,
        "confidence": pred_res.get("confidence", 0.85),
        "confidence_label": pred_res.get("confidence_label", "Moderate Confidence"),
        "data_tier": pred_res.get("data_tier", "established"),
        "model_status": pred_res.get("model_status", "model_prediction"),
        "model_name": pred_res.get("model_name", "Persistence"),
        "is_stale": is_stale,
        "data_age_minutes": data_age_minutes,
    }

    # Model metadata info
    horizon_metrics = {}
    if predictor.metadata and "evaluation_by_horizon" in predictor.metadata:
        horizon_metrics = predictor.metadata["evaluation_by_horizon"].get(f"{horizon_minutes}m", {})

    model_info = {
        "model_name": pred_res.get("model_name", "Persistence"),
        "trained_at": predictor.metadata.get("trained_at") if predictor.metadata else None,
        "training_data_cutoff_timestamp": predictor.metadata.get("training_data_cutoff_timestamp") if predictor.metadata else None,
        "horizon_minutes": horizon_minutes,
        "supported_horizons": supported_horizons,
        "model_mae": pred_res.get("model_mae"),
        "model_rmse": pred_res.get("model_rmse"),
        "evaluation": horizon_metrics.get("model_metrics"),
        "baseline_comparison": horizon_metrics.get("persistence_baseline"),
    }

    data_status = {
        "total_observations": observation_count,
        "has_sufficient_history": True,
        "is_monitored": is_monitored,
        "estimated_readiness_minutes": estimated_readiness_min,
        "readiness_note": readiness_note,
        "earliest": loc_subset["timestamp"].min() if loc_subset is not None and not loc_subset.empty else None,
        "latest": loc_subset["timestamp"].max() if loc_subset is not None and not loc_subset.empty else None,
        "is_stale": is_stale,
        "data_age_minutes": data_age_minutes,
        "freshness": freshness_status,
    }

    return {
        "forecast_available": True,
        "data_available": True,
        "location": location_info,
        "live_traffic": live_traffic_info,
        "forecast": forecast_info,
        "outlooks": outlooks,
        "recent_history": recent_pts,
        "model_info": model_info,
        "data_status": data_status,
        "explanation": pred_res.get("explanation"),
        # Legacy backwards compatibility
        "predictions": [forecast_info],
        "model_name": model_info["model_name"],
        "model_status": forecast_info["model_status"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_mae": pred_res.get("model_mae"),
    }


@app.get("/api/traffic/predictions/locations")
def get_prediction_locations():
    """
    Returns all monitored locations with historical observations,
    reporting whether each location has sufficient history for ML forecasting.
    """
    df = get_traffic_dataset()
    if df is None or df.empty:
        return {"locations": [], "total_locations": 0}

    try:
        locations_list = []
        for (city, area), grp in df.groupby(["city", "area"]):
            cnt = len(grp)
            last_row = grp.iloc[-1]
            first_row = grp.iloc[0]

            locations_list.append({
                "city": city,
                "area": area,
                "latitude": round(float(last_row["latitude"]), 4),
                "longitude": round(float(last_row["longitude"]), 4),
                "observation_count": cnt,
                "has_sufficient_history": cnt >= 15,
                "latest_congestion": round(float(last_row["congestion_percent"]), 1) if "congestion_percent" in last_row else None,
                "latest_speed": round(float(last_row["current_speed_kmh"]), 1) if "current_speed_kmh" in last_row else None,
                "latest_timestamp": str(last_row["timestamp"]),
                "earliest_timestamp": str(first_row["timestamp"]),
            })

        locations_list.sort(key=lambda x: x["observation_count"], reverse=True)
        return {
            "locations": locations_list,
            "total_locations": len(locations_list),
        }
    except Exception as e:
        print("Error in get_prediction_locations:", e)
        return {"locations": [], "total_locations": 0, "error": str(e)}


@app.get("/api/traffic/predictions/roads-outlook")
def get_roads_outlook(
    city: Optional[str] = Query(default=None),
    horizon_minutes: int = Query(default=15),
    sort_by: Optional[str] = Query(default="worsening"),
):
    """
    Returns multi-road comparative forecasts across monitored segments.
    Sortable by: worsening, improving, congestion, name.
    """
    supported_horizons = [15, 30, 60]
    if horizon_minutes not in supported_horizons:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported horizon: {horizon_minutes}m. Supported horizons: {supported_horizons}.",
        )

    predictor = get_predictor()
    if not predictor.is_available:
        predictor.load()

    df = get_traffic_dataset()
    if df is None or df.empty:
        return {"roads": [], "total_roads": 0, "horizon_minutes": horizon_minutes}

    try:
        roads = []
        for (c, a), grp in df.groupby(["city", "area"]):
            if city and city.lower() not in c.lower():
                continue

            cnt = len(grp)
            last_row = grp.iloc[-1]
            cur_speed = float(last_row["current_speed_kmh"])
            ff_speed = float(last_row["free_flow_speed_kmh"])
            cur_cong = float(last_row["congestion_percent"])

            if cnt >= 15:
                prior_speed = float(grp.iloc[-2]["current_speed_kmh"]) if cnt >= 2 else cur_speed
                prior_cong = float(grp.iloc[-2]["congestion_percent"]) if cnt >= 2 else cur_cong

                pred = predictor.predict_segment(
                    current_speed_kmh=cur_speed,
                    free_flow_speed_kmh=ff_speed,
                    congestion_percent=cur_cong,
                    prior_speed_kmh=prior_speed,
                    prior_congestion=prior_cong,
                    road_id=a,
                    horizon_minutes=horizon_minutes,
                    city=c,
                    area=a,
                    historical_sample_count=cnt,
                )

                is_forecast_avail = pred.get("predicted_congestion_percent") is not None and pred.get("model_status") != "insufficient_data"

                roads.append({
                    "road_name": a,
                    "city": c,
                    "area": a,
                    "latitude": round(float(last_row["latitude"]), 4),
                    "longitude": round(float(last_row["longitude"]), 4),
                    "current_congestion_percent": round(cur_cong, 1),
                    "predicted_congestion_percent": pred.get("predicted_congestion_percent"),
                    "congestion_delta": pred.get("congestion_delta", 0.0),
                    "current_speed_kmh": round(cur_speed, 1),
                    "predicted_speed_kmh": pred.get("predicted_speed_kmh"),
                    "speed_delta": pred.get("speed_delta", 0.0),
                    "direction": pred.get("direction", "stable"),
                    "direction_label": pred.get("direction_label"),
                    "observation_count": cnt,
                    "has_sufficient_history": True,
                    "forecast_available": is_forecast_avail,
                })
            else:
                roads.append({
                    "road_name": a,
                    "city": c,
                    "area": a,
                    "latitude": round(float(last_row["latitude"]), 4),
                    "longitude": round(float(last_row["longitude"]), 4),
                    "current_congestion_percent": round(cur_cong, 1),
                    "predicted_congestion_percent": None,
                    "congestion_delta": 0.0,
                    "current_speed_kmh": round(cur_speed, 1),
                    "predicted_speed_kmh": None,
                    "speed_delta": 0.0,
                    "direction": "insufficient_history",
                    "direction_label": f"Accumulating ({cnt}/15)",
                    "observation_count": cnt,
                    "has_sufficient_history": False,
                    "forecast_available": False,
                })

        # Apply sorting
        if sort_by == "worsening":
            roads.sort(key=lambda r: (r["forecast_available"], r["congestion_delta"]), reverse=True)
        elif sort_by == "improving":
            roads.sort(key=lambda r: (r["forecast_available"], -r["congestion_delta"]), reverse=True)
        elif sort_by == "congestion":
            roads.sort(key=lambda r: r["current_congestion_percent"], reverse=True)
        elif sort_by == "name":
            roads.sort(key=lambda r: r["road_name"].lower())

        return {
            "roads": roads,
            "total_roads": len(roads),
            "horizon_minutes": horizon_minutes,
            "sort_by": sort_by,
        }
    except Exception as e:
        print("Error in get_roads_outlook:", e)
        return {"roads": [], "total_roads": 0, "error": str(e)}


@app.get("/api/traffic/collector/status")
def get_collector_status():
    """
    Returns live collection health, scheduler status, latest successful collection time,
    and monitored location counts.
    """
    with _collection_health_lock:
        status_copy = dict(_collection_health_status)
    status_copy["scheduler_active"] = scheduler.running if 'scheduler' in globals() else False
    status_copy["is_collector_running"] = (
        status_copy["scheduler_active"]
        and status_copy["tomtom_api_configured"]
        and (status_copy.get("monitored_locations_count", 0) > 0 or len(load_monitored_locations()) > 0)
    )
    return status_copy


@app.get("/api/traffic/predictions/data-status")
def get_prediction_data_status():
    """
    Returns pipeline data health, deduplication stats, and model training freshness.
    """
    status = get_data_quality_status()
    predictor = get_predictor()
    if not predictor.is_available:
        predictor.load()

    meta = predictor.metadata or {}
    status["model_training_status"] = {
        "model_name": meta.get("model_name"),
        "trained_at": meta.get("trained_at"),
        "supported_horizons": meta.get("supported_horizons", [15, 30, 60]),
        "total_training_rows": meta.get("total_dataset_rows"),
    }
    status["collection_health"] = get_collector_status()
    return status


@app.get("/api/model/status")
def get_model_status():
    """
    Returns training evaluation metrics across 15m, 30m, and 60m horizons,
    comparing production models against the Persistence and Historical Average baselines.
    """
    predictor = get_predictor()
    if not predictor.is_available:
        predictor.load()
    return {
        "is_available": predictor.is_available,
        "metadata": predictor.metadata,
    }


# -----------------------------
# Data Pipeline & Model Retraining Actions
# -----------------------------

@app.post("/api/traffic/collect")
def trigger_traffic_collection():
    """
    Manually triggers an immediate traffic collection poll across monitored locations.
    Appends new observations to live_traffic.csv and cleaned_traffic.csv, automatically
    invalidating in-memory caches.
    """
    if not TOMTOM_API_KEY:
        raise HTTPException(
            status_code=400,
            detail="Traffic collection skipped: TOMTOM_API_KEY is not configured.",
        )
    before_df = get_traffic_dataset()
    before_count = len(before_df) if before_df is not None else 0
    collect_traffic_automatically()
    invalidate_traffic_cache()
    after_df = get_traffic_dataset()
    after_count = len(after_df) if after_df is not None else 0
    new_records = max(0, after_count - before_count)

    return {
        "success": True,
        "message": f"Traffic collection completed. Added {new_records} new record(s).",
        "new_records": new_records,
        "total_cleaned_records": after_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/traffic/clean")
def trigger_dataset_cleaning():
    """
    Manually triggers an idempotent cleaning and deduplication pass on raw live_traffic.csv
    into cleaned_traffic.csv. Safely clears in-memory caches.
    """
    from services.data_pipeline import clean_historical_dataset
    if not CSV_FILE.exists():
        raise HTTPException(status_code=404, detail="Raw dataset live_traffic.csv not found.")
    summary = clean_historical_dataset()
    invalidate_traffic_cache()
    return {
        "success": True,
        "message": "Dataset cleaned and deduplicated successfully.",
        "summary": summary,
    }


@app.post("/api/model/retrain")
def trigger_model_retraining():
    """
    Triggers deliberate model training and multi-horizon validation pipeline.
    Re-evaluates candidate models, updates saved artifacts, reloads predictor, and returns metadata.
    Does not occur automatically on frontend refresh.
    """
    from ml.train import train_pipeline
    metadata = train_pipeline()
    predictor = get_predictor(force_reload=True)
    return {
        "success": True,
        "message": "Model retraining and multi-horizon validation completed successfully.",
        "metadata": metadata,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)



