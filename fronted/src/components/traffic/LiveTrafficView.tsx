import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Compass,
  Database,
  Eye,
  Filter,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Search,
  SlidersHorizontal,
  X,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTraffic, locationKey } from './TrafficProvider';
import { TrafficMap } from './TrafficMap';
import { LocationSearch } from './LocationSearch';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';
import type { TrafficSegment } from '@/types/traffic';

function formatDateTime(value?: string | Date | null): string {
  if (!value) return 'Not available';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateLong(value?: string | Date | null): string {
  if (!value) return 'Not available';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getFreshnessAge(timestamp?: string | Date | null): string {
  if (!timestamp) return 'Freshness unavailable';
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (Number.isNaN(d.getTime())) return 'Freshness unavailable';
  const now = new Date();
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (diffSeconds < 45) return 'Just now (< 1 min ago)';
  if (diffSeconds < 90) return '1 min ago';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
  const hours = Math.floor(diffSeconds / 3600);
  return `${hours} hr${hours > 1 ? 's' : ''} ago`;
}

export function LiveTrafficView() {
  const {
    location,
    reading,
    segments,
    loading,
    segmentsLoading,
    error,
    segmentsError,
    lastUpdated,
    lastRefreshedAt,
    isStale,
    refresh,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    health,
    monitoredLocations,
    save,
    saved,
  } = useTraffic();

  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    'default' | 'congestion-desc' | 'congestion-asc' | 'speed-desc' | 'speed-asc' | 'delay-desc'
  >('default');
  const [segmentQuery, setSegmentQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const mapPanelRef = useRef<HTMLElement>(null);

  const isSaved = saved.some(l => locationKey(l) === locationKey(location));
  const isMonitored = monitoredLocations.some(
    m => Math.abs(m.latitude - location.latitude) < 0.001 && Math.abs(m.longitude - location.longitude) < 0.001
  );

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && !isFullscreen) {
      if (mapPanelRef.current?.requestFullscreen) {
        mapPanelRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      } else {
        setIsFullscreen(true);
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  // Selected road segment (if selected) or primary point reading
  const selectedSegment =
    selectedSegmentIndex !== null && selectedSegmentIndex >= 0 && selectedSegmentIndex < segments.length
      ? segments[selectedSegmentIndex]
      : null;

  // Selected road segment metrics (honestly preserves null when unavailable)
  const selectedSpeed = selectedSegment
    ? selectedSegment.current_speed_kmh
    : reading?.current_speed_kmh !== undefined && reading?.current_speed_kmh !== null
    ? Number(reading.current_speed_kmh)
    : null;

  const selectedFreeFlow = selectedSegment
    ? selectedSegment.free_flow_speed_kmh
    : reading?.free_flow_speed_kmh !== undefined && reading?.free_flow_speed_kmh !== null
    ? Number(reading.free_flow_speed_kmh)
    : null;

  const selectedCongestion = selectedSegment
    ? selectedSegment.congestion_percent
    : reading?.congestion_percent !== undefined && reading?.congestion_percent !== null
    ? Number(reading.congestion_percent)
    : null;

  const selectedCondition = getTrafficCondition(selectedCongestion);
  const selectedColor = getTrafficColor(selectedCongestion);

  // Area-wide metrics calculated across valid reporting segments
  const validCongestionSegments = useMemo(
    () => segments.filter(s => s.congestion_percent !== null && Number.isFinite(s.congestion_percent)),
    [segments]
  );

  const avgCongestion = useMemo(() => {
    if (validCongestionSegments.length === 0) {
      return reading?.congestion_percent !== undefined && reading?.congestion_percent !== null
        ? Number(reading.congestion_percent)
        : null;
    }
    const sum = validCongestionSegments.reduce((acc, s) => acc + (s.congestion_percent || 0), 0);
    return sum / validCongestionSegments.length;
  }, [validCongestionSegments, reading]);

  const validSpeedSegments = useMemo(
    () => segments.filter(s => s.current_speed_kmh !== null && Number.isFinite(s.current_speed_kmh)),
    [segments]
  );

  const avgSpeed = useMemo(() => {
    if (validSpeedSegments.length === 0) return null;
    const sum = validSpeedSegments.reduce((acc, s) => acc + (s.current_speed_kmh || 0), 0);
    return sum / validSpeedSegments.length;
  }, [validSpeedSegments]);

  // Congestion distribution across 4 strict categories
  const distribution = useMemo(() => {
    const total = segments.length;
    let low = 0;
    let moderate = 0;
    let heavy = 0;
    let unknown = 0;

    for (const seg of segments) {
      if (seg.congestion_percent === null || !Number.isFinite(seg.congestion_percent)) {
        unknown++;
      } else if (seg.congestion_percent < 30) {
        low++;
      } else if (seg.congestion_percent < 60) {
        moderate++;
      } else {
        heavy++;
      }
    }

    return {
      total,
      low: { count: low, pct: total > 0 ? (low / total) * 100 : 0 },
      moderate: { count: moderate, pct: total > 0 ? (moderate / total) * 100 : 0 },
      heavy: { count: heavy, pct: total > 0 ? (heavy / total) * 100 : 0 },
      unknown: { count: unknown, pct: total > 0 ? (unknown / total) * 100 : 0 },
    };
  }, [segments]);

  // Filtered and sorted segments for table
  const processedSegments = useMemo(() => {
    let list = segments.map((seg, idx) => ({ ...seg, originalIndex: idx }));

    if (segmentQuery.trim()) {
      const q = segmentQuery.toLowerCase();
      list = list.filter(
        s =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.frc && s.frc.toLowerCase().includes(q)) ||
          `segment ${s.originalIndex + 1}`.includes(q)
      );
    }

    if (filterCondition !== 'all') {
      list = list.filter(s => {
        if (filterCondition === 'low') return s.congestion_percent !== null && s.congestion_percent < 30;
        if (filterCondition === 'moderate')
          return s.congestion_percent !== null && s.congestion_percent >= 30 && s.congestion_percent < 60;
        if (filterCondition === 'heavy') return s.congestion_percent !== null && s.congestion_percent >= 60;
        if (filterCondition === 'unknown')
          return s.congestion_percent === null || !Number.isFinite(s.congestion_percent);
        return true;
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'congestion-desc') {
        return (b.congestion_percent ?? -1) - (a.congestion_percent ?? -1);
      }
      if (sortBy === 'congestion-asc') {
        return (a.congestion_percent ?? 999) - (b.congestion_percent ?? 999);
      }
      if (sortBy === 'speed-desc') {
        return (b.current_speed_kmh ?? -1) - (a.current_speed_kmh ?? -1);
      }
      if (sortBy === 'speed-asc') {
        return (a.current_speed_kmh ?? 999) - (b.current_speed_kmh ?? 999);
      }
      if (sortBy === 'delay-desc') {
        return (b.delay_seconds ?? -1) - (a.delay_seconds ?? -1);
      }
      return a.originalIndex - b.originalIndex;
    });

    return list;
  }, [segments, segmentQuery, filterCondition, sortBy]);

  // Genuine connection / feed status evaluation
  const isUpdating = loading || segmentsLoading;
  const hasData = Boolean(reading || segments.length > 0);
  const isOffline = health === 'offline' || ((error || segmentsError) && !hasData);

  let statusBadgeText = 'Awaiting Live Feed';
  let statusBadgeClass = 'bg-muted text-muted-foreground border-border';
  let statusDotClass = 'bg-muted-foreground';

  if (isStale) {
    statusBadgeText = 'Stale Data (Refresh Failed)';
    statusBadgeClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25';
    statusDotClass = 'bg-amber-500';
  } else if (isUpdating && !hasData) {
    statusBadgeText = 'Connecting to Feed…';
    statusBadgeClass = 'bg-primary/10 text-primary border-primary/20';
    statusDotClass = 'bg-primary animate-spin';
  } else if (isUpdating && hasData) {
    statusBadgeText = 'Updating Traffic Data…';
    statusBadgeClass = 'bg-primary/10 text-primary border-primary/20';
    statusDotClass = 'bg-primary animate-pulse';
  } else if (health === 'offline') {
    statusBadgeText = 'Service Offline';
    statusBadgeClass = 'bg-destructive/10 text-destructive border-destructive/20';
    statusDotClass = 'bg-destructive';
  } else if ((error || segmentsError) && !hasData) {
    statusBadgeText = 'Feed Disconnected';
    statusBadgeClass = 'bg-destructive/10 text-destructive border-destructive/20';
    statusDotClass = 'bg-destructive';
  } else if (hasData && health === 'online') {
    statusBadgeText = 'Live Feed Connected';
    statusBadgeClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    statusDotClass = 'bg-emerald-500 animate-pulse';
  }

  // Handle "View on Map" click
  const handleViewOnMap = (index: number) => {
    setSelectedSegmentIndex(index);
    if (isMinimized) {
      setIsMinimized(false);
    }
    if (typeof mapPanelRef.current?.scrollIntoView === 'function') {
      mapPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          1. LIVE TRAFFIC HEADER AND CONTROLS
          ========================================================================= */}
      <header className="space-y-4">
        {/* Title bar with real connection status badge and actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Live Traffic
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass}`}
                data-testid="traffic-feed-status-badge"
              >
                <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                <span>{statusBadgeText}</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Real-time traffic flow, congestion levels, and multi-segment speed monitoring.
            </p>
          </div>

          {/* Action controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Manual Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isUpdating}
              className="h-9 px-3 text-xs font-semibold gap-1.5 shadow-xs"
              title="Fetch latest traffic data now"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={isUpdating ? 'animate-spin text-primary' : ''} />
              <span>{isUpdating ? 'Refreshing…' : 'Refresh'}</span>
            </Button>

            {/* Auto-Refresh Status Pill */}
            <button
              type="button"
              onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
              className={`h-9 px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                autoRefreshEnabled
                  ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
              }`}
              title={
                autoRefreshEnabled
                  ? 'Auto-refresh active (every 60s). Click to pause.'
                  : 'Auto-refresh paused. Click to enable.'
              }
              aria-label={autoRefreshEnabled ? 'Pause auto-refresh' : 'Enable auto-refresh'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  autoRefreshEnabled ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                }`}
              />
              <span>{autoRefreshEnabled ? 'Auto-refresh 60s' : 'Auto-refresh Paused'}</span>
            </button>

            {/* Save Location Action */}
            <Button
              size="sm"
              variant={isSaved || isMonitored ? 'secondary' : 'default'}
              onClick={() => save()}
              className="h-9 px-3 text-xs font-semibold gap-1.5 shadow-xs"
              title="Save or monitor this location"
            >
              <Bookmark size={14} />
              <span>{isSaved || isMonitored ? 'Location Monitored' : 'Save Location'}</span>
            </Button>
          </div>
        </div>

        {/* Location Search Bar & Active Coordinates Strip */}
        <div className="space-y-3">
          <LocationSearch placeholder="Search any city, road, or area in India to view live traffic (e.g. Pune, Shivajinagar, FC Road)…" />

          <div className="location-strip flex-wrap">
            <div className="location-title">
              <span className="location-icon">
                <MapPin size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    {location.area}, {location.city}
                  </h3>
                  {isMonitored && (
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Monitored Location
                    </span>
                  )}
                  {selectedSegment && (
                    <span className="text-[10px] bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      <span>Inspecting {selectedSegment.name || `Road segment ${selectedSegmentIndex! + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSegmentIndex(null)}
                        className="ml-1 hover:text-foreground text-[10px] underline font-bold"
                        title="Clear segment inspection"
                        aria-label="Clear segment inspection"
                      >
                        (Clear)
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {location.latitude.toFixed(4)}° N · {location.longitude.toFixed(4)}° E
                  <span className="mx-2">|</span> Provider: TomTom Flow API
                </p>
              </div>
            </div>

            <div className="data-status flex-wrap">
              {isUpdating ? (
                <Loader2 size={13} className="animate-spin text-primary" />
              ) : (
                <span className={`status-dot ${hasData && !isStale && !isOffline ? 'online' : 'offline'}`} />
              )}
              <span className="text-xs">
                {isUpdating
                  ? 'Retrieving live traffic…'
                  : lastRefreshedAt
                  ? `Updated ${formatDateTime(lastRefreshedAt)}`
                  : reading?.timestamp
                  ? `Observation ${formatDateTime(reading.timestamp)}`
                  : 'Awaiting data'}
              </span>
            </div>
          </div>
        </div>

        {/* Stale or Error Notice if applicable */}
        {isStale && (
          <div
            className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs flex items-center justify-between gap-3 shadow-xs"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>
                <strong>Traffic data is stale:</strong> The most recent background refresh attempt failed. Displaying previously recorded readings.
              </span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 shrink-0" onClick={refresh}>
              Retry Refresh
            </Button>
          </div>
        )}

        {(error || segmentsError) && !isStale && (
          <div
            className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center justify-between gap-3 shadow-xs"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error || segmentsError}</span>
            </div>
            <Button size="sm" variant="secondary" className="h-7 text-xs px-2.5 shrink-0" onClick={refresh}>
              Retry
            </Button>
          </div>
        )}
      </header>

      {/* =========================================================================
          2. TRAFFIC SUMMARY METRIC CARDS (6 CARDS)
          ========================================================================= */}
      <section aria-label="Traffic Summary Metrics">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity size={14} className="text-primary" />
            <span>Traffic Summary</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {selectedSegment
              ? `Inspecting: ${selectedSegment.name || `Segment #${selectedSegmentIndex! + 1}`}`
              : 'Scope: Selected Road & Monitored Network'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Current Speed */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Speed
                </span>
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Gauge size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                {isUpdating && selectedSpeed === null ? (
                  <span className="text-2xl font-extrabold tracking-tight text-foreground animate-pulse">—</span>
                ) : selectedSpeed !== null ? (
                  <>
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {selectedSpeed.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">km/h</span>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold tracking-tight text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {selectedSegment ? 'Speed on inspected road segment' : 'Speed on primary selected road'}
            </p>
          </article>

          {/* Card 2: Free-Flow Speed */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Free-Flow Speed
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <RouteIcon size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                {isUpdating && selectedFreeFlow === null ? (
                  <span className="text-2xl font-extrabold tracking-tight text-foreground animate-pulse">—</span>
                ) : selectedFreeFlow !== null ? (
                  <>
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {selectedFreeFlow.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">km/h</span>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold tracking-tight text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {selectedSegment ? 'Ideal flow without delays' : 'Expected unimpeded speed baseline'}
            </p>
          </article>

          {/* Card 3: Road Congestion */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Road Congestion
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Activity size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                {isUpdating && selectedCongestion === null ? (
                  <span className="text-2xl font-extrabold tracking-tight text-foreground animate-pulse">—</span>
                ) : selectedCongestion !== null ? (
                  <>
                    <span
                      className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                      style={{ color: selectedColor }}
                    >
                      {selectedCongestion.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">%</span>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold tracking-tight text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {selectedSegment ? 'Relative delay on inspected road' : 'Point delay relative to free-flow'}
            </p>
          </article>

          {/* Card 4: Traffic Condition */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Traffic Condition
                </span>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${selectedColor}15`,
                    color: selectedColor,
                  }}
                >
                  <Activity size={14} />
                </div>
              </div>
              <div className="my-1">
                <span
                  className="text-sm font-bold flex items-center gap-1.5 truncate"
                  style={{ color: selectedColor }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: selectedColor }}
                  />
                  <span className="truncate">{selectedCondition}</span>
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {selectedCongestion !== null
                ? selectedCongestion < 30
                  ? 'Speed at near normal capacity'
                  : selectedCongestion < 60
                  ? 'Moderate slowdown observed'
                  : 'Severe congestion & delays'
                : 'Condition data unavailable'}
            </p>
          </article>

          {/* Card 5: Road Segments */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Road Segments
                </span>
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MapPin size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                {segmentsLoading ? (
                  <span className="text-2xl font-extrabold tracking-tight text-foreground animate-pulse">…</span>
                ) : (
                  <>
                    <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                      {segments.length}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {segments.length === 1 ? 'road' : 'roads'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {validCongestionSegments.length > 0
                ? `${validCongestionSegments.length} reporting live flow`
                : 'Active road segments mapped nearby'}
            </p>
          </article>

          {/* Card 6: Average Congestion */}
          <article className="dashboard-metric-card flex flex-col justify-between h-full min-h-[128px]">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Area Congestion
                </span>
                <div className="w-7 h-7 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
                  <Clock3 size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-1 my-1">
                {segmentsLoading && loading ? (
                  <span className="text-2xl font-extrabold tracking-tight text-foreground animate-pulse">—</span>
                ) : avgCongestion !== null ? (
                  <>
                    <span
                      className="text-2xl sm:text-3xl font-extrabold tracking-tight"
                      style={{ color: getTrafficColor(avgCongestion) }}
                    >
                      {avgCongestion.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">%</span>
                  </>
                ) : (
                  <span className="text-2xl font-extrabold tracking-tight text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60 truncate">
              {validCongestionSegments.length > 0
                ? `Area avg across ${validCongestionSegments.length} segments`
                : 'Calculated across valid segment data'}
            </p>
          </article>
        </div>
      </section>

      {/* =========================================================================
          3. LIVE TRAFFIC ROAD MAP (MAIN VISUAL FEATURE)
          ========================================================================= */}
      <section
        ref={mapPanelRef}
        className={`panel live-traffic-map-panel ${isFullscreen ? 'is-fullscreen' : ''} ${
          isMinimized ? 'is-minimized' : ''
        }`}
        aria-label="Live Traffic Road Map"
      >
        <div className="panel-heading flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-foreground">Live Traffic Road Map</h2>
              {selectedSegmentIndex !== null && (
                <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded border border-primary/20">
                  Segment #{selectedSegmentIndex + 1} Selected
                </span>
              )}
              {isFullscreen && (
                <span className="text-[10px] font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded">
                  Fullscreen Mode
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Multi-segment live flow around {location.area}, {location.city}. Click any road to inspect or click the map to change location.
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {selectedSegmentIndex !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedSegmentIndex(null)}
                aria-label="Clear road segment selection"
              >
                <X size={12} className="mr-1" />
                <span>Clear Selection</span>
              </Button>
            )}

            {/* Minimize / Restore Map button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs flex items-center gap-1"
              onClick={() => setIsMinimized(v => !v)}
              title={isMinimized ? 'Restore map' : 'Minimize map'}
              aria-label={isMinimized ? 'Restore map' : 'Minimize map'}
            >
              {isMinimized ? (
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

            {/* Fullscreen Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs flex items-center gap-1"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <>
                  <Minimize size={13} />
                  <span>Exit fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize size={13} />
                  <span>Enter fullscreen</span>
                </>
              )}
            </Button>

            <span className="data-status text-xs hidden sm:flex items-center gap-1 pl-1">
              <Radio size={13} className={hasData && !isOffline ? 'text-emerald-500' : 'text-muted-foreground'} />
              <span>{segments.length} segments mapped</span>
            </span>
          </div>
        </div>

        {isMinimized ? (
          <div className="p-6 bg-card/60 flex items-center justify-between text-xs border-t border-border">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Compass size={16} className="text-primary" />
              <span>Map is minimized. Click &ldquo;Restore map&rdquo; to expand the interactive live flow visualization.</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsMinimized(false)}>
              Restore map
            </Button>
          </div>
        ) : (
          <TrafficMap
            expanded={!isFullscreen}
            isFullscreen={isFullscreen}
            selectedSegmentIndex={selectedSegmentIndex}
            onSelectSegment={setSelectedSegmentIndex}
          />
        )}
      </section>

      {/* =========================================================================
          4. TRAFFIC CONDITION DISTRIBUTION
          ========================================================================= */}
      <section className="panel" aria-label="Traffic Condition Distribution">
        <div className="panel-heading flex-wrap gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">Traffic Condition Distribution</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Breakdown of {distribution.total} nearby monitored road segment{distribution.total === 1 ? '' : 's'} by congestion severity
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {distribution.total > 0 ? `${distribution.total} total segments analyzed` : 'No segments found'}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {distribution.total === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Compass size={22} />
              </div>
              <h3>No road segments available</h3>
              <p>
                No active traffic road segments were returned for this location by the TomTom Traffic Flow API. Try searching for a major road, city center, or clicking another point on the map.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Low Congestion */}
              <div className="p-4 rounded-lg border border-border bg-card hover:border-[#059669]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
                    Low Congestion
                  </span>
                  <span className="text-xs font-bold text-[#059669]">&lt; 30%</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">{distribution.low.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({distribution.low.pct.toFixed(0)}% of roads)
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#059669] h-full rounded-full transition-all duration-300"
                    style={{ width: `${distribution.low.pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Smooth flow near baseline speed</p>
              </div>

              {/* Card 2: Moderate Congestion */}
              <div className="p-4 rounded-lg border border-border bg-card hover:border-[#eab308]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#eab308]" />
                    Moderate Congestion
                  </span>
                  <span className="text-xs font-bold text-[#eab308]">30–59%</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">{distribution.moderate.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({distribution.moderate.pct.toFixed(0)}% of roads)
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#eab308] h-full rounded-full transition-all duration-300"
                    style={{ width: `${distribution.moderate.pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Noticeable slowdowns and mild delays</p>
              </div>

              {/* Card 3: Heavy Congestion */}
              <div className="p-4 rounded-lg border border-border bg-card hover:border-[#dc2626]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
                    Heavy Congestion
                  </span>
                  <span className="text-xs font-bold text-[#dc2626]">≥ 60%</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">{distribution.heavy.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({distribution.heavy.pct.toFixed(0)}% of roads)
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#dc2626] h-full rounded-full transition-all duration-300"
                    style={{ width: `${distribution.heavy.pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Substantial delays & bumper-to-bumper</p>
              </div>

              {/* Card 4: Data Unavailable */}
              <div className="p-4 rounded-lg border border-border bg-card hover:border-[#64748b]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#64748b]" />
                    Data Unavailable
                  </span>
                  <span className="text-xs font-bold text-[#64748b]">N/A</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">{distribution.unknown.count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({distribution.unknown.pct.toFixed(0)}% of roads)
                  </span>
                </div>
                <div className="mt-3 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[#64748b] h-full rounded-full transition-all duration-300"
                    style={{ width: `${distribution.unknown.pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Sensors currently reporting no speed</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          5. MONITORED ROAD SEGMENTS (TABLE)
          ========================================================================= */}
      <section className="panel" aria-label="Monitored Road Segments">
        <div className="panel-heading flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-foreground">Monitored Road Segments</h2>
              <span className="text-[11px] text-muted-foreground font-normal hidden sm:inline">
                Nearby Road Segments
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real readings returned from TomTom Traffic Flow API. Click a segment to highlight and focus on the map.
            </p>
          </div>

          {/* Filtering, Searching, and Sorting Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Road Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                value={segmentQuery}
                onChange={e => setSegmentQuery(e.target.value)}
                placeholder="Search road name…"
                aria-label="Search road segments"
                className="h-8 text-xs pl-8 pr-7 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary w-36 sm:w-44"
              />
              {segmentQuery && (
                <button
                  type="button"
                  onClick={() => setSegmentQuery('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Condition Filter Buttons (Sum matches Total) */}
            <div className="flex items-center rounded-md border border-border p-0.5 bg-background text-xs flex-wrap">
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors text-[11px] font-medium ${
                  filterCondition === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilterCondition('all')}
              >
                All ({segments.length})
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors text-[11px] font-medium ${
                  filterCondition === 'low'
                    ? 'bg-[#059669] text-white font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilterCondition('low')}
              >
                Low ({distribution.low.count})
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors text-[11px] font-medium ${
                  filterCondition === 'moderate'
                    ? 'bg-[#eab308] text-slate-900 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilterCondition('moderate')}
              >
                Moderate ({distribution.moderate.count})
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded transition-colors text-[11px] font-medium ${
                  filterCondition === 'heavy'
                    ? 'bg-[#dc2626] text-white font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilterCondition('heavy')}
              >
                Heavy ({distribution.heavy.count})
              </button>
              {distribution.unknown.count > 0 && (
                <button
                  type="button"
                  className={`px-2 py-1 rounded transition-colors text-[11px] font-medium ${
                    filterCondition === 'unknown'
                      ? 'bg-[#64748b] text-white font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setFilterCondition('unknown')}
                >
                  Unavailable ({distribution.unknown.count})
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <select
              aria-label="Sort segments"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="h-8 text-xs bg-background border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="default">Default Order</option>
              <option value="congestion-desc">Highest Congestion</option>
              <option value="congestion-asc">Lowest Congestion</option>
              <option value="speed-desc">Fastest Speed</option>
              <option value="speed-asc">Slowest Speed</option>
              <option value="delay-desc">Longest Delay</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {segmentsLoading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin text-primary" />
            <span className="text-xs">Loading road segments from traffic service…</span>
          </div>
        ) : processedSegments.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs">
            {segments.length === 0
              ? 'No road segments available for this area.'
              : 'No segments match the selected search or filter criteria.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">Road Segment</th>
                  <th className="py-2.5 px-3">Condition</th>
                  <th className="py-2.5 px-3">Congestion</th>
                  <th className="py-2.5 px-3">Current Speed</th>
                  <th className="py-2.5 px-3">Free-Flow Speed</th>
                  <th className="py-2.5 px-3">Estimated Delay</th>
                  <th className="py-2.5 px-3 text-right">View on Map</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processedSegments.map(seg => {
                  const isSelected = selectedSegmentIndex === seg.originalIndex;
                  const segColor = getTrafficColor(seg.congestion_percent);
                  const segCond = getTrafficCondition(seg.congestion_percent);
                  const fallbackName = `Road segment ${seg.originalIndex + 1}`;
                  const displayName = seg.name || fallbackName;

                  const delayDisplay =
                    seg.delay_seconds !== null && seg.delay_seconds !== undefined
                      ? seg.delay_seconds > 60
                        ? `+${(seg.delay_seconds / 60).toFixed(1)} min`
                        : seg.delay_seconds > 0
                        ? `+${seg.delay_seconds}s`
                        : 'No delay'
                      : seg.current_travel_time_seconds
                      ? `${(seg.current_travel_time_seconds / 60).toFixed(1)} min trip`
                      : 'N/A';

                  return (
                    <tr
                      key={`table-seg-${seg.originalIndex}`}
                      onClick={() => handleViewOnMap(seg.originalIndex)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-l-4 border-l-primary font-medium'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      {/* Name & Class */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: segColor }}
                          />
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              <span>{displayName}</span>
                              {isSelected && (
                                <span className="text-[10px] bg-primary text-primary-foreground font-bold px-1.5 py-0.2 rounded">
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              {seg.frc ? (
                                <span className="uppercase text-[9px] bg-muted px-1 rounded font-mono">
                                  {seg.frc}
                                </span>
                              ) : null}
                              <span>{seg.coordinates.length} coords</span>
                              {seg.confidence !== null && seg.confidence !== undefined && (
                                <span>· {(seg.confidence * 100).toFixed(0)}% conf</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Condition Badge */}
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold"
                          style={{
                            color: segColor,
                            backgroundColor: `${segColor}15`,
                            border: `1px solid ${segColor}30`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: segColor }}
                          />
                          {segCond}
                        </span>
                      </td>

                      {/* Congestion % */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-foreground">
                          {seg.congestion_percent !== null && Number.isFinite(seg.congestion_percent)
                            ? `${seg.congestion_percent.toFixed(1)}%`
                            : 'N/A'}
                        </span>
                      </td>

                      {/* Current Speed */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-foreground">
                          {seg.current_speed_kmh !== null && Number.isFinite(seg.current_speed_kmh)
                            ? `${seg.current_speed_kmh} km/h`
                            : 'N/A'}
                        </span>
                      </td>

                      {/* Free Flow Speed */}
                      <td className="py-3 px-3 text-muted-foreground">
                        {seg.free_flow_speed_kmh !== null && Number.isFinite(seg.free_flow_speed_kmh)
                          ? `${seg.free_flow_speed_kmh} km/h`
                          : 'N/A'}
                      </td>

                      {/* Estimated Delay */}
                      <td className="py-3 px-3 text-muted-foreground">
                        <span
                          className={
                            seg.delay_seconds && seg.delay_seconds > 120
                              ? 'text-destructive font-semibold'
                              : 'text-muted-foreground'
                          }
                        >
                          {delayDisplay}
                        </span>
                      </td>

                      {/* View on Map Action */}
                      <td className="py-3 px-3 text-right">
                        <Button
                          size="sm"
                          variant={isSelected ? 'secondary' : 'outline'}
                          className="h-7 text-[11px] px-2.5"
                          onClick={e => {
                            e.stopPropagation();
                            handleViewOnMap(seg.originalIndex);
                          }}
                          aria-label={`View ${displayName} on map`}
                        >
                          <Eye size={12} className="mr-1" />
                          <span>{isSelected ? 'Focused' : 'View on Map'}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================================================================
          6. COMPACT TRAFFIC DATA STATUS SECTION (REPLACES LARGE VERIFICATION PANEL)
          ========================================================================= */}
      <section className="panel" aria-label="Traffic Data Status">
        <div className="panel-heading flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primary shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-foreground">Traffic Data Status</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time telemetry integrity, provider connection, and freshness metrics
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClass}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
            <span>{statusBadgeText}</span>
          </span>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Compact Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            {/* Provider */}
            <div className="p-3 rounded-lg border border-border bg-card">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Provider
              </span>
              <span className="font-bold text-foreground block mt-1 truncate">TomTom Traffic API</span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">Flow Segment Data v4</span>
            </div>

            {/* Connection / Feed Status */}
            <div className="p-3 rounded-lg border border-border bg-card">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Feed Status
              </span>
              <span className="font-bold text-foreground block mt-1 truncate">{statusBadgeText}</span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {isStale
                  ? 'Retry pending'
                  : hasData
                  ? 'Active stream'
                  : 'Awaiting connection'}
              </span>
            </div>

            {/* Last Successful Observation */}
            <div className="p-3 rounded-lg border border-border bg-card">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Last Observation
              </span>
              <span className="font-bold text-foreground block mt-1 truncate">
                {reading?.timestamp
                  ? formatDateTime(reading.timestamp)
                  : segments[0]?.last_updated
                  ? formatDateTime(segments[0].last_updated)
                  : 'Not available'}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {reading?.timestamp ? formatDateLong(reading.timestamp) : 'Awaiting observation'}
              </span>
            </div>

            {/* Client Refresh / Freshness */}
            <div className="p-3 rounded-lg border border-border bg-card">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Freshness / Age
              </span>
              <span className="font-bold text-foreground block mt-1 truncate">
                {getFreshnessAge(reading?.timestamp || lastRefreshedAt)}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Client refreshed: {formatDateTime(lastRefreshedAt)}
              </span>
            </div>

            {/* Monitored Coverage */}
            <div className="p-3 rounded-lg border border-border bg-card col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Coverage
              </span>
              <span className="font-bold text-foreground block mt-1">
                {segments.length} road segment{segments.length === 1 ? '' : 's'}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {validCongestionSegments.length} reporting live speeds
              </span>
            </div>
          </div>

          {/* Stale or Incomplete warning if feed is having issues */}
          {isStale && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>
                <strong>Feed update delayed:</strong> Background refresh failed to reach the traffic service. The displayed observations reflect the previous successful cycle.
              </span>
            </div>
          )}

          {distribution.unknown.count > 0 && (
            <div className="p-3 rounded-lg bg-muted/60 border border-border text-muted-foreground text-xs flex items-center gap-2">
              <Info size={15} className="shrink-0 text-muted-foreground" />
              <span>
                <strong>Coverage Notice:</strong> {distribution.unknown.count} road segment{distribution.unknown.count === 1 ? '' : 's'} in this area currently have no active probe vehicle readings; these are reported as <em>Data Unavailable</em> rather than zero congestion.
              </span>
            </div>
          )}

          {/* Expandable "Data quality and coverage details" button */}
          <div className="border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={() => setIsDetailsOpen(prev => !prev)}
              className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
              aria-expanded={isDetailsOpen}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-primary" />
                <span>Data quality and coverage details</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-primary group-hover:underline">
                <span>{isDetailsOpen ? 'Hide details' : 'Show details'}</span>
                {isDetailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>

            {isDetailsOpen && (
              <div className="mt-3 p-3.5 rounded-lg border border-border bg-card/60 text-xs text-muted-foreground space-y-2.5">
                <div>
                  <strong className="text-foreground block mb-0.5">Data Source & Endpoint</strong>
                  <p className="leading-relaxed text-[11px]">
                    Live traffic readings and road geometries are supplied via the official <strong>TomTom Traffic Flow API</strong> (Flow Segment Data v4) through our local FastAPI backend service. Base cartography is provided by © OpenStreetMap contributors.
                  </p>
                </div>

                <div>
                  <strong className="text-foreground block mb-0.5">Observation Timestamp vs. Client Refresh</strong>
                  <p className="leading-relaxed text-[11px]">
                    The <em>Observation Time</em> ({formatDateLong(reading?.timestamp || segments[0]?.last_updated)}) represents when TomTom recorded the road probe speeds. The <em>Client Refresh</em> ({formatDateLong(lastRefreshedAt)}) represents when TrafficWatch checked for new data.
                  </p>
                </div>

                <div>
                  <strong className="text-foreground block mb-0.5">Coverage Limitations & Unavailable Readings</strong>
                  <p className="leading-relaxed text-[11px]">
                    Coverage depends on road probe density monitored by TomTom. Secondary or residential roads may lack live speed probe data; in such cases, values are shown as <em>N/A</em> rather than fabricated figures or assumed zero traffic.
                  </p>
                </div>

                <div>
                  <strong className="text-foreground block mb-0.5">Congestion Calculation Methodology</strong>
                  <p className="leading-relaxed text-[11px]">
                    Congestion is calculated by comparing observed speed against unimpeded free-flow speed: <code>max(0, min(100, 100 × (1 − currentSpeed / freeFlowSpeed)))</code>. Low is &lt;30%, Moderate is 30–59%, and Heavy is ≥60%.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
