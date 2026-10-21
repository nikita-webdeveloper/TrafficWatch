# TrafficWatch frontend

## Run
From the project root:
```sh
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to your FastAPI service. The default `http://127.0.0.1:8000` is for a frontend running in the same browser environment as your local backend. A hosted HTTPS frontend needs a publicly reachable HTTPS backend; localhost does not point to this sandbox or your server from other devices.

Configure FastAPI CORSMiddleware to allow the exact frontend origin, GET requests, and required headers. Do not expose the TomTom key. No existing Python backend has been modified or supplied in this workspace.

## Pages
- `/`: overview, selected road segment, live metrics, map, shortcuts.
- `/live-traffic`: explicit-submit geocoding, map coordinate selection, real traffic requests, refresh and errors.
- `/analytics`: future history integration, speed/congestion charts and CSV export when data is available.
- `/predictions`: future model integration; no fabricated forecasts or performance metrics.
- `/hotspots`: future historical/multi-location rankings.
- `/locations`: browser-local save, custom names, filter, removal, live-traffic shortcuts.
- `/about`: sources, calculations, limitations and privacy.

## Integration readiness
Traffic requests use `GET /api/traffic?city=...&area=...&latitude=...&longitude=...`. Status uses `/health`. History expects a JSON array from `/api/traffic/history`; predictions expect `{ predictions: [{ timestamp, congestion_percent, confidence? }], generated_at, model_name? }` from `/api/traffic/predictions`. Agree on query parameters and response shapes with your backend before enabling these future endpoints. Daily/weekly aggregates and historical-versus-predicted comparison remain unavailable until supplied.

OpenStreetMap tiles and Nominatim need no frontend API key. Search happens only on explicit submission, not autocomplete. Requests are throttled; public Nominatim requires valid browser Referer identification. Public tiles/geocoding are suitable for light interactive use, not bulk collection. Use a dedicated provider for production scale and comply with its policies.

## Verify real traffic
Open browser Network tools, submit a location, and inspect the `/api/traffic` request coordinates and response. Compare the displayed speed, congestion and timestamp to that response and the CSV row saved by FastAPI. No demo readings are included. Live traffic could not be verified here because your external FastAPI service is not connected. Offline states, themes, navigation, maps and saved-location flows are verified separately.

## Main source files
`src/styles.css`: semantic theme and responsive design. `src/components/traffic`: shared shell, map, search, state and page views. `src/services`: typed API and geocoding. `src/types/traffic.ts`: contracts. `src/routes`: seven typed TanStack pages and individual metadata.

## Route Planner status

The frontend includes a Route Planner page at `/route-planner`. It uses India-restricted place search and expects `POST /api/routes` for actual route alternatives. The endpoint is a proposed backend contract, not part of the existing FastAPI backend by default. See `docs/ROUTING_API.md` before implementing it. Until the endpoint is available, the page displays the real API error and does not show sample routes.


## Updated route planning and data integrations

The Route Planner is available at `/route-planner`. It searches places in India and calls the proposed `POST /api/routes` endpoint. The backend must proxy the TomTom Routing API, keep the TomTom key server-side, and return real alternative routes. The frontend draws route polylines only when route geometry is present; it never fabricates routes. See `docs/ROUTING_API.md` for the contract.

The Overview attempts to load recent readings from `GET /api/traffic/history`. Analytics shows actual history API errors instead of claiming the endpoint is always missing. Hotspots uses history data and requires at least three readings per location in the chosen time window. Locations distinguishes browser-saved places from the list returned by `GET /api/monitored-locations` and can submit a selected place through `POST /api/monitored-locations`. Verify those payloads against your actual FastAPI implementation.

The Predictions page remains intentionally unavailable until `GET /api/traffic/predictions` returns genuine model output. UI availability does not mean that route planning, predictions, or backend integrations are complete on the server.
