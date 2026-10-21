import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  getTraffic,
  getNearbySegments,
  getMonitoredLocations,
  addMonitoredLocation,
  request,
} from '@/services/api';
import type {
  Location,
  TrafficReading,
  TrafficSegment,
  MonitoredLocation,
} from '@/types/traffic';

// Default location: Pune, Maharashtra (18.5204, 73.8567)
export const initialLocation: Location = {
  city: 'Pune',
  area: 'Central Pune',
  latitude: 18.5204,
  longitude: 73.8567,
  name: 'Central Pune, Pune, Maharashtra',
};

export const locationKey = (l: { latitude: number; longitude: number }) =>
  `${Number(l.latitude).toFixed(4)},${Number(l.longitude).toFixed(4)}`;

export interface TrafficContextValue {
  location: Location;
  selectLocation: (value: Location) => void;
  reading: TrafficReading | null;
  segments: TrafficSegment[];
  loading: boolean;
  segmentsLoading: boolean;
  error: string;
  segmentsError: string;
  lastUpdated: string | null;
  lastRefreshedAt: Date | null;
  isStale: boolean;
  refresh: () => void;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  health: 'checking' | 'online' | 'offline';
  monitoredLocations: MonitoredLocation[];
  loadMonitored: () => Promise<void>;
  addMonitored: (place?: Location, displayName?: string) => Promise<{ success: boolean; message: string }>;
  saved: Location[];
  save: (name?: string) => void;
  remove: (location: Location) => void;
  theme: string;
  toggleTheme: () => void;
}

const TrafficContext = createContext<TrafficContextValue | null>(null);

export function TrafficProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(initialLocation);
  const [reading, setReading] = useState<TrafficReading | null>(null);
  const [segments, setSegments] = useState<TrafficSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [segmentsError, setSegmentsError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [version, setVersion] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [monitoredLocations, setMonitoredLocations] = useState<MonitoredLocation[]>([]);
  const [saved, setSaved] = useState<Location[]>([]);
  const [theme, setTheme] = useState('light');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);

  // Initialize theme, saved locations, and monitored locations
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('trafficwatch-locations') || '[]');
      if (Array.isArray(stored)) {
        setSaved(
          stored.filter(
            l =>
              typeof l.city === 'string' &&
              typeof l.area === 'string' &&
              Number.isFinite(l.latitude) &&
              Number.isFinite(l.longitude)
          )
        );
      }
      const preference = localStorage.getItem('trafficwatch-theme') || 'light';
      setTheme(preference === 'dark' ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', preference === 'dark');
    } catch {
      /* browser storage may be disabled */
    }
  }, []);

  const loadMonitored = useCallback(async () => {
    try {
      const list = await getMonitoredLocations();
      setMonitoredLocations(list);
    } catch (err) {
      console.warn('Failed to load monitored locations:', err);
    }
  }, []);

  useEffect(() => {
    void loadMonitored();
  }, [loadMonitored]);

  // Main data fetching function
  const fetchTrafficData = useCallback(
    async (isBackgroundRefresh = false) => {
      if (isBackgroundRefresh && isFetchingRef.current) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      isFetchingRef.current = true;

      if (!isBackgroundRefresh) {
        setLoading(true);
        setSegmentsLoading(true);
        setError('');
        setSegmentsError('');
      }

      try {
        // Fetch live point reading, nearby segments, and health concurrently
        const [trafficResult, segmentsResult] = await Promise.allSettled([
          getTraffic(location, controller.signal),
          getNearbySegments(location.latitude, location.longitude, controller.signal),
        ]);

        if (controller.signal.aborted) return;

        let hasSuccess = false;

        // Process point reading
        if (trafficResult.status === 'fulfilled') {
          setReading(trafficResult.value);
          setError('');
          setHealth('online');
          hasSuccess = true;
        } else {
          const err = trafficResult.reason;
          if (err instanceof Error && err.name !== 'AbortError') {
            setError(err.message || 'Unable to fetch traffic reading.');
          }
        }

        // Process nearby segments
        if (segmentsResult.status === 'fulfilled') {
          setSegments(segmentsResult.value);
          setSegmentsError('');
          hasSuccess = true;
        } else {
          const err = segmentsResult.reason;
          if (err instanceof Error && err.name !== 'AbortError') {
            setSegmentsError(err.message || 'Unable to load nearby road segments.');
          }
        }

        if (hasSuccess) {
          setLastRefreshedAt(new Date());
          setIsStale(false);
        } else {
          // If refresh failed but previous data exists, flag as stale
          setIsStale(true);
        }

        // Check health
        request('/health', controller.signal)
          .then(() => {
            if (!controller.signal.aborted) setHealth('online');
          })
          .catch(() => {
            if (!controller.signal.aborted) setHealth('offline');
          });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setSegmentsLoading(false);
          isFetchingRef.current = false;
        }
      }
    },
    [location]
  );

  // Fetch when location or manual version changes
  useEffect(() => {
    void fetchTrafficData(false);
    return () => {
      abortControllerRef.current?.abort();
      isFetchingRef.current = false;
    };
  }, [fetchTrafficData, version]);

  // Periodic auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = window.setInterval(() => {
      void fetchTrafficData(true);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, fetchTrafficData]);

  const selectLocation = useCallback((value: Location) => {
    setLocation(prev => {
      if (
        Math.abs(prev.latitude - value.latitude) < 0.0001 &&
        Math.abs(prev.longitude - value.longitude) < 0.0001
      ) {
        return prev;
      }
      return {
        ...value,
        name: value.name || `${value.area}, ${value.city}`,
      };
    });
  }, []);

  const refresh = useCallback(() => {
    setVersion(v => v + 1);
    void loadMonitored();
  }, [loadMonitored]);

  const addMonitored = useCallback(
    async (place?: Location, displayName?: string) => {
      const target = place || location;
      try {
        const response = await addMonitoredLocation(target, displayName);
        await loadMonitored();
        return {
          success: true,
          message: response.message || `${displayName || target.area} added to backend monitoring.`,
        };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to add location to monitoring.',
        };
      }
    },
    [location, loadMonitored]
  );

  function persistSaved(next: Location[]) {
    setSaved(next);
    try {
      localStorage.setItem('trafficwatch-locations', JSON.stringify(next));
    } catch {
      setError('Browser storage is unavailable. Saved places will not persist.');
    }
  }

  function save(name?: string) {
    const toSave: Location = {
      ...location,
      name: name?.trim() || location.name || location.area,
    };
    persistSaved([...saved.filter(l => locationKey(l) !== locationKey(location)), toSave]);
    // Also sync with backend monitored locations
    void addMonitored(toSave, name);
  }

  function remove(value: Location) {
    persistSaved(saved.filter(l => locationKey(l) !== locationKey(value)));
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('trafficwatch-theme', next);
    } catch {
      /* theme still works */
    }
  }

  return (
    <TrafficContext.Provider
      value={{
        location,
        selectLocation,
        reading,
        segments,
        loading,
        segmentsLoading,
        error,
        segmentsError,
        lastUpdated: reading?.timestamp ?? null,
        lastRefreshedAt,
        isStale,
        refresh,
        autoRefreshEnabled,
        setAutoRefreshEnabled,
        health,
        monitoredLocations,
        loadMonitored,
        addMonitored,
        saved,
        save,
        remove,
        theme,
        toggleTheme,
      }}
    >
      {children}
    </TrafficContext.Provider>
  );
}

export function useTraffic() {
  const context = useContext(TrafficContext);
  if (!context) throw new Error('Traffic context missing');
  return context;
}
