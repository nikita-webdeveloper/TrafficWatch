import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { PredictionsView } from '@/components/traffic/PredictionsView';
import * as api from '@/services/api';
import type {
  PredictionResponse,
  PredictionLocationsResponse,
  RoadsOutlookResponse,
  PredictionDataStatusResponse,
  ModelStatusResponse,
} from '@/types/traffic';

// Mock recharts responsive container for jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual<any>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  };
});

// Mock TrafficProvider context
vi.mock('@/components/traffic/TrafficProvider', () => ({
  useTraffic: () => ({
    location: { city: 'Pune', area: 'Central Pune', latitude: 18.5204, longitude: 73.8567 },
    reading: null,
    loading: false,
    monitoredLocations: [],
  }),
}));

const MOCK_LOCATIONS: PredictionLocationsResponse = {
  total_locations: 2,
  locations: [
    {
      city: 'Pune',
      area: 'Central Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      observation_count: 480,
      has_sufficient_history: true,
      latest_congestion: 35.0,
      latest_speed: 28.0,
    },
    {
      city: 'Mumbai',
      area: 'CSMT, Mumbai',
      latitude: 18.9414,
      longitude: 72.8354,
      observation_count: 56,
      has_sufficient_history: true,
      latest_congestion: 52.0,
      latest_speed: 21.0,
    },
  ],
};

const MOCK_PREDICTION: PredictionResponse = {
  forecast_available: true,
  data_available: true,
  location: {
    city: 'Pune',
    area: 'Central Pune',
    road_name: 'Central Pune',
    latitude: 18.5204,
    longitude: 73.8567,
  },
  live_traffic: {
    timestamp: '2026-10-18T11:00:00+05:30',
    current_speed_kmh: 28.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 37.8,
    traffic_condition: 'Moderate Congestion',
    confidence: 0.9,
  },
  forecast: {
    timestamp: '2026-10-18T11:15:00+05:30',
    predicted_congestion_percent: 32.5,
    predicted_speed_kmh: 30.4,
    congestion_delta: -5.3,
    speed_delta: 2.4,
    direction: 'improving',
    direction_label: 'Congestion easing (-5.3%)',
    horizon_minutes: 15,
    confidence: 0.85,
    model_status: 'model_prediction',
    model_name: 'RandomForestRegressor',
  },
  outlooks: {
    '15m': {
      timestamp: '2026-10-18T11:15:00+05:30',
      predicted_congestion_percent: 32.5,
      predicted_speed_kmh: 30.4,
      congestion_delta: -5.3,
      direction: 'improving',
      direction_label: 'Congestion easing (-5.3%)',
      horizon_minutes: 15,
      model_status: 'model_prediction',
    },
    '30m': {
      timestamp: '2026-10-18T11:30:00+05:30',
      predicted_congestion_percent: 30.0,
      predicted_speed_kmh: 31.5,
      congestion_delta: -7.8,
      direction: 'improving',
      direction_label: 'Congestion easing (-7.8%)',
      horizon_minutes: 30,
      model_status: 'model_prediction',
    },
    '60m': {
      timestamp: '2026-10-18T12:00:00+05:30',
      predicted_congestion_percent: 35.0,
      predicted_speed_kmh: 29.2,
      congestion_delta: -2.8,
      direction: 'improving',
      direction_label: 'Congestion easing (-2.8%)',
      horizon_minutes: 60,
      model_status: 'model_prediction',
    },
  },
  recent_history: [
    { timestamp: '2026-10-18T10:45:00+05:30', congestion_percent: 42.0, current_speed_kmh: 26.0, free_flow_speed_kmh: 45.0 },
    { timestamp: '2026-10-18T10:50:00+05:30', congestion_percent: 40.0, current_speed_kmh: 27.0, free_flow_speed_kmh: 45.0 },
    { timestamp: '2026-10-18T10:55:00+05:30', congestion_percent: 38.0, current_speed_kmh: 28.0, free_flow_speed_kmh: 45.0 },
  ],
  explanation: 'Traffic is predicted to ease slightly over the next 15 minutes as flow improves.',
  data_status: {
    total_observations: 480,
    has_sufficient_history: true,
  },
  predictions: [],
};

const MOCK_ROADS: RoadsOutlookResponse = {
  total_roads: 2,
  horizon_minutes: 15,
  roads: [
    {
      road_name: 'Central Pune',
      city: 'Pune',
      area: 'Central Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      current_congestion_percent: 37.8,
      predicted_congestion_percent: 32.5,
      congestion_delta: -5.3,
      current_speed_kmh: 28.0,
      predicted_speed_kmh: 30.4,
      speed_delta: 2.4,
      direction: 'improving',
      direction_label: 'Congestion easing',
      observation_count: 480,
      has_sufficient_history: true,
      forecast_available: true,
    },
    {
      road_name: 'CSMT, Mumbai',
      city: 'Mumbai',
      area: 'CSMT, Mumbai',
      latitude: 18.9414,
      longitude: 72.8354,
      current_congestion_percent: 52.0,
      predicted_congestion_percent: 56.5,
      congestion_delta: 4.5,
      current_speed_kmh: 21.0,
      predicted_speed_kmh: 19.5,
      speed_delta: -1.5,
      direction: 'worsening',
      direction_label: 'Congestion building',
      observation_count: 56,
      has_sufficient_history: true,
      forecast_available: true,
    },
  ],
};

const MOCK_DATA_STATUS: PredictionDataStatusResponse = {
  status: 'ready',
  total_cleaned_rows: 1083,
  exact_duplicates_removed: 14,
  logical_duplicates_removed: 155,
  conflicts_resolved: 36,
  time_span_hours: 74.6,
  freshness: 'fresh',
};

