import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Filter,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { useTraffic } from './TrafficProvider';
import {
  getAnalyticsFilterOptions,
  getAnalyticsOverview,
  getAnalyticsRecords,
  getAnalyticsExportUrl,
} from '@/services/api';
import type {
  AnalyticsFilterOptions,
  AnalyticsOverviewResponse,
  PaginatedRecordsResponse,
  PaginatedHistoricalRecord,
  RoadComparisonItem,
  AnalyticsTrendPoint,
  HeatmapCell,
} from '@/types/traffic';
import { getTrafficColor, getTrafficLevel } from '@/lib/traffic-utils';

// Helper date formatter for labels
function formatDateLabel(val: string): string {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return val;
  }
}

function formatFullTimestamp(val?: string | null): string {
  if (!val) return 'Unavailable';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return val || 'Unavailable';
  }
}

function formatDelay(delaySeconds?: number | null): string {
  if (delaySeconds === null || delaySeconds === undefined) return '—';
  if (delaySeconds <= 0) return '0s (no delay)';
  const min = Math.round(delaySeconds / 60);
  if (min < 1) return `+${Math.round(delaySeconds)}s`;
  return `+${min} min (${Math.round(delaySeconds)}s)`;
}

export function TrafficAnalytics() {
  const { reading: liveReading, health, location: activeAppLocation } = useTraffic();

  // Filter options loaded from backend
  const [filterOptions, setFilterOptions] = useState<AnalyticsFilterOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Active filter state
  const [selectedCity, setSelectedCity] = useState<string>('Pune');
  const [selectedRoad, setSelectedRoad] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [dateShortcut, setDateShortcut] = useState<'all' | '24h' | '7d' | 'custom'>('all');

  // Overview data state
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Trends chart view mode
  const [trendMetric, setTrendMetric] = useState<'congestion' | 'speed'>('congestion');

  // Road comparison limit toggle
  const [showAllRoads, setShowAllRoads] = useState(false);

  // Heatmap hover state
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  // Table state
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortBy, setTableSortBy] = useState('timestamp');
  const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('desc');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);
  const [tableData, setTableData] = useState<PaginatedRecordsResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Abort controllers for clean cancellations
  const overviewAbortRef = useRef<AbortController | null>(null);
  const tableAbortRef = useRef<AbortController | null>(null);

  // 1. Load filter options on mount
  useEffect(() => {
    let isMounted = true;
    async function loadOptions() {
      setOptionsLoading(true);
      try {
        const opts = await getAnalyticsFilterOptions();
        if (isMounted) {
          setFilterOptions(opts);
          if (opts.default_city) {
            setSelectedCity(opts.default_city);
          }
        }
      } catch (err) {
        console.warn('Failed to load analytics filter options:', err);
      } finally {
        if (isMounted) setOptionsLoading(false);
      }
    }
    loadOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  // Roads available for currently selected city
  const availableRoads = useMemo(() => {
    if (!filterOptions) return [];
    if (selectedCity === 'All' || !selectedCity) {
      return filterOptions.all_roads || [];
    }
    return filterOptions.roads_by_city[selectedCity] || [];
  }, [filterOptions, selectedCity]);

  // When city changes, reset road to 'All'
  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedRoad('All');
  };

  // Date shortcut buttons
  const handleShortcut = (shortcut: 'all' | '24h' | '7d') => {
    setDateShortcut(shortcut);
    if (shortcut === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (shortcut === '24h') {
      // Historical dataset window
      setStartDate('2026-10-16');
      setEndDate('2026-10-17');
    } else if (shortcut === '7d') {
      setStartDate('2026-10-10');
      setEndDate('2026-10-17');
    }
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setDateShortcut('custom');
    setStartDate(start);
    setEndDate(end);
  };

  const handleResetFilters = () => {
    setSelectedCity(filterOptions?.default_city || 'Pune');
    setSelectedRoad('All');
    setStartDate('');
    setEndDate('');
    setDateShortcut('all');
    setSelectedTimeOfDay('all');
    setSelectedSeverity('all');
    setTableSearch('');
    setTablePage(1);
  };

  // Current filter params dict
  const currentFilterParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedCity && selectedCity !== 'All') params.city = selectedCity;
    if (selectedRoad && selectedRoad !== 'All') params.road = selectedRoad;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (selectedTimeOfDay && selectedTimeOfDay !== 'all') params.time_of_day = selectedTimeOfDay;
    if (selectedSeverity && selectedSeverity !== 'all') params.severity = selectedSeverity;
    return params;
  }, [selectedCity, selectedRoad, startDate, endDate, selectedTimeOfDay, selectedSeverity]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCity && selectedCity !== 'All' && selectedCity !== (filterOptions?.default_city || 'Pune')) count++;
    if (selectedRoad && selectedRoad !== 'All') count++;
    if (startDate || endDate) count++;
    if (selectedTimeOfDay && selectedTimeOfDay !== 'all') count++;
    if (selectedSeverity && selectedSeverity !== 'all') count++;
    return count;
  }, [selectedCity, selectedRoad, startDate, endDate, selectedTimeOfDay, selectedSeverity, filterOptions]);

  // 2. Fetch Overview data
  const fetchOverviewData = useCallback(async (isRefresh = false) => {
    if (overviewAbortRef.current) {
      overviewAbortRef.current.abort();
    }
    const controller = new AbortController();
    overviewAbortRef.current = controller;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await getAnalyticsOverview(currentFilterParams, controller.signal);
      setOverview(data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unable to load analytics data.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFilterParams]);

  // 3. Fetch Paginated Records
  const fetchRecordsData = useCallback(async () => {
    if (tableAbortRef.current) {
      tableAbortRef.current.abort();
    }
    const controller = new AbortController();
    tableAbortRef.current = controller;

    setTableLoading(true);
    try {
      const params: Record<string, string | number> = {
        ...currentFilterParams,
        page: tablePage,
        page_size: tablePageSize,
        sort_by: tableSortBy,
        sort_order: tableSortOrder,
      };
      if (tableSearch.trim()) {
        params.search = tableSearch.trim();
      }

      const res = await getAnalyticsRecords(params, controller.signal);
      setTableData(res);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn('Failed to load table records:', err);
    } finally {
      setTableLoading(false);
    }
  }, [currentFilterParams, tablePage, tablePageSize, tableSortBy, tableSortOrder, tableSearch]);

  // Fetch when filters change
  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  useEffect(() => {
    fetchRecordsData();
  }, [fetchRecordsData]);

  // Handle client or server CSV export
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const url = getAnalyticsExportUrl(currentFilterParams);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `trafficwatch_analytics_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setExportingCsv(false);
    }
  };

  // Toggle table sorting
  const handleSort = (column: string) => {
    if (tableSortBy === column) {
      setTableSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortBy(column);
      setTableSortOrder('desc');
    }
    setTablePage(1);
  };

  // Roads list to display (top 10 or all)
  const displayedRoads = useMemo(() => {
    if (!overview?.road_comparison) return [];
    return showAllRoads ? overview.road_comparison : overview.road_comparison.slice(0, 10);
  }, [overview?.road_comparison, showAllRoads]);

  // Summary data shorthand
  const summary = overview?.summary;

  return (
    <div className="page space-y-6 sm:space-y-8" data-testid="traffic-analytics-page" tabIndex={0}>
      {/* ---------------------------------------------------- */}
      {/* 1. Page Header (Simplified, clean, uncluttered) */}
      {/* ---------------------------------------------------- */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow flex items-center gap-1.5 text-primary font-semibold">
              <Activity size={13} />
              Traffic Intelligence & Patterns
            </span>
            <span className="text-muted-foreground/60 hidden sm:inline">·</span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Historical Corridor Telemetry
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Traffic Analytics
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl leading-normal">
            Analyze recorded historical traffic patterns, congestion frequency, and speed deficits across monitored corridors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Status Pills */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
              title="Historical observations recorded from TomTom Traffic Flow API"
            >
              <Layers size={13} />
              Recorded Dataset ({summary?.records_analyzed ?? 0} valid readings)
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                health === 'online'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
              title="Live TomTom Traffic Service connection status"
            >
              <span className={`status-dot ${health === 'online' ? 'online' : 'offline'}`} />
              {health === 'online' ? 'Live Flow Active' : 'Live Service Standby'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchOverviewData(true);
                fetchRecordsData();
              }}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 h-9 text-xs px-3 shadow-sm"
              aria-label="Refresh Data"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-primary' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleExportCsv}
              disabled={exportingCsv || !summary?.records_analyzed}
              className="flex items-center gap-1.5 h-9 text-xs px-3 shadow-sm font-semibold"
              aria-label="Export CSV"
            >
              <Download size={13} />
              <span>{exportingCsv ? 'Exporting...' : 'Export CSV'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. Live vs Historical Context Banner */}
      {/* ---------------------------------------------------- */}
      <section
        className="bg-card/70 border border-border border-l-4 border-l-primary rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
        aria-label="Data Source Context"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Info size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Dataset Coverage & Source Transparency
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1 max-w-4xl">
              Historical metrics below are computed exclusively from the backend traffic log dataset{' '}
              <strong className="text-foreground">
                ({summary?.date_range ? `${formatDateLabel(summary.date_range.start)} to ${formatDateLabel(summary.date_range.end)}` : 'Oct 15 - Oct 17, 2026'})
              </strong>.
              Historical observations are never labeled as live traffic. Current live conditions are displayed separately in the Live Benchmark panel.
            </p>
          </div>
        </div>

        {liveReading && health === 'online' && (
          <div className="shrink-0 flex items-center gap-3 px-3.5 py-2 rounded-lg bg-secondary/80 border border-border text-xs shadow-sm">
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block font-semibold uppercase tracking-wider">
                LIVE TELEMETRY ({liveReading.area || activeAppLocation.area})
              </span>
              <span className="font-bold text-foreground text-sm">
                {liveReading.current_speed_kmh} km/h{' '}
                <span className="text-muted-foreground font-normal text-xs">
                  ({liveReading.congestion_percent}% congestion)
                </span>
              </span>
            </div>
            <div
              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: getTrafficColor(liveReading.congestion_percent) }}
              title={getTrafficLevel(liveReading.congestion_percent)}
            />
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- */}
      {/* 3. Filter Section (Redesigned with comfortable spacing) */}
      {/* ---------------------------------------------------- */}
      <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" aria-label="Traffic Analytics Filters">
        {/* Filter Panel Header */}
        <div className="p-4 sm:p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <SlidersHorizontal size={14} />
            </div>
            <span className="text-sm font-bold text-foreground">Analytics Filters</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground shadow-sm">
                {activeFiltersCount} active
              </span>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Quick Date Presets */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/70 border border-border text-xs">
              <span className="text-muted-foreground text-[11px] px-1.5 hidden sm:inline font-medium">Quick Dates:</span>
              <button
                type="button"
                onClick={() => handleShortcut('all')}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  dateShortcut === 'all'
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Recorded
              </button>
              <button
                type="button"
                onClick={() => handleShortcut('24h')}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  dateShortcut === '24h'
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 24 Hours
              </button>
              <button
                type="button"
                onClick={() => handleShortcut('7d')}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                  dateShortcut === '7d'
                    ? 'bg-card text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Last 7 Days
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              aria-label="Reset Filters"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </Button>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* City Filter */}
          <div className="space-y-1.5">
            <label htmlFor="filter-city" className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
              <MapPin size={13} className="text-primary" />
              City
            </label>
            <select
              id="filter-city"
              value={selectedCity}
              onChange={e => handleCityChange(e.target.value)}
              disabled={optionsLoading}
              className="w-full h-10 px-3 py-2 text-xs sm:text-sm rounded-lg bg-background border border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            >
              <option value="All">All Cities</option>
              {filterOptions?.cities.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.record_count})
                </option>
              ))}
            </select>
          </div>

          {/* Road Filter */}
          <div className="space-y-1.5">
            <label htmlFor="filter-road" className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
              <Gauge size={13} className="text-primary" />
              Road / Corridor
            </label>
            <select
              id="filter-road"
              value={selectedRoad}
              onChange={e => setSelectedRoad(e.target.value)}
              disabled={optionsLoading || !availableRoads.length}
              className="w-full h-10 px-3 py-2 text-xs sm:text-sm rounded-lg bg-background border border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            >
              <option value="All">All Roads ({availableRoads.length})</option>
              {availableRoads.map(r => (
                <option key={r.name} value={r.name}>
                  {r.name.length > 28 ? `${r.name.slice(0, 28)}...` : r.name} ({r.record_count})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start */}
          <div className="space-y-1.5">
            <label htmlFor="filter-start-date" className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
              <Calendar size={13} className="text-primary" />
              From Date
            </label>
            <input
              id="filter-start-date"
              type="date"
              value={startDate}
              onChange={e => handleCustomDateChange(e.target.value, endDate)}
              className="w-full h-10 px-3 py-2 text-xs sm:text-sm rounded-lg bg-background border border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            />
          </div>

          {/* Date Range End */}
          <div className="space-y-1.5">
            <label htmlFor="filter-end-date" className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
              <Calendar size={13} className="text-primary" />
              To Date
            </label>
            <input
              id="filter-end-date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => handleCustomDateChange(startDate, e.target.value)}
              className="w-full h-10 px-3 py-2 text-xs sm:text-sm rounded-lg bg-background border border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            />
          </div>

          {/* Time of Day */}
          <div className="space-y-1.5">
            <label htmlFor="filter-time-of-day" className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
              <Clock size={13} className="text-primary" />
              Time of Day
            </label>
            <select
              id="filter-time-of-day"
              value={selectedTimeOfDay}
              onChange={e => setSelectedTimeOfDay(e.target.value)}
              className="w-full h-10 px-3 py-2 text-xs sm:text-sm rounded-lg bg-background border border-border text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            >
              {filterOptions?.time_of_day_options.map(tod => (
                <option key={tod.id} value={tod.id}>
                  {tod.label}
                </option>
              )) || (
                <>
                  <option value="all">All Day</option>
                  <option value="morning">Morning (05:00 - 11:59)</option>
                  <option value="afternoon">Afternoon (12:00 - 16:59)</option>
                  <option value="evening">Evening (17:00 - 20:59)</option>
                  <option value="night">Night (21:00 - 04:59)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Severity Selection Pills */}
        <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex items-center gap-3 flex-wrap text-xs">
          <span className="text-muted-foreground font-semibold text-xs flex items-center gap-1.5 shrink-0">
            <Flame size={13} className="text-amber-500" />
            Congestion Severity:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All Severities' },
              { id: 'low', label: 'Low (< 20%)', color: '#059669' },
              { id: 'moderate', label: 'Moderate (20% - 39.9%)', color: '#eab308' },
              { id: 'high', label: 'High (40% - 59.9%)', color: '#ea580c' },
              { id: 'severe', label: 'Severe (≥ 60%)', color: '#dc2626' },
            ].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSeverity(s.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border shadow-2xs ${
                  selectedSeverity === s.id
                    ? 'bg-foreground text-background font-bold border-foreground shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                {s.color && (
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                )}
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Error & Timeout Notice with Functional Retry */}
      {error && (
        <div
          className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-center justify-between gap-4 shadow-sm"
          role="alert"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-destructive shrink-0" />
            <div>
              <span className="font-bold text-sm block">Traffic Analytics Unavailable:</span>
              <span className="text-xs">{error}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchOverviewData(true);
              fetchRecordsData();
            }}
            className="border-destructive/30 hover:bg-destructive/10 text-xs h-8 shrink-0 font-semibold"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. Summary Statistic Cards (Responsive 6-Card Grid) */}
      {/* ---------------------------------------------------- */}
      <section aria-label="Summary Statistics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* 1. Average Congestion */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-avg-congestion"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Average Congestion</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Flame size={16} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight my-1">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : summary?.avg_congestion_percent !== null && summary?.avg_congestion_percent !== undefined ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span>{summary.avg_congestion_percent}%</span>
                  <small
                    className="font-bold text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${getTrafficColor(summary.avg_congestion_percent)}15`,
                      color: getTrafficColor(summary.avg_congestion_percent),
                    }}
                  >
                    {getTrafficLevel(summary.avg_congestion_percent)}
                  </small>
                </div>
              ) : (
                <span className="text-muted-foreground text-base">No Data</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {summary?.records_analyzed ? 'Speed deficit vs. free flow' : 'Awaiting filtered observations'}
            </p>
          </article>

          {/* 2. Average Speed */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-avg-speed"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Average Recorded Speed</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Gauge size={16} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight my-1">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : summary?.avg_speed_kmh !== null && summary?.avg_speed_kmh !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span>{summary.avg_speed_kmh}</span>
                  <small className="text-xs font-medium text-muted-foreground">km/h</small>
                </div>
              ) : (
                <span className="text-muted-foreground text-base">No Data</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Free-flow baseline: {summary?.avg_free_flow_speed_kmh ?? '—'} km/h
            </p>
          </article>

          {/* 3. Peak Traffic Period */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-peak-period"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Peak Congestion Period</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Clock size={16} />
              </div>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-foreground tracking-tight my-1 leading-snug">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : summary?.peak_traffic_period ? (
                <span className="line-clamp-2" title={summary.peak_traffic_period}>
                  {summary.peak_traffic_period}
                </span>
              ) : (
                <span className="text-muted-foreground text-base">Unavailable</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate" title={summary?.peak_traffic_detail || ''}>
              {summary?.peak_traffic_detail || 'Requires sufficient hourly observations'}
            </p>
          </article>

          {/* 4. Records Analyzed */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-records-analyzed"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Records Analyzed</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Layers size={16} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight my-1">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span>{summary?.records_analyzed ?? 0}</span>
                  <small className="text-xs font-normal text-muted-foreground">
                    / {summary?.total_records_available ?? 0}
                  </small>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {summary?.date_range ? `${summary.date_range.days_covered} days observed` : '0 days in filter'}
            </p>
          </article>

          {/* 5. Most Congested Road */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-top-road"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Highest Congestion Road</span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-foreground tracking-tight my-1 leading-snug">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : summary?.most_congested_road ? (
                <span className="line-clamp-2" title={summary.most_congested_road.name}>
                  {summary.most_congested_road.name}
                </span>
              ) : (
                <span className="text-muted-foreground text-base">None</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {summary?.most_congested_road
                ? `${summary.most_congested_road.avg_congestion_percent}% avg (${summary.most_congested_road.sample_count} samples)`
                : 'No road observations'}
            </p>
          </article>

          {/* 6. Average Delay */}
          <article
            className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-border/80 transition-colors"
            data-testid="metric-avg-delay"
          >
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-2">
              <span>Average Delay</span>
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight my-1">
              {loading ? (
                <span className="text-muted-foreground text-base animate-pulse">Loading...</span>
              ) : summary?.avg_delay_seconds !== null && summary?.avg_delay_seconds !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span>{summary.avg_delay_minutes}</span>
                  <small className="text-xs font-medium text-muted-foreground">min</small>
                </div>
              ) : (
                <span className="text-muted-foreground text-base">—</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {summary?.avg_delay_seconds ? `+${Math.round(summary.avg_delay_seconds)}s segment delay` : 'No excess delay recorded'}
            </p>
          </article>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 5. Main Charts Row: Side-by-Side with Generous Height */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Historical Congestion Trend Chart */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col" aria-label="Historical Congestion Trend">
          <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-foreground">Historical Traffic Trend</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Chronological readings aggregated in 30-minute intervals</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg p-1 bg-secondary/80 border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setTrendMetric('congestion')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    trendMetric === 'congestion'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Congestion (%)
                </button>
                <button
                  type="button"
                  onClick={() => setTrendMetric('speed')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    trendMetric === 'speed'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Speed (km/h)
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 flex-1 min-h-[380px] flex flex-col justify-center">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground text-xs animate-pulse">
                Loading trend data...
              </div>
            ) : overview?.trends && overview.trends.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overview.trends} margin={{ top: 10, right: 15, left: -10, bottom: 25 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatDateLabel}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      interval="preserveStartEnd"
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis
                      domain={trendMetric === 'congestion' ? [0, 100] : ['auto', 'auto']}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      unit={trendMetric === 'congestion' ? '%' : ' km/h'}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        fontSize: 12,
                        color: 'var(--foreground)',
                      }}
                      labelFormatter={(val: unknown) => formatFullTimestamp(String(val))}
                      formatter={(val: unknown, name: unknown) => [
                        `${val} ${trendMetric === 'congestion' ? '%' : 'km/h'}`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    {trendMetric === 'congestion' ? (
                      <Line
                        type="monotone"
                        dataKey="congestion_percent"
                        name="Congestion (%)"
                        stroke="var(--primary)"
                        strokeWidth={2.4}
                        dot={{ r: 2.5 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    ) : (
                      <>
                        <Line
                          type="monotone"
                          dataKey="current_speed_kmh"
                          name="Recorded Speed (km/h)"
                          stroke="var(--primary)"
                          strokeWidth={2.2}
                          dot={{ r: 2.5 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="free_flow_speed_kmh"
                          name="Free-flow Baseline (km/h)"
                          stroke="var(--muted-foreground)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls={false}
                        />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <AlertCircle size={32} className="mb-2 opacity-40 text-primary" />
                <p className="font-bold text-sm text-foreground">No historical observations match this selection</p>
                <p className="text-xs max-w-sm mt-1">
                  Adjust date boundaries or filter criteria to view recorded traffic trends.
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Points disconnected across multi-hour sampling gaps</span>
            <span className="font-medium text-foreground">{overview?.trends?.length ?? 0} time intervals</span>
          </div>
        </section>

        {/* Road Congestion Ranking Chart */}
        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col" aria-label="Road Congestion Ranking">
          <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-foreground">Corridor Congestion Ranking</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Roads sorted by highest average recorded congestion</p>
            </div>

            {overview?.road_comparison && overview.road_comparison.length > 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllRoads(prev => !prev)}
                className="text-xs h-8 px-2.5"
              >
                {showAllRoads ? 'Show Top 10' : `Show All (${overview.road_comparison.length})`}
              </Button>
            )}
          </div>

          <div className="p-5 flex-1 min-h-[380px] flex flex-col justify-center">
            {loading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground text-xs animate-pulse">
                Loading road rankings...
              </div>
            ) : displayedRoads.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayedRoads}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="road"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      width={100}
                      tickFormatter={(val: string) => (val.length > 15 ? `${val.slice(0, 15)}...` : val)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        fontSize: 12,
                        color: 'var(--foreground)',
                      }}
                      formatter={(val: unknown, name: unknown, item: any) => [
                        `${val}% avg congestion`,
                        `Road: ${item?.payload?.road} (${item?.payload?.sample_count} readings, ${item?.payload?.avg_speed_kmh} km/h avg speed)`,
                      ]}
                    />
                    <Bar dataKey="avg_congestion_percent" radius={[0, 4, 4, 0]}>
                      {displayedRoads.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getTrafficColor(entry.avg_congestion_percent)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <AlertCircle size={32} className="mb-2 opacity-40 text-primary" />
                <p className="font-bold text-sm text-foreground">No road data found for this filter</p>
                <p className="text-xs max-w-sm mt-1">Select a different city or broaden your filter settings.</p>
              </div>
            )}
          </div>

          <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Color coded by severity threshold</span>
            <span className="font-medium text-foreground">{displayedRoads.length} corridors shown</span>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 6. Day-of-Week & Hour-of-Day Heatmap (Airy, Readable) */}
      {/* ---------------------------------------------------- */}
      <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" aria-label="Day and Hour Congestion Heatmap">
        <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">Congestion Pattern Heatmap (Day vs. Hour)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recurring congestion patterns across weekly days and hours. Unobserved cells are distinguished from 0% congestion.
            </p>
          </div>

          {/* Color Legend */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-muted/40 border border-dashed border-border" />
              Unobserved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-[#059669]" />
              Low (&lt;20%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-[#eab308]" />
              Moderate (20-39%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-[#ea580c]" />
              High (40-59%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-[#dc2626]" />
              Severe (≥60%)
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {/* Heatmap Grid Container */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[780px]">
              {/* Header: Hours 00 to 23 with clear markers */}
              <div className="grid grid-cols-[90px_repeat(24,1fr)] gap-1.5 mb-2 text-center font-bold text-[11px] text-muted-foreground">
                <div className="text-left pl-2 uppercase tracking-wider text-[10px]">Day</div>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="truncate" title={`${String(h).padStart(2, '0')}:00`}>
                    {h % 3 === 0 ? `${h}h` : ''}
                  </div>
                ))}
              </div>

              {/* Rows: Monday to Sunday */}
              {overview?.heatmap?.days ? (
                overview.heatmap.days.map((dayName, dow) => {
                  const dayCells = overview.heatmap.cells.filter(c => c.day_index === dow);
                  return (
                    <div
                      key={dayName}
                      className="grid grid-cols-[90px_repeat(24,1fr)] gap-1.5 mb-1.5 items-center"
                    >
                      <div className="text-xs font-bold text-foreground pl-2 truncate" title={dayName}>
                        {dayName.slice(0, 3)}
                      </div>
                      {dayCells.map(cell => {
                        const isObserved = cell.status === 'observed';
                        const congestion = cell.avg_congestion;
                        let bgStyle = 'bg-muted/30 border border-dashed border-border/80 text-transparent';

                        if (isObserved && congestion !== null) {
                          if (congestion < 20) {
                            bgStyle = 'bg-emerald-600 text-white font-bold shadow-2xs';
                          } else if (congestion < 40) {
                            bgStyle = 'bg-amber-500 text-slate-950 font-bold shadow-2xs';
                          } else if (congestion < 60) {
                            bgStyle = 'bg-orange-600 text-white font-bold shadow-2xs';
                          } else {
                            bgStyle = 'bg-red-600 text-white font-bold shadow-2xs';
                          }
                        }

                        return (
                          <div
                            key={`${dow}-${cell.hour}`}
                            onMouseEnter={() => setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`h-8 sm:h-9 rounded-md flex items-center justify-center text-[10px] cursor-pointer transition-all hover:scale-115 hover:z-20 hover:shadow-lg ${bgStyle}`}
                            title={`${cell.day_name} ${String(cell.hour).padStart(2, '0')}:00 - ${
                              isObserved ? `${congestion}% (${cell.count} readings)` : 'No observations recorded'
                            }`}
                          >
                            {isObserved && congestion !== null ? Math.round(congestion) : ''}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                <div className="h-44 flex items-center justify-center text-muted-foreground text-xs animate-pulse">
                  Loading heatmap...
                </div>
              )}
            </div>
          </div>

          {/* Hover Detail Inspection Card */}
          <div className="mt-5 p-4 rounded-xl bg-secondary/50 border border-border flex flex-wrap items-center justify-between text-xs gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">Cell Inspection:</span>
              {hoveredCell ? (
                <span className="text-foreground">
                  <strong>{hoveredCell.day_name}</strong> at <strong>{hoveredCell.hour_label}</strong>:{' '}
                  {hoveredCell.status === 'observed' ? (
                    <span className="font-semibold text-foreground">
                      {hoveredCell.avg_congestion}% average congestion ({hoveredCell.count} readings recorded
                      {hoveredCell.avg_speed_kmh ? `, ${hoveredCell.avg_speed_kmh} km/h avg speed` : ''})
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      No traffic readings observed during this hour
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Hover over any grid cell to inspect detailed observation counts and speed.</span>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground font-medium">
              {overview?.heatmap?.coverage_note || 'Coverage is based on recorded sampling periods.'}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 7. Speed Deficit & Delay Analysis Section */}
      {/* ---------------------------------------------------- */}
      <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" aria-label="Speed and Delay Analysis">
        <div className="p-4 sm:p-5 border-b border-border">
          <h2 className="text-sm sm:text-base font-bold text-foreground">Speed Deficit & Delay Analysis</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evaluation of current speeds against free-flow baselines and segment delay distributions
          </p>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Speed Distribution Cards */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Speed Bracket Distribution Across Observations
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {overview?.speed_delay?.speed_distribution.map(bracket => (
                <div key={bracket.range} className="p-3.5 rounded-lg border border-border bg-secondary/30">
                  <span className="text-xs text-muted-foreground block font-medium">
                    {bracket.range}
                  </span>
                  <span className="text-xl font-extrabold text-foreground mt-1 block">
                    {bracket.count}{' '}
                    <small className="text-xs font-normal text-muted-foreground">samples</small>
                  </span>
                  <div className="w-full bg-secondary h-2 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${bracket.percentage}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1.5 block">
                    {bracket.percentage}% of readings
                  </span>
                </div>
              ))}
            </div>

            {/* Speed deficit metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-secondary/50 border border-border text-xs">
                <span className="text-muted-foreground block">Overall Avg Recorded Speed</span>
                <span className="text-lg font-bold text-foreground mt-1 block">
                  {overview?.speed_delay?.overall_avg_speed ?? '—'} km/h
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-secondary/50 border border-border text-xs">
                <span className="text-muted-foreground block">Free-flow Baseline Speed</span>
                <span className="text-lg font-bold text-foreground mt-1 block">
                  {overview?.speed_delay?.overall_free_flow_speed ?? '—'} km/h
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-secondary/50 border border-border text-xs">
                <span className="text-muted-foreground block">Avg Speed Deficit</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 block">
                  -{overview?.speed_delay?.overall_speed_deficit ?? 0} km/h
                </span>
              </div>
            </div>
          </div>

          {/* Formula & Metric Methodology Card */}
          <div className="p-5 rounded-xl bg-secondary/30 border border-border flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-2">
                <HelpCircle size={15} className="text-primary" />
                <span>Congestion & Delay Methodology</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Congestion is derived using the standard speed-loss ratio:
              </p>
              <code className="formula my-2.5 text-xs py-2 px-3 block rounded-md bg-secondary border border-border font-mono">
                100 × max(0, 1 − current_speed / free_flow_speed)
              </code>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2.5 space-y-1">
                <span>• <strong>Free-flow speed</strong> is bounded &gt; 0 km/h to prevent division by zero.</span>
                <br />
                <span>• <strong>Travel delay</strong> represents the observed segment difference <code>(currentTravelTime − freeFlowTravelTime)</code> in seconds.</span>
                <br />
                <span>• This represents an approximate relative speed indicator, not an official municipal traffic rating.</span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-border/80 text-[11px] text-muted-foreground">
              Source: Recorded TomTom Flow Absolute Segments Log
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 8. Historical Records Table */}
      {/* ---------------------------------------------------- */}
      <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" aria-label="Historical Traffic Records Table">
        <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-foreground">Historical Observations Log</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Searchable, sortable table of underlying telemetry records ({tableData?.total_count ?? 0} matching)
            </p>
          </div>

          {/* Search bar inside table header */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search road or city..."
                value={tableSearch}
                onChange={e => {
                  setTableSearch(e.target.value);
                  setTablePage(1);
                }}
                className="pl-8 pr-3 py-1.5 text-xs h-9 rounded-lg bg-secondary border border-border text-foreground outline-none focus:border-primary w-52 sm:w-64 transition-all"
                aria-label="Search records"
              />
            </div>
          </div>
        </div>

        {/* Table content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                <th
                  onClick={() => handleSort('timestamp')}
                  className="p-3.5 cursor-pointer hover:text-foreground select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Timestamp</span>
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
                    Loading records...
                  </td>
                </tr>
              ) : tableData?.records && tableData.records.length > 0 ? (
                tableData.records.map(record => (
                  <tr
                    key={record.id}
                    className="border-b border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3.5 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                      {formatFullTimestamp(record.timestamp)}
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
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <p className="font-semibold text-sm">No historical records match your search query</p>
                    <p className="text-xs mt-1">Try clearing the search box or adjusting the active filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page:</span>
            <select
              value={tablePageSize}
              onChange={e => {
                setTablePageSize(Number(e.target.value));
                setTablePage(1);
              }}
              className="px-2.5 py-1 rounded-md bg-secondary border border-border text-foreground text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <span className="ml-2">
              Showing{' '}
              <strong className="text-foreground">
                {tableData?.records.length ? (tablePage - 1) * tablePageSize + 1 : 0}–
                {Math.min(tablePage * tablePageSize, tableData?.total_count ?? 0)}
              </strong>{' '}
              of <strong className="text-foreground">{tableData?.total_count ?? 0}</strong> observations
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTablePage(1)}
              disabled={tablePage <= 1 || tableLoading}
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTablePage(p => Math.max(1, p - 1))}
              disabled={tablePage <= 1 || tableLoading}
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </Button>

            <span className="px-3 py-1 text-xs font-semibold text-foreground">
              Page {tablePage} of {tableData?.total_pages || 1}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTablePage(p => Math.min(tableData?.total_pages || 1, p + 1))}
              disabled={!tableData || tablePage >= tableData.total_pages || tableLoading}
              title="Next Page"
            >
              <ChevronRight size={14} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTablePage(tableData?.total_pages || 1)}
              disabled={!tableData || tablePage >= tableData.total_pages || tableLoading}
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
