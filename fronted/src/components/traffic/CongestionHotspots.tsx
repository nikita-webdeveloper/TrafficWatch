import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  ShieldAlert,
  ArrowUpDown,
  Clock,
  Loader2,
  X,
  ChevronRight,
  Info,
  Activity,
  Gauge,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getHotspots, searchLocations } from '@/services/api';
import { LocationAutocomplete } from './LocationAutocomplete';
import type { TrafficSegment, Location } from '@/types/traffic';
import {
  getTrafficColor,
  getTrafficCondition,
  getTrafficLevel,
  CONGESTION_THRESHOLDS,
} from '@/lib/traffic-utils';
import { HotspotMap } from './HotspotMap';

export const MONITORED_PRESETS: {
  name: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
}[] = [
  {
    name: 'Central Pune, Maharashtra',
    city: 'Pune',
    area: 'Central Pune',
    latitude: 18.5204,
    longitude: 73.8567,
  },
  {
    name: 'Hinjawadi IT Park, Pune',
    city: 'Pune',
    area: 'Hinjawadi',
    latitude: 18.5913,
    longitude: 73.7389,
  },
  {
    name: 'Bandra Kurla Complex, Mumbai',
    city: 'Mumbai',
    area: 'Bandra Kurla',
    latitude: 19.0657,
    longitude: 72.8687,
  },
  {
    name: 'Connaught Place, New Delhi',
    city: 'New Delhi',
    area: 'Connaught Place',
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    name: 'Koramangala, Bengaluru',
    city: 'Bengaluru',
    area: 'Koramangala',
    latitude: 12.9352,
    longitude: 77.6245,
  },
];

function formatTimestamp(value?: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not available';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDelay(delaySeconds?: number | null): string {
  if (delaySeconds === null || delaySeconds === undefined) return '—';
  if (delaySeconds <= 0) return 'No delay';
  const minutes = Math.round(delaySeconds / 60);
  if (minutes < 1) return '< 1 min delay';
  return `+${minutes} min delay`;
}

function getFrcDescription(frc?: string): string {
  switch (frc?.toUpperCase()) {
    case 'FRC0':
      return 'Motorway / Highway';
    case 'FRC1':
      return 'Major Arterial';
    case 'FRC2':
      return 'Arterial Road';
    case 'FRC3':
      return 'Secondary Arterial';
    case 'FRC4':
      return 'Connecting Road';
    case 'FRC5':
      return 'Local Collector';
    case 'FRC6':
      return 'Local Street';
    default:
      return frc ? `Road Class ${frc}` : 'Standard Road';
  }
}