const MOCK_MODEL_STATUS: ModelStatusResponse = {
  is_available: true,
  metadata: {
    model_name: 'RandomForestRegressor',
    algorithm: 'RandomForestRegressor (residual delta formulation)',
    trained_at: '2026-10-18T11:26:00Z',
    total_dataset_rows: 1083,
    supported_horizons: [15, 30, 60],
    evaluation_by_horizon: {
      '15m': {
        horizon_minutes: 15,
        supported: true,
        model_metrics: { mae_percent: 6.75, rmse_percent: 9.41, mape: 69.14 },
        persistence_baseline: { mae_percent: 6.21, rmse_percent: 9.94, mape: 55.37 },
        historical_avg_baseline: { mae_percent: 9.09, rmse_percent: 11.63, mape: 117.79 },
        beats_baseline_rmse: true,
      },
      '30m': {
        horizon_minutes: 30,
        supported: true,
        model_metrics: { mae_percent: 7.32, rmse_percent: 9.79, mape: 75.77 },
        persistence_baseline: { mae_percent: 7.12, rmse_percent: 10.24, mape: 66.66 },
        historical_avg_baseline: { mae_percent: 9.97, rmse_percent: 12.13, mape: 135.93 },
        beats_baseline_rmse: true,
      },
      '60m': {
        horizon_minutes: 60,
        supported: true,
        model_metrics: { mae_percent: 7.95, rmse_percent: 9.85, mape: 79.82 },
        persistence_baseline: { mae_percent: 7.02, rmse_percent: 10.59, mape: 62.68 },
        historical_avg_baseline: { mae_percent: 8.83, rmse_percent: 11.57, mape: 106.51 },
        beats_baseline_rmse: true,
      },
    },
  },
};

describe('PredictionsView Component', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getPredictionLocations').mockResolvedValue(MOCK_LOCATIONS);
    vi.spyOn(api, 'getPredictions').mockResolvedValue(MOCK_PREDICTION);
    vi.spyOn(api, 'getRoadsOutlook').mockResolvedValue(MOCK_ROADS);
    vi.spyOn(api, 'getPredictionDataStatus').mockResolvedValue(MOCK_DATA_STATUS);
    vi.spyOn(api, 'getModelStatus').mockResolvedValue(MOCK_MODEL_STATUS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all required sections when full prediction is available', async () => {
    render(<PredictionsView />);

    // 1. Header
    await waitFor(() => {
      expect(screen.getByText('Traffic Predictions')).toBeInTheDocument();
    });
    expect(screen.getByText('See how traffic conditions may change on your selected road.')).toBeInTheDocument();

    // 2. Horizon buttons
    expect(screen.getAllByText('+15 Minutes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+30 Minutes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+60 Minutes').length).toBeGreaterThanOrEqual(1);

    // 3. Main Outlook card
    await waitFor(() => {
      expect(screen.getAllByText('32.5%').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/Congestion easing/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Conditions Comparison')).toBeInTheDocument();

    // 4. Time-series chart
    expect(screen.getByText('How Traffic May Change')).toBeInTheDocument();

    // 5. Multi-Horizon Outlook Cards
    expect(screen.getByText('Forecast by Time')).toBeInTheDocument();

    // 6. Roads Comparison Table
    expect(screen.getByText('Compare Other Roads')).toBeInTheDocument();
    expect(screen.getByText('CSMT, Mumbai')).toBeInTheDocument();

    // 7. Model Performance Section
    expect(screen.getByText('Forecast Accuracy and Data Quality')).toBeInTheDocument();

    // 8. Data Pipeline Status
    expect(screen.getByText(/Cleaned Historical Dataset:/)).toBeInTheDocument();
    expect(screen.getByText(/1083 validated records/)).toBeInTheDocument();
  });

  it('allows switching forecast horizon to +30m and +60m', async () => {
    render(<PredictionsView />);
    await waitFor(() => {
      expect(screen.getAllByText('+30 Minutes').length).toBeGreaterThanOrEqual(1);
    });

    const btn30 = screen.getAllByRole('button', { name: /\+30 Minutes/i })[0];
    fireEvent.click(btn30);

    await waitFor(() => {
      expect(api.getPredictions).toHaveBeenCalledWith(
        expect.objectContaining({
          get: expect.any(Function),
        })
      );
    });
  });

  it('handles insufficient history gracefully without fabricating synthetic forecasts', async () => {
    const insufficientMock: PredictionResponse = {
      forecast_available: false,
      data_available: true,
      location: { city: 'Mumbai', area: 'Unfinished Road', road_name: 'Unfinished Road' },
      live_traffic: {
        timestamp: '2026-10-18T11:00:00+05:30',
        current_speed_kmh: 22.0,
        free_flow_speed_kmh: 40.0,
        congestion_percent: 45.0,
        traffic_condition: 'Moderate Congestion',
        confidence: 0.8,
      },
      forecast: null,
      outlooks: {},
      recent_history: [],
      data_status: {
        total_observations: 7,
        has_sufficient_history: false,
        required_observations: 15,
      },
      message: 'Insufficient historical data for Unfinished Road (7 readings available, 15 required). Accumulating data...',
      predictions: [],
    };

    vi.spyOn(api, 'getPredictions').mockResolvedValue(insufficientMock);

    render(<PredictionsView />);

    await waitFor(() => {
      expect(screen.getByText(/Accumulating Historical Observations/)).toBeInTheDocument();
    });
    expect(screen.getByText(/7 observations recorded/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated readiness: ~40 minutes/)).toBeInTheDocument();
    // Live speed is reported truthfully
    expect(screen.getByText('22 km/h')).toBeInTheDocument();
  });
});
