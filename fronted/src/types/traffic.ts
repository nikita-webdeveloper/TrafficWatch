export interface Location {
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  name?: string;
}

export interface TrafficReading extends Location {
  timestamp: string;
  current_speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  current_travel_time_seconds: number | null;
  free_flow_travel_time_seconds: number | null;
  confidence?: number | null;
  congestion_percent: number | null;
}

export interface TrafficSegment {
  id?: string;
  name?: string;
  coordinates: [number, number][];
  current_speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  congestion_percent: number | null;
  current_travel_time_seconds?: number | null;
  free_flow_travel_time_seconds?: number | null;
  delay_seconds?: number | null;
  confidence?: number | null;
  frc?: string;
  last_updated?: string;
}

export interface NearbySegmentsResponse {
  segments: TrafficSegment[];
}

export interface HotspotsResponse {
  city?: string | null;
  latitude: number;
  longitude: number;
  hotspots: TrafficSegment[];
  total_monitored: number;
  generated_at: string;
}

export interface MonitoredLocation {
  name: string;
  city: string;
  area?: string;
  latitude: number;
  longitude: number;
}

export type LocationLabel = 'Home' | 'Work' | 'Office' | 'College' | 'Other';

export interface SavedLocation {
  id: string;
  name: string;
  label: LocationLabel;
  address: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  created_at?: string;
  updated_at?: string;
  // Live traffic telemetry near the saved place
  current_speed_kmh?: number | null;
  free_flow_speed_kmh?: number | null;
  congestion_percent?: number | null;
  delay_seconds?: number | null;
  traffic_last_updated?: string | null;
  traffic_status?: 'available' | 'unavailable' | 'loading' | 'error';
  traffic_error?: string | null;
}

export interface SavedLocationsResponse {
  locations: SavedLocation[];
}

export interface Forecast {
  timestamp: string;
  predicted_congestion_percent?: number | null;
  congestion_percent?: number;
  predicted_speed_kmh?: number | null;
  current_speed_kmh?: number | null;
  free_flow_speed_kmh?: number | null;
  congestion_delta?: number;
  speed_delta?: number;
  direction?: 'improving' | 'worsening' | 'stable' | string;
  direction_label?: string;
  horizon_minutes?: number;
  confidence?: number;
  confidence_label?: string;
  data_tier?: 'established' | 'experimental' | 'insufficient' | string;
  model_status?: string;
  model_name?: string;
  explanation?: string;
}

export interface PredictionLocation {
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  observation_count: number;
  has_sufficient_history: boolean;
  latest_congestion?: number | null;
  latest_speed?: number | null;
  latest_timestamp?: string;
  earliest_timestamp?: string;
}

export interface PredictionLocationsResponse {
  locations: PredictionLocation[];
  total_locations: number;
}

export interface RoadOutlookItem {
  road_name: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  current_congestion_percent: number;
  predicted_congestion_percent?: number | null;
  congestion_delta: number;
  current_speed_kmh: number;
  predicted_speed_kmh?: number | null;
  speed_delta: number;
  direction: 'improving' | 'worsening' | 'stable' | 'insufficient_history' | string;
  direction_label?: string;
  observation_count: number;
  has_sufficient_history: boolean;
  forecast_available: boolean;
}

export interface RoadsOutlookResponse {
  roads: RoadOutlookItem[];
  total_roads: number;
  horizon_minutes: number;
  sort_by?: string;
}

export interface PredictionDataStatusResponse {
  status: string;
  total_cleaned_rows: number;
  input_rows?: number;
  exact_duplicates_removed?: number;
  invalid_rows_removed?: number;
  logical_duplicates_removed?: number;
  conflicts_resolved?: number;
  time_span_hours?: number;
  data_age_minutes?: number;
  freshness?: string;
  unique_cities?: string[];
  unique_locations_count?: number;
  earliest_observation?: string;
  latest_observation?: string;
  model_training_status?: {
    model_name?: string;
    trained_at?: string;
    supported_horizons?: number[];
    total_training_rows?: number;
  };
  collection_health?: CollectorStatusResponse;
}

export interface CollectorStatusResponse {
  is_collector_running: boolean;
  scheduler_active: boolean;
  last_attempt_at: string | null;
  last_successful_collection_at: string | null;
  last_collection_status: string;
  last_collection_message: string | null;
  successful_reads_last_run: number;
  failed_reads_last_run: number;
  monitored_locations_count: number;
  tomtom_api_configured: boolean;
}

