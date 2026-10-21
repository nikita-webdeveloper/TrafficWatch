# TrafficWatch Architecture & Agent Guidelines


- Use TanStack file routes for the seven TrafficWatch pages and a shared root application shell; this preserves SSR and typed navigation.
- Keep traffic API access in a typed browser service configured by VITE_API_BASE_URL; the external FastAPI backend is not replaced.
- Dynamically import the Leaflet component behind ClientOnly; Leaflet depends on browser globals.
- Use a shared TrafficProvider for selected location and readings, clearing and aborting stale requests; navigation must not relabel old readings.
- Persist saved locations and theme only in browser storage; these preferences require no server or account syncing.
- Define all appearance and severity colors in src/styles.css semantic tokens; both themes share the same UI.
