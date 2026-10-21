import os
import time
import math
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

import requests

from ml.predict import get_predictor


# In-memory cache for flow segments: (lat_round, lon_round) -> (timestamp, data)
_FLOW_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 60


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in km."""
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _fetch_tomtom_flow(
    lat: float, lon: float, api_key: str
) -> Optional[Dict[str, Any]]:
    """Fetches flow segment data with caching to respect API quotas."""
    cache_key = (round(lat, 3), round(lon, 3))
    now = time.time()
    if cache_key in _FLOW_CACHE:
        cached_time, cached_val = _FLOW_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_val

    url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    try:
        resp = requests.get(
            url,
            params={"point": f"{lat},{lon}", "key": api_key},
            timeout=8,
        )
        if resp.status_code == 200:
            data = resp.json()
            flow = data.get("flowSegmentData", {})
            cur_speed = flow.get("currentSpeed")
            ff_speed = flow.get("freeFlowSpeed")
            if cur_speed is not None and ff_speed is not None and ff_speed > 0:
                congestion = round(
                    max(0.0, min(100.0, 100.0 * (1.0 - cur_speed / ff_speed))), 1
                )
            else:
                congestion = None

            coords = [
                [p["latitude"], p["longitude"]]
                for p in flow.get("coordinates", {}).get("coordinate", [])
                if "latitude" in p and "longitude" in p
            ]

            result = {
                "current_speed_kmh": cur_speed,
                "free_flow_speed_kmh": ff_speed,
                "congestion_percent": congestion,
                "coordinates": coords,
                "confidence": flow.get("confidence"),
                "road_class": flow.get("frc"),
                "timestamp": datetime.now().astimezone().isoformat(),
            }
            _FLOW_CACHE[cache_key] = (now, result)
            return result
    except Exception as e:
        print(f"Flow fetch error near {lat},{lon}: {e}")

    return None


def calculate_routes_tomtom(
    start_lat: float,
    start_lon: float,
    dest_lat: float,
    dest_lon: float,
    start_name: Optional[str] = None,
    dest_name: Optional[str] = None,
    preference: str = "fastest",
    include_alternatives: bool = True,
    depart_at: Optional[str] = None,
    api_key: Optional[str] = None,
    monitored_locations: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Calculates candidate routes via TomTom Routing API.
    Identifies fastest, shortest, and traffic-aware alternatives.
    Extracts road segments and integrates live traffic + ML predictions.
    """
    if not api_key:
        raise ValueError("TomTom API key is required for route calculation.")

    # 1. Fetch fastest routes (with up to 2 alternatives)
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{start_lat},{start_lon}:{dest_lat},{dest_lon}/json"
    params = {
        "key": api_key,
        "traffic": "true",
        "travelMode": "car",
        "routeType": "fastest",
        "computeTravelTimeFor": "all",
        "sectionType": "traffic",
        "maxAlternatives": 2 if include_alternatives else 0,
    }
    if depart_at:
        params["departAt"] = depart_at

    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        raise RuntimeError(f"TomTom routing request failed: {e}") from e

    raw_routes = data.get("routes", [])
    if not raw_routes:
        return {
            "routes": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "provider": "TomTom Routing API",
        }

    # 2. Also fetch shortest route if alternatives requested
    shortest_raw_route = None
    if include_alternatives:
        try:
            shortest_params = {
                "key": api_key,
                "traffic": "true",
                "travelMode": "car",
                "routeType": "shortest",
                "computeTravelTimeFor": "all",
                "sectionType": "traffic",
                "maxAlternatives": 0,
            }
            if depart_at:
                shortest_params["departAt"] = depart_at
            s_resp = requests.get(url, params=shortest_params, timeout=10)
            if s_resp.status_code == 200:
                s_data = s_resp.json()
                s_routes = s_data.get("routes", [])
                if s_routes:
                    shortest_raw_route = s_routes[0]
        except Exception as e:
            print(f"Could not fetch shortest route variant: {e}")

    predictor = get_predictor()
    now_dt = datetime.now().astimezone()

    candidates: List[Dict[str, Any]] = []

    def process_raw_route(
        r: Dict[str, Any], candidate_tag: str, route_idx: int
    ) -> Dict[str, Any]:
        summary = r.get("summary", {})
        length_m = summary.get("lengthInMeters", 0)
        dist_km = round(length_m / 1000.0, 2)
        travel_time_sec = summary.get("travelTimeInSeconds", 0)
        no_traffic_time_sec = summary.get("noTrafficTravelTimeInSeconds")
        raw_traffic_delay_sec = summary.get("trafficDelayInSeconds")

        legs = r.get("legs", [])
        points = legs[0].get("points", []) if legs else []
        geometry: List[List[float]] = [[p["latitude"], p["longitude"]] for p in points]

        # Determine actual traffic delay and congestion percent
        route_congestion = None
        traffic_delay_sec = None

        if (
            no_traffic_time_sec is not None
            and travel_time_sec is not None
            and travel_time_sec > 0
            and no_traffic_time_sec > 0
        ):
            # Formula: congestion_percent = 100 * (1 - free_flow_time_seconds / travel_time_seconds)
            route_congestion = round(
                max(
                    0.0,
                    min(
                        100.0,
                        100.0 * (1.0 - no_traffic_time_sec / travel_time_sec),
                    ),
                ),
                1,
            )
            computed_delay = max(0, travel_time_sec - no_traffic_time_sec)
            traffic_delay_sec = max(raw_traffic_delay_sec or 0, computed_delay)
        elif raw_traffic_delay_sec is not None and raw_traffic_delay_sec >= 0:
            traffic_delay_sec = raw_traffic_delay_sec

        # Traffic classification thresholds:
        # Below 30%: Low Congestion
        # From 30% to below 60%: Moderate Congestion
        # 60% and above: Heavy Congestion
        if route_congestion is None:
            traffic_condition = "Traffic data unavailable"
            traffic_available = False
        elif route_congestion < 30.0:
            traffic_condition = "Low Congestion"
            traffic_available = True
        elif route_congestion < 60.0:
            traffic_condition = "Moderate Congestion"
            traffic_available = True
        else:
            traffic_condition = "Heavy Congestion"
            traffic_available = True

        # Calculate estimated arrival time
        arrival_dt = now_dt + timedelta(seconds=travel_time_sec)
        arrival_formatted = arrival_dt.strftime("%I:%M %p").lstrip("0")

        # 3. Identify road segments along this route
        # A) Congested sections from TomTom routing response
        route_segments: List[Dict[str, Any]] = []
        sections = r.get("sections", [])
        for s_idx, sec in enumerate(sections):
            if sec.get("sectionType") == "TRAFFIC":
                start_i = sec.get("startPointIndex", 0)
                end_i = min(len(geometry) - 1, sec.get("endPointIndex", len(geometry) - 1))
                sec_coords = geometry[start_i : end_i + 1]
                eff_speed = sec.get("effectiveSpeedInKmh")
                sec_delay = sec.get("delayInSeconds", 0)
                category = sec.get("simpleCategory", "CONGESTION")

                # Estimate free flow from overall route speed
                route_avg_speed = (dist_km / max(no_traffic_time_sec or travel_time_sec, 1)) * 3600.0
                ff_speed = round(max(eff_speed or 25.0, route_avg_speed), 1)

                sec_congestion = None
                if eff_speed is not None and ff_speed > 0:
                    sec_congestion = round(
                        max(0.0, min(100.0, 100.0 * (1.0 - eff_speed / ff_speed))),
                        1,
                    )

                route_segments.append(
                    {
                        "id": f"traffic-section-{s_idx + 1}",
                        "name": f"Congested Corridor ({category})",
                        "coordinates": sec_coords,
                        "current_speed_kmh": eff_speed,
                        "free_flow_speed_kmh": ff_speed,
                        "congestion_percent": sec_congestion,
                        "delay_seconds": sec_delay,
                        "is_congested_hotspot": True,
                        "data_source": "TomTom Route Traffic Sections",
                    }
                )

        # B) Match monitored locations intersecting or near the route (within 800m)
        if monitored_locations:
            for loc in monitored_locations:
                loc_lat = loc.get("latitude")
                loc_lon = loc.get("longitude")
                if loc_lat is None or loc_lon is None:
                    continue

                # Check minimum distance to any geometry sample
                step = max(1, len(geometry) // 30)
                near = False
                for pt in geometry[::step]:
                    if _haversine_distance_km(loc_lat, loc_lon, pt[0], pt[1]) < 0.8:
                        near = True
                        break

                if near:
                    # Query live flow data or cached
                    flow_info = _fetch_tomtom_flow(loc_lat, loc_lon, api_key)
                    if flow_info:
                        route_segments.append(
                            {
                                "id": f"monitored-{loc.get('name', 'loc')}",
                                "name": loc.get("name", "Monitored Segment"),
                                "coordinates": flow_info["coordinates"] or [[loc_lat, loc_lon]],
                                "current_speed_kmh": flow_info["current_speed_kmh"],
                                "free_flow_speed_kmh": flow_info["free_flow_speed_kmh"],
                                "congestion_percent": flow_info["congestion_percent"],
                                "confidence": flow_info["confidence"],
                                "is_congested_hotspot": (flow_info["congestion_percent"] or 0) >= 30,
                                "data_source": "TomTom Flow API (Monitored Location)",
                                "last_updated": flow_info["timestamp"],
                            }
                        )

        # C) If still few segments, sample 2-3 points along route to get real flow
        if len(route_segments) < 2 and len(geometry) >= 4:
            sample_indices = [len(geometry) // 3, (2 * len(geometry)) // 3]
            for s_idx, idx in enumerate(sample_indices):
                pt = geometry[idx]
                flow_info = _fetch_tomtom_flow(pt[0], pt[1], api_key)
                if flow_info:
                    route_segments.append(
                        {
                            "id": f"waypoint-flow-{s_idx + 1}",
                            "name": f"Route Segment {s_idx + 1}",
                            "coordinates": flow_info["coordinates"] or [pt],
                            "current_speed_kmh": flow_info["current_speed_kmh"],
                            "free_flow_speed_kmh": flow_info["free_flow_speed_kmh"],
                            "congestion_percent": flow_info["congestion_percent"],
                            "is_congested_hotspot": (flow_info["congestion_percent"] or 0) >= 30,
                            "data_source": "TomTom Flow API",
                            "last_updated": flow_info["timestamp"],
                        }
                    )

        # 4. Integrate ML predictions for the route segments
        prediction_result = predictor.predict_route(
            route_segments=route_segments,
            route_distance_km=dist_km,
            route_travel_time_seconds=travel_time_sec,
            free_flow_time_seconds=no_traffic_time_sec,
        )

        return {
            "id": f"route-{route_idx}",
            "candidate_tag": candidate_tag,
            "name": f"Route {route_idx} ({candidate_tag.replace('-', ' ').title()})",
            "distance_km": dist_km,
            "travel_time_seconds": travel_time_sec,
            "free_flow_time_seconds": no_traffic_time_sec,
            "traffic_delay_seconds": traffic_delay_sec,
            "congestion_percent": route_congestion,
            "traffic_condition": traffic_condition,
            "traffic_available": traffic_available,
            "estimated_arrival_time": arrival_formatted,
            "geometry": geometry,
            "segments": route_segments,
            "prediction": prediction_result,
            "sources": {
                "distance": "TomTom Routing API",
                "travel_time": "TomTom Routing API (live traffic aware)",
                "traffic_delay": "TomTom Routing API",
                "segments": "TomTom Flow & Traffic Sections",
                "prediction": "TrafficWatch ML (15-min horizon)",
            },
        }

    def _extract_route_delay(route_dict: Dict[str, Any]) -> float:
        s = route_dict.get("summary", {})
        tt = s.get("travelTimeInSeconds", 0)
        nt = s.get("noTrafficTravelTimeInSeconds")
        raw_d = s.get("trafficDelayInSeconds")
        if tt and nt and tt > 0 and nt > 0:
            return float(max(raw_d or 0, max(0, tt - nt)))
        return float(raw_d or 0)

    # Process primary fastest route
    candidates.append(process_raw_route(raw_routes[0], "fastest", 1))

    # Process TomTom alternatives
    for i, alt in enumerate(raw_routes[1:], start=2):
        # Tag alternatives meaningfully: if delay is notably lower, tag as less-congested
        alt_delay = _extract_route_delay(alt)
        primary_delay = _extract_route_delay(raw_routes[0])
        tag = "less-congested" if alt_delay < primary_delay else f"alternative-{i-1}"
        candidates.append(process_raw_route(alt, tag, len(candidates) + 1))

    # Process shortest route if fetched and distinct
    if shortest_raw_route:
        s_len = shortest_raw_route.get("summary", {}).get("lengthInMeters", 0)
        # Check if significantly different from existing candidates
        is_duplicate = any(
            abs(c["distance_km"] * 1000 - s_len) < 50 for c in candidates
        )
        if not is_duplicate:
            candidates.append(
                process_raw_route(shortest_raw_route, "shortest", len(candidates) + 1)
            )

    # 5. Rank routes and assign recommendation strictly based on data
    # Ranking logic
    if preference == "shortest":
        candidates.sort(key=lambda r: (r["distance_km"], r["travel_time_seconds"]))
    elif preference == "least-congested":
        def congestion_key(r):
            delay = r.get("traffic_delay_seconds")
            ff_time = r.get("free_flow_time_seconds")
            if delay is None or ff_time is None or ff_time <= 0:
                return float("inf")
            return delay / ff_time
        candidates.sort(key=lambda r: (congestion_key(r), r["travel_time_seconds"]))
    else:  # fastest
        candidates.sort(key=lambda r: (r["travel_time_seconds"], r["distance_km"]))

    # Assign recommendation labels and transparent reasons
    for idx, r in enumerate(candidates):
        is_rec = idx == 0
        r["is_recommended"] = is_rec
        if is_rec:
            if preference == "shortest":
                r["recommendation_reason"] = (
                    f"Recommended because it has the shortest driving distance ({r['distance_km']} km) "
                    f"among the returned alternatives."
                )
            elif preference == "least-congested":
                delay_str = f"{round(r['traffic_delay_seconds'] / 60, 1)} min" if r.get("traffic_delay_seconds") is not None else "0 min"
                r["recommendation_reason"] = (
                    f"Recommended based on lower measured traffic delay ({delay_str}) "
                    f"among the returned alternatives."
                )
            else:
                time_min = round(r["travel_time_seconds"] / 60, 1)
                r["recommendation_reason"] = (
                    f"Recommended because it provides the fastest traffic-aware travel time "
                    f"(~{time_min} min) among the returned alternatives."
                )
        else:
            r["recommendation_reason"] = None

    return {
        "routes": candidates,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": "TomTom Routing API & TrafficWatch ML",
        "preference_applied": preference,
    }
