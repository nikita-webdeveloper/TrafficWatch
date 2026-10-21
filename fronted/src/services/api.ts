import type {
  Location,
  TrafficReading,
  TrafficSegment,
  NearbySegmentsResponse,
  HotspotsResponse,
  MonitoredLocation,
  PredictionResponse,
  PredictionLocationsResponse,
  RoadsOutlookResponse,
  PredictionDataStatusResponse,
  ModelStatusResponse,
  RoutePoint,
  RoutePlanResponse,
  RoutePreference,
  SavedLocation,
  SavedLocationsResponse,
  AnalyticsFilterOptions,
  AnalyticsOverviewResponse,
  PaginatedRecordsResponse,
  CollectorStatusResponse,
} from '@/types/traffic';
import { searchPlaces as searchPlacesFallback } from './geocoding';

export { MonitoredLocation, SavedLocation };

export const API_BASE = (import.meta.env['VITE_API_BASE_URL'] || 'http://127.0.0.1:8000').replace(/\/$/, '');

export async function request<T>(
  path: string,
  signal?: AbortSignal,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Traffic service returned ${response.status}. Please try again.`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new Error('Traffic service returned an unreadable response.');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The traffic request timed out. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the traffic service. Check that your FastAPI server is running on http://127.0.0.1:8000.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Fetches real-time traffic reading for a specific point */
export async function getTraffic(location: Location, signal?: AbortSignal): Promise<TrafficReading> {
  const params = new URLSearchParams({
    city: location.city,
    area: location.area,
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  });

  const data = await request<TrafficReading>(`/api/traffic?${params.toString()}`, signal);
  if (!data || typeof data.timestamp !== 'string') {
    throw new Error('The traffic response is missing required readings.');
  }

  return {
    ...data,
    current_speed_kmh:
      data.current_speed_kmh !== null && data.current_speed_kmh !== undefined
        ? Number(data.current_speed_kmh)
        : null,
    free_flow_speed_kmh:
      data.free_flow_speed_kmh !== null && data.free_flow_speed_kmh !== undefined
        ? Number(data.free_flow_speed_kmh)
        : null,
    congestion_percent:
      data.congestion_percent !== null && data.congestion_percent !== undefined
        ? Number(data.congestion_percent)
        : null,
    current_travel_time_seconds:
      data.current_travel_time_seconds !== null && data.current_travel_time_seconds !== undefined
        ? Number(data.current_travel_time_seconds)
        : null,
    free_flow_travel_time_seconds:
      data.free_flow_travel_time_seconds !== null && data.free_flow_travel_time_seconds !== undefined
        ? Number(data.free_flow_travel_time_seconds)
        : null,
  };
}

/** Fetches multiple live traffic road segments around the given coordinate */
export async function getNearbySegments(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<TrafficSegment[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });

  const data = await request<NearbySegmentsResponse>(
    `/api/traffic/nearby-segments?${params.toString()}`,
    signal
  );

  if (!data || !Array.isArray(data.segments)) {
    return [];
  }

  return data.segments
    .filter(segment => Array.isArray(segment.coordinates) && segment.coordinates.length >= 2)
    .map((segment, index) => ({
      id: segment.id || `seg-${index + 1}`,
      name: segment.name || `Road segment ${index + 1}`,
      coordinates: segment.coordinates,
      current_speed_kmh: segment.current_speed_kmh !== null && segment.current_speed_kmh !== undefined ? Number(segment.current_speed_kmh) : null,
      free_flow_speed_kmh: segment.free_flow_speed_kmh !== null && segment.free_flow_speed_kmh !== undefined ? Number(segment.free_flow_speed_kmh) : null,
      congestion_percent: segment.congestion_percent !== null && segment.congestion_percent !== undefined ? Number(segment.congestion_percent) : null,
      current_travel_time_seconds: segment.current_travel_time_seconds !== null && segment.current_travel_time_seconds !== undefined ? Number(segment.current_travel_time_seconds) : null,
      free_flow_travel_time_seconds: segment.free_flow_travel_time_seconds !== null && segment.free_flow_travel_time_seconds !== undefined ? Number(segment.free_flow_travel_time_seconds) : null,
      delay_seconds: segment.delay_seconds !== null && segment.delay_seconds !== undefined
        ? Number(segment.delay_seconds)
        : (segment.current_travel_time_seconds && segment.free_flow_travel_time_seconds
            ? Math.max(0, Number(segment.current_travel_time_seconds) - Number(segment.free_flow_travel_time_seconds))
            : null),
      confidence: segment.confidence !== null && segment.confidence !== undefined ? Number(segment.confidence) : null,
      frc: segment.frc,
      last_updated: segment.last_updated,
    }));
}

/** Fetches real-time congestion hotspots for a monitored coordinate / city */
export async function getHotspots(
  latitude: number,
  longitude: number,
  city?: string,
  signal?: AbortSignal
): Promise<{ hotspots: TrafficSegment[]; generated_at: string; total_monitored: number }> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });
  if (city) params.set('city', city);

  try {
    const data = await request<HotspotsResponse>(
      `/api/traffic/hotspots?${params.toString()}`,
      signal
    );

    if (data && Array.isArray(data.hotspots)) {
      const parsed = data.hotspots
        .filter(s => Array.isArray(s.coordinates) && s.coordinates.length >= 2)
        .map((segment, index) => ({
          id: segment.id || `hotspot-${index + 1}`,
          name: segment.name || `Road segment ${index + 1}`,
          coordinates: segment.coordinates,
          current_speed_kmh: segment.current_speed_kmh !== null && segment.current_speed_kmh !== undefined ? Number(segment.current_speed_kmh) : null,
          free_flow_speed_kmh: segment.free_flow_speed_kmh !== null && segment.free_flow_speed_kmh !== undefined ? Number(segment.free_flow_speed_kmh) : null,
          congestion_percent: segment.congestion_percent !== null && segment.congestion_percent !== undefined ? Number(segment.congestion_percent) : null,
          current_travel_time_seconds: segment.current_travel_time_seconds !== null && segment.current_travel_time_seconds !== undefined ? Number(segment.current_travel_time_seconds) : null,
          free_flow_travel_time_seconds: segment.free_flow_travel_time_seconds !== null && segment.free_flow_travel_time_seconds !== undefined ? Number(segment.free_flow_travel_time_seconds) : null,
          delay_seconds: segment.delay_seconds !== null && segment.delay_seconds !== undefined
            ? Number(segment.delay_seconds)
            : (segment.current_travel_time_seconds && segment.free_flow_travel_time_seconds
                ? Math.max(0, Number(segment.current_travel_time_seconds) - Number(segment.free_flow_travel_time_seconds))
                : null),
          confidence: segment.confidence !== null && segment.confidence !== undefined ? Number(segment.confidence) : null,
          frc: segment.frc,
          last_updated: segment.last_updated || data.generated_at,
        }));

      return {
        hotspots: parsed,
        generated_at: data.generated_at,
        total_monitored: parsed.length,
      };
    }
  } catch (err) {
    console.warn('Dedicated hotspots endpoint unavailable, falling back to nearby-segments:', err);
  }

  // Fallback to getNearbySegments
  const fallbackSegments = await getNearbySegments(latitude, longitude, signal);
  return {
    hotspots: fallbackSegments,
    generated_at: new Date().toISOString(),
    total_monitored: fallbackSegments.length,
  };
}

/** Search location via backend Nominatim proxy with fallback */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<Location[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];

  try {
    const params = new URLSearchParams({ q: trimmed });
    const payload = await request<{ locations: Location[] }>(
      `/api/search-location?${params.toString()}`,
      signal
    );

    if (payload && Array.isArray(payload.locations) && payload.locations.length > 0) {
      return payload.locations.map(loc => ({
        name: loc.name || `${loc.area || ''}, ${loc.city}`.trim(),
        city: loc.city || 'Unknown',
        area: loc.area || (loc.name ? loc.name.split(',')[0].trim() : 'Selected area'),
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
      }));
    }
  } catch (backendError) {
    console.warn('Backend search-location failed, falling back to OSM directly:', backendError);
  }

  // Fallback to geocoding.ts
  return searchPlacesFallback(trimmed);
}

/** Fetches historical traffic readings */
export async function getHistory(
  params = new URLSearchParams(),
  signal?: AbortSignal
): Promise<TrafficReading[]> {
  const rows = await request<TrafficReading[]>(`/api/traffic/history?${params.toString()}`, signal);
  if (!Array.isArray(rows)) return [];

  return rows.map(row => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    current_speed_kmh: Number(row.current_speed_kmh ?? 0),
    free_flow_speed_kmh: Number(row.free_flow_speed_kmh ?? 0),
    congestion_percent: Number(row.congestion_percent ?? 0),
    current_travel_time_seconds: Number(row.current_travel_time_seconds ?? 0),
    free_flow_travel_time_seconds: Number(row.free_flow_travel_time_seconds ?? 0),
  }));
}

export const getPredictions = (params: URLSearchParams, signal?: AbortSignal) =>
  request<PredictionResponse>(`/api/traffic/predictions?${params.toString()}`, signal);

export const getPredictionLocations = (signal?: AbortSignal) =>
  request<PredictionLocationsResponse>('/api/traffic/predictions/locations', signal);

export const getRoadsOutlook = (params = new URLSearchParams(), signal?: AbortSignal) =>
  request<RoadsOutlookResponse>(`/api/traffic/predictions/roads-outlook?${params.toString()}`, signal);

export const getPredictionDataStatus = (signal?: AbortSignal) =>
  request<PredictionDataStatusResponse>('/api/traffic/predictions/data-status', signal);

export const getCollectorStatus = (signal?: AbortSignal) =>
  request<CollectorStatusResponse>('/api/traffic/collector/status', signal);

export const getModelStatus = (signal?: AbortSignal) =>
  request<ModelStatusResponse>('/api/model/status', signal);

/** Calls the proposed FastAPI route endpoint. */
export async function getRoutes(
  source: RoutePoint,
  destination: RoutePoint,
  preference: RoutePreference,
  signal?: AbortSignal,
  departAt?: string | null
): Promise<RoutePlanResponse> {
  const body: Record<string, any> = {
    source: {
      latitude: source.latitude,
      longitude: source.longitude,
      name: source.name,
      city: source.city,
      area: source.area,
    },
    destination: {
      latitude: destination.latitude,
      longitude: destination.longitude,
      name: destination.name,
      city: destination.city,
      area: destination.area,
    },
    preference,
    alternatives: true,
  };

  if (departAt) {
    body.depart_at = departAt;
  }

  const data = await request<RoutePlanResponse>('/api/routes', signal, {
    method: 'POST',
    body,
  });

  if (!data || !Array.isArray(data.routes)) {
    throw new Error('The route service returned an invalid response.');
  }

  for (const route of data.routes) {
    if (
      typeof route.distance_km !== 'number' ||
      typeof route.travel_time_seconds !== 'number' ||
      typeof route.traffic_available !== 'boolean'
    ) {
      throw new Error('The route service response is missing required route fields.');
    }
  }

  return data;
}

/** Reads backend-monitored locations */
export async function getMonitoredLocations(signal?: AbortSignal): Promise<MonitoredLocation[]> {
  const payload = await request<unknown>('/api/monitored-locations', signal);
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
      typeof payload === 'object' &&
      'locations' in payload &&
      Array.isArray((payload as { locations: unknown }).locations)
    ? (payload as { locations: unknown[] }).locations
    : null;

  if (!rows) throw new Error('Monitored-locations endpoint returned an unexpected response.');

  return rows
    .filter((row): row is MonitoredLocation => {
      if (!row || typeof row !== 'object') return false;
      const item = row as Record<string, unknown>;
      return (
        typeof item.latitude === 'number' &&
        Number.isFinite(item.latitude) &&
        typeof item.longitude === 'number' &&
        Number.isFinite(item.longitude)
      );
    })
    .map(row => ({
      name: String(row.name || row.area || row.city || 'Monitored location'),
      city: String(row.city || 'Unknown'),
      area: row.area ? String(row.area) : undefined,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }));
}

/** Adds a location to backend monitoring */
export async function addMonitoredLocation(location: Location, name?: string): Promise<{ message?: string }> {
  return await request<{ message?: string }>('/api/monitored-locations', undefined, {
    method: 'POST',
    body: {
      name: name?.trim() || location.name || location.area || 'Selected location',
      city: location.city || 'Unknown',
      area: location.area || 'Selected road',
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });
}

/** Fetches personal saved locations with localStorage fallback */
export async function getSavedLocations(signal?: AbortSignal): Promise<SavedLocation[]> {
  try {
    const payload = await request<SavedLocationsResponse>('/api/saved-locations', signal);
    if (payload && Array.isArray(payload.locations)) {
      try {
        localStorage.setItem('trafficwatch-saved-locations', JSON.stringify(payload.locations));
      } catch {
        /* storage disabled */
      }
      return payload.locations;
    }
  } catch (err) {
    console.warn('Backend /api/saved-locations failed, using localStorage fallback:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem('trafficwatch-saved-locations');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* empty */
  }
  return [];
}

/** Creates a new personal saved location */
export async function createSavedLocation(
  data: {
    name: string;
    label?: string;
    address?: string;
    city?: string;
    area?: string;
    latitude: number;
    longitude: number;
  },
  signal?: AbortSignal
): Promise<SavedLocation> {
  const result = await request<{ message: string; location: SavedLocation; locations: SavedLocation[] }>(
    '/api/saved-locations',
    signal,
    {
      method: 'POST',
      body: data,
    }
  );

  if (result?.locations) {
    try {
      localStorage.setItem('trafficwatch-saved-locations', JSON.stringify(result.locations));
    } catch {
      /* storage disabled */
    }
  }

  return result.location;
}

/** Updates an existing personal saved location */
export async function updateSavedLocation(
  id: string,
  data: Partial<SavedLocation>,
  signal?: AbortSignal
): Promise<SavedLocation> {
  const result = await request<{ message: string; location: SavedLocation; locations: SavedLocation[] }>(
    `/api/saved-locations/${id}`,
    signal,
    {
      method: 'PUT',
      body: data,
    }
  );

  if (result?.locations) {
    try {
      localStorage.setItem('trafficwatch-saved-locations', JSON.stringify(result.locations));
    } catch {
      /* storage disabled */
    }
  }

  return result.location;
}

/** Deletes a personal saved location */
export async function deleteSavedLocation(id: string, signal?: AbortSignal): Promise<void> {
  const result = await request<{ message: string; deleted_id: string; locations: SavedLocation[] }>(
    `/api/saved-locations/${id}`,
    signal,
    {
      method: 'DELETE',
    }
  );

  if (result?.locations) {
    try {
      localStorage.setItem('trafficwatch-saved-locations', JSON.stringify(result.locations));
    } catch {
      /* storage disabled */
    }
  }
}

/** Queries live traffic conditions near a specific saved location */
export async function checkSavedLocationTraffic(
  latitude: number,
  longitude: number,
  city = 'Pune',
  area = 'Saved Location',
  signal?: AbortSignal
): Promise<TrafficReading> {
  return getTraffic(
    {
      city,
      area,
      latitude,
      longitude,
    },
    signal
  );
}

// -----------------------------
// Traffic Analytics API Functions
// -----------------------------

/** Fetches available filter options (cities, roads, date bounds) from the backend. */
export async function getAnalyticsFilterOptions(signal?: AbortSignal): Promise<AnalyticsFilterOptions> {
  return request<AnalyticsFilterOptions>('/api/traffic/analytics/filters', signal);
}

/** Fetches full analytics overview (summary, trends, heatmap, road comparisons, speed-delay analysis). */
export async function getAnalyticsOverview(
  params: Record<string, string | undefined> = {},
  signal?: AbortSignal
): Promise<AnalyticsOverviewResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value.trim() !== '') {
      searchParams.set(key, value.trim());
    }
  }
  const queryStr = searchParams.toString();
  return request<AnalyticsOverviewResponse>(
    `/api/traffic/analytics/overview${queryStr ? `?${queryStr}` : ''}`,
    signal
  );
}

/** Fetches paginated, searchable, sortable historical records. */
export async function getAnalyticsRecords(
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal
): Promise<PaginatedRecordsResponse> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.set(key, String(value).trim());
    }
  }
  const queryStr = searchParams.toString();
  return request<PaginatedRecordsResponse>(
    `/api/traffic/analytics/records${queryStr ? `?${queryStr}` : ''}`,
    signal
  );
}

/** Constructs the URL for direct CSV download with active filters. */
export function getAnalyticsExportUrl(params: Record<string, string | undefined> = {}): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value.trim() !== '') {
      searchParams.set(key, value.trim());
    }
  }
  const queryStr = searchParams.toString();
  return `${API_BASE}/api/traffic/analytics/export${queryStr ? `?${queryStr}` : ''}`;
}


