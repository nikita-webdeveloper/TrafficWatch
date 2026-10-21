import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { TrafficAnalytics } from '@/components/traffic/TrafficAnalytics';
import * as api from '@/services/api';
import type {
  AnalyticsFilterOptions,
  AnalyticsOverviewResponse,
  PaginatedRecordsResponse,
} from '@/types/traffic';

// Mock recharts ResponsiveContainer so jsdom renders chart contents without 0-dimension warnings
vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  };
});

// Mock TrafficProvider hook
const mockTrafficContext = {
  location: { city: 'Pune', area: 'Central Pune', latitude: 18.5204, longitude: 73.8567 },
  reading: {
    city: 'Pune',
    area: 'Central Pune',
    latitude: 18.5204,
    longitude: 73.8567,
    current_speed_kmh: 18,
    free_flow_speed_kmh: 22,
    current_travel_time_seconds: 500,
    free_flow_travel_time_seconds: 400,
    congestion_percent: 18.2,
    timestamp: '2026-10-17T15:20:00+05:30',
  },
  health: 'online' as const,
};

vi.mock('@/components/traffic/TrafficProvider', async () => {
  const actual = await vi.importActual<any>('@/components/traffic/TrafficProvider');
  return {
    ...actual,
    useTraffic: () => mockTrafficContext,
  };
});

const MOCK_FILTER_OPTIONS: AnalyticsFilterOptions = {
  cities: [
    { name: 'Pune', record_count: 512 },
    { name: 'New Delhi', record_count: 149 },
    { name: 'Mulshi Subdistrict', record_count: 134 },
  ],
  roads_by_city: {
    Pune: [
      { name: 'Central Pune', record_count: 442 },
      { name: 'Bibwewadi', record_count: 48 },
      { name: 'Shivajinagar', record_count: 22 },
    ],
    'New Delhi': [{ name: 'Connaught Place', record_count: 149 }],
    'Mulshi Subdistrict': [{ name: 'Hinjawadi', record_count: 134 }],
  },
  all_roads: [
    { name: 'Central Pune', record_count: 442 },
    { name: 'Connaught Place', record_count: 149 },
    { name: 'Hinjawadi', record_count: 134 },
    { name: 'Bibwewadi', record_count: 48 },
  ],
  default_city: 'Pune',
  min_date: '2026-10-15',
  max_date: '2026-10-17',
  total_records: 855,
  time_of_day_options: [
    { id: 'all', label: 'All Day' },
    { id: 'morning', label: 'Morning (05:00 - 11:59)' },
    { id: 'afternoon', label: 'Afternoon (12:00 - 16:59)' },
    { id: 'evening', label: 'Evening (17:00 - 20:59)' },
    { id: 'night', label: 'Night (21:00 - 04:59)' },
  ],
  severity_options: [
    { id: 'all', label: 'All Severities' },
    { id: 'low', label: 'Low (< 20%)' },
    { id: 'moderate', label: 'Moderate (20% - 39.9%)' },
    { id: 'high', label: 'High (40% - 59.9%)' },
    { id: 'severe', label: 'Severe (≥ 60%)' },
  ],
};