export interface ModelHorizonEvaluation {
  horizon_minutes: number;
  supported: boolean;
  selected_model_name?: string;
  selected_algorithm?: string;
  selection_rationale?: string;
  total_pairs?: number;
  train_samples?: number;
  val_samples?: number;
  test_samples?: number;
  validation_metrics?: Record<string, { mae_percent: number; rmse_percent: number; mape?: number }>;
  test_metrics?: Record<string, { mae_percent: number; rmse_percent: number; mape?: number }>;
  model_metrics?: { mae_percent: number; rmse_percent: number; mape: number };
  persistence_baseline?: { mae_percent: number; rmse_percent: number; mape: number };
  historical_avg_baseline?: { mae_percent: number; rmse_percent: number; mape: number };
  random_forest_metrics?: { mae_percent: number; rmse_percent: number; mape: number };
  beats_baseline_mae?: boolean;
  beats_baseline_rmse?: boolean;
  feature_importances?: Record<string, number>;
  corridor_evaluations?: Record<string, any>;
  location_support?: Record<string, any>;
}

export interface ModelStatusResponse {
  is_available: boolean;
  metadata?: {
    model_name?: string;
    algorithm?: string;
    selected_model_by_horizon?: Record<string, string>;
    trained_at?: string;
    training_data_cutoff_timestamp?: string;
    total_dataset_rows?: number;
    supported_horizons?: number[];
    feature_columns?: string[];
    evaluation_by_horizon?: Record<string, ModelHorizonEvaluation>;
    metrics?: any;
    limitations?: string[];
  };
}

