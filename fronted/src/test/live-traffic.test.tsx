import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { getTrafficColor, getTrafficCondition } from '@/components/traffic/MapCanvas';
import { initialLocation, locationKey } from '@/components/traffic/TrafficProvider';
import { LiveTrafficView } from '@/components/traffic/LiveTrafficView';
import type { TrafficSegment } from '@/types/traffic';

// Mock Leaflet and MapCanvas since React-Leaflet requires real DOM canvas / window measurements
vi.mock('@/components/traffic/TrafficMap', () => ({
  TrafficMap: ({ selectedSegmentIndex, onSelectSegment }: any) => (
    <div data-testid="traffic-map-mock">
      <span>Mocked Leaflet Map for Pune</span>
      {selectedSegmentIndex !== null && <span>Segment {selectedSegmentIndex} highlighted</span>}
      <button onClick={() => onSelectSegment?.(0)}>Select Segment 0 on Map</button>
    </div>
  ),
}));

// Mock TrafficProvider hook
const mockUseTraffic = vi.fn();
vi.mock('@/components/traffic/TrafficProvider', async () => {
  const actual = await vi.importActual<any>('@/components/traffic/TrafficProvider');
  return {
    ...actual,
    useTraffic: () => mockUseTraffic(),
  };
});

describe('Live Traffic Page - Specifications & Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Default Location Requirements', () => {
    it('sets initial default location strictly to Central Pune, Maharashtra (18.5204, 73.8567)', () => {
      expect(initialLocation.city).toBe('Pune');
      expect(initialLocation.area).toBe('Central Pune');
      expect(initialLocation.latitude).toBeCloseTo(18.5204, 4);
      expect(initialLocation.longitude).toBeCloseTo(73.8567, 4);
    });

    it('formats locationKey consistently with 4 decimal places', () => {
      expect(locationKey({ latitude: 18.5204, longitude: 73.8567 })).toBe('18.5204,73.8567');
    });
  });

  describe('Traffic Congestion Color Thresholds', () => {
    it('assigns Green (#059669) for low congestion (<30%)', () => {
      expect(getTrafficColor(0)).toBe('#059669');
      expect(getTrafficColor(15)).toBe('#059669');
      expect(getTrafficColor(29.9)).toBe('#059669');
      expect(getTrafficCondition(20)).toBe('Low Congestion');
    });

    it('assigns Yellow (#eab308) for moderate congestion (30% to <60%)', () => {
      expect(getTrafficColor(30)).toBe('#eab308');
      expect(getTrafficColor(45.5)).toBe('#eab308');
      expect(getTrafficColor(59.9)).toBe('#eab308');
      expect(getTrafficCondition(45)).toBe('Moderate Congestion');
    });

    it('assigns Red (#dc2626) for heavy congestion (>=60%)', () => {
      expect(getTrafficColor(60)).toBe('#dc2626');
      expect(getTrafficColor(75)).toBe('#dc2626');
      expect(getTrafficColor(100)).toBe('#dc2626');
      expect(getTrafficCondition(80)).toBe('Heavy Congestion');
    });

    it('assigns Gray (#64748b) and Data Unavailable for null, NaN, or undefined congestion', () => {
      expect(getTrafficColor(null)).toBe('#64748b');
      expect(getTrafficColor(NaN)).toBe('#64748b');
      expect(getTrafficCondition(null)).toBe('Data Unavailable');
      expect(getTrafficCondition(NaN)).toBe('Data Unavailable');
    });
  });

  describe('LiveTrafficView Rendering and UI Components', () => {
    const mockSegments: TrafficSegment[] = [
      {
        coordinates: [[18.5204, 73.8567], [18.5214, 73.8577]],
        current_speed_kmh: 40,
        free_flow_speed_kmh: 50,
        congestion_percent: 20, // Low (<30%)
        name: 'Road segment 1',
      },
      {
        coordinates: [[18.5204, 73.8567], [18.5224, 73.8587]],
        current_speed_kmh: 25,
        free_flow_speed_kmh: 50,
        congestion_percent: 50, // Moderate (30–59%)
        name: 'Road segment 2',
      },
      {
        coordinates: [[18.5204, 73.8567], [18.5234, 73.8597]],
        current_speed_kmh: 12,
        free_flow_speed_kmh: 40,
        congestion_percent: 70, // Heavy (>=60%)
        name: 'Road segment 3',
      },
      {
        coordinates: [[18.5204, 73.8567], [18.5244, 73.8607]],
        current_speed_kmh: null,
        free_flow_speed_kmh: null,
        congestion_percent: null, // Unknown
        name: 'Road segment 4',
      },
    ];

    const defaultMockContext = {
      location: initialLocation,
      reading: {
        city: 'Pune',
        area: 'Central Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        current_speed_kmh: 28,
        free_flow_speed_kmh: 45,
        congestion_percent: 37.8,
        current_travel_time_seconds: 450,
        free_flow_travel_time_seconds: 280,
        confidence: 0.85,
        timestamp: '2026-10-16T09:30:00+05:30',
      },
      segments: mockSegments,
      loading: false,
      segmentsLoading: false,
      error: '',
      segmentsError: '',
      lastUpdated: '2026-10-16T09:30:00+05:30',
      lastRefreshedAt: new Date('2026-10-16T09:30:00+05:30'),
      isStale: false,
      refresh: vi.fn(),
      autoRefreshEnabled: true,
      setAutoRefreshEnabled: vi.fn(),
      health: 'online',
      monitoredLocations: [],
      loadMonitored: vi.fn(),
      addMonitored: vi.fn(),
      saved: [],
      save: vi.fn(),
      remove: vi.fn(),
      theme: 'light',
      toggleTheme: vi.fn(),
      selectLocation: vi.fn(),
    };

    it('renders the header with title, location, coordinates, and refresh control', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      expect(screen.getByRole('heading', { level: 1, name: /Live Traffic/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Central Pune, Pune/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/18.5204° N · 73.8567° E/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument();
      expect(screen.getByText(/Auto-refresh 60s/i)).toBeInTheDocument();
    });

    it('displays summary metrics cards distinguishing road and area values', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      // Metric labels exist
      expect(screen.getAllByText('Current Speed').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Free-Flow Speed').length).toBeGreaterThan(0);
      expect(screen.getByText('Road Congestion')).toBeInTheDocument();
      expect(screen.getByText('Traffic Condition')).toBeInTheDocument();
      expect(screen.getByText('Road Segments')).toBeInTheDocument();
      expect(screen.getByText('Area Congestion')).toBeInTheDocument();

      // Values from primary reading: 28.0 km/h, 45.0 km/h, 37.8%
      expect(screen.getByText('28.0')).toBeInTheDocument();
      expect(screen.getByText('45.0')).toBeInTheDocument();
      expect(screen.getByText('37.8')).toBeInTheDocument();

      // Area average congestion across valid segments (20 + 50 + 70) / 3 = 46.7%
      expect(screen.getByText('46.7')).toBeInTheDocument();
    });

    it('calculates the traffic condition distribution across categories', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      expect(screen.getByText('Traffic Condition Distribution')).toBeInTheDocument();

      // 4 total segments: 1 low, 1 moderate, 1 heavy, 1 unknown
      expect(screen.getByText(/4 total segments analyzed/i)).toBeInTheDocument();
      expect(screen.getAllByText('Low Congestion').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Moderate Congestion').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Heavy Congestion').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Data Unavailable').length).toBeGreaterThan(0);
    });

    it('renders the nearby road segments table with fallback names and sorting', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      expect(screen.getByText('Nearby Road Segments')).toBeInTheDocument();
      expect(screen.getByText('Road segment 1')).toBeInTheDocument();
      expect(screen.getByText('Road segment 2')).toBeInTheDocument();
      expect(screen.getByText('Road segment 3')).toBeInTheDocument();
      expect(screen.getByText('Road segment 4')).toBeInTheDocument();

      // Speeds displayed in table
      expect(screen.getAllByText('40 km/h').length).toBeGreaterThan(0);
      expect(screen.getAllByText('25 km/h').length).toBeGreaterThan(0);
      expect(screen.getAllByText('12 km/h').length).toBeGreaterThan(0);
    });

    it('allows clicking a segment row to highlight it and inspect its metrics', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      // Click on Road segment 3 (heavy congestion 70%, 12 km/h)
      fireEvent.click(screen.getByText('Road segment 3'));

      // Metric cards should now reflect Road segment 3
      expect(screen.getByText('12.0')).toBeInTheDocument();
      expect(screen.getByText('70.0')).toBeInTheDocument();
      expect(screen.getByText(/Inspecting Road segment 3/i)).toBeInTheDocument();
    });

    it('displays clear stale data warning when refresh failed', () => {
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        isStale: true,
      });
      render(<LiveTrafficView />);

      expect(screen.getByText(/Traffic data is stale:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Stale Data \(Refresh Failed\)/i).length).toBeGreaterThan(0);
    });

    it('displays compact Traffic Data Status section with expandable details', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      expect(screen.getByRole('region', { name: /Traffic Data Status/i })).toBeInTheDocument();
      expect(screen.getByText('Traffic Data Status')).toBeInTheDocument();
      expect(screen.getAllByText(/TomTom Traffic API/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Live Feed Connected/i).length).toBeGreaterThan(0);

      // Click to expand details
      const expandBtn = screen.getByRole('button', { name: /Data quality and coverage details/i });
      expect(expandBtn).toBeInTheDocument();
      fireEvent.click(expandBtn);

      expect(screen.getByText(/Base cartography is provided by © OpenStreetMap contributors/i)).toBeInTheDocument();
      expect(screen.getByText(/Coverage Limitations & Unavailable Readings/i)).toBeInTheDocument();
    });

    it('toggles map minimize and restore states', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      const minimizeBtn = screen.getByRole('button', { name: /Minimize map/i });
      expect(minimizeBtn).toBeInTheDocument();
      fireEvent.click(minimizeBtn);

      expect(screen.getByText(/Map is minimized/i)).toBeInTheDocument();
      const restoreBtn = screen.getAllByRole('button', { name: /Restore map/i })[0];
      fireEvent.click(restoreBtn);

      expect(screen.queryByText(/Map is minimized/i)).not.toBeInTheDocument();
    });

    it('toggles map fullscreen state', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      const fullscreenBtn = screen.getByRole('button', { name: /Enter fullscreen/i });
      expect(fullscreenBtn).toBeInTheDocument();
      fireEvent.click(fullscreenBtn);

      expect(screen.getByRole('button', { name: /Exit fullscreen/i })).toBeInTheDocument();
    });

    it('supports severity filter pills including Data Unavailable in the table', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      // Filter pills
      expect(screen.getByRole('button', { name: /^All \(4\)$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Low \(1\)$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Moderate \(1\)$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Heavy \(1\)$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Unavailable \(1\)$/i })).toBeInTheDocument();

      // Click Unavailable filter
      fireEvent.click(screen.getByRole('button', { name: /^Unavailable \(1\)$/i }));
      expect(screen.getByText('Road segment 4')).toBeInTheDocument();
      expect(screen.queryByText('Road segment 1')).not.toBeInTheDocument();
    });

    it('displays an empty state when no road segments are available for a point', () => {
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        segments: [],
      });
      render(<LiveTrafficView />);

      expect(screen.getAllByText(/No road segments available/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/No active traffic road segments were returned for this location/i)).toBeInTheDocument();
    });

    it('enforces the exact required page section order in the DOM', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      const { container } = render(<LiveTrafficView />);

      const header = container.querySelector('header');
      const summarySection = screen.getByRole('region', { name: /Traffic Summary/i });
      const mapSection = screen.getByRole('region', { name: /Live Traffic Road Map/i });
      const distSection = screen.getByRole('region', { name: /Traffic Condition Distribution/i });
      const tableSection = screen.getByRole('region', { name: /Monitored Road Segments/i });
      const statusSection = screen.getByRole('region', { name: /Traffic Data Status/i });

      expect(header).toBeInTheDocument();
      expect(summarySection).toBeInTheDocument();
      expect(mapSection).toBeInTheDocument();
      expect(distSection).toBeInTheDocument();
      expect(tableSection).toBeInTheDocument();
      expect(statusSection).toBeInTheDocument();

      // Check order in DOM hierarchy
      const children = Array.from(container.firstElementChild?.children || []);
      const headerIdx = children.indexOf(header as Element);
      const summaryIdx = children.indexOf(summarySection);
      const mapIdx = children.indexOf(mapSection);
      const distIdx = children.indexOf(distSection);
      const tableIdx = children.indexOf(tableSection);
      const statusIdx = children.indexOf(statusSection);

      expect(headerIdx).toBeLessThan(summaryIdx);
      expect(summaryIdx).toBeLessThan(mapIdx);
      expect(mapIdx).toBeLessThan(distIdx);
      expect(distIdx).toBeLessThan(tableIdx);
      expect(tableIdx).toBeLessThan(statusIdx);
    });

    it('ensures connection status reflects actual feed state and never shows green when disconnected or stale', () => {
      // 1. Stale state
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        isStale: true,
      });
      const { rerender } = render(<LiveTrafficView />);
      const staleBadge = screen.getByTestId('traffic-feed-status-badge');
      expect(staleBadge).toHaveTextContent(/Stale Data/i);
      expect(staleBadge).not.toHaveTextContent(/Live Feed Connected/i);

      // 2. Offline state
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        health: 'offline',
        isStale: false,
      });
      rerender(<LiveTrafficView />);
      const offlineBadge = screen.getByTestId('traffic-feed-status-badge');
      expect(offlineBadge).toHaveTextContent(/Service Offline/i);
      expect(offlineBadge).not.toHaveTextContent(/Live Feed Connected/i);

      // 3. Error state with no data
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        reading: null,
        segments: [],
        error: 'Failed to fetch',
        health: 'checking',
        isStale: false,
      });
      rerender(<LiveTrafficView />);
      const errorBadge = screen.getByTestId('traffic-feed-status-badge');
      expect(errorBadge).toHaveTextContent(/Feed Disconnected/i);
      expect(errorBadge).not.toHaveTextContent(/Live Feed Connected/i);
    });

    it('displays unavailable values honestly as N/A rather than substituting zeros', () => {
      mockUseTraffic.mockReturnValue({
        ...defaultMockContext,
        reading: {
          city: 'Pune',
          area: 'Remote Area',
          latitude: 18.5204,
          longitude: 73.8567,
          current_speed_kmh: null,
          free_flow_speed_kmh: null,
          congestion_percent: null,
          current_travel_time_seconds: null,
          free_flow_travel_time_seconds: null,
          timestamp: '2026-10-16T09:30:00+05:30',
        },
        segments: [],
      });
      render(<LiveTrafficView />);

      // Must display honest N/A values instead of 0.0 km/h or 0.0%
      const naElements = screen.getAllByText('N/A');
      expect(naElements.length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByText('0.0 km/h')).not.toBeInTheDocument();
      expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
    });

    it('focuses road on map and synchronizes selection when clicking View on Map in table', () => {
      mockUseTraffic.mockReturnValue(defaultMockContext);
      render(<LiveTrafficView />);

      const viewBtn = screen.getByRole('button', { name: /View Road segment 2 on map/i });
      fireEvent.click(viewBtn);

      expect(screen.getByText(/Segment #2 Selected/i)).toBeInTheDocument();
      expect(screen.getByText(/Segment 1 highlighted/i)).toBeInTheDocument();
    });
  });
});
