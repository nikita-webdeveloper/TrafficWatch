import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Compass,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  RotateCcw,
  Route as RouteIcon,
  Search,
  Sparkles,
  TableProperties,
  Waypoints,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { searchLocations, getRoutes, getHistory } from '@/services/api';
import { LocationAutocomplete } from './LocationAutocomplete';
import type {
  Location,
  PlannedRoute,
  RoutePreference,
  TrafficReading,
} from '@/types/traffic';
import {
  getTrafficColor,
  getTrafficCondition,
  getTrafficLevel,
  CONGESTION_THRESHOLDS,
} from '@/lib/traffic-utils';
import { RouteMap, ROUTE_COLORS } from './RouteMap';

// Default Pune Coordinates for fallback map centering
const PUNE_DEFAULT_LOCATION: Location = {
  city: 'Pune',
  area: 'Central Pune',
  latitude: 18.5204,
  longitude: 73.8567,
  name: 'Central Pune, Maharashtra, India',
};

export function formatDetailedDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'Unavailable';
  }
  const totalSec = Math.round(seconds);
  if (totalSec < 0) return 'Unavailable';
  if (totalSec === 0) return '0 sec';
  if (totalSec < 60) return `${totalSec} sec`;

  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    if (mins > 0 && secs > 0) return `${hrs} hr ${mins} min ${secs} sec`;
    if (mins > 0) return `${hrs} hr ${mins} min`;
    if (secs > 0) return `${hrs} hr ${secs} sec`;
    return `${hrs} hr`;
  }

  return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
}

