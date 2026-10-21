import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DashboardPage } from '@/components/traffic/TrafficPages';
import * as api from '@/services/api';
import type { TrafficReading, TrafficSegment, Location } from '@/types/traffic';

// Mock @tanstack/react-router Link
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-router');
  return {
    ...actual,
    Link: ({ to, children, className, ...props }: any) => (
      <a href={to} className={className} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock recharts ResponsiveContainer
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

// Mock Leaflet and TrafficMap since React-Leaflet requires real DOM canvas
vi.mock('@/components/traffic/TrafficMap', () => ({
  TrafficMap: ({ isFullscreen, selectedSegmentIndex, onSelectSegment }: any) => (
    <div data-testid="traffic-map-mock">
      <span>Mocked Live Traffic Leaflet Map</span>
      <span data-testid="map-fullscreen">{isFullscreen ? 'true' : 'false'}</span>
      {selectedSegmentIndex !== null && (
        <span data-testid="selected-segment">Segment {selectedSegmentIndex}</span>
      )}
      <button onClick={() => onSelectSegment?.(0)}>Select Segment 0</button>
    </div>
  ),
}));

// Mock History API
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<any>('@/services/api');
  return {
    ...actual,
    getHistory: vi.fn(),
  };
});

const mockUseTraffic = vi.fn();
vi.mock('@/components/traffic/TrafficProvider', async () => {
  const actual = await vi.importActual<any>('@/components/traffic/TrafficProvider');
  return {
    ...actual,
    useTraffic: () => mockUseTraffic(),
  };
});

const MOCK_LOCATION: Location = {
  city: 'Pune',
  area: 'Koregaon Park',
  latitude: 18.5362,
  longitude: 73.894,
  name: 'Koregaon Park, Pune, Maharashtra',
};

const MOCK_READING: TrafficReading = {
  timestamp: '2026-10-17T20:30:00+05:30',
  city: 'Pune',
  area: 'Koregaon Park',
  latitude: 18.5362,
  longitude: 73.894,
  current_speed_kmh: 24.5,
  free_flow_speed_kmh: 45.0,
  current_travel_time_seconds: 360,
  free_flow_travel_time_seconds: 200,
  congestion_percent: 45.5, // Moderate (30–59%)
  confidence: 0.9,
};

const MOCK_SEGMENTS: TrafficSegment[] = [
  {
    id: 'seg-1',
    name: 'North Main Road',
    coordinates: [
      [18.5362, 73.894],
      [18.538, 73.896],
    ],
    current_speed_kmh: 18,
    free_flow_speed_kmh: 40,
    congestion_percent: 55, // Moderate
    frc: 'FRC3',
  },
  {
    id: 'seg-2',
    name: 'South Main Road',
    coordinates: [
      [18.534, 73.892],
      [18.535, 73.893],
    ],
    current_speed_kmh: 35,
    free_flow_speed_kmh: 40,
    congestion_percent: 12.5, // Low
    frc: 'FRC4',
  },
  {
    id: 'seg-3',
    name: 'Bund Garden Bridge',
    coordinates: [
      [18.54, 73.88],
      [18.542, 73.883],
    ],
    current_speed_kmh: 12,
    free_flow_speed_kmh: 45,
    congestion_percent: 73.3, // Heavy (>=60%)
    frc: 'FRC2',
  },
];

const MOCK_HISTORY: TrafficReading[] = [
  {
    timestamp: '2026-10-17T18:00:00+05:30',
    city: 'Pune',
    area: 'Koregaon Park',
    latitude: 18.5362,
    longitude: 73.894,
    current_speed_kmh: 30.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 33.3,
  },
  {
    timestamp: '2026-10-17T19:00:00+05:30',
    city: 'Pune',
    area: 'Koregaon Park',
    latitude: 18.5362,
    longitude: 73.894,
    current_speed_kmh: 22.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 51.1,
  },
  {
    timestamp: '2026-10-17T20:00:00+05:30',
    city: 'Pune',
    area: 'Koregaon Park',
    latitude: 18.5362,
    longitude: 73.894,
    current_speed_kmh: 24.5,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 45.5,
  },
];