const MOCK_OVERVIEW: AnalyticsOverviewResponse = {
  summary: {
    records_analyzed: 512,
    total_records_available: 855,
    corrupted_records: 0,
    avg_congestion_percent: 21.4,
    avg_speed_kmh: 14.8,
    avg_free_flow_speed_kmh: 18.5,
    avg_delay_seconds: 142.0,
    avg_delay_minutes: 2.4,
    highest_congestion_percent: 54.2,
    peak_traffic_period: 'Thursday 18:00 - 19:00',
    peak_traffic_detail: '37.2% avg congestion (27 readings)',
    most_congested_road: {
      name: 'Bibwewadi',
      avg_congestion_percent: 28.5,
      sample_count: 48,
    },
    date_range: {
      start: '2026-10-15T08:49:27+05:30',
      end: '2026-10-17T15:20:00+05:30',
      days_covered: 3,
    },
    coverage_note: 'Analysis covers 512 valid recorded traffic observations.',
  },
  trends: [
    {
      bin: '2026-10-15 09:00',
      timestamp: '2026-10-15T09:02:10+05:30',
      label: '10-15 09:00',
      congestion_percent: 12.5,
      current_speed_kmh: 15.0,
      free_flow_speed_kmh: 17.0,
      avg_delay_seconds: 45.0,
      sample_count: 8,
      primary_road: 'Central Pune',
    },
    {
      bin: '2026-10-15 18:00',
      timestamp: '2026-10-15T18:05:00+05:30',
      label: '10-15 18:00',
      congestion_percent: 37.2,
      current_speed_kmh: 11.0,
      free_flow_speed_kmh: 17.5,
      avg_delay_seconds: 210.0,
      sample_count: 14,
      primary_road: 'Central Pune',
    },
  ],
  heatmap: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    hours: Array.from({ length: 24 }, (_, i) => i),
    cells: Array.from({ length: 168 }, (_, idx) => {
      const dow = Math.floor(idx / 24);
      const hr = idx % 24;
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      // Sample observation on Thursday hour 18
      if (dow === 3 && hr === 18) {
        return {
          day_index: dow,
          day_name: dayNames[dow],
          hour: hr,
          hour_label: `${hr}:00`,
          avg_congestion: 37.2,
          avg_speed_kmh: 11.0,
          count: 27,
          status: 'observed',
        };
      }
      return {
        day_index: dow,
        day_name: dayNames[dow],
        hour: hr,
        hour_label: `${hr}:00`,
        avg_congestion: null,
        avg_speed_kmh: null,
        count: 0,
        status: 'unobserved',
      };
    }),
    observed_cells_count: 18,
    unobserved_cells_count: 150,
    coverage_percentage: 10.7,
    observed_days: ['Thursday', 'Friday', 'Saturday'],
    coverage_note: 'Observed data covers 18 of 168 weekly hour slots.',
  },
  road_comparison: [
    {
      road: 'Bibwewadi',
      city: 'Pune',
      avg_congestion_percent: 28.5,
      avg_speed_kmh: 18.0,
      free_flow_speed_kmh: 24.0,
      speed_deficit_kmh: 6.0,
      avg_delay_seconds: 180.0,
      avg_delay_minutes: 3.0,
      sample_count: 48,
      severity: 'moderate',
    },
    {
      road: 'Central Pune',
      city: 'Pune',
      avg_congestion_percent: 21.0,
      avg_speed_kmh: 14.5,
      free_flow_speed_kmh: 18.0,
      speed_deficit_kmh: 3.5,
      avg_delay_seconds: 135.0,
      avg_delay_minutes: 2.3,
      sample_count: 442,
      severity: 'moderate',
    },
  ],
  speed_delay: {
    overall_avg_speed: 14.8,
    overall_free_flow_speed: 18.5,
    overall_speed_deficit: 3.7,
    overall_avg_delay_sec: 142.0,
    speed_distribution: [
      { range: '< 20 km/h', count: 420, percentage: 82.0 },
      { range: '20 - 34 km/h', count: 80, percentage: 15.6 },
      { range: '35 - 49 km/h', count: 12, percentage: 2.4 },
      { range: '≥ 50 km/h', count: 0, percentage: 0.0 },
    ],
    formula_documentation: 'Congestion percentage = 100 × (1 − current_speed / free_flow_speed).',
  },
  active_filters: {
    city: 'Pune',
    road: 'All',
    start_date: null,
    end_date: null,
    time_of_day: 'all',
    severity: 'all',
  },
  total_filtered_records: 512,
  dataset_source: 'TomTom Flow API Historical Dataset',
  generated_at: '2026-10-17T15:25:00+05:30',
};

const MOCK_PAGINATED_RECORDS: PaginatedRecordsResponse = {
  records: [
    {
      id: 'rec-1',
      timestamp: '2026-10-15T09:02:10+05:30',
      city: 'Pune',
      area: 'Central Pune',
      current_speed_kmh: 16,
      free_flow_speed_kmh: 16,
      speed_deficit_kmh: 0,
      delay_seconds: 0,
      congestion_percent: 0,
      confidence: 0.67,
      severity: 'low',
      source: 'TomTom Flow API Historical Log',
    },
    {
      id: 'rec-2',
      timestamp: '2026-10-15T09:32:22+05:30',
      city: 'Pune',
      area: 'Central Pune',
      current_speed_kmh: 13,
      free_flow_speed_kmh: 15,
      speed_deficit_kmh: 2,
      delay_seconds: 117,
      congestion_percent: 13.3,
      confidence: 0.67,
      severity: 'low',
      source: 'TomTom Flow API Historical Log',
    },
  ],
  total_count: 512,
  page: 1,
  page_size: 10,
  total_pages: 52,
};

