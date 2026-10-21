import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AboutDataView } from '@/components/traffic/AboutDataView';
import * as api from '@/services/api';
import type {
  PredictionDataStatusResponse,
  CollectorStatusResponse,
  PaginatedRecordsResponse,
} from '@/types/traffic';

const MOCK_DATA_STATUS: PredictionDataStatusResponse = {
  status: 'ready',
  total_cleaned_rows: 1646,
  unique_locations_count: 19,
  earliest_observation: '2026-10-15T10:00:00+05:30',
  latest_observation: '2026-10-18T14:15:00+05:30',
  time_span_hours: 76.5,
  data_age_minutes: 5.2,
  freshness: 'fresh',
  model_training_status: {
    model_name: 'Persistence',
    trained_at: '2026-10-17T15:25:02+05:30',
    supported_horizons: [15, 30, 60],
    total_training_rows: 1420,
  },
  collection_health: {
    is_collector_running: true,
    scheduler_active: true,
    last_attempt_at: '2026-10-18T14:15:02+05:30',
    last_successful_collection_at: '2026-10-18T14:15:10+05:30',
    last_collection_status: 'success',
    last_collection_message: 'Collected 19 observations successfully',
    successful_reads_last_run: 19,
    failed_reads_last_run: 0,
    monitored_locations_count: 19,
    tomtom_api_configured: true,
  },
};

const MOCK_COLLECTOR_STATUS: CollectorStatusResponse = {
  is_collector_running: true,
  scheduler_active: true,
  last_attempt_at: '2026-10-18T14:15:02+05:30',
  last_successful_collection_at: '2026-10-18T14:15:10+05:30',
  last_collection_status: 'success',
  last_collection_message: 'Collected 19 observations successfully',
  successful_reads_last_run: 19,
  failed_reads_last_run: 0,
  monitored_locations_count: 19,
  tomtom_api_configured: true,
};

const MOCK_RECORDS: PaginatedRecordsResponse = {
  records: [
    {
      id: 'rec-1',
      timestamp: '2026-10-18T14:15:00+05:30',
      city: 'Delhi',
      area: 'Connaught Place Outer Circle',
      current_speed_kmh: 22,
      free_flow_speed_kmh: 40,
      delay_seconds: 120,
      congestion_percent: 45.0,
      traffic_condition: 'Moderate Congestion',
    },
    {
      id: 'rec-2',
      timestamp: '2026-10-18T14:15:00+05:30',
      city: 'Mumbai',
      area: 'Western Express Highway',
      current_speed_kmh: 15,
      free_flow_speed_kmh: 60,
      delay_seconds: 350,
      congestion_percent: 75.0,
      traffic_condition: 'Heavy Congestion',
    },
  ],
  total_count: 1646,
  page: 1,
  page_size: 10,
  total_pages: 165,
};

describe('AboutDataView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getPredictionDataStatus').mockResolvedValue(MOCK_DATA_STATUS);
    vi.spyOn(api, 'getCollectorStatus').mockResolvedValue(MOCK_COLLECTOR_STATUS);
    vi.spyOn(api, 'getAnalyticsRecords').mockResolvedValue(MOCK_RECORDS);
    vi.spyOn(api, 'getAnalyticsExportUrl').mockReturnValue('http://127.0.0.1:8000/api/traffic/analytics/export');
  });

  it('renders page header and subtitle', async () => {
    render(<AboutDataView />);

    expect(screen.getByRole('heading', { level: 1, name: 'About & Data' })).toBeInTheDocument();
    expect(screen.getByText(/understand how trafficwatch collects real-time road telemetry/i)).toBeInTheDocument();
  });

  it('renders Section A with all 5 feature cards', async () => {
    render(<AboutDataView />);

    expect(screen.getByText('TrafficWatch — Smart Traffic Monitoring & Prediction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Live Traffic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Route Planner' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Congestion Hotspots' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Traffic Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Traffic Predictions' })).toBeInTheDocument();
  });

  it('renders Section B summary cards with real backend statistics', async () => {
    render(<AboutDataView />);

    await waitFor(() => {
      expect(screen.getByText('1,646')).toBeInTheDocument();
    });

    expect(screen.getByText('Monitored Corridors')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('Latest Observation')).toBeInTheDocument();
    expect(screen.getByText('Last Collector Run')).toBeInTheDocument();
    expect(screen.getByText('Fresh Telemetry')).toBeInTheDocument();
  });

  it('renders Section C 4-step data pipeline and distinction callout', async () => {
    render(<AboutDataView />);

    expect(screen.getByText('Where Does the Traffic Data Come From?')).toBeInTheDocument();
    expect(screen.getByText('TomTom Traffic Flow API')).toBeInTheDocument();
    expect(screen.getByText('Raw CSV Logging')).toBeInTheDocument();
    expect(screen.getByText('Validation & Deduplication')).toBeInTheDocument();
    expect(screen.getByText('Analytics & Forecasting')).toBeInTheDocument();
    expect(screen.getByText(/key distinction: live observations vs. model training cutoff/i)).toBeInTheDocument();
  });

  it('renders Section D telemetry records table with search and pagination controls', async () => {
    render(<AboutDataView />);

    await waitFor(() => {
      expect(screen.getByText('Recent Traffic Records')).toBeInTheDocument();
      expect(screen.getByText('Connaught Place Outer Circle')).toBeInTheDocument();
      expect(screen.getByText('Western Express Highway')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Search corridor or city...')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', 'http://127.0.0.1:8000/api/traffic/analytics/export');
    expect(screen.getByText(/showing/i)).toBeInTheDocument();
    expect(screen.getByText('1–10')).toBeInTheDocument();
  });

  it('filters records when typing in the search box', async () => {
    render(<AboutDataView />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search corridor or city...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search corridor or city...');
    fireEvent.change(searchInput, { target: { value: 'Mumbai' } });

    await waitFor(() => {
      expect(api.getAnalyticsRecords).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Mumbai' }),
        expect.anything()
      );
    });
  });

  it('triggers refresh when clicking Refresh Data button', async () => {
    render(<AboutDataView />);

    // Wait for initial load to finish so button is enabled
    await waitFor(() => {
      expect(screen.getByText('1,646')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh data status and table/i });
    expect(refreshButton).not.toBeDisabled();
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(api.getPredictionDataStatus).toHaveBeenCalledTimes(2);
      expect(api.getAnalyticsRecords).toHaveBeenCalledTimes(2);
    });
  });

  it('renders Section E explaining prediction baseline and honest limitations', async () => {
    render(<AboutDataView />);

    expect(screen.getByText('Understanding Traffic Predictions')).toBeInTheDocument();
    expect(screen.getByText(/active model: persistence baseline/i)).toBeInTheDocument();
    expect(screen.getByText(/why baseline beat random forest/i)).toBeInTheDocument();
    expect(screen.getByText(/limitations & realities/i)).toBeInTheDocument();
  });

  it('renders Section F technology stack and architecture', async () => {
    render(<AboutDataView />);

    expect(screen.getByText('Technology Stack & Architecture')).toBeInTheDocument();
    expect(screen.getByText(/react 18, typescript, vite & tanstack router/i)).toBeInTheDocument();
    expect(screen.getByText(/fastapi, python 3.12, uvicorn & apscheduler/i)).toBeInTheDocument();
    expect(screen.getByText(/scikit-learn, pandas, joblib & numpy/i)).toBeInTheDocument();
  });
});