function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'Unavailable';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`;
}

function formatDistance(km?: number | null): string {
  if (km === null || km === undefined || !Number.isFinite(km)) {
    return 'Unavailable';
  }
  return `${km.toFixed(1)} km`;
}

interface PlaceSearchInputProps {
  label: string;
  value: Location | null;
  inputValue?: string;
  onSelect: (place: Location | null) => void;
  placeholder: string;
  iconColor?: string;
  onUseCurrentLocation?: () => void;
  locatingCurrent?: boolean;
  onQueryChange?: (query: string) => void;
  resetKey?: number;
}

function PlaceSearchInput({
  label,
  value,
  inputValue,
  onSelect,
  placeholder,
  iconColor = 'text-primary',
  onUseCurrentLocation,
  locatingCurrent = false,
  onQueryChange,
  resetKey = 0,
}: PlaceSearchInputProps) {
  return (
    <LocationAutocomplete
      label={label}
      aria-label={label}
      value={value}
      inputValue={inputValue}
      onSelect={onSelect}
      placeholder={placeholder}
      iconColor={iconColor}
      onInputChange={onQueryChange}
      resetKey={resetKey}
      showRecentSearches={true}
      rightAction={
        onUseCurrentLocation ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUseCurrentLocation}
            disabled={locatingCurrent}
            className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            title="Use your device's current location"
          >
            {locatingCurrent ? (
              <Loader2 size={11} className="mr-1 animate-spin" />
            ) : (
              <Navigation size={11} className="mr-1 text-primary" />
            )}
            Use current location
          </Button>
        ) : undefined
      }
    />
  );
}

export function RoutePlannerPage() {
  // Starting location and destination are empty by default
  const [source, setSource] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [resetCount, setResetCount] = useState(0);
  const [preference, setPreference] = useState<RoutePreference>('fastest');
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locatingCurrent, setLocatingCurrent] = useState(false);
  const [historyRows, setHistoryRows] = useState<TrafficReading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isMapMinimized, setIsMapMinimized] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Toggle native browser fullscreen or CSS-expanded fallback
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      if (mapContainerRef.current?.requestFullscreen) {
        mapContainerRef.current.requestFullscreen().catch(() => {
          setIsMapExpanded(prev => !prev);
        });
      } else {
        setIsMapExpanded(prev => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {
          setIsMapExpanded(false);
        });
      } else {
        setIsMapExpanded(false);
      }
    }
  }, []);

  // Sync fullscreen change with state and trigger Leaflet map resizing
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsMapExpanded(isFs);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle escape key and body overflow when CSS expanded fallback is active
  useEffect(() => {
    if (!isMapExpanded) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setIsMapExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMapExpanded]);

  // Trigger Leaflet map invalidateSize when un-minimizing
  useEffect(() => {
    if (!isMapMinimized) {
      const timers = [
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50),
        setTimeout(() => window.dispatchEvent(new Event('resize')), 200),
      ];
      return () => timers.forEach(t => clearTimeout(t));
    }
  }, [isMapMinimized]);

  // Active route calculation query tracker to prevent race conditions
  const activeSearchIdRef = useRef(0);

  // Check URL query parameters for prefilled starting point or destination (from My Locations handoff)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const startName = params.get('start_name');
        const startLat = params.get('start_lat');
        const startLon = params.get('start_lon');
        const destName = params.get('dest_name');
        const destLat = params.get('dest_lat');
        const destLon = params.get('dest_lon');

        if (
          startLat &&
          startLon &&
          Number.isFinite(parseFloat(startLat)) &&
          Number.isFinite(parseFloat(startLon))
        ) {
          const parsedStart: Location = {
            name: startName || 'Saved Location',
            city: params.get('start_city') || 'Pune',
            area: params.get('start_area') || (startName ? startName.split(',')[0].trim() : 'Start'),
            latitude: parseFloat(startLat),
            longitude: parseFloat(startLon),
          };
          setSource(parsedStart);
          setSourceQuery(parsedStart.name || '');
        }

        if (
          destLat &&
          destLon &&
          Number.isFinite(parseFloat(destLat)) &&
          Number.isFinite(parseFloat(destLon))
        ) {
          const parsedDest: Location = {
            name: destName || 'Saved Destination',
            city: params.get('dest_city') || 'Pune',
            area: params.get('dest_area') || (destName ? destName.split(',')[0].trim() : 'Destination'),
            latitude: parseFloat(destLat),
            longitude: parseFloat(destLon),
          };
          setDestination(parsedDest);
          setDestQuery(parsedDest.name || '');
        }
      }
    } catch {
      /* non-browser or parse error */
    }
  }, []);

  // Handle Geolocation (optional, triggered only on explicit click)
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLocatingCurrent(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        const currentLoc: Location = {
          city: 'Pune',
          area: 'My Current Location',
          name: `Current Location (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
          latitude,
          longitude,
        };
        setSource(currentLoc);
        setSourceQuery(currentLoc.name || '');
        setLocatingCurrent(false);
      },
      geoErr => {
        setLocatingCurrent(false);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setError('Location permission denied. Please search manually by landmark or address.');
        } else {
          setError('Unable to retrieve device position. Please search manually.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  // Swap Origin and Destination
  function handleSwapPlaces() {
    const tempLoc = source;
    const tempQuery = sourceQuery;
    setSource(destination);
    setSourceQuery(destQuery);
    setDestination(tempLoc);
    setDestQuery(tempQuery);
  }

  // Clear/Reset entire planner to empty state
  function handleReset() {
    setSource(null);
    setDestination(null);
    setSourceQuery('');
    setDestQuery('');
    setResetCount(c => c + 1);
    setRoutes([]);
    setSelectedRouteId(null);
    setError('');
    setGeneratedAt(null);
    setHistoryRows([]);
  }

  // Find Routes via POST /api/routes
  async function findRoutes() {
    let activeSource = source;
    let activeDest = destination;

    setLoading(true);
    setError('');

    // If source or destination was typed but not clicked in dropdown, auto-geocode first
    if (!activeSource && sourceQuery.trim().length >= 2) {
      try {
        const places = await searchLocations(sourceQuery.trim());
        if (places.length > 0 && places[0]) {
          activeSource = places[0];
          setSource(activeSource);
        }
      } catch (err) {
        console.warn('Auto-geocoding source failed:', err);
      }
    }

    if (!activeDest && destQuery.trim().length >= 2) {
      try {
        const places = await searchLocations(destQuery.trim());
        if (places.length > 0 && places[0]) {
          activeDest = places[0];
          setDestination(activeDest);
        }
      } catch (err) {
        console.warn('Auto-geocoding destination failed:', err);
      }
    }

    if (!activeSource || !activeDest) {
      setError('Please specify both a starting point and destination.');
      setLoading(false);
      return;
    }

    if (
      Math.abs(activeSource.latitude - activeDest.latitude) < 0.0001 &&
      Math.abs(activeSource.longitude - activeDest.longitude) < 0.0001
    ) {
      setError('Origin and destination appear to be identical. Please select different points.');
      setLoading(false);
      return;
    }

    const searchId = ++activeSearchIdRef.current;

    try {
      const response = await getRoutes(activeSource, activeDest, preference);

      if (searchId !== activeSearchIdRef.current) return;

      if (!response || !response.routes || response.routes.length === 0) {
        setError('No valid routes found between these locations. Please try nearby landmarks.');
        setRoutes([]);
        setSelectedRouteId(null);
        return;
      }

      setRoutes(response.routes);
      setGeneratedAt(response.generated_at);

      // Auto-select recommended route or first route
      const rec = response.routes.find(r => r.is_recommended);
      setSelectedRouteId(rec ? rec.id : response.routes[0]?.id || null);
    } catch (err) {
      if (searchId !== activeSearchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to calculate route alternatives.');
      setRoutes([]);
      setSelectedRouteId(null);
    } finally {
      if (searchId === activeSearchIdRef.current) {
        setLoading(false);
      }
    }
  }

  // Load historical congestion records for selected route endpoints
  const loadHistoryForRoute = useCallback(async () => {
    if (!source || !destination) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        city: source.city || destination.city || 'Pune',
      });
      const data = await getHistory(params);
      if (Array.isArray(data)) {
        setHistoryRows(data.slice(-5));
      }
    } catch (err) {
      console.warn('Could not load historical traffic for corridor:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [source, destination]);

  useEffect(() => {
    if (routes.length > 0) {
      void loadHistoryForRoute();
    }
  }, [routes.length, loadHistoryForRoute]);

  const selectedRoute = useMemo(
    () => routes.find(r => r.id === selectedRouteId) || routes[0] || null,
    [routes, selectedRouteId]
  );

  const minTravelTime = useMemo(() => {
    if (routes.length === 0) return null;
    const times = routes.map(r => r.travel_time_seconds).filter(Number.isFinite);
    return times.length > 0 ? Math.min(...times) : null;
  }, [routes]);

  const minDistance = useMemo(() => {
    if (routes.length === 0) return null;
    const distances = routes.map(r => r.distance_km).filter(Number.isFinite);
    return distances.length > 0 ? Math.min(...distances) : null;
  }, [routes]);

  const minCongestion = useMemo(() => {
    if (routes.length === 0) return null;
    const congestions = routes
      .map(r => r.congestion_percent)
      .filter((c): c is number => c !== null && c !== undefined && Number.isFinite(c));
    return congestions.length > 0 ? Math.min(...congestions) : null;
  }, [routes]);

  const preferenceOptions: { value: RoutePreference; label: string; desc: string }[] = [
    {
      value: 'fastest',
      label: 'Fastest',
      desc: 'Prioritizes lowest estimated travel time',
    },
    {
      value: 'shortest',
      label: 'Shortest',
      desc: 'Prioritizes shortest route distance',
    },
    {
      value: 'least_congested',
      label: 'Least Congested',
      desc: 'Prioritizes routes with minimal traffic delays',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="page-heading">
        <div>
          <p className="eyebrow">INTELLIGENT NAVIGATION</p>
          <h1>Route Planner</h1>
          <p>
            Real-time TomTom routing, congestion analysis along your corridor, and ML-powered 15-minute speed predictions.
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={loading} className="cursor-pointer">
            <RotateCcw size={14} className="mr-1.5" />
            Reset Planner
          </Button>
        </div>
      </header>

      {/* SECTION 1: Plan Your Journey */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Waypoints size={18} className="text-primary" />
            Plan Your Journey
          </CardTitle>
          <CardDescription>
            Search by area, landmark, or address to calculate optimal traffic-aware routes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Starting Location */}
          <PlaceSearchInput
            label="Starting Location"
            value={source}
            inputValue={sourceQuery}
            onSelect={loc => {
              setSource(loc);
              setSourceQuery(loc ? loc.name || `${loc.area}, ${loc.city}` : '');
            }}
            onQueryChange={setSourceQuery}
            resetKey={resetCount}
            placeholder="Enter starting location…"
            iconColor="text-emerald-600"
            onUseCurrentLocation={handleUseCurrentLocation}
            locatingCurrent={locatingCurrent}
          />

          {/* Swap Button */}
          <div className="flex justify-center -my-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSwapPlaces}
              disabled={!source && !destination && !sourceQuery && !destQuery}
              className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Swap start and destination"
            >
              <ArrowDownUp size={13} className="mr-1.5" />
              Swap start and destination
            </Button>
          </div>

          {/* Destination */}
          <PlaceSearchInput
            label="Destination"
            value={destination}
            inputValue={destQuery}
            onSelect={loc => {
              setDestination(loc);
              setDestQuery(loc ? loc.name || `${loc.area}, ${loc.city}` : '');
            }}
            onQueryChange={setDestQuery}
            resetKey={resetCount}
            placeholder="Enter destination…"
            iconColor="text-red-600"
          />

          {/* Route Preferences */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-foreground tracking-wide">
              Route Preference
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {preferenceOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPreference(opt.value)}
                  className={`rounded-lg border p-3 text-left transition-all cursor-pointer ${
                    preference === opt.value
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs font-semibold'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <div className="text-xs text-foreground flex items-center justify-between font-semibold">
                    <span>{opt.label}</span>
                    {preference === opt.value && (
                      <CheckCircle2 size={13} className="text-primary shrink-0" />
                    )}
                  </div>
                  <div className="text-[11px] mt-1 text-muted-foreground font-normal leading-snug">
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Route calculation notice</strong>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {/* Find Routes Button */}
          <Button
            className="w-full mt-2 h-10 text-sm font-semibold cursor-pointer"
            onClick={findRoutes}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={16} />
                Calculating optimal routes…
              </>
            ) : (
              <>
                <Search className="mr-2" size={16} />
                Find Routes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* SECTION 2: Interactive Route Map */}
      <Card
        ref={mapContainerRef}
        className={`border-border shadow-sm transition-all duration-200 ${
          isMapExpanded
            ? 'fixed inset-0 z-50 rounded-none border-0 m-0 p-4 sm:p-6 bg-card/95 backdrop-blur-md flex flex-col shadow-2xl overflow-hidden'
            : ''
        }`}
      >
        <CardHeader className={isMapExpanded ? 'p-0 pb-3 shrink-0' : 'pb-3'}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin size={18} className="text-primary" />
                {isMapExpanded ? 'Interactive Route Map (Expanded View)' : 'Interactive Route Map'}
              </CardTitle>
              <CardDescription>
                {routes.length === 0
                  ? 'Enter your starting location and destination to view available routes.'
                  : isMapExpanded
                    ? 'Full-screen route inspection with real-time congestion overlays. Select any candidate route below or use the map legend.'
                    : 'Color-coded candidate routes. The selected route is highlighted with detailed live congestion overlays.'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedRoute && (
                <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded font-semibold border border-primary/20">
                  Viewing: {selectedRoute.name} ({formatDistance(selectedRoute.distance_km)})
                </span>
              )}
              {isMapExpanded && routes.length > 1 && (
                <div className="hidden md:flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
                  {routes.map((r, i) => {
                    const isSel = r.id === selectedRouteId || (!selectedRouteId && i === 0);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRouteId(r.id)}
                        className={`px-2.5 py-0.5 text-xs rounded font-medium transition-colors ${
                          isSel
                            ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {r.name || `Route ${i + 1}`}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMapMinimized(prev => !prev)}
                className="flex items-center gap-1.5 h-8 text-xs cursor-pointer"
                aria-label={isMapMinimized ? 'Restore map' : 'Minimize map'}
                title={isMapMinimized ? 'Restore map' : 'Minimize map'}
              >
                {isMapMinimized ? (
                  <>
                    <Maximize2 size={13} />
                    <span>Restore map</span>
                  </>
                ) : (
                  <>
                    <Minimize2 size={13} />
                    <span>Minimize map</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant={isMapExpanded ? 'default' : 'outline'}
                size="sm"
                onClick={toggleFullscreen}
                className="flex items-center gap-1.5 h-8 text-xs cursor-pointer"
                aria-label={isMapExpanded ? 'Exit Fullscreen' : 'Expand Map'}
                title={isMapExpanded ? 'Exit Fullscreen (Esc)' : 'Expand Map'}
              >
                {isMapExpanded ? (
                  <>
                    <Minimize2 size={13} />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 size={13} />
                    <span>Expand Map</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMapExpanded ? 'flex-1 min-h-0 p-0 flex flex-col' : ''}>
          {isMapMinimized ? (
            <div className="p-6 bg-muted/40 rounded-lg border border-dashed border-border flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Compass size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Map minimized</p>
                  <p className="text-[11px] text-muted-foreground">
                    Click restore to inspect route geometry and live flow overlays.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={() => setIsMapMinimized(false)}
                className="text-xs h-8 cursor-pointer"
                aria-label="Restore map"
              >
                <Maximize2 size={13} className="mr-1.5" />
                Restore map
              </Button>
            </div>
          ) : (
            <RouteMap
              source={source}
              destination={destination}
              routes={routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              isExpanded={isMapExpanded}
              onToggleExpand={toggleFullscreen}
            />
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: Route Comparison */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <RouteIcon size={18} className="text-primary" />
                Route Alternatives
              </CardTitle>
              <CardDescription>
                Real metrics calculated with TomTom live traffic flow and speed predictions.
              </CardDescription>
            </div>
            {routes.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded font-medium">
                {routes.length} candidate{routes.length === 1 ? '' : 's'} evaluated
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {routes.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
              <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
                <Compass size={24} />
              </div>
              <h3 className="font-semibold text-sm text-foreground">Awaiting Route Calculation</h3>
              <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
                Enter your origin and destination, choose a preference, and click &ldquo;Find Routes&rdquo; to
                compare genuine alternatives with live traffic and ML predictions.
              </p>
            </div>
          ) : (
            <>
              {/* Route Summary Cards */}
              <div className="route-alternatives-container" data-testid="route-alternatives-container">
                <div className="route-alternatives-grid" data-testid="route-alternatives-grid">
                  {routes.map((route, idx) => {
                    const isSelected = route.id === selectedRouteId || (!selectedRouteId && idx === 0);
                    const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                    const congestionColor = getTrafficColor(route.congestion_percent ?? null);
                    const trafficLevel = getTrafficLevel(route.congestion_percent ?? null);
                    const trafficCondition = getTrafficCondition(route.congestion_percent ?? null);
                    const isFastest = minTravelTime !== null && route.travel_time_seconds === minTravelTime;
                    const isShortest = minDistance !== null && route.distance_km === minDistance;
                    const isLeastCongested =
                      routes.length > 1 &&
                      minCongestion !== null &&
                      route.congestion_percent !== null &&
                      route.congestion_percent !== undefined &&
                      route.congestion_percent === minCongestion;

                    return (
                      <div
                        key={route.id}
                        data-testid={`route-card-${route.id}`}
                        onClick={() => setSelectedRouteId(route.id)}
                        className={`route-alternative-card dashboard-card-enter rounded-xl border p-4 cursor-pointer transition-all duration-150 flex flex-col justify-between ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                            : 'border-border hover:border-primary/50 hover:shadow-xs bg-card'
                        }`}
                      >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="h-3 w-3 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-bold text-sm text-foreground">
                                {route.name || `Alternative ${idx + 1}`}
                              </span>
                              {isSelected && (
                                <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-bold">
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {route.is_recommended && (
                                <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                                  <Sparkles size={10} />
                                  Recommended
                                </span>
                              )}
                              {isFastest && (
                                <span className="rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 px-2 py-0.5 text-[10px] font-semibold">
                                  Fastest
                                </span>
                              )}
                              {isShortest && (
                                <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">
                                  Shortest
                                </span>
                              )}
                              {isLeastCongested && (
                                <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
                                  Least Congested
                                </span>
                              )}
                            </div>
                          </div>

                          {route.estimated_arrival_time && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock3 size={12} />
                              Arrival ~{route.estimated_arrival_time}
                            </span>
                          )}
                        </div>

                        {/* 4 Primary Metrics */}
                        <div className="mt-3 grid grid-cols-2 gap-3 route-card-metrics text-xs">
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Distance</span>
                            <strong className="text-sm font-semibold text-foreground">
                              {formatDistance(route.distance_km)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Current Travel Time</span>
                            <strong className="text-sm font-semibold text-foreground flex items-center gap-1">
                              <Clock3 size={13} className="text-primary" />
                              {formatDetailedDuration(route.travel_time_seconds)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Free-Flow Time</span>
                            <strong className="text-sm font-semibold text-foreground">
                              {route.free_flow_time_seconds != null
                                ? formatDetailedDuration(route.free_flow_time_seconds)
                                : 'Unavailable'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Traffic Delay</span>
                            <span
                              className={`text-sm font-semibold ${
                                route.traffic_delay_seconds && route.traffic_delay_seconds > 60
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : route.traffic_delay_seconds === 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-foreground'
                              }`}
                            >
                              {route.traffic_delay_seconds != null && Number.isFinite(route.traffic_delay_seconds)
                                ? route.traffic_delay_seconds > 0
                                  ? `+${formatDetailedDuration(route.traffic_delay_seconds)}`
                                  : '0 sec'
                                : 'Unavailable'}
                            </span>
                          </div>
                        </div>

                        {/* Prominent Traffic Congestion Details Line */}
                        <div className="mt-3 rounded-md bg-muted/40 border border-border p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: congestionColor }}
                            />
                            <span className="text-foreground font-medium">
                              Traffic Congestion:{' '}
                              {route.congestion_percent != null && Number.isFinite(route.congestion_percent) ? (
                                <strong className="font-semibold text-foreground">
                                  {route.congestion_percent.toFixed(1)}% — {trafficLevel}
                                </strong>
                              ) : (
                                <span className="text-muted-foreground">Traffic data unavailable</span>
                              )}
                            </span>
                          </div>

                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>
                              Traffic Delay:{' '}
                              <strong className="text-foreground">
                                {route.traffic_delay_seconds != null && Number.isFinite(route.traffic_delay_seconds)
                                  ? formatDetailedDuration(route.traffic_delay_seconds)
                                  : 'Unavailable'}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Estimated Travel Time:{' '}
                              <strong className="text-foreground">
                                {formatDetailedDuration(route.travel_time_seconds)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Traffic Congestion Alert (>= 50% elevated congestion) */}
                        {route.congestion_percent != null &&
                          Number.isFinite(route.congestion_percent) &&
                          route.congestion_percent >= CONGESTION_THRESHOLDS.ALERT_MIN && (
                            <div
                              role="alert"
                              className={`mt-3 flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                                route.congestion_percent >= CONGESTION_THRESHOLDS.MODERATE_MAX
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              <AlertTriangle
                                size={15}
                                className={`mt-0.5 shrink-0 ${
                                  route.congestion_percent >= CONGESTION_THRESHOLDS.MODERATE_MAX
                                    ? 'text-destructive'
                                    : 'text-amber-600'
                                }`}
                              />
                              <div>
                                <strong className="block font-semibold">
                                  {route.congestion_percent >= CONGESTION_THRESHOLDS.MODERATE_MAX
                                    ? 'Heavy traffic warning'
                                    : 'Elevated traffic warning'}
                                </strong>
                                <p className="mt-0.5 text-muted-foreground">
                                  This route has {route.congestion_percent.toFixed(1)}% congestion ({trafficCondition}). Consider comparing alternative routes.
                                </p>
                              </div>
                            </div>
                          )}

                        {/* Future Predicted Travel Time Badge (Separated from Current) */}
                        {route.prediction?.route_prediction_available &&
                          route.prediction.predicted_travel_time_seconds && (
                            <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-xs bg-muted/30 -mx-4 -mb-4 px-4 py-2 rounded-b-lg">
                              <div className="flex items-center gap-1.5 text-primary font-medium">
                                <BrainCircuit size={13} />
                                <span>Predicted Time (15m ahead):</span>
                                <strong>{formatDetailedDuration(route.prediction.predicted_travel_time_seconds)}</strong>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {route.prediction.coverage_percent}% road coverage
                              </span>
                            </div>
                          )}

                        {/* Recommendation Rationale */}
                        {route.is_recommended && (
                          <p className="mt-2 text-[11px] text-muted-foreground border-t border-border pt-1.5">
                            <strong className="text-emerald-600 dark:text-emerald-400">Why recommended:</strong>{' '}
                            {route.recommendation_reason?.trim() ||
                              (preference === 'fastest'
                                ? 'Selected for the fastest estimated journey using the available routing results.'
                                : preference === 'shortest'
                                  ? 'Selected using your shortest-distance preference.'
                                  : 'Selected using your least-congested route preference and available traffic information.')}
                          </p>
                        )}
                      </div>

                      {/* Card Selection Action */}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          {isSelected ? 'Active route on map' : 'Click to select route'}
                        </span>
                        <Button
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 text-xs px-3 cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedRouteId(route.id);
                          }}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>

              {/* Compact Route Comparison Table */}
              <div className="pt-3">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                  <div>
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <TableProperties size={16} className="text-primary" />
                      <span>Route Comparison Table</span>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Side-by-side comparison of all evaluated candidate routes with live traffic metrics.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded font-medium">
                    {routes.length} candidate route{routes.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="relative w-full overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[170px]">Route</TableHead>
                        <TableHead className="min-w-[130px]">Travel Time</TableHead>
                        <TableHead className="min-w-[130px]">Free-Flow Time</TableHead>
                        <TableHead className="min-w-[110px]">Traffic Delay</TableHead>
                        <TableHead className="min-w-[100px]">Congestion</TableHead>
                        <TableHead className="min-w-[150px]">Classification</TableHead>
                        <TableHead className="min-w-[100px] text-right">Selection</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routes.map((route, idx) => {
                        const isSelected = route.id === selectedRouteId || (!selectedRouteId && idx === 0);
                        const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                        const congestionColor = getTrafficColor(route.congestion_percent ?? null);
                        const isFastest = minTravelTime !== null && route.travel_time_seconds === minTravelTime;
                        const isShortest = minDistance !== null && route.distance_km === minDistance;

                        return (
                          <TableRow
                            key={route.id}
                            onClick={() => setSelectedRouteId(route.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10 font-semibold' : 'hover:bg-muted/50'
                            }`}
                            data-state={isSelected ? 'selected' : undefined}
                          >
                            <TableCell>
                              <div className="flex items-start gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full inline-block mt-1 shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-foreground text-xs">
                                    {route.name || `Route ${idx + 1}`}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {route.is_recommended && (
                                      <span className="rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-0.5">
                                        <Sparkles size={9} />
                                        Recommended
                                      </span>
                                    )}
                                    {isFastest && (
                                      <span className="rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-semibold">
                                        Fastest
                                      </span>
                                    )}
                                    {isShortest && (
                                      <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold">
                                        Shortest
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="flex flex-col text-xs">
                                <span className="font-semibold text-foreground tabular-nums">
                                  {formatDetailedDuration(route.travel_time_seconds)}
                                </span>
                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                  {formatDistance(route.distance_km)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs tabular-nums">
                              {route.free_flow_time_seconds != null
                                ? formatDetailedDuration(route.free_flow_time_seconds)
                                : <span className="text-muted-foreground">Unavailable</span>}
                            </TableCell>

                            <TableCell className="text-xs tabular-nums">
                              {route.traffic_delay_seconds != null && Number.isFinite(route.traffic_delay_seconds) ? (
                                <span
                                  className={`font-semibold ${
                                    route.traffic_delay_seconds > 60
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : route.traffic_delay_seconds === 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-foreground'
                                  }`}
                                >
                                  {route.traffic_delay_seconds > 0
                                    ? `+${formatDetailedDuration(route.traffic_delay_seconds)}`
                                    : '0 sec'}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Unavailable</span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs tabular-nums">
                              {route.congestion_percent != null && Number.isFinite(route.congestion_percent) ? (
                                <strong className="font-semibold text-foreground">
                                  {route.congestion_percent.toFixed(1)}%
                                </strong>
                              ) : (
                                <span className="text-muted-foreground">Unavailable</span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full inline-block shrink-0"
                                  style={{ backgroundColor: congestionColor }}
                                />
                                <span>{getTrafficCondition(route.congestion_percent)}</span>
                              </span>
                            </TableCell>

                            <TableCell className="text-right">
                              <Button
                                variant={isSelected ? 'default' : 'outline'}
                                size="sm"
                                className="h-7 text-xs px-2.5 cursor-pointer"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedRouteId(route.id);
                                }}
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {generatedAt && (
                <div className="pt-2 text-[11px] text-muted-foreground flex items-center justify-between border-t border-border">
                  <span>Routing Provider: TomTom Routing API</span>
                  <span>Calculated {new Date(generatedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
