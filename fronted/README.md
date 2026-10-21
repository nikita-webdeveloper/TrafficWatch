# TrafficWatch Frontend

TrafficWatch is an urban mobility and congestion-aware route recommendation frontend built with React 19, TypeScript, TanStack Start & Router, Tailwind CSS 4, Leaflet, and Recharts.

---

## Features & Navigation

- **Dashboard / Overview** (`/dashboard` & `/overview`): Live road-segment metrics, map, route-planning shortcut, and recent corridor history.
- **Route Planner** (`/route-planner`): Geocoded place search, source/destination selection, fastest/shortest/least-congested preferences, real route comparison cards, and Leaflet map displaying alternative route geometries from `POST /api/routes`.
- **Live Traffic** (`/live-traffic`): Real-time traffic flow map, segment details, free-flow vs. current speeds, and road status table.
- **Traffic Analytics** (`/analytics`): Multi-dimensional history filters, speed/congestion trend charts, hourly/day-of-week heatmaps, summary metrics, and CSV dataset export.
- **Predictions** (`/predictions`): 15-, 30-, and 60-minute multi-horizon forecasts, candidate model benchmarks (MAE, RMSE, MAPE), and live staleness indicators.
- **Congestion Hotspots** (`/hotspots`): Severity-ranked bottlenecks across monitored corridors based on real telemetry.
- **My Locations** (`/locations`): User-managed saved locations with traffic flow inspection and search.
- **About & Data** (`/about`): Comprehensive documentation on data sources, calculations, and architectural limitations.

---

## Local Development

1. **Install dependencies** (Bun recommended):
   ```bash
   bun install
   # Or using npm: npm install
   ```
2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # On Windows: copy .env.example .env
   ```
3. **Verify API Base URL**:
   Ensure `VITE_API_BASE_URL` in `.env` points to the running FastAPI backend (defaults to `http://127.0.0.1:8000`).
4. **Start the development server**:
   ```bash
   bun run dev
   # Or: npm run dev
   ```

*Security Note: The frontend does not store or process the TomTom API key. All external API calls are securely proxied by the backend.*

---

## Validation & Testing

- **Run unit and component tests**:
  ```bash
  bun run test
  # Or: npm test
  ```
- **Run production build**:
  ```bash
  bun run build
  # Or: npm run build
  ```
