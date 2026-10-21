import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChartNoAxesCombined,
  BrainCircuit,
  Clock3,
  Database,
  Download,
  Flame,
  Gauge,
  Info,
  Loader2,
  Map,
  MapPin,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Trash2,
  Maximize,
  Minimize,
  Maximize2,
  Minimize2,
  CheckCircle2,
  ChevronRight,
  Compass,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTraffic, locationKey } from './TrafficProvider';
import { TrafficMap } from './TrafficMap';
import { HotspotMap } from './HotspotMap';
import { LocationSearch } from './LocationSearch';
import { LiveTrafficView } from './LiveTrafficView';
import { getHistory, getPredictions } from '@/services/api';
import type { Location, TrafficReading, PredictionResponse } from '@/types/traffic';
import { AnalyticsCorridorPanels } from './AnalyticsCorridorPanels';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';
function dateLabel(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not available';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Heading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}

function Empty({
  icon: Icon = Database,
  title,
  description,
  action,
  large = false,
}: {
  icon?: typeof Database;
  title: string;
  description: string;
  action?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className={`empty-state ${large ? 'large' : ''}`}>
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

function LocationStrip() {
  const { location, reading, loading, monitoredLocations } = useTraffic();
  const isMonitored = monitoredLocations.some(
    m => Math.abs(m.latitude - location.latitude) < 0.001 && Math.abs(m.longitude - location.longitude) < 0.001
  );

  return (
    <div className="location-strip">
      <div className="location-title">
        <span className="location-icon">
          <MapPin size={19} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h3>{location.area}, {location.city}</h3>
            {isMonitored && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                Monitored Location
              </span>
            )}
          </div>
          <p>
            {location.latitude.toFixed(4)}° N · {location.longitude.toFixed(4)}° E
            <span className="mx-2">|</span> Real-time TomTom Flow
          </p>
        </div>
      </div>
      <div className="data-status">
        {loading ? (
          <Loader2 size={12} className="animate-spin text-primary" />
        ) : (
          <span className={`status-dot ${reading ? 'online' : ''}`} />
        )}
        {loading
          ? 'Fetching live traffic…'
          : reading
          ? `Updated ${dateLabel(reading.timestamp)}`
          : 'Awaiting live data'}
      </div>
    </div>
  );
}

function ErrorNotice() {
  const { error, refresh, loading } = useTraffic();
  return error ? (
    <div className="api-notice" role="alert">
      <Info size={16} />
      <span>{error}</span>
      <Button variant="ghost" size="sm" disabled={loading} onClick={refresh}>
        <RefreshCw size={13} className="mr-1" />
        Retry
      </Button>
    </div>
  ) : null;
}

function Legend() {
  return (
    <div className="map-legend">
      <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
        CONGESTION:
      </span>
      <span className="legend-item">
        <i className="legend-dot low" />
        Low &lt;30%
      </span>
      <span className="legend-item">
        <i className="legend-dot moderate" />
        Moderate 30–59%
      </span>
      <span className="legend-item">
        <i className="legend-dot heavy" />
        Heavy ≥60%
      </span>
      <span className="legend-item">
        <i className="legend-dot unknown" />
        Data unavailable
      </span>
      <span className="map-note">Real-time TomTom Flow · Auto-refresh 60s</span>
    </div>
  );
}

function DashboardHeader() {
  const { location, reading, loading, refresh, health, monitoredLocations, save, saved } =
    useTraffic();

  const isCurrentMonitored = monitoredLocations.some(
    m =>
      Math.abs(m.latitude - location.latitude) < 0.001 &&
      Math.abs(m.longitude - location.longitude) < 0.001
  );
  const isSaved = saved.some(l => locationKey(l) === locationKey(location));

  const formattedRefreshedTime = reading?.timestamp
    ? dateLabel(reading.timestamp)
    : 'Awaiting data';

  return (
    <header className="mb-6 space-y-4">
      {/* Top Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Dashboard
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                health === 'online'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : health === 'checking'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  health === 'online'
                    ? 'bg-emerald-500 animate-pulse'
                    : health === 'checking'
                    ? 'bg-amber-500 animate-spin'
                    : 'bg-red-500'
                }`}
              />
              {health === 'online'
                ? 'System Live'
                : health === 'checking'
                ? 'Checking Flow'
                : 'Service Offline'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time traffic conditions and road monitoring
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="text-right text-xs text-muted-foreground mr-1 hidden sm:block">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
              Freshness
            </span>
            <span className="font-semibold text-foreground text-xs">{formattedRefreshedTime}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5"
            aria-label="Refresh traffic data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
            <span>{loading ? 'Refreshing…' : 'Refresh Traffic'}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => save()}
            variant={isSaved || isCurrentMonitored ? 'secondary' : 'default'}
            className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5"
          >
            <Bookmark size={14} />
            <span>{isSaved || isCurrentMonitored ? 'Location Monitored' : 'Save & Monitor'}</span>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs font-semibold">
            <Link to="/route-planner" className="flex items-center gap-1.5">
              <RouteIcon size={14} />
              <span className="hidden sm:inline">Plan a Route</span>
              <span className="sm:hidden">Route</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Global Location Search & Selected Location Strip */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-8">
          <LocationSearch placeholder="Search any city, road, or area in India to view live traffic (e.g. Pune, Koregaon Park, Shivajinagar)…" />
        </div>
        <div className="md:col-span-4 flex items-center justify-between md:justify-end gap-2 bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xs">
          <div className="flex items-center gap-2 truncate">
            <MapPin size={15} className="text-primary shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-foreground block truncate">
                {location.area}, {location.city}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {location.latitude.toFixed(4)}° N, {location.longitude.toFixed(4)}° E
              </span>
            </div>
          </div>
          {isCurrentMonitored && (
            <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
              Monitored
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function DashboardPrimaryMetrics() {
  const { reading, segments, loading, segmentsLoading, lastRefreshedAt } = useTraffic();

  const currentSpeed =
    reading?.current_speed_kmh !== undefined && reading?.current_speed_kmh !== null
      ? Number(reading.current_speed_kmh)
      : null;
  const freeFlowSpeed =
    reading?.free_flow_speed_kmh !== undefined && reading?.free_flow_speed_kmh !== null
      ? Number(reading.free_flow_speed_kmh)
      : null;

  const validSegments = segments.filter(
    s => s.congestion_percent !== null && Number.isFinite(s.congestion_percent)
  );
  const avgCongestion =
    validSegments.length > 0
      ? validSegments.reduce((sum, s) => sum + (s.congestion_percent || 0), 0) / validSegments.length
      : reading?.congestion_percent !== undefined && reading?.congestion_percent !== null
      ? Number(reading.congestion_percent)
      : null;

  let trafficCondition = 'Data Unavailable';
  let conditionColor = '#64748b';
  let conditionBg = 'rgba(100, 116, 139, 0.12)';
  let conditionBorder = 'rgba(100, 116, 139, 0.25)';

  if (avgCongestion !== null) {
    if (avgCongestion < 30) {
      trafficCondition = 'Low Congestion';
      conditionColor = '#059669';
      conditionBg = 'rgba(5, 150, 105, 0.12)';
      conditionBorder = 'rgba(5, 150, 105, 0.25)';
    } else if (avgCongestion < 60) {
      trafficCondition = 'Moderate Congestion';
      conditionColor = '#eab308';
      conditionBg = 'rgba(234, 179, 8, 0.12)';
      conditionBorder = 'rgba(234, 179, 8, 0.25)';
    } else {
      trafficCondition = 'Heavy Congestion';
      conditionColor = '#dc2626';
      conditionBg = 'rgba(220, 38, 38, 0.12)';
      conditionBorder = 'rgba(220, 38, 38, 0.25)';
    }
  }

  const travelTimeMinutes = reading?.current_travel_time_seconds
    ? (reading.current_travel_time_seconds / 60).toFixed(1)
    : null;

  const formattedRefreshedTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : reading?.timestamp
    ? dateLabel(reading.timestamp)
    : 'N/A';

  const cards = [
    {
      id: 'current-speed',
      label: 'Observed Speed',
      icon: Gauge,
      value: loading ? '—' : currentSpeed !== null ? currentSpeed.toFixed(1) : 'N/A',
      unit: currentSpeed !== null ? 'km/h' : '',
      subtext:
        freeFlowSpeed !== null
          ? `vs ${freeFlowSpeed.toFixed(1)} km/h free-flow`
          : 'Observed point speed',
      foot: 'Observed speed on selected road',
      badge: null,
    },
    {
      id: 'congestion-percent',
      label: 'Congestion Level',
      icon: Activity,
      value:
        segmentsLoading && loading
          ? '—'
          : avgCongestion !== null
          ? `${avgCongestion.toFixed(1)}%`
          : 'N/A',
      unit: '',
      subtext:
        validSegments.length > 0
          ? `Area avg across ${validSegments.length} live segments`
          : 'Selected segment reading',
      foot: trafficCondition,
      badge: {
        text: trafficCondition,
        color: conditionColor,
        bg: conditionBg,
        border: conditionBorder,
      },
    },
    {
      id: 'active-segments',
      label: 'Monitored Network',
      icon: RouteIcon,
      value: segmentsLoading ? '…' : segments.length > 0 ? segments.length.toString() : '0',
      unit: segments.length === 1 ? 'road segment' : 'road segments',
      subtext:
        validSegments.length > 0
          ? `${validSegments.length} reporting live flow`
          : 'Polling nearby road segments',
      foot: 'Live segments mapped by TomTom',
      badge: null,
    },
    {
      id: 'flow-freshness',
      label: 'Last Updated',
      icon: Clock3,
      value: formattedRefreshedTime,
      unit: '',
      subtext: travelTimeMinutes ? `Est. travel time: ${travelTimeMinutes} min` : 'Live flow data',
      foot: 'Auto-refresh every 60s',
      badge: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <article
          key={c.id}
          className="dashboard-card-enter dashboard-metric-card flex flex-col justify-between"
          data-testid={`metric-card-${c.id}`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {c.label}
              </span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <c.icon size={16} />
              </div>
            </div>

            <div className="flex items-baseline gap-2 my-1">
              <span
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground ${
                  c.value === '—' ? 'animate-pulse' : ''
                }`}
              >
                {c.value}
              </span>
              {c.unit && (
                <span className="text-xs font-medium text-muted-foreground">{c.unit}</span>
              )}
            </div>

            {c.badge && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    color: c.badge.color,
                    backgroundColor: c.badge.bg,
                    borderColor: c.badge.border,
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full inline-block"
                    style={{ backgroundColor: c.badge.color }}
                  />
                  {c.badge.text}
                </span>
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate">{c.subtext}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function DashboardLiveMapSection() {
  const { location, segments, segmentsLoading } = useTraffic();
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const mapPanelRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
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
  };

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

  // Sort segments by congestion descending (highest congestion first)
  const sortedSegments = useMemo(() => {
    return [...segments]
      .filter(s => s.coordinates && s.coordinates.length >= 2)
      .sort((a, b) => (b.congestion_percent ?? -1) - (a.congestion_percent ?? -1));
  }, [segments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6 items-start">
      {/* 2/3 Map Panel */}
      <section
        ref={mapPanelRef}
        className={`panel dashboard-map-panel ${
          isFullscreen ? 'is-fullscreen' : 'lg:col-span-8'
        } ${isMinimized ? 'is-minimized' : ''} transition-all duration-200`}
        aria-label="Interactive Live Traffic Map"
      >
        <div className="panel-heading flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Live Traffic Map</h2>
              {isFullscreen && (
                <span className="text-[10px] font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded">
                  Fullscreen Mode
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time multi-segment road conditions around {location.area}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
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

            <Link
              to="/live-traffic"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline ml-2"
            >
              <span>Full View</span>
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>

        {isMinimized ? (
          <div className="p-4 bg-muted/20 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Map size={16} />
              </div>
              <div>
                <strong className="text-xs font-semibold text-foreground block">
                  Map minimized ({location.area}, {location.city})
                </strong>
                <span className="text-[11px] text-muted-foreground">
                  {segments.length} live road segments currently monitored
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              className="text-xs h-8"
              onClick={() => setIsMinimized(false)}
            >
              <Maximize2 size={13} className="mr-1.5" />
              Restore map
            </Button>
          </div>
        ) : (
          <>
            <TrafficMap
              expanded={true}
              isFullscreen={isFullscreen}
              height={isFullscreen ? undefined : 520}
              selectedSegmentIndex={selectedSegmentIndex}
              onSelectSegment={setSelectedSegmentIndex}
            />
            <Legend />
          </>
        )}
      </section>

      {/* 1/3 Traffic Conditions / Top Congested Roads Side Panel */}
      <section
        className="panel lg:col-span-4 flex flex-col justify-between"
        aria-label="Traffic Conditions"
      >
        <div>
          <div className="panel-heading">
            <div>
              <h2 className="text-sm font-bold text-foreground">Traffic Conditions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Top congested roads in {location.city}
              </p>
            </div>
            <span className="text-[10px] font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
              {segmentsLoading ? 'Updating…' : `${sortedSegments.length} Segments`}
            </span>
          </div>

          <div className="p-3 divide-y divide-border/60">
            {segmentsLoading && sortedSegments.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin text-primary" />
                <span>Loading live road conditions…</span>
              </div>
            ) : sortedSegments.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground px-4">
                <Compass size={24} className="mx-auto mb-2 text-muted-foreground/60" />
                <h4 className="font-semibold text-xs text-foreground mb-1">No Active Flow Segments</h4>
                <p className="text-[11px] leading-relaxed">
                  No monitored flow segments were returned for this coordinate. Click on the map or search another road.
                </p>
              </div>
            ) : (
              sortedSegments.slice(0, 5).map((seg, idx) => {
                const color = getTrafficColor(seg.congestion_percent);
                const isSelected = selectedSegmentIndex === idx;

                return (
                  <div
                    key={seg.id || `seg-${idx}`}
                    onClick={() => setSelectedSegmentIndex(idx)}
                    className={`py-3 px-2 rounded-md transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                    }`}
                    title="Click to focus this road on map"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <h4 className="font-semibold text-xs text-foreground truncate">
                          {seg.name || `Road segment ${idx + 1}`}
                        </h4>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        {seg.frc && (
                          <span className="uppercase text-[9px] font-medium bg-muted px-1.5 py-0.5 rounded">
                            {seg.frc}
                          </span>
                        )}
                        <span>
                          {seg.current_speed_kmh !== null
                            ? `${seg.current_speed_kmh} km/h`
                            : 'Speed N/A'}
                        </span>
                        {seg.free_flow_speed_kmh !== null && (
                          <span className="opacity-75">
                            ({seg.free_flow_speed_kmh} free-flow)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full inline-block"
                        style={{
                          color: color,
                          backgroundColor: `${color}18`,
                        }}
                      >
                        {seg.congestion_percent !== null
                          ? `${seg.congestion_percent.toFixed(0)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-3 border-t border-border bg-card/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted-foreground">TomTom Flow API</span>
          <Link
            to="/hotspots"
            className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>View all hotspots</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function DashboardHistorySection() {
  const { location, reading } = useTraffic();
  const [rows, setRows] = useState<TrafficReading[]>([]);
  const [metric, setMetric] = useState<'congestion_percent' | 'current_speed_kmh'>('congestion_percent');
  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [timeRange, setTimeRange] = useState<'recent' | '24h' | 'all'>('recent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (scope === 'selected') {
        params.set('city', location.city);
        if (location.area && location.area !== 'Selected area' && !location.area.includes(',')) {
          params.set('area', location.area);
        }
      }

      const data = await getHistory(params);
      let validRows = Array.isArray(data) ? data : [];

      if (validRows.length === 0 && scope === 'selected') {
        const cityParams = new URLSearchParams({ city: location.city });
        const cityData = await getHistory(cityParams);
        if (Array.isArray(cityData) && cityData.length > 0) {
          validRows = cityData;
        } else {
          const allData = await getHistory();
          if (Array.isArray(allData) && allData.length > 0) {
            validRows = allData;
          }
        }
      }

      // Filter out invalid rows and sort chronologically
      const sorted = [...validRows]
        .filter(r => r.timestamp && !Number.isNaN(Date.parse(r.timestamp)))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setRows(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load traffic history.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [location.city, location.area, scope]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, reading?.timestamp]);

  // Filter rows by timeRange
  const displayRows = useMemo(() => {
    if (rows.length === 0) return [];
    if (timeRange === 'recent') {
      return rows.slice(-20);
    }
    if (timeRange === '24h') {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const filtered = rows.filter(r => new Date(r.timestamp).getTime() >= cutoff);
      return filtered.length > 0 ? filtered : rows.slice(-20);
    }
    return rows;
  }, [rows, timeRange]);

  // Determine coverage period honestly
  const coverageText = useMemo(() => {
    if (displayRows.length === 0) return null;
    const first = new Date(displayRows[0].timestamp);
    const last = new Date(displayRows[displayRows.length - 1].timestamp);
    const fmt = (d: Date) =>
      d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    return `Coverage: ${fmt(first)} – ${fmt(last)} · ${displayRows.length} recorded readings`;
  }, [displayRows]);

  const recentTableRows = useMemo(() => {
    return [...displayRows].reverse().slice(0, 5);
  }, [displayRows]);

  return (
    <section className="panel mt-6" aria-label="Traffic History Section">
      <div className="panel-heading flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">Traffic History</h2>
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
              Verified Records
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Historical observations recorded for{' '}
            {scope === 'selected' ? `${location.area}, ${location.city}` : 'all monitored areas'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Metric Toggle */}
          <div className="flex rounded-md border border-border p-0.5 bg-background text-xs">
            <button
              type="button"
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                metric === 'congestion_percent'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMetric('congestion_percent')}
            >
              Congestion %
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                metric === 'current_speed_kmh'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMetric('current_speed_kmh')}
            >
              Speed km/h
            </button>
          </div>

          {/* Scope Toggle */}
          <div className="flex rounded-md border border-border p-0.5 bg-background text-xs">
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                scope === 'selected'
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setScope('selected')}
            >
              Selected Area
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                scope === 'all'
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setScope('all')}
            >
              All Data
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex rounded-md border border-border p-0.5 bg-background text-xs">
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                timeRange === 'recent'
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTimeRange('recent')}
            >
              Recent 20
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                timeRange === '24h'
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTimeRange('24h')}
            >
              24h
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTimeRange('all')}
            >
              All
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadHistory()}
            disabled={loading}
            title="Reload history"
            aria-label="Reload history"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {coverageText && (
        <div className="px-5 py-2 bg-muted/20 border-b border-border/60 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>{coverageText}</span>
          <span className="text-[10px] text-muted-foreground/80">Source: live_traffic.csv</span>
        </div>
      )}

      <div className="p-4 sm:p-5">
        {loading && displayRows.length === 0 ? (
          <div className="h-64 flex items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span>Loading verified historical observations…</span>
          </div>
        ) : displayRows.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayRows} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.6} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={s => {
                    if (!s) return '';
                    const d = new Date(s);
                    return Number.isNaN(d.getTime())
                      ? ''
                      : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                  }}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <YAxis
                  domain={metric === 'congestion_percent' ? [0, 100] : ['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  unit={metric === 'congestion_percent' ? '%' : ''}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    boxShadow: 'var(--shadow-panel)',
                  }}
                  labelFormatter={s => dateLabel(String(s))}
                  formatter={(value: any) => [
                    `${Number(value).toFixed(1)} ${
                      metric === 'congestion_percent' ? '%' : 'km/h'
                    }`,
                    metric === 'congestion_percent' ? 'Congestion' : 'Speed',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey={metric}
                  stroke={metric === 'congestion_percent' ? '#dc2626' : '#2563eb'}
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: metric === 'congestion_percent' ? '#dc2626' : '#2563eb' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty
            icon={ChartNoAxesCombined}
            title="No historical traffic readings yet"
            description={
              error ||
              'No recorded traffic history was found for this location. Click Refresh or change locations to record traffic points.'
            }
          />
        )}
      </div>

      {recentTableRows.length > 0 && (
        <div className="border-t border-border">
          <div className="history-header">
            <span>LOCATION</span>
            <span>OBSERVED SPEED</span>
            <span>CONGESTION</span>
            <span>RECORDED AT</span>
          </div>
          {recentTableRows.map((row, index) => (
            <div className="history-row" key={`${locationKey(row)}-${row.timestamp}-${index}`}>
              <span className="font-medium truncate">
                {row.area}, {row.city}
              </span>
              <span>{Number(row.current_speed_kmh).toFixed(1)} km/h</span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full inline-block"
                  style={{
                    backgroundColor:
                      row.congestion_percent < 30
                        ? '#059669'
                        : row.congestion_percent < 60
                        ? '#eab308'
                        : '#dc2626',
                  }}
                />
                {Number(row.congestion_percent).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">{dateLabel(row.timestamp)}</span>
            </div>
          ))}
          <div className="p-3 bg-card/60 flex items-center justify-between text-xs border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Showing recent observations from dataset
            </span>
            <Link
              to="/analytics"
              className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>View Full Traffic Analytics</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function DashboardQuickNavigation() {
  const navCards = [
    {
      title: 'Live Traffic Map',
      description: 'Explore multi-layer traffic flow and road classes on full map',
      to: '/live-traffic' as const,
      icon: Map,
      badge: 'Interactive',
    },
    {
      title: 'Route Planner',
      description: 'Compare alternative routes and calculate live congestion delays',
      to: '/route-planner' as const,
      icon: RouteIcon,
      badge: 'Routing',
    },
    {
      title: 'Traffic Analytics',
      description: 'Analyze multi-day trends, hourly heatmaps, and segment records',
      to: '/analytics' as const,
      icon: ChartNoAxesCombined,
      badge: 'Historical',
    },
    {
      title: 'My Locations',
      description: 'Manage personal saved places and backend monitored corridors',
      to: '/locations' as const,
      icon: MapPin,
      badge: 'Management',
    },
  ];

  return (
    <section className="mt-5 mb-1" aria-label="Quick Tools Navigation">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {navCards.map(card => (
          <Link
            key={card.title}
            to={card.to}
            className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-150 flex flex-col justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 h-full min-h-[108px]"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <card.icon size={16} />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {card.badge}
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                <span>{card.title}</span>
                <ArrowRight
                  size={13}
                  className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-0.5 text-primary shrink-0"
                />
              </h4>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {card.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function DashboardPage() {
  return (
    <>
      <DashboardHeader />
      <DashboardPrimaryMetrics />
      <DashboardLiveMapSection />
      <DashboardHistorySection />
      <DashboardQuickNavigation />
      <ErrorNotice />
    </>
  );
}

export const DashboardMonitoringCoverage = DashboardQuickNavigation;

export const OverviewPage = DashboardPage;
export { DashboardPrimaryMetrics as OverviewMetrics };
export function LiveTrafficPage() {
  return <LiveTrafficView />;
}
export { TrafficAnalytics as AnalyticsPage } from './TrafficAnalytics';
export { PredictionsView as PredictionsPage } from './PredictionsView';
export { CongestionHotspots as HotspotsPage } from './CongestionHotspots';
export { MyLocations as LocationsPage } from './MyLocations';

export { AboutDataView as AboutPage } from './AboutDataView';
