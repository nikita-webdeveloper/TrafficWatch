import React, { useEffect, useState, useCallback, useId } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getPredictionDataStatus,
  getCollectorStatus,
  getAnalyticsRecords,
  getAnalyticsExportUrl,
} from '@/services/api';
import type {
  PredictionDataStatusResponse,
  CollectorStatusResponse,
  PaginatedRecordsResponse,
} from '@/types/traffic';
import { getTrafficColor, getTrafficLevel } from '@/lib/traffic-utils';

function formatFullDateTime(isoStr?: string | null): string {
  if (!isoStr) return 'Not available';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDelay(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds <= 0) return 'None (0s)';
  if (seconds < 60) return `+${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `+${min}m ${sec}s` : `+${min}m`;
}

export function AboutDataView() {
  const searchInputId = useId();
  const pageSizeSelectId = useId();

  // Status & Metadata states
  const [dataStatus, setDataStatus] = useState<PredictionDataStatusResponse | null>(null);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Table states
  const [tableData, setTableData] = useState<PaginatedRecordsResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);
  const [tableSortBy, setTableSortBy] = useState('timestamp');
  const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('desc');

  // Load Status Information
  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const [dataRes, collectorRes] = await Promise.allSettled([
        getPredictionDataStatus(signal),
        getCollectorStatus(signal),
      ]);

      if (dataRes.status === 'fulfilled') {
        setDataStatus(dataRes.value);
        if (dataRes.value.collection_health) {
          setCollectorStatus(dataRes.value.collection_health);
        }
      }
      if (collectorRes.status === 'fulfilled') {
        setCollectorStatus(collectorRes.value);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn('Failed to load status in About & Data view:', err);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // Load Paginated Records
  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    setTableLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: tablePage,
        page_size: tablePageSize,
        sort_by: tableSortBy,
        sort_order: tableSortOrder,
      };
      if (tableSearch.trim()) {
        params['search'] = tableSearch.trim();
      }
      const res = await getAnalyticsRecords(params, signal);
      setTableData(res);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn('Failed to load records in About & Data view:', err);
    } finally {
      setTableLoading(false);
    }
  }, [tablePage, tablePageSize, tableSortBy, tableSortOrder, tableSearch]);

  // Initial load
  useEffect(() => {
    const controller = new AbortController();
    loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  useEffect(() => {
    const controller = new AbortController();
    loadRecords(controller.signal);
    return () => controller.abort();
  }, [loadRecords]);

  // Handle Full Refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStatus(), loadRecords()]);
    setRefreshing(false);
  };

  // Table Sort toggle
  const handleSort = (field: string) => {
    if (tableSortBy === field) {
      setTableSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortBy(field);
      setTableSortOrder('desc');
    }
    setTablePage(1);
  };

  // Freshness & health evaluations
  const isStale = dataStatus?.freshness === 'stale' || dataStatus?.freshness === 'historical' || (dataStatus?.data_age_minutes ?? 0) > 45;
  const isCollectorHealthy = collectorStatus?.is_collector_running && collectorStatus?.scheduler_active;
  const exportUrl = getAnalyticsExportUrl(tableSearch.trim() ? { search: tableSearch.trim() } : {});

  return (
    <div className="page space-y-8" tabIndex={0} aria-label="About and Data Management">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow">SYSTEM & DATA OVERVIEW</span>
            {isCollectorHealthy ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Collector Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Collector Idle / Manual
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            About & Data
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Understand how TrafficWatch collects real-time road telemetry, processes cleaned observations, and forecasts urban traffic conditions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || statusLoading}
            className="text-xs h-9 gap-1.5"
            aria-label="Refresh data status and table"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-primary' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </Button>

          <a
            href={exportUrl}
            download="trafficwatch_records.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm h-9"
            aria-label="Download traffic records as CSV"
          >
            <Download size={13} />
            <span>Download CSV</span>
          </a>
        </div>
      </div>

      {/* Stale Data Alert Notice (if applicable) */}
      {isStale && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-800 dark:text-amber-300">Telemetry Latency Notice:</span>{' '}
            The latest recorded observation is over 45 minutes old (last observed {dataStatus?.data_age_minutes ? `${Math.round(dataStatus.data_age_minutes)} mins ago` : 'in historical session'}).
            The background collector runs on a scheduled 5-minute interval whenever the service is actively polling TomTom. Telemetry records below reflect the verified historical and active dataset.
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION A — About TrafficWatch & Feature Highlights */}
      {/* ========================================================================= */}
      <section className="space-y-4" aria-labelledby="about-trafficwatch-title">
        <div className="bg-card border border-border rounded-xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Compass size={18} />
            </div>
            <h2 id="about-trafficwatch-title" className="text-lg sm:text-xl font-bold text-foreground">
              TrafficWatch — Smart Traffic Monitoring & Prediction
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-4xl">
            TrafficWatch is an end-to-end urban mobility platform that helps commuters, transport planners, and city monitors understand road conditions.
            It provides live traffic telemetry, intelligent route planning, bottleneck hotspot identification, multi-day historical trend analytics, and short-term congestion forecasts across monitored arterial corridors.
          </p>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mt-6">
            <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5">
                  <Activity size={15} />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1">Live Traffic</h3>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Real-time speed, free-flow comparisons, and live delays across monitored city roads.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                  <Navigation size={15} />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1">Route Planner</h3>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Point-to-point journey comparisons highlighting faster, less congested alternatives.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2.5">
                  <Flame size={15} />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1">Congestion Hotspots</h3>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Identifies severe urban bottlenecks, elevated delays, and peak congestion corridors.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2.5">
                  <TrendingUp size={15} />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1">Traffic Analytics</h3>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Explores historical patterns, hourly congestion heatmaps, and road speed distributions.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5">
                  <Clock size={15} />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1">Traffic Predictions</h3>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Short-term congestion estimates for +15, +30, and +60 minutes based on recent momentum.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION B — Traffic Data at a Glance (Summary Cards) */}
      {/* ========================================================================= */}
      <section className="space-y-3" aria-labelledby="data-at-glance-title">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="data-at-glance-title" className="text-base sm:text-lg font-bold text-foreground">
              Traffic Data at a Glance
            </h2>
            <p className="text-xs text-muted-foreground">
              Live statistics from the validated backend repository and background collector.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Cleaned Records */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Total Records</span>
              <Database size={16} className="text-primary" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-foreground">
              {statusLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
              ) : (
                dataStatus?.total_cleaned_rows?.toLocaleString() ?? '0'
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Validated & deduplicated entries
            </p>
          </div>

          {/* Card 2: Monitored Corridors */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Monitored Corridors</span>
              <MapPin size={16} className="text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-foreground">
              {statusLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
              ) : (
                dataStatus?.unique_locations_count ?? collectorStatus?.monitored_locations_count ?? '19'
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Active arterial segments tracked
            </p>
          </div>

          {/* Card 3: Latest Traffic Observation */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Latest Observation</span>
              <Clock size={16} className="text-blue-500" />
            </div>
            <div className="text-sm sm:text-base font-bold text-foreground leading-snug">
              {statusLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
              ) : (
                formatFullDateTime(dataStatus?.latest_observation)
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Actual road sensor reading timestamp
            </p>
          </div>

          {/* Card 4: Last Collector Run */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Last Collector Run</span>
              <Server size={16} className="text-purple-500" />
            </div>
            <div className="text-sm sm:text-base font-bold text-foreground leading-snug">
              {statusLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
              ) : collectorStatus?.last_successful_collection_at ? (
                formatFullDateTime(collectorStatus.last_successful_collection_at)
              ) : (
                'System Initialization'
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {collectorStatus?.is_collector_running ? 'Automated collector active (5 min)' : 'Collector waiting / manual'}
            </p>
          </div>

          {/* Card 5: Pipeline Health & Deduplication */}
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Data Freshness</span>
              <ShieldCheck size={16} className="text-emerald-500" />
            </div>
            <div className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
              {statusLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
              ) : isStale ? (
                <span className="text-amber-600 dark:text-amber-400">Historical / Latent</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">Fresh Telemetry</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {dataStatus?.data_age_minutes !== undefined ? `Data age: ${Math.round(dataStatus.data_age_minutes)} min` : 'Deduplicated & verified'}
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION C — Where Does the Traffic Data Come From? */}
      {/* ========================================================================= */}
      <section className="space-y-3" aria-labelledby="data-flow-title">
        <div className="bg-card border border-border rounded-xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Workflow size={18} className="text-primary" />
            <h2 id="data-flow-title" className="text-base sm:text-lg font-bold text-foreground">
              Where Does the Traffic Data Come From?
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mb-6">
            TrafficWatch follows a transparent 4-stage data pipeline from road sensors to your screen:
          </p>

          {/* 4-Step Pipeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 1</span>
                  <Activity size={14} className="text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1.5">TomTom Traffic Flow API</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Every 5 minutes, the background collector queries the TomTom Traffic Flow API for real-time speed, free-flow velocity, and road delay.
                </p>
              </div>
              <div className="mt-3 text-[10px] text-primary font-medium flex items-center gap-1">
                <span>Real sensor telemetry</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 2</span>
                  <Database size={14} className="text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1.5">Raw CSV Logging</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Incoming readings are appended into <code>data/live_traffic.csv</code>, preserving exact raw observation timestamps and coordinates.
                </p>
              </div>
              <div className="mt-3 text-[10px] text-primary font-medium flex items-center gap-1">
                <span>Non-destructive staging</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 3</span>
                  <ShieldCheck size={14} className="text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1.5">Validation & Deduplication</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Our pipeline checks speed limits, removes logical duplicates, resolves conflicts, and outputs the clean dataset into <code>data/cleaned_traffic.csv</code>.
                </p>
              </div>
              <div className="mt-3 text-[10px] text-primary font-medium flex items-center gap-1">
                <span>Rigorous data cleaning</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage 4</span>
                  <Gauge size={14} className="text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground mb-1.5">Analytics & Forecasting</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Validated records instantly power the dashboard, interactive hotspot maps, route planner comparisons, and prediction models.
                </p>
              </div>
              <div className="mt-3 text-[10px] text-primary font-medium flex items-center gap-1">
                <span>Interactive intelligence</span>
              </div>
            </div>
          </div>

          {/* Important Technical Distinction Box */}
          <div className="mt-5 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-950 dark:text-blue-200">
            <div className="flex items-start gap-2.5">
              <Info size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong className="font-semibold text-blue-800 dark:text-blue-300">
                  Key Distinction: Live Observations vs. Model Training Cutoff:
                </strong>{' '}
                Live observations are continuously gathered as long as the background collector runs. In contrast, predictive models were evaluated against a specific historical snapshot (cutoff: {formatFullDateTime(dataStatus?.model_training_status?.trained_at || '2026-10-17T15:25:02+05:30')}).
                The forecasting engine uses current real-time observations as its baseline, ensuring forecasts immediately reflect fresh conditions.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION D — Recent Traffic Records (Table with Search, Pagination, CSV) */}
      {/* ========================================================================= */}
      <section className="space-y-3" aria-labelledby="traffic-records-title">
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Table Header & Controls */}
          <div className="p-5 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Database size={16} className="text-primary" />
                <h2 id="traffic-records-title" className="text-base sm:text-lg font-bold text-foreground">
                  Recent Traffic Records
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inspect actual cleaned telemetry records ({tableData?.total_count ?? 0} matching observations in repository).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative">
                <label htmlFor={searchInputId} className="sr-only">Search corridor or city</label>
                <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  id={searchInputId}
                  type="text"
                  placeholder="Search corridor or city..."
                  value={tableSearch}
                  onChange={e => {
                    setTableSearch(e.target.value);
                    setTablePage(1);
                  }}
                  className="pl-8 pr-3 py-1 text-xs h-8 rounded-md bg-secondary border border-border text-foreground outline-none focus:border-primary w-48 sm:w-60"
                />
              </div>

              {/* Rows per page */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <label htmlFor={pageSizeSelectId} className="hidden sm:inline">Rows:</label>
                <select
                  id={pageSizeSelectId}
                  value={tablePageSize}
                  onChange={e => {
                    setTablePageSize(Number(e.target.value));
                    setTablePage(1);
                  }}
                  className="h-8 px-2 py-0.5 rounded-md bg-secondary border border-border text-foreground text-xs"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* CSV Export */}
              <a
                href={exportUrl}
                download="trafficwatch_records.csv"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-secondary border border-border hover:bg-muted text-foreground transition-colors h-8"
                title="Download matching records as CSV"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Export CSV</span>
              </a>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                  <th
                    onClick={() => handleSort('timestamp')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none"
                    title="Click to sort by timestamp"
                  >
                    <div className="flex items-center gap-1">
                      <span>Observation Time</span>
                      {tableSortBy === 'timestamp' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('city')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none"
                    title="Click to sort by city"
                  >
                    <div className="flex items-center gap-1">
                      <span>City</span>
                      {tableSortBy === 'city' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('area')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none"
                    title="Click to sort by road / corridor"
                  >
                    <div className="flex items-center gap-1">
                      <span>Road / Corridor</span>
                      {tableSortBy === 'area' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('current_speed_kmh')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none text-right"
                    title="Click to sort by speed"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Speed</span>
                      {tableSortBy === 'current_speed_kmh' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('free_flow_speed_kmh')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none text-right"
                    title="Click to sort by free-flow speed"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Free-Flow</span>
                      {tableSortBy === 'free_flow_speed_kmh' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('delay_seconds')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none text-right"
                    title="Click to sort by delay"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Delay</span>
                      {tableSortBy === 'delay_seconds' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('congestion_percent')}
                    className="p-3.5 cursor-pointer hover:text-foreground select-none text-right"
                    title="Click to sort by congestion"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Congestion</span>
                      {tableSortBy === 'congestion_percent' ? (
                        tableSortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>

                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>

              <tbody>
                {tableLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground animate-pulse">
                      Loading traffic telemetry records...
                    </td>
                  </tr>
                ) : tableData?.records && tableData.records.length > 0 ? (
                  tableData.records.map(record => (
                    <tr
                      key={record.id}
                      className="border-b border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3.5 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                        {formatFullDateTime(record.timestamp)}
                      </td>
                      <td className="p-3.5 font-semibold text-foreground whitespace-nowrap">
                        {record.city}
                      </td>
                      <td className="p-3.5 text-foreground max-w-xs truncate" title={record.area}>
                        {record.area}
                      </td>
                      <td className="p-3.5 text-right font-medium">
                        {record.current_speed_kmh !== null ? `${record.current_speed_kmh} km/h` : '—'}
                      </td>
                      <td className="p-3.5 text-right text-muted-foreground">
                        {record.free_flow_speed_kmh !== null ? `${record.free_flow_speed_kmh} km/h` : '—'}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap text-muted-foreground">
                        {formatDelay(record.delay_seconds)}
                      </td>
                      <td className="p-3.5 text-right font-bold whitespace-nowrap">
                        {record.congestion_percent !== null ? (
                          <span style={{ color: getTrafficColor(record.congestion_percent) }}>
                            {record.congestion_percent}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                          style={{
                            backgroundColor: `${getTrafficColor(record.congestion_percent)}15`,
                            color: getTrafficColor(record.congestion_percent),
                          }}
                        >
                          {getTrafficLevel(record.congestion_percent)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-muted-foreground">
                      <p className="font-semibold text-sm">No traffic records match your query</p>
                      <p className="text-xs mt-1">
                        Try clearing your search term or clicking <strong>Refresh Data</strong> above.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="text-muted-foreground">
              Showing{' '}
              <strong className="text-foreground">
                {tableData?.records.length ? (tablePage - 1) * tablePageSize + 1 : 0}–
                {Math.min(tablePage * tablePageSize, tableData?.total_count ?? 0)}
              </strong>{' '}
              of <strong className="text-foreground">{tableData?.total_count ?? 0}</strong> observations
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTablePage(p => Math.max(1, p - 1))}
                disabled={tablePage <= 1 || tableLoading}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <span className="text-xs font-medium text-foreground px-1">
                Page {tablePage} of {Math.max(1, tableData?.total_pages ?? 1)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTablePage(p => p + 1)}
                disabled={!tableData?.total_pages || tablePage >= tableData.total_pages || tableLoading}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION E — Understanding Traffic Predictions */}
      {/* ========================================================================= */}
      <section className="space-y-3" aria-labelledby="prediction-explanation-title">
        <div className="bg-card border border-border rounded-xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={18} className="text-amber-500" />
            <h2 id="prediction-explanation-title" className="text-base sm:text-lg font-bold text-foreground">
              Understanding Traffic Predictions
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            TrafficWatch provides forward-looking estimates for +15, +30, and +60 minutes.
            Here is an open and transparent explanation of our methodology and empirical findings:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            {/* Box 1: Forecasting Approach */}
            <div className="p-4 rounded-lg bg-secondary/40 border border-border">
              <h3 className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-500" />
                Active Model: Persistence Baseline
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Short-term traffic conditions have high temporal momentum. Our active production forecasting utilizes the empirical Persistence Baseline, projecting forward current speeds and congestion levels.
              </p>
            </div>

            {/* Box 2: Empirical Evaluation */}
            <div className="p-4 rounded-lg bg-secondary/40 border border-border">
              <h3 className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-blue-500" />
                Why Baseline Beat Random Forest
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                On held-out test data, Random Forest tended to regress toward historical corridor averages, muting real spikes and yielding higher error (MAE ~6.6%–8.7% vs. ~3.4%–4.2% for Baseline). We prioritize accuracy over complexity.
              </p>
            </div>

            {/* Box 3: Limitations & Safety */}
            <div className="p-4 rounded-lg bg-secondary/40 border border-border">
              <h3 className="text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-amber-500" />
                Limitations & Realities
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Sudden road disruptions—such as accidents, weather events, or VIP motorcades—cannot be foreseen before they occur in sensor feeds. Predictions are advisory estimates, never guaranteed conditions.
              </p>
            </div>
          </div>

          {/* Model Status Metrics Strip */}
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              <span>Model Training Cutoff: </span>
              <strong className="text-foreground">
                {formatFullDateTime(dataStatus?.model_training_status?.trained_at || '2026-10-17T15:25:02+05:30')}
              </strong>
            </div>
            <div>
              <span>Supported Horizons: </span>
              <strong className="text-foreground">+15m, +30m, +60m</strong>
            </div>
            <div>
              <span>Test Error (MAE): </span>
              <strong className="text-foreground">3.4% – 4.2% congestion delta</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION F — Technology and Project Information */}
      {/* ========================================================================= */}
      <footer className="space-y-3 pt-2" aria-labelledby="tech-stack-title">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={16} className="text-primary" />
            <h2 id="tech-stack-title" className="text-sm sm:text-base font-bold text-foreground">
              Technology Stack & Architecture
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            TrafficWatch is built with verified modern web, backend, and data science standards:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <span className="font-bold text-foreground block mb-0.5">Frontend</span>
              <span className="text-[11px] text-muted-foreground">React 18, TypeScript, Vite & TanStack Router</span>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <span className="font-bold text-foreground block mb-0.5">Backend</span>
              <span className="text-[11px] text-muted-foreground">FastAPI, Python 3.12, Uvicorn & APScheduler</span>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <span className="font-bold text-foreground block mb-0.5">Traffic Telemetry</span>
              <span className="text-[11px] text-muted-foreground">TomTom Traffic Flow API & Nominatim</span>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <span className="font-bold text-foreground block mb-0.5">Data & ML</span>
              <span className="text-[11px] text-muted-foreground">Scikit-learn, Pandas, Joblib & NumPy</span>
            </div>

            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <span className="font-bold text-foreground block mb-0.5">Visuals & Maps</span>
              <span className="text-[11px] text-muted-foreground">Recharts, React-Leaflet & OpenStreetMap</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted-foreground gap-2">
            <div>
              TrafficWatch — Open Intelligent Traffic Monitoring & Prediction System
            </div>
            <div>
              API keys and telemetry credentials remain securely managed on the backend.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
