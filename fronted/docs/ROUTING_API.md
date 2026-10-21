# TrafficWatch Routing API Contract

The TrafficWatch frontend provides a Route Planner page that communicates with the backend endpoint `POST /api/routes`.

---

## 1. Request Schema

```json
{
  "source": { "latitude": 18.4636, "longitude": 73.8662, "name": "Bibwewadi, Pune" },
  "destination": { "latitude": 18.5308, "longitude": 73.8475, "name": "Shivaji Nagar, Pune" },
  "preference": "fastest",
  "alternatives": true
}
```

- `source` and `destination`: Geocoded coordinates (`latitude`, `longitude`) and human-readable names.
- `preference`: One of `"fastest"`, `"shortest"`, or `"least-congested"`.
- `alternatives`: Boolean flag indicating whether to compute alternative routes (up to 3 routes).

---

## 2. Response Schema

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
      "geometry": [[18.4636, 73.8662], [18.48, 73.86], [18.5308, 73.8475]],
      "summary": "Via Pune - Satara Rd"
    }
  ],
  "generated_at": "2026-10-20T15:00:00Z",
  "provider": "TomTom"
}
```

- `routes`: Array of route candidates.
- `geometry`: Ordered array of `[latitude, longitude]` coordinate pairs representing the route path for Leaflet rendering.
- `traffic_delay_seconds`: Delay in seconds relative to free-flow conditions.
- `congestion_percent`: Delay percentage computed as `min(100, max(0, (traffic_delay_seconds / (free_flow_time_seconds + traffic_delay_seconds)) * 100))`.
- `traffic_available`: Set to `true` when live traffic delay is provided by TomTom.

---

## 3. Ranking Logic

The frontend ranks routes according to the user's selected preference:
- `fastest`: Ordered by total `travel_time_seconds` ascending.
- `shortest`: Ordered by physical `distance_km` ascending.
- `least-congested`: Ordered by congestion ratio (`traffic_delay_seconds / free_flow_time_seconds`) ascending.
