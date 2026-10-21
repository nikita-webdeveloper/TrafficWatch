# TrafficWatch REST API Reference

The TrafficWatch backend provides a RESTful API built on FastAPI. When running locally, interactive documentation is available at:
- **Swagger UI**: `http://127.0.0.1:8000/docs`
- **ReDoc**: `http://127.0.0.1:8000/redoc`

---

## 1. System & Health

### `GET /health`
Returns system operational status and TomTom API configuration state.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "tomtom_api_configured": true,
  "scheduler_active": true,
  "dataset_available": true
}
```

---

## 2. Monitored Locations

Locations monitored periodically by the background traffic collector.

### `GET /api/monitored-locations`
Returns the list of monitored locations.

### `POST /api/monitored-locations`
Adds a new location to the periodic monitoring schedule.

**Request Body:**
```json
{
  "name": "Deccan Gymkhana",
  "city": "Pune",
  "latitude": 18.5167,
  "longitude": 73.8417
}
```

---

## 3. Saved Locations (My Locations)

User-managed bookmarks (e.g., Home, Work, Frequent).

### `GET /api/saved-locations`
Returns all saved user locations.

### `POST /api/saved-locations`
Creates a new saved location.

**Request Body:**
```json
{
  "name": "Headquarters",
  "label": "Work",
  "address": "Shivajinagar, Pune, Maharashtra",
  "city": "Pune",
  "area": "Shivajinagar",
  "latitude": 18.5308,
  "longitude": 73.8475
}
```

### `PUT /api/saved-locations/{location_id}`
Updates an existing saved location.

### `DELETE /api/saved-locations/{location_id}`
Removes a saved location.

---

## 4. Search & Geocoding

### `GET /api/search-location`
Geocodes query text into latitude/longitude coordinates via TomTom Search API.

**Query Parameters:**
- `q` (string, required): Search query string (minimum 2 characters).

**Response (200 OK):**
```json
{
  "query": "Shivaji Nagar",
  "results": [
    {
      "name": "Shivaji Nagar",
      "address": "Shivaji Nagar, Pune, Maharashtra, India",
      "latitude": 18.5308,
      "longitude": 73.8475,
      "city": "Pune"
    }
  ]
}
```

---

## 5. Live Traffic & Road Segments

### `GET /api/traffic`
Fetches real-time traffic flow for a specific coordinate.

**Query Parameters:**
- `lat` (float, optional): Latitude coordinate.
- `lon` (float, optional): Longitude coordinate.

### `GET /api/traffic/segments`
Returns live flow readings across all monitored corridors.

### `GET /api/traffic/nearby-segments`
Finds monitored road segments within a specified radius (in kilometers) of a coordinate.

---

## 6. Congestion Hotspots

### `GET /api/traffic/hotspots`
Returns a ranked list of active traffic bottlenecks across monitored corridors, ordered by congestion severity.

**Response (200 OK):**
```json
{
  "hotspots": [
    {
      "area": "Hinjawadi",
      "city": "Pune",
      "congestion_percent": 68.5,
      "current_speed_kmh": 14.0,
      "free_flow_speed_kmh": 45.0,
      "delay_seconds": 540,
      "severity": "Heavy"
    }
  ],
  "timestamp": "2026-10-20T15:00:00Z"
}
```

---

## 7. Route Planner

### `POST /api/routes`
Calculates traffic-aware routes between origin and destination coordinates, comparing alternatives and delays.

**Request Body:**
```json
{
  "source": {
    "latitude": 18.4636,
    "longitude": 73.8662,
    "name": "Bibwewadi, Pune"
  },
  "destination": {
    "latitude": 18.5308,
    "longitude": 73.8475,
    "name": "Shivaji Nagar, Pune"
  },
  "preference": "fastest",
  "alternatives": true
}
```

**Response (200 OK):**
```json
{
  "routes": [
    {
      "id": "route-1",
      "distance_km": 8.4,
      "travel_time_seconds": 1320,
      "free_flow_time_seconds": 960,
      "traffic_delay_seconds": 360,
      "congestion_percent": 27.3,
      "traffic_available": true,
      "geometry": [[18.4636, 73.8662], [18.4800, 73.8600], [18.5308, 73.8475]],
      "summary": "Via Pune - Satara Rd"
    }
  ],
  "generated_at": "2026-10-20T15:00:00Z",
  "provider": "TomTom"
}
```

---

## 8. Traffic Analytics

### `GET /api/traffic/analytics/filters`
Returns dynamic filter options (cities, roads, severity buckets, date bounds) present in the historical dataset.

### `GET /api/traffic/analytics/overview`
Returns aggregated analytics metrics according to supplied filter parameters.

**Query Parameters:**
- `city` (string, optional)
- `road` (string, optional)
- `time_of_day` (string, optional: `morning_rush`, `midday`, `evening_rush`, `night`)
- `severity` (string, optional: `Low`, `Moderate`, `Heavy`, `Severe`)
- `start_date` / `end_date` (string, optional: ISO 8601 date string)

**Response Content:**
- `summary`: Overall readings, average speed, average congestion, total delay hours.
- `trends`: Time-series data points of speed and congestion over time.
- `heatmap`: Hourly and day-of-week matrix of congestion intensity.
- `road_comparison`: Comparative metrics across corridors.
- `speed_delay_analysis`: Correlation distribution between speed and travel delay.

### `GET /api/traffic/analytics/records`
Returns paginated, searchable, and sortable tabular traffic observations.

### `GET /api/traffic/analytics/export`
Exports filtered traffic dataset as downloadable CSV stream.

---

## 9. Predictions & Machine Learning

### `GET /api/traffic/predictions`
Returns multi-horizon forecasts (15, 30, and 60 minutes) for a corridor or coordinate.

**Query Parameters:**
- `horizon` (int, default: 15): Forecast horizon in minutes (`15`, `30`, or `60`).
- `area` (string, optional): Target corridor name.
- `lat` / `lon` (float, optional): Target coordinate.

### `GET /api/traffic/predictions/roads-outlook`
Returns predicted traffic outlook across all monitored roads for the selected horizon.

### `GET /api/traffic/predictions/data-status`
Returns observation counts, corridor readiness status ($\ge 15$ readings required), and data freshness timestamp.

### `GET /api/model/status`
Returns the active model metadata, candidate architecture benchmark scores, and test error metrics from `models/model_metadata.json`.

---

## 10. Data Maintenance & Triggers

### `POST /api/traffic/collect`
Triggers an immediate collection cycle across all monitored locations.

### `POST /api/traffic/clean`
Runs an idempotent validation, deduplication, and normalization pass on `data/live_traffic.csv`, updating `data/cleaned_traffic.csv`.

### `POST /api/model/retrain`
Triggers chronological model retraining, candidate benchmarking, backup generation, and model metadata update.