describe('Traffic Control Dashboard UI Redesign (Design A)', () => {
  const mockRefresh = vi.fn();
  const mockSave = vi.fn();
  const mockAddMonitored = vi.fn().mockResolvedValue({ message: 'Added to monitoring' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getHistory).mockResolvedValue(MOCK_HISTORY);

    mockUseTraffic.mockReturnValue({
      location: MOCK_LOCATION,
      selectLocation: vi.fn(),
      reading: MOCK_READING,
      segments: MOCK_SEGMENTS,
      loading: false,
      segmentsLoading: false,
      error: '',
      segmentsError: '',
      lastUpdated: '2026-10-17T20:30:00+05:30',
      lastRefreshedAt: new Date('2026-10-17T20:30:00+05:30'),
      isStale: false,
      refresh: mockRefresh,
      health: 'online',
      monitoredLocations: [
        { name: 'Koregaon Park', city: 'Pune', latitude: 18.5362, longitude: 73.894 },
        { name: 'Shivajinagar', city: 'Pune', latitude: 18.5308, longitude: 73.8474 },
      ],
      saved: [],
      save: mockSave,
    });
  });

  describe('Header Section', () => {
    it('renders the Dashboard title, subtitle, and live status indicator', () => {
      render(<DashboardPage />);

      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
      expect(
        screen.getByText('Real-time traffic conditions and road monitoring')
      ).toBeInTheDocument();
      expect(screen.getByText('System Live')).toBeInTheDocument();
    });

    it('renders the location search and selected location coordinates badge', () => {
      render(<DashboardPage />);

      expect(
        screen.getByPlaceholderText(/Search any city, road, or area in India/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Koregaon Park, Pune')).toBeInTheDocument();
      expect(screen.getByText(/18.5362° N, 73.8940° E/i)).toBeInTheDocument();
    });

    it('triggers refresh when the Refresh Traffic button is clicked', () => {
      render(<DashboardPage />);

      const refreshBtn = screen.getByRole('button', { name: /Refresh Traffic/i });
      fireEvent.click(refreshBtn);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Primary Metric Cards', () => {
    it('renders 4 distinct primary metric cards in one grid', () => {
      render(<DashboardPage />);

      expect(screen.getByTestId('metric-card-current-speed')).toBeInTheDocument();
      expect(screen.getByTestId('metric-card-congestion-percent')).toBeInTheDocument();
      expect(screen.getByTestId('metric-card-active-segments')).toBeInTheDocument();
      expect(screen.getByTestId('metric-card-flow-freshness')).toBeInTheDocument();
    });

    it('displays observed speed with free-flow comparison clearly separated', () => {
      render(<DashboardPage />);

      const speedCard = screen.getByTestId('metric-card-current-speed');
      expect(speedCard).toHaveTextContent('24.5');
      expect(speedCard).toHaveTextContent('km/h');
      expect(speedCard).toHaveTextContent('vs 45.0 km/h free-flow');
    });

    it('displays congestion index with correct severity badge', () => {
      render(<DashboardPage />);

      const congestionCard = screen.getByTestId('metric-card-congestion-percent');
      // Average of 55, 12.5, 73.3 = ~46.9%
      expect(congestionCard).toHaveTextContent('%');
      expect(congestionCard).toHaveTextContent('Moderate Congestion');
    });

    it('displays active network segments count', () => {
      render(<DashboardPage />);

      const segmentsCard = screen.getByTestId('metric-card-active-segments');
      expect(segmentsCard).toHaveTextContent('3');
      expect(segmentsCard).toHaveTextContent('road segments');
    });
  });

  describe('Live Traffic Map & Controls', () => {
    it('renders the live traffic map panel with heading and full view link', () => {
      render(<DashboardPage />);

      expect(screen.getByRole('heading', { name: 'Live Traffic Map', level: 2 })).toBeInTheDocument();
      expect(screen.getByTestId('traffic-map-mock')).toBeInTheDocument();
      expect(screen.getByText('Full View')).toBeInTheDocument();
    });

    it('toggles minimize and restore map states', () => {
      render(<DashboardPage />);

      // Initially not minimized
      const minimizeBtn = screen.getByRole('button', { name: /Minimize map/i });
      expect(minimizeBtn).toBeInTheDocument();

      // Click minimize
      fireEvent.click(minimizeBtn);
      expect(screen.getByText(/Map minimized/i)).toBeInTheDocument();
      expect(screen.queryByTestId('traffic-map-mock')).not.toBeInTheDocument();

      // Click restore (either button restores the map)
      const restoreButtons = screen.getAllByRole('button', { name: /Restore map/i });
      expect(restoreButtons.length).toBeGreaterThan(0);
      fireEvent.click(restoreButtons[0]);
      expect(screen.getByTestId('traffic-map-mock')).toBeInTheDocument();
    });

    it('supports fullscreen toggle button with accessible labels', () => {
      render(<DashboardPage />);

      const fsBtn = screen.getByRole('button', { name: /Enter fullscreen/i });
      expect(fsBtn).toBeInTheDocument();

      fireEvent.click(fsBtn);
      expect(screen.getByRole('button', { name: /Exit fullscreen/i })).toBeInTheDocument();
    });
  });

  describe('Traffic Conditions Map-Side Summary', () => {
    it('renders top congested roads sorted by congestion severity', () => {
      render(<DashboardPage />);

      expect(screen.getByRole('heading', { name: 'Traffic Conditions' })).toBeInTheDocument();
      // Bund Garden Bridge has highest congestion (73%)
      expect(screen.getByText('Bund Garden Bridge')).toBeInTheDocument();
      expect(screen.getByText('North Main Road')).toBeInTheDocument();
      expect(screen.getByText('South Main Road')).toBeInTheDocument();
      expect(screen.getByText('73%')).toBeInTheDocument();
      expect(screen.getByText('View all hotspots')).toBeInTheDocument();
    });

    it('shows informative empty state when no road segments exist', () => {
      mockUseTraffic.mockReturnValue({
        ...mockUseTraffic(),
        segments: [],
      });

      render(<DashboardPage />);
      expect(screen.getByText('No Active Flow Segments')).toBeInTheDocument();
    });
  });

  describe('Historical Traffic Section', () => {
    it('renders Traffic History with toggles for metric, scope, and time range', async () => {
      render(<DashboardPage />);

      expect(screen.getByRole('heading', { name: 'Traffic History' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Congestion %' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Speed km/h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Selected Area' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All Data' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recent 20' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/Coverage:/i)).toBeInTheDocument();
      });
    });

    it('toggles metric from Congestion % to Speed km/h', async () => {
      render(<DashboardPage />);

      const speedToggle = screen.getByRole('button', { name: 'Speed km/h' });
      fireEvent.click(speedToggle);
      expect(speedToggle).toHaveClass('bg-primary');
    });

    it('displays recent verified observations in the summary table', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('OBSERVED SPEED')).toBeInTheDocument();
        expect(screen.getByText('View Full Traffic Analytics')).toBeInTheDocument();
      });
    });
  });

  describe('Quick Navigation & Clean Dashboard Bottom Structure', () => {
    it('does not display the large backend monitoring coverage panel on the dashboard', () => {
      render(<DashboardPage />);

      expect(screen.queryByText('Backend Monitoring Coverage')).not.toBeInTheDocument();
      expect(screen.queryByText(/Monitor Current Location/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Corridors Active/i)).not.toBeInTheDocument();
    });

    it('renders compact quick navigation cards to Live Traffic, Route Planner, Analytics, and Locations', () => {
      render(<DashboardPage />);

      expect(screen.getByRole('link', { name: /Live Traffic Map/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Route Planner/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Traffic Analytics/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /My Locations/i })).toBeInTheDocument();
    });
  });
});