export interface PredictionResponse {
  forecast_available?: boolean;
  data_available?: boolean;
  is_stale?: boolean;
  location?: {
    city: string;
    area: string;
    road_name: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  live_traffic?: {
    timestamp: string;
    current_speed_kmh: number;
    free_flow_speed_kmh: number;
    congestion_percent: number | null;
    traffic_condition: string;
    confidence: number;
    is_stale?: boolean;
    data_age_minutes?: number;
    freshness?: string;
  } | null;
  forecast?: (Forecast & {
    is_stale?: boolean;
    data_age_minutes?: number;
  }) | null;
  outlooks?: Record<string, Forecast>;
  recent_history?: Array<{
    timestamp: string;
    congestion_percent: number;
    current_speed_kmh: number;
    free_flow_speed_kmh: number;
  }>;
  model_info?: {
    model_name: string;
    trained_at?: string;
    training_data_cutoff_timestamp?: string;
    horizon_minutes: number;
    supported_horizons: number[];
    model_mae?: number;
    model_rmse?: number;
    evaluation?: any;
    baseline_comparison?: any;
  };
  data_status?: {
    total_observations: number;
    has_sufficient_history: boolean;
    required_observations?: number;
    is_monitored?: boolean;
    estimated_readiness_minutes?: number | null;
    readiness_note?: string;
    earliest?: string;
    latest?: string;
    is_stale?: boolean;
    data_age_minutes?: number;
    freshness?: string;
  };
  explanation?: string;
  message?: string;
  predictions: Forecast[];
  model_name?: string;
  model_status?: string;
  generated_at?: string;
  model_mae?: number;
}


/** Coordinates used by the route-planning API. */
export interface RoutePoint {
  latitude: number;
  longitude: number;
  name?: string;
  city?: string;
  area?: string;
}

export type RoutePreference = 'fastest' | 'shortest' | 'least-congested';

export interface RouteSegmentTraffic {
  id: string;
  name: string;
  coordinates: [number, number][];
  current_speed_kmh?: number | null;
  free_flow_speed_kmh?: number | null;
  congestion_percent?: number | null;
  delay_seconds?: number;
  is_congested_hotspot?: boolean;
  data_source?: string;
  last_updated?: string;
}

export interface RoutePredictionSegment {
  road_id: string;
  predicted_speed_kmh?: number | null;
  predicted_congestion_percent?: number | null;
  current_speed_kmh?: number | null;
  free_flow_speed_kmh?: number | null;
  horizon_minutes: number;
  model_status: string;
  explanation?: string;
  coordinates?: [number, number][];
}

export interface RoutePredictionSummary {
  route_prediction_available: boolean;
  coverage_status: string;
  coverage_percent: number;
  monitored_segments_count?: number;
  total_segments_count?: number;
  predicted_travel_time_seconds?: number | null;
  predicted_traffic_delay_seconds?: number | null;
  prediction_horizon_minutes: number;
  message: string;
  segment_predictions?: RoutePredictionSegment[];
}

/** Expected response from POST /api/routes endpoint. */
export interface PlannedRoute {
  id: string;
  candidate_tag?: string;
  name?: string;
  distance_km: number;
  travel_time_seconds: number;
  free_flow_time_seconds?: number;
  traffic_delay_seconds?: number;
  congestion_percent?: number;
  traffic_condition?: string;
  traffic_available: boolean;
  estimated_arrival_time?: string;
  is_recommended?: boolean;
  recommendation_reason?: string | null;
  geometry?: [number, number][];
  summary?: string;
  segments?: RouteSegmentTraffic[];
  prediction?: RoutePredictionSummary;
  sources?: Record<string, string>;
}

export interface RoutePlanResponse {
  routes: PlannedRoute[];
  generated_at: string;
  provider?: string;
  preference_applied?: string;
}

// -----------------------------
// Traffic Analytics Types
// -----------------------------

export interface AnalyticsFilterOption {
  id: string;
  label: string;
}

export interface CityFilterOption {
  name: string;
  record_count: number;
}

export interface RoadFilterOption {
  name: string;
  record_count: number;
}

export interface AnalyticsFilterOptions {
  cities: CityFilterOption[];
  roads_by_city: Record<string, RoadFilterOption[]>;
  all_roads: RoadFilterOption[];
  default_city: string;
  min_date: string | null;
  max_date: string | null;
  total_records: number;
  time_of_day_options: AnalyticsFilterOption[];
  severity_options: AnalyticsFilterOption[];
  raw_records_count?: number;
  corrupted_records_count?: number;
}

export interface AnalyticsSummary {
  records_analyzed: number;
  total_records_available: number;
  corrupted_records: number;
  avg_congestion_percent: number | null;
  avg_speed_kmh: number | null;
  avg_free_flow_speed_kmh: number | null;
  avg_delay_seconds: number | null;
  avg_delay_minutes: number | null;
  highest_congestion_percent: number | null;
  peak_traffic_period: string | null;
  peak_traffic_detail: string | null;
  most_congested_road: {
    name: string;
    avg_congestion_percent: number;
    sample_count: number;
  } | null;
  date_range: {
    start: string;
    end: string;
    days_covered: number;
  } | null;
  coverage_note: string;
}

export interface AnalyticsTrendPoint {
  bin: string;
  timestamp: string;
  label: string;
  congestion_percent: number | null;
  current_speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  avg_delay_seconds: number | null;
  sample_count: number;
  primary_road: string;
}

export interface HeatmapCell {
  day_index: number;
  day_name: string;
  hour: number;
  hour_label: string;
  avg_congestion: number | null;
  avg_speed_kmh: number | null;
  count: number;
  status: 'observed' | 'unobserved';
}

export interface HeatmapData {
  days: string[];
  hours: number[];
  cells: HeatmapCell[];
  observed_cells_count: number;
  unobserved_cells_count: number;
  coverage_percentage: number;
  observed_days: string[];
  coverage_note: string;
}

export interface RoadComparisonItem {
  road: string;
  city: string;
  avg_congestion_percent: number;
  avg_speed_kmh: number;
  free_flow_speed_kmh: number;
  speed_deficit_kmh: number;
  avg_delay_seconds: number;
  avg_delay_minutes: number;
  sample_count: number;
  severity: string;
}

export interface SpeedDistributionItem {
  range: string;
  count: number;
  percentage: number;
}

export interface SpeedDelayAnalysis {
  overall_avg_speed: number | null;
  overall_free_flow_speed: number | null;
  overall_speed_deficit: number | null;
  overall_avg_delay_sec: number | null;
  speed_distribution: SpeedDistributionItem[];
  formula_documentation: string;
}

export interface AnalyticsOverviewResponse {
  summary: AnalyticsSummary;
  trends: AnalyticsTrendPoint[];
  heatmap: HeatmapData;
  road_comparison: RoadComparisonItem[];
  speed_delay: SpeedDelayAnalysis;
  active_filters: {
    city?: string | null;
    road?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    time_of_day?: string | null;
    severity?: string | null;
  };
  total_filtered_records: number;
  dataset_source: string;
  generated_at: string;
}

export interface PaginatedHistoricalRecord {
  id: string;
  timestamp: string;
  city: string;
  area: string;
  current_speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  speed_deficit_kmh: number | null;
  delay_seconds: number | null;
  congestion_percent: number | null;
  confidence: number | null;
  severity: string;
  source: string;
}

export interface PaginatedRecordsResponse {
  records: PaginatedHistoricalRecord[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}