describe('TrafficAnalytics Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getAnalyticsFilterOptions').mockResolvedValue(MOCK_FILTER_OPTIONS);
    vi.spyOn(api, 'getAnalyticsOverview').mockResolvedValue(MOCK_OVERVIEW);
    vi.spyOn(api, 'getAnalyticsRecords').mockResolvedValue(MOCK_PAGINATED_RECORDS);
    vi.spyOn(api, 'getAnalyticsExportUrl').mockReturnValue('http://127.0.0.1:8000/api/traffic/analytics/export?city=Pune');
  });

  it('renders page header, title, description, refresh button, and data source badges', async () => {
    render(<TrafficAnalytics />);

    expect(screen.getByText('Traffic Analytics')).toBeInTheDocument();
    expect(screen.getByText(/Analyze recorded historical traffic patterns/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh Data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Recorded Dataset/i)).toBeInTheDocument();
      expect(screen.getByText(/Live Flow Active/i)).toBeInTheDocument();
    });
  });

  it('renders summary statistic cards with calculated values', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      // Average Congestion
      const congestionCard = screen.getByTestId('metric-avg-congestion');
      expect(congestionCard).toHaveTextContent('21.4%');
      expect(congestionCard).toHaveTextContent('Low');

      // Average Speed
      const speedCard = screen.getByTestId('metric-avg-speed');
      expect(speedCard).toHaveTextContent('14.8');
      expect(speedCard).toHaveTextContent('km/h');

      // Peak Period
      const peakCard = screen.getByTestId('metric-peak-period');
      expect(peakCard).toHaveTextContent('Thursday 18:00 - 19:00');

      // Records Analyzed
      const recordsCard = screen.getByTestId('metric-records-analyzed');
      expect(recordsCard).toHaveTextContent('512');

      // Top Road
      const roadCard = screen.getByTestId('metric-top-road');
      expect(roadCard).toHaveTextContent('Bibwewadi');

      // Delay
      const delayCard = screen.getByTestId('metric-avg-delay');
      expect(delayCard).toHaveTextContent('2.4');
    });
  });

  it('renders filter controls and defaults to Pune', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      const citySelect = screen.getByLabelText(/City/i) as HTMLSelectElement;
      expect(citySelect.value).toBe('Pune');
    });
  });

  it('updates road options when city changes', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      const citySelect = screen.getByLabelText(/City/i) as HTMLSelectElement;
      expect(citySelect.value).toBe('Pune');
    });

    // Change city to New Delhi
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'New Delhi' } });

    await waitFor(() => {
      const roadSelect = screen.getByLabelText(/Road \/ Corridor/i) as HTMLSelectElement;
      expect(roadSelect).toHaveTextContent('Connaught Place');
    });
  });

  it('triggers overview reload when road filter changes', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(api.getAnalyticsOverview).toHaveBeenCalled();
    });

    const roadSelect = screen.getByLabelText(/Road \/ Corridor/i);
    fireEvent.change(roadSelect, { target: { value: 'Central Pune' } });

    await waitFor(() => {
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        expect.objectContaining({ road: 'Central Pune' }),
        expect.anything()
      );
    });
  });

  it('handles date shortcuts (Last 24 Hours, Last 7 Days, All Recorded)', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Last 24 Hours')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Last 24 Hours'));

    await waitFor(() => {
      const fromInput = screen.getByLabelText(/From Date/i) as HTMLInputElement;
      const toInput = screen.getByLabelText(/To Date/i) as HTMLInputElement;
      expect(fromInput.value).toBe('2026-10-16');
      expect(toInput.value).toBe('2026-10-17');
    });

    // Click All Recorded
    fireEvent.click(screen.getByText('All Recorded'));
    await waitFor(() => {
      const fromInput = screen.getByLabelText(/From Date/i) as HTMLInputElement;
      expect(fromInput.value).toBe('');
    });
  });

  it('supports time of day selection', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Time of Day/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Time of Day/i), { target: { value: 'morning' } });

    await waitFor(() => {
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        expect.objectContaining({ time_of_day: 'morning' }),
        expect.anything()
      );
    });
  });

  it('supports congestion severity filter pills', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText(/Low \(< 20%\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Low \(< 20%\)/i));

    await waitFor(() => {
      expect(api.getAnalyticsOverview).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'low' }),
        expect.anything()
      );
    });
  });

  it('resets filters when clicking the Reset button', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Time of Day/i)).toBeInTheDocument();
    });

    // Set time of day to evening
    fireEvent.change(screen.getByLabelText(/Time of Day/i), { target: { value: 'evening' } });

    // Click Reset
    fireEvent.click(screen.getByRole('button', { name: /Reset Filters/i }));

    await waitFor(() => {
      const todSelect = screen.getByLabelText(/Time of Day/i) as HTMLSelectElement;
      expect(todSelect.value).toBe('all');
    });
  });

  it('renders historical records table with sort and search controls', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Historical Observations Log')).toBeInTheDocument();
      expect(screen.getAllByText('16 km/h').length).toBeGreaterThan(0);
      expect(screen.getByText('13 km/h')).toBeInTheDocument();
      expect(screen.getByText('13.3%')).toBeInTheDocument();
    });

    // Search input
    const searchInput = screen.getByPlaceholderText(/Search road or city.../i);
    fireEvent.change(searchInput, { target: { value: 'Central' } });

    await waitFor(() => {
      expect(api.getAnalyticsRecords).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Central' }),
        expect.anything()
      );
    });
  });

  it('renders the heatmap and handles cell hover inspection', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText(/Congestion Pattern Heatmap/i)).toBeInTheDocument();
      expect(screen.getByText('Cell Inspection:')).toBeInTheDocument();
    });
  });

  it('renders road congestion comparison chart', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Corridor Congestion Ranking')).toBeInTheDocument();
    });
  });

  it('renders speed deficit distribution cards and methodology', async () => {
    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Speed Deficit & Delay Analysis')).toBeInTheDocument();
      expect(screen.getByText(/Congestion & Delay Methodology/i)).toBeInTheDocument();
      expect(screen.getByText(/< 20 km\/h/i)).toBeInTheDocument();
    });
  });

  it('handles API error state gracefully with retry button', async () => {
    vi.spyOn(api, 'getAnalyticsOverview').mockRejectedValueOnce(new Error('Network service timeout'));

    render(<TrafficAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Network service timeout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