export function CongestionHotspots() {
  // Active monitored location (defaults to Central Pune)
  const [currentLocation, setCurrentLocation] = useState<{
    name: string;
    city: string;
    area: string;
    latitude: number;
    longitude: number;
  }>(MONITORED_PRESETS[0]);

  // Hotspots data state
  const [segments, setSegments] = useState<TrafficSegment[]>([]);
  const [lastSuccessTimestamp, setLastSuccessTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection & UI state
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'heavy' | 'moderate' | 'low'>('all');
  const [sortOption, setSortOption] = useState<'desc' | 'asc' | 'delay'>('desc');
  const [roadFilterQuery, setRoadFilterQuery] = useState('');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Area search state
  const [citySearchInput, setCitySearchInput] = useState('');
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [citySearchResults, setCitySearchResults] = useState<Location[] | null>(null);
  const [citySearchError, setCitySearchError] = useState<string | null>(null);

  // Fetch hotspots for current location
  const fetchHotspotsData = useCallback(
    async (lat: number, lon: number, city?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await getHotspots(lat, lon, city);
        setSegments(response.hotspots);
        setLastSuccessTimestamp(response.generated_at);
        // If a previously selected segment no longer exists, reset selection
        setSelectedSegmentId(prev =>
          response.hotspots.some(s => s.id === prev) ? prev : null
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to retrieve congestion hotspots from the traffic service.';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Initial load or when monitored location changes
  useEffect(() => {
    void fetchHotspotsData(currentLocation.latitude, currentLocation.longitude, currentLocation.city);
  }, [currentLocation, fetchHotspotsData]);

  // Handle manual refresh
  const handleRefresh = () => {
    void fetchHotspotsData(currentLocation.latitude, currentLocation.longitude, currentLocation.city);
  };

  // Handle location search submit
  const handleCitySearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = citySearchInput.trim();
    if (query.length < 1) return;

    setIsSearchingCity(true);
    setCitySearchError(null);
    setCitySearchResults(null);

    try {
      const results = await searchLocations(query);
      if (!results || results.length === 0) {
        setCitySearchError(`No locations found for "${query}". Please try another search.`);
      } else {
        setCitySearchResults(results);
      }
    } catch (err) {
      setCitySearchError(err instanceof Error ? err.message : 'Location search failed. Please try again.');
    } finally {
      setIsSearchingCity(false);
    }
  };

  // Select a searched or preset location
  const handleSelectLocation = (loc: {
    name?: string;
    city: string;
    area: string;
    latitude: number;
    longitude: number;
  }) => {
    setCurrentLocation({
      name: loc.name || `${loc.area}, ${loc.city}`,
      city: loc.city,
      area: loc.area,
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    setCitySearchResults(null);
    setCitySearchInput('');
    setCitySearchError(null);
  };

  // Summary Metrics calculations
  const validSegments = useMemo(
    () =>
      segments.filter(
        s =>
          s.congestion_percent !== null &&
          s.congestion_percent !== undefined &&
          Number.isFinite(s.congestion_percent)
      ),
    [segments]
  );

  const lowCount = useMemo(
    () => validSegments.filter(s => (s.congestion_percent ?? 0) < CONGESTION_THRESHOLDS.LOW_MAX).length,
    [validSegments]
  );

  const moderateCount = useMemo(
    () =>
      validSegments.filter(
        s =>
          (s.congestion_percent ?? 0) >= CONGESTION_THRESHOLDS.LOW_MAX &&
          (s.congestion_percent ?? 0) < CONGESTION_THRESHOLDS.MODERATE_MAX
      ).length,
    [validSegments]
  );

  const heavyCount = useMemo(
    () =>
      validSegments.filter(s => (s.congestion_percent ?? 0) >= CONGESTION_THRESHOLDS.MODERATE_MAX).length,
    [validSegments]
  );

  // Filtered and Sorted segments for the ranked list
  const rankedSegments = useMemo(() => {
    let list = [...segments];

    // Filter by severity
    if (severityFilter === 'heavy') {
      list = list.filter(
        s =>
          s.congestion_percent !== null &&
          s.congestion_percent !== undefined &&
          s.congestion_percent >= CONGESTION_THRESHOLDS.MODERATE_MAX
      );
    } else if (severityFilter === 'moderate') {
      list = list.filter(
        s =>
          s.congestion_percent !== null &&
          s.congestion_percent !== undefined &&
          s.congestion_percent >= CONGESTION_THRESHOLDS.LOW_MAX &&
          s.congestion_percent < CONGESTION_THRESHOLDS.MODERATE_MAX
      );
    } else if (severityFilter === 'low') {
      list = list.filter(
        s =>
          s.congestion_percent !== null &&
          s.congestion_percent !== undefined &&
          s.congestion_percent < CONGESTION_THRESHOLDS.LOW_MAX
      );
    }

    // Filter by road name search
    if (roadFilterQuery.trim()) {
      const q = roadFilterQuery.toLowerCase().trim();
      list = list.filter(
        s =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          s.id.toLowerCase().includes(q) ||
          (s.frc && s.frc.toLowerCase().includes(q))
      );
    }

    // Sort order
    list.sort((a, b) => {
      if (sortOption === 'desc') {
        const congA = a.congestion_percent ?? -1;
        const congB = b.congestion_percent ?? -1;
        return congB - congA;
      }
      if (sortOption === 'asc') {
        const congA = a.congestion_percent ?? 999;
        const congB = b.congestion_percent ?? 999;
        return congA - congB;
      }
      if (sortOption === 'delay') {
        const delayA = a.delay_seconds ?? -1;
        const delayB = b.delay_seconds ?? -1;
        return delayB - delayA;
      }
      return 0;
    });

    return list;
  }, [segments, severityFilter, roadFilterQuery, sortOption]);

  // Selected segment details
  const selectedSegment = useMemo(
    () => segments.find(s => s.id === selectedSegmentId) || null,
    [segments, selectedSegmentId]
  );

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="page-heading flex-wrap gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Flame className="text-red-500 shrink-0" size={28} />
            Congestion Hotspots
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Real-time congestion monitoring and live road rankings based on verified TomTom traffic flow observations.
          </p>
        </div>

        <div className="heading-actions flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-right text-xs text-muted-foreground hidden sm:block">
            <span className="block text-[11px] text-muted-foreground/80">Last Updated</span>
            <span className="font-medium text-foreground">
              {formatTimestamp(lastSuccessTimestamp)}
            </span>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
            className="flex items-center gap-2 text-xs font-semibold h-9 px-3.5"
            aria-label="Refresh traffic hotspots"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
            <span>{loading ? 'Refreshing…' : 'Refresh Hotspots'}</span>
          </Button>
        </div>
      </div>

      {/* Mobile timestamp display */}
      <div className="sm:hidden flex items-center justify-between text-xs text-muted-foreground bg-card p-2.5 rounded-lg border border-border">
        <span>Last updated:</span>
        <span className="font-semibold text-foreground">
          {formatTimestamp(lastSuccessTimestamp)}
        </span>
      </div>

      {/* Error banner if fetch failed */}
      {error && (
        <div
          className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 flex items-start gap-3 text-xs sm:text-sm"
          role="alert"
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Traffic Service Unavailable</strong>
            <p>{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="shrink-0 text-xs border-red-500/30 text-red-700 hover:bg-red-500/20"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 2. City / Monitored Area Search & Quick Chips */}
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Active Area Indicator */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Currently Monitored Area
              </div>
              <div className="font-bold text-sm sm:text-base text-foreground flex items-center gap-1.5">
                <span>{currentLocation.name}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  ({currentLocation.latitude.toFixed(4)}°, {currentLocation.longitude.toFixed(4)}°)
                </span>
              </div>
            </div>
          </div>

          {/* Google Maps-style live autocomplete with optional manual search button */}
          <form
            onSubmit={handleCitySearch}
            className="flex items-start gap-2 w-full lg:max-w-md"
          >
            <div className="relative flex-1">
              <LocationAutocomplete
                placeholder="Search city or area in India (e.g. Pune, Mumbai, Delhi)…"
                aria-label="Search city or monitored area"
                inputValue={citySearchInput}
                onInputChange={val => {
                  setCitySearchInput(val);
                  if (!val.trim()) {
                    setCitySearchResults(null);
                    setCitySearchError(null);
                  }
                }}
                onSelect={loc => {
                  if (loc) {
                    handleSelectLocation(loc);
                  }
                }}
                onSearchSubmit={() => void handleCitySearch()}
                showRecentSearches={true}
              />
            </div>
            <Button
              type="submit"
              disabled={isSearchingCity || citySearchInput.trim().length < 1}
              size="sm"
              className="text-xs shrink-0 h-9 px-3.5"
            >
              {isSearchingCity ? <Loader2 size={13} className="animate-spin" /> : 'Search'}
            </Button>
          </form>
        </div>

        {/* Location search results picker if search performed */}
        {citySearchResults && citySearchResults.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">
                Select a matched location ({citySearchResults.length} found):
              </span>
              <button
                type="button"
                onClick={() => setCitySearchResults(null)}
                className="text-xs text-muted-foreground hover:text-foreground p-1"
                aria-label="Close search results"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {citySearchResults.slice(0, 6).map((loc, idx) => (
                <button
                  key={`${loc.latitude}-${loc.longitude}-${idx}`}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className="flex items-start gap-2 p-2.5 text-left rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer text-xs"
                >
                  <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                  <div className="truncate">
                    <div className="font-semibold text-foreground truncate">{loc.name || loc.area}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{loc.city}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {citySearchError && (
          <div className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
            <Info size={14} />
            <span>{citySearchError}</span>
          </div>
        )}

        {/* Quick Monitored City Chips */}
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground text-[11px] font-medium mr-1 flex items-center gap-1">
            <SlidersHorizontal size={12} />
            Quick Monitored Areas:
          </span>
          {MONITORED_PRESETS.map(preset => {
            const isCurrent =
              Math.abs(preset.latitude - currentLocation.latitude) < 0.005 &&
              Math.abs(preset.longitude - currentLocation.longitude) < 0.005;

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleSelectLocation(preset)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border'
                }`}
              >
                {preset.area}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Congestion Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Monitored Segments */}
        <div className="metric flex flex-col justify-between">
          <div className="metric-top">
            <span>TOTAL MONITORED</span>
            <div className="metric-icon">
              <Activity size={16} />
            </div>
          </div>
          <div className="metric-value">
            {loading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : segments.length}
            <small>segments</small>
          </div>
          <div className="metric-foot">
            Roads actively tracked in {currentLocation.city}
          </div>
        </div>

        {/* Low Congestion */}
        <div className="metric flex flex-col justify-between">
          <div className="metric-top">
            <span>LOW CONGESTION</span>
            <div className="metric-icon !bg-emerald-500/10 !text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="metric-value !text-emerald-600">
            {loading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : lowCount}
            <small>
              {segments.length > 0 ? `(${Math.round((lowCount / segments.length) * 100)}%)` : ''}
            </small>
          </div>
          <div className="metric-foot text-emerald-700 dark:text-emerald-400">
            Flowing smoothly (&lt;30% congestion)
          </div>
        </div>

        {/* Moderate Congestion */}
        <div className="metric flex flex-col justify-between">
          <div className="metric-top">
            <span>MODERATE CONGESTION</span>
            <div className="metric-icon !bg-amber-500/10 !text-amber-600">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="metric-value !text-amber-600">
            {loading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : moderateCount}
            <small>
              {segments.length > 0 ? `(${Math.round((moderateCount / segments.length) * 100)}%)` : ''}
            </small>
          </div>
          <div className="metric-foot text-amber-700 dark:text-amber-400">
            Noticeable slowdown (30% to &lt;60%)
          </div>
        </div>

        {/* Heavy Congestion */}
        <div className="metric flex flex-col justify-between">
          <div className="metric-top">
            <span>HEAVY CONGESTION</span>
            <div className="metric-icon !bg-red-500/10 !text-red-600">
              <Flame size={16} />
            </div>
          </div>
          <div className="metric-value !text-red-600">
            {loading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : heavyCount}
            <small>
              {segments.length > 0 ? `(${Math.round((heavyCount / segments.length) * 100)}%)` : ''}
            </small>
          </div>
          <div className="metric-foot text-red-700 dark:text-red-400">
            Severe bottleneck (≥60% congestion)
          </div>
        </div>
      </div>

      {/* 4. Interactive Map Section */}
      <section className="panel" aria-label="Interactive Congestion Map">
        <div className="panel-heading">
          <div>
            <h2 className="text-sm font-bold text-foreground">Interactive Road Congestion Map</h2>
            <p className="text-xs text-muted-foreground">
              Color-coded road polylines show live congestion severity. Click any road segment to view in-depth details.
            </p>
          </div>
          {selectedSegment && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground bg-primary/10 text-primary px-2.5 py-1 rounded-md">
                Viewing: {selectedSegment.name || selectedSegment.id}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedSegmentId(null)}
                className="h-7 text-xs px-2"
                title="Clear selected road"
              >
                <X size={13} className="mr-1" />
                Deselect
              </Button>
            </div>
          )}
        </div>

        <div className="p-0">
          <HotspotMap
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={setSelectedSegmentId}
            center={[currentLocation.latitude, currentLocation.longitude]}
            height={460}
            isExpanded={isMapExpanded}
            onToggleExpand={() => setIsMapExpanded(v => !v)}
          />
        </div>
      </section>

      {/* 5. Deep Breakdown: Selected Road Traffic Details Panel */}
      <section className="panel" aria-label="Traffic Details Panel">
        <div className="panel-heading">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Gauge size={16} className="text-primary" />
              Traffic Details Panel
            </h2>
            <p className="text-xs text-muted-foreground">
              Detailed speed telemetry, delay estimation, and telemetry quality for the selected road segment.
            </p>
          </div>
          {selectedSegment && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedSegmentId(null)}
              className="text-xs h-7"
            >
              Clear Selection
            </Button>
          )}
        </div>

        <div className="p-4 sm:p-5">
          {selectedSegment ? (
            <div className="space-y-5">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-foreground">
                      {selectedSegment.name || 'Monitored Road Segment'}
                    </h3>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white inline-flex items-center gap-1 shadow-sm"
                      style={{
                        backgroundColor: getTrafficColor(selectedSegment.congestion_percent),
                      }}
                    >
                      {getTrafficCondition(selectedSegment.congestion_percent)}
                    </span>
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded border border-border">
                      {getFrcDescription(selectedSegment.frc)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Segment ID: <code className="font-mono text-foreground">{selectedSegment.id}</code></span>
                    <span>·</span>
                    <span>
                      Start Coordinate:{' '}
                      <code className="font-mono text-foreground">
                        {selectedSegment.coordinates[0]?.[0].toFixed(5)}°,{' '}
                        {selectedSegment.coordinates[0]?.[1].toFixed(5)}°
                      </code>
                    </span>
                    <span>·</span>
                    <span>Last Updated: {formatTimestamp(selectedSegment.last_updated || lastSuccessTimestamp)}</span>
                  </div>
                </div>

                <div className="text-right sm:self-center shrink-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Congestion Level
                  </div>
                  <div
                    className="text-3xl font-extrabold font-mono"
                    style={{ color: getTrafficColor(selectedSegment.congestion_percent) }}
                  >
                    {selectedSegment.congestion_percent !== null && selectedSegment.congestion_percent !== undefined
                      ? `${selectedSegment.congestion_percent.toFixed(1)}%`
                      : 'Data Unavailable'}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-3.5 rounded-lg border border-border bg-card">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Current Speed
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {selectedSegment.current_speed_kmh !== null && selectedSegment.current_speed_kmh !== undefined
                      ? `${selectedSegment.current_speed_kmh.toFixed(1)} km/h`
                      : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Live observed vehicle flow
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-card">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Free-Flow Speed
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {selectedSegment.free_flow_speed_kmh !== null && selectedSegment.free_flow_speed_kmh !== undefined
                      ? `${selectedSegment.free_flow_speed_kmh.toFixed(1)} km/h`
                      : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Uncongested target speed
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-card">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Estimated Delay
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {formatDelay(selectedSegment.delay_seconds)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {selectedSegment.delay_seconds !== null && selectedSegment.delay_seconds !== undefined
                      ? `${selectedSegment.delay_seconds} seconds lost`
                      : 'Delay not calculated'}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-border bg-card">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Confidence Rating
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">
                    {selectedSegment.confidence !== null && selectedSegment.confidence !== undefined
                      ? `${Math.round(selectedSegment.confidence * 100)}%`
                      : 'High'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    TomTom telemetry confidence
                  </div>
                </div>
              </div>

              {/* Speed Comparison Visual Bar */}
              {selectedSegment.current_speed_kmh !== null &&
                selectedSegment.free_flow_speed_kmh !== null &&
                selectedSegment.free_flow_speed_kmh > 0 && (
                  <div className="p-3.5 rounded-lg bg-secondary/40 border border-border">
                    <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                      <span>Speed Efficiency Comparison</span>
                      <span className="text-muted-foreground">
                        {selectedSegment.current_speed_kmh < selectedSegment.free_flow_speed_kmh ? (
                          <span className="text-amber-600 font-semibold">
                            {(
                              selectedSegment.free_flow_speed_kmh - selectedSegment.current_speed_kmh
                            ).toFixed(1)}{' '}
                            km/h slower than free-flow
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Flowing at or above free-flow speed</span>
                        )}
                      </span>
                    </div>
                    <div className="h-3 w-full bg-border rounded-full overflow-hidden flex">
                      <div
                        className="h-full transition-all rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              5,
                              ((selectedSegment.current_speed_kmh || 0) /
                                (selectedSegment.free_flow_speed_kmh || 1)) *
                                100
                            )
                          )}%`,
                          backgroundColor: getTrafficColor(selectedSegment.congestion_percent),
                        }}
                      />
                    </div>
                  </div>
                )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                <Navigation size={22} />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No Road Segment Selected</h3>
              <p className="text-xs max-w-md text-muted-foreground leading-relaxed">
                Click any road on the map or select from the ranked list below to inspect full speed telemetry, delay estimates, and road attributes.
              </p>
              {rankedSegments.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedSegmentId(rankedSegments[0].id)}
                  className="mt-3 text-xs"
                >
                  <Flame size={13} className="mr-1 text-red-500" />
                  Inspect Most Congested Road (#{1})
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 6. Ranked List: Most Congested Roads */}
      <section className="panel" aria-label="Most Congested Roads Ranking">
        <div className="panel-heading flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Most Congested Roads in {currentLocation.city}</h2>
            <p className="text-xs text-muted-foreground">
              Ranked list of monitored road segments ordered by traffic severity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              Showing {rankedSegments.length} of {segments.length} segments
            </span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 border-b border-border bg-card/50 flex flex-wrap items-center justify-between gap-3">
          {/* Severity Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSeverityFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                severityFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border'
              }`}
            >
              All ({segments.length})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('heavy')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                severityFilter === 'heavy'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20'
              }`}
            >
              Heavy ({heavyCount})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('moderate')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                severityFilter === 'moderate'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
              }`}
            >
              Moderate ({moderateCount})
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('low')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                severityFilter === 'low'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
              }`}
            >
              Low ({lowCount})
            </button>
          </div>

          {/* Quick Road Search & Sort Option */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Filter roads…"
                value={roadFilterQuery}
                onChange={e => setRoadFilterQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {roadFilterQuery && (
                <button
                  type="button"
                  onClick={() => setRoadFilterQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <label htmlFor="hotspot-sort" className="text-xs text-muted-foreground hidden sm:inline">
                Sort:
              </label>
              <select
                id="hotspot-sort"
                value={sortOption}
                onChange={e => setSortOption(e.target.value as any)}
                className="text-xs py-1.5 px-2 rounded-lg border border-border bg-background text-foreground"
              >
                <option value="desc">Highest Congestion First</option>
                <option value="asc">Lowest Congestion First</option>
                <option value="delay">Highest Delay First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table of Roads */}
        <div className="overflow-x-auto">
          {loading && segments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-xs">Loading congestion hotspots for {currentLocation.city}…</span>
            </div>
          ) : rankedSegments.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 w-16 text-center">Rank</th>
                  <th className="py-3 px-4">Road Name / Identifier</th>
                  <th className="py-3 px-4">Current / Free-Flow Speed</th>
                  <th className="py-3 px-4">Congestion %</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Estimated Delay</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rankedSegments.map((segment, index) => {
                  const isSelected = segment.id === selectedSegmentId;
                  const color = getTrafficColor(segment.congestion_percent);
                  const condition = getTrafficCondition(segment.congestion_percent);

                  // Distinguish top 3 congested badges
                  const isTopRanked = index < 3 && sortOption === 'desc';

                  return (
                    <tr
                      key={segment.id}
                      onClick={() => setSelectedSegmentId(segment.id)}
                      className={`transition-colors cursor-pointer hover:bg-muted/40 ${
                        isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                      }`}
                    >
                      {/* Rank Position */}
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span
                          className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                            isTopRanked
                              ? index === 0
                                ? 'bg-red-500 text-white'
                                : index === 1
                                ? 'bg-amber-500 text-white'
                                : 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          #{index + 1}
                        </span>
                      </td>

                      {/* Road Name & Identifier */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate max-w-xs">{segment.name || 'Monitored Road Segment'}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>ID: {segment.id}</span>
                          <span>·</span>
                          <span>{getFrcDescription(segment.frc)}</span>
                        </div>
                      </td>

                      {/* Current Speed vs Free-Flow */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-foreground">
                          {segment.current_speed_kmh !== null && segment.current_speed_kmh !== undefined
                            ? `${segment.current_speed_kmh.toFixed(1)} km/h`
                            : '—'}{' '}
                          <span className="text-muted-foreground font-normal">
                            /{' '}
                            {segment.free_flow_speed_kmh !== null && segment.free_flow_speed_kmh !== undefined
                              ? `${segment.free_flow_speed_kmh.toFixed(1)} km/h`
                              : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Congestion % */}
                      <td className="py-3.5 px-4">
                        <span
                          className="font-bold font-mono text-sm"
                          style={{ color }}
                        >
                          {segment.congestion_percent !== null && segment.congestion_percent !== undefined
                            ? `${segment.congestion_percent.toFixed(1)}%`
                            : 'Data Unavailable'}
                        </span>
                      </td>

                      {/* Severity Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-xs"
                          style={{ backgroundColor: color }}
                        >
                          {condition}
                        </span>
                      </td>

                      {/* Traffic Delay */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-medium ${
                            (segment.delay_seconds || 0) > 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {formatDelay(segment.delay_seconds)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedSegmentId(segment.id);
                          }}
                          className="text-xs h-7 px-2.5"
                        >
                          {isSelected ? 'Selected' : 'View on map'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Flame size={24} className="mx-auto mb-2 text-muted-foreground opacity-50" />
              <div className="font-semibold text-foreground text-sm">No matching road segments</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No road segments match the current severity filter or search query. Try switching to "All" or clearing your search.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSeverityFilter('all');
                  setRoadFilterQuery('');
                }}
                className="mt-3 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
