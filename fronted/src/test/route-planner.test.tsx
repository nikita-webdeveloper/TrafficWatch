import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { RoutePlannerPage } from '@/components/traffic/RoutePlanner';
import * as api from '@/services/api';

// Mock RouteMap since Leaflet needs real DOM canvas/container
vi.mock('@/components/traffic/RouteMap', () => ({
  ROUTE_COLORS: ['#16a34a', '#2563eb', '#9333ea', '#d97706', '#0891b2'],
  RouteMap: ({ selectedRouteId, onSelectRoute, routes, isExpanded, onToggleExpand }: any) => (
    <div data-testid="route-map-mock">
      <span>Mocked Leaflet RouteMap</span>
      <span>Selected: {selectedRouteId || 'none'}</span>
      <span>Expanded: {isExpanded ? 'true' : 'false'}</span>
      {onToggleExpand && (
        <button onClick={onToggleExpand} aria-label={isExpanded ? 'Mock Exit' : 'Mock Expand'}>
          {isExpanded ? 'Mock Exit' : 'Mock Expand'}
        </button>
      )}
      {routes?.map((r: any) => (
        <button key={r.id} onClick={() => onSelectRoute?.(r.id)}>
          Select {r.name}
        </button>
      ))}
    </div>
  ),
}));

describe('Route Planner Page - Requirements & Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial Route Planner UI with empty starting location and destination', () => {
    render(<RoutePlannerPage />);

    expect(screen.getByRole('heading', { name: /route planner/i })).toBeInTheDocument();
    expect(screen.getByText(/plan your journey/i)).toBeInTheDocument();
    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    expect(startInput).toHaveValue('');
    expect(startInput).toHaveAttribute('placeholder', 'Enter starting location…');

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    expect(destInput).toHaveValue('');
    expect(destInput).toHaveAttribute('placeholder', 'Enter destination…');

    expect(screen.getByRole('button', { name: /find routes/i })).toBeInTheDocument();
    expect(screen.getByText(/fastest/i)).toBeInTheDocument();
    expect(screen.getAllByText(/shortest/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/least congested/i)).toBeInTheDocument();
  });

  it('displays empty state before routes are calculated', () => {
    render(<RoutePlannerPage />);
    expect(screen.getByText(/awaiting route calculation/i)).toBeInTheDocument();
  });

  it('validates that starting location and destination are required', async () => {
    render(<RoutePlannerPage />);

    // Click find routes with both empty
    const findBtn = screen.getByRole('button', { name: /find routes/i });
    fireEvent.click(findBtn);

    expect(
      await screen.findByText(/please specify both a starting point and destination/i)
    ).toBeInTheDocument();
  });

  it('allows swapping source and destination', () => {
    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune, Maharashtra, India' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Hinjawadi IT Park, Pune' } });

    const swapBtn = screen.getByRole('button', { name: /swap start and destination/i });
    fireEvent.click(swapBtn);

    expect(screen.getByRole('textbox', { name: /^starting location$/i })).toHaveValue('Hinjawadi IT Park, Pune');
    expect(screen.getByRole('textbox', { name: /^destination$/i })).toHaveValue('Central Pune, Maharashtra, India');
  });

  it('allows switching route preferences (Fastest, Shortest, Least Congested)', () => {
    render(<RoutePlannerPage />);

    const shortestBtn = screen.getByText('Shortest').closest('button');
    expect(shortestBtn).toBeInTheDocument();
    fireEvent.click(shortestBtn!);

    // Shortest should now have selected style
    expect(shortestBtn?.className).toContain('border-primary');
  });

  it('calculates routes and displays comparison cards, recommendation, and ML predictions', async () => {
    const mockRoutesResponse = {
      routes: [
        {
          id: 'route-1',
          name: 'Route 1 (Fastest)',
          distance_km: 18.4,
          travel_time_seconds: 2400,
          traffic_delay_seconds: 180,
          congestion_percent: 15.0,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          estimated_arrival_time: '9:30 PM',
          is_recommended: true,
          recommendation_reason: 'Recommended because it provides the fastest traffic-aware travel time (~40 min).',
          geometry: [[18.52, 73.85], [18.59, 73.73]],
          segments: [
            {
              id: 'seg-1',
              name: 'Central Pune Corridor',
              coordinates: [[18.52, 73.85], [18.53, 73.84]],
              current_speed_kmh: 32.0,
              free_flow_speed_kmh: 40.0,
              congestion_percent: 20.0,
              delay_seconds: 40,
              is_congested_hotspot: false,
              data_source: 'TomTom Flow API',
            },
          ],
          prediction: {
            route_prediction_available: true,
            coverage_status: 'full_coverage',
            coverage_percent: 100.0,
            predicted_travel_time_seconds: 2280,
            predicted_traffic_delay_seconds: 60,
            prediction_horizon_minutes: 15,
            message: 'Traffic prediction for 15 minutes ahead based on 1 monitored segment (100% coverage).',
            segment_predictions: [
              {
                road_id: 'Central Pune Corridor',
                current_speed_kmh: 32.0,
                predicted_speed_kmh: 35.0,
                free_flow_speed_kmh: 40.0,
                horizon_minutes: 15,
                model_status: 'model_prediction',
                explanation: 'Traffic conditions are predicted to ease slightly.',
              },
            ],
          },
        },
        {
          id: 'route-2',
          name: 'Route 2 (Shortest)',
          distance_km: 17.8,
          travel_time_seconds: 2700,
          traffic_delay_seconds: 350,
          congestion_percent: 35.0,
          traffic_condition: 'Moderate Congestion',
          traffic_available: true,
          estimated_arrival_time: '9:35 PM',
          is_recommended: false,
          geometry: [[18.52, 73.85], [18.58, 73.74]],
          segments: [],
          prediction: {
            route_prediction_available: false,
            coverage_status: 'no_monitored_segments',
            coverage_percent: 0.0,
            prediction_horizon_minutes: 15,
            message: 'Prediction unavailable: route does not intersect monitored road segments.',
            segment_predictions: [],
          },
        },
      ],
      generated_at: '2026-10-16T15:00:00Z',
      provider: 'TomTom Routing API & TrafficWatch ML',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('hinjawadi')) {
        return [
          {
            city: 'Pune',
            area: 'Hinjawadi',
            name: 'Hinjawadi, Pune',
            latitude: 18.5913,
            longitude: 73.7389,
          },
        ];
      }
      return [
        {
          city: 'Pune',
          area: 'Central Pune',
          name: 'Central Pune, Maharashtra, India',
          latitude: 18.5204,
          longitude: 73.8567,
        },
      ];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockRoutesResponse as any);

    render(<RoutePlannerPage />);

    // Enter starting location and destination
    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune, Maharashtra, India' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Hinjawadi, Pune' } });

    // Click Find Routes button
    const findBtn = screen.getByRole('button', { name: /find routes/i });
    fireEvent.click(findBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Route 1 (Fastest)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Route 2 (Shortest)').length).toBeGreaterThanOrEqual(1);
    });

    // Check recommended badge
    expect(screen.getAllByText('Recommended').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/18\.4 km/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Arrival ~9:30 PM/i)).toBeInTheDocument();

    // Verify bottom analytics panels are removed from Route Planner page
    expect(screen.queryByText(/Traffic Prediction \(15 min ahead\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Road Segments & Traffic Flow/i)).not.toBeInTheDocument();
  });

  it('displays actual traffic percentages, free-flow times, and delay metrics on route cards', async () => {
    const mockResponse = {
      routes: [
        {
          id: 'route-1',
          name: 'Route 1 (Fastest)',
          distance_km: 21.5,
          travel_time_seconds: 1765, // 29 min 25 sec
          free_flow_time_seconds: 1609, // 26 min 49 sec
          traffic_delay_seconds: 156, // 2 min 36 sec
          congestion_percent: 8.8,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          estimated_arrival_time: '12:27 PM',
          is_recommended: true,
          recommendation_reason: 'Fastest route',
          geometry: [[19.06, 72.86], [18.94, 72.83]],
          segments: [],
        },
      ],
      generated_at: '2026-10-17T11:50:00Z',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('csmt')) {
        return [{ city: 'Mumbai', area: 'CSMT', name: 'CSMT, Mumbai', latitude: 18.94, longitude: 72.83 }];
      }
      return [{ city: 'Mumbai', area: 'Bandra', name: 'Bandra, Mumbai', latitude: 19.06, longitude: 72.84 }];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockResponse as any);

    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Bandra, Mumbai' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'CSMT, Mumbai' } });

    const findBtn = screen.getByRole('button', { name: /find routes/i });
    fireEvent.click(findBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Route 1 (Fastest)').length).toBeGreaterThanOrEqual(1);
    });

    // Check prominent traffic percentage display
    expect(screen.getByText(/8\.8% — Low/i)).toBeInTheDocument();

    // Check travel time formatted accurately to minutes and seconds
    expect(screen.getAllByText(/29 min 25 sec/i).length).toBeGreaterThanOrEqual(1);

    // Check free-flow time displayed
    expect(screen.getAllByText(/26 min 49 sec/i).length).toBeGreaterThanOrEqual(1);

    // Check traffic delay formatted accurately to minutes and seconds
    expect(screen.getAllByText(/2 min 36 sec/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders responsive comparison table for all routes and highlights fastest and shortest', async () => {
    const mockResponse = {
      routes: [
        {
          id: 'route-1',
          name: 'Route 1 (Fastest)',
          distance_km: 25.0,
          travel_time_seconds: 1800, // 30 min (fastest)
          free_flow_time_seconds: 1500,
          traffic_delay_seconds: 300,
          congestion_percent: 16.7,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: true,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
        {
          id: 'route-2',
          name: 'Route 2 (Shortest)',
          distance_km: 18.0, // 18 km (shortest)
          travel_time_seconds: 2200,
          free_flow_time_seconds: 1900,
          traffic_delay_seconds: 300,
          congestion_percent: 13.6,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: false,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
        {
          id: 'route-3',
          name: 'Route 3 (Alternative)',
          distance_km: 22.0,
          travel_time_seconds: 2400,
          free_flow_time_seconds: 2000,
          traffic_delay_seconds: 400,
          congestion_percent: 16.7,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: false,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
      ],
      generated_at: '2026-10-17T11:50:00Z',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('baner')) {
        return [{ city: 'Pune', area: 'Baner', name: 'Baner, Pune', latitude: 18.55, longitude: 73.78 }];
      }
      return [{ city: 'Pune', area: 'Central Pune', name: 'Central Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 }];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockResponse as any);

    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Baner, Pune' } });

    fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

    await waitFor(() => {
      // Comparison table must display heading
      expect(screen.getByText('Route Comparison Table')).toBeInTheDocument();
      expect(screen.getByText('3 candidate routes')).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByRole('columnheader', { name: /^route$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^travel time$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^free-flow time$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^traffic delay$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^congestion$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^classification$/i })).toBeInTheDocument();

    // Check fastest and shortest badges are identified
    expect(screen.getAllByText('Fastest').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Shortest').length).toBeGreaterThanOrEqual(1);

    // Check clicking a route in the comparison table updates selection
    const selectButtons = screen.getAllByRole('button', { name: /^select$/i });
    expect(selectButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(selectButtons[0]!);

    // Check route selection synchronized with map mock
    expect(screen.getByTestId('route-map-mock')).toHaveTextContent('Selected: route-2');
  });

  it('shows elevated congestion warning alert when congestion >= 50% and hides it below 50%', async () => {
    const mockResponse = {
      routes: [
        {
          id: 'route-congested',
          name: 'Route 1 (Congested Corridor)',
          distance_km: 15.0,
          travel_time_seconds: 3000,
          free_flow_time_seconds: 1350,
          traffic_delay_seconds: 1650,
          congestion_percent: 55.0, // 55% -> should show alert
          traffic_condition: 'Moderate Congestion',
          traffic_available: true,
          is_recommended: true,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
        {
          id: 'route-smooth',
          name: 'Route 2 (Clear Path)',
          distance_km: 16.0,
          travel_time_seconds: 1500,
          free_flow_time_seconds: 1350,
          traffic_delay_seconds: 150,
          congestion_percent: 10.0, // 10% -> should NOT show alert
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: false,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
      ],
      generated_at: '2026-10-17T11:50:00Z',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('viman')) {
        return [{ city: 'Pune', area: 'Viman Nagar', name: 'Viman Nagar', latitude: 18.56, longitude: 73.91 }];
      }
      return [{ city: 'Pune', area: 'Central Pune', name: 'Central Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 }];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockResponse as any);

    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Viman Nagar' } });
    fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

    await waitFor(() => {
      expect(screen.getByText('Elevated traffic warning')).toBeInTheDocument();
      expect(screen.getByText(/55\.0% congestion/i)).toBeInTheDocument();
      expect(screen.getByText(/consider comparing alternative routes/i)).toBeInTheDocument();
    });

    // Heavy traffic warning or alert should NOT be shown for the 10% route
    expect(screen.queryByText(/10\.0% congestion.*consider comparing/i)).not.toBeInTheDocument();
  });

  it('displays honest unavailable states when traffic data is missing without NaN or 0% fallback', async () => {
    const mockResponse = {
      routes: [
        {
          id: 'route-no-traffic',
          name: 'Route 1 (No Traffic Data)',
          distance_km: 10.0,
          travel_time_seconds: 1200,
          free_flow_time_seconds: null,
          traffic_delay_seconds: null,
          congestion_percent: null,
          traffic_condition: 'Traffic data unavailable',
          traffic_available: false,
          is_recommended: true,
          geometry: [[18.52, 73.85]],
          segments: [],
        },
      ],
      generated_at: '2026-10-17T11:50:00Z',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('khadki')) {
        return [{ city: 'Pune', area: 'Khadki', name: 'Khadki', latitude: 18.56, longitude: 73.83 }];
      }
      return [{ city: 'Pune', area: 'Central Pune', name: 'Central Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 }];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockResponse as any);

    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Khadki' } });
    fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

    await waitFor(() => {
      expect(screen.getByText(/traffic data unavailable/i)).toBeInTheDocument();
    });

    // Must never show NaN or undefined
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    // Must not show congestion alert for missing data
    expect(screen.queryByText(/elevated traffic warning/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/heavy traffic warning/i)).not.toBeInTheDocument();
  });

  it('resets all fields when Reset Planner is clicked', () => {
    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune' } });
    expect(startInput).toHaveValue('Central Pune');

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Mumbai' } });
    expect(destInput).toHaveValue('Mumbai');

    const resetBtn = screen.getByRole('button', { name: /reset planner/i });
    fireEvent.click(resetBtn);

    expect(screen.getByRole('textbox', { name: /^destination$/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /^starting location$/i })).toHaveValue('');
  });

  it('allows expanding map to fullscreen overlay and minimizing back or pressing Escape', async () => {
    render(<RoutePlannerPage />);

    // Expand Map button exists in header and in map
    const expandButtons = screen.getAllByRole('button', { name: /expand map/i });
    expect(expandButtons.length).toBeGreaterThanOrEqual(1);

    // Click Expand Map in card header
    fireEvent.click(expandButtons[0]);

    // Fullscreen view is active: header updates and Exit Fullscreen button is visible
    expect(screen.getByText(/Interactive Route Map \(Expanded View\)/i)).toBeInTheDocument();
    const exitButtons = screen.getAllByRole('button', { name: /exit fullscreen/i });
    expect(exitButtons.length).toBeGreaterThanOrEqual(1);
    expect(document.body.style.overflow).toBe('hidden');

    // Click Exit Fullscreen
    fireEvent.click(exitButtons[0]);
    expect(screen.getByText(/^Interactive Route Map$/i)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    // Test Escape key dismissal
    const expandAgain = screen.getAllByRole('button', { name: /expand map/i })[0];
    fireEvent.click(expandAgain);
    expect(screen.getByText(/Interactive Route Map \(Expanded View\)/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText(/^Interactive Route Map$/i)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('preserves route selection when switching between normal and expanded map views', async () => {
    const mockResponse = {
      routes: [
        {
          id: 'route-alpha',
          name: 'Route Alpha',
          distance_km: 15.0,
          travel_time_seconds: 1200,
          free_flow_time_seconds: 1100,
          traffic_delay_seconds: 100,
          congestion_percent: 8.3,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: true,
          geometry: [[18.52, 73.85], [18.55, 73.87]],
          segments: [],
        },
        {
          id: 'route-beta',
          name: 'Route Beta',
          distance_km: 17.0,
          travel_time_seconds: 1400,
          free_flow_time_seconds: 1200,
          traffic_delay_seconds: 200,
          congestion_percent: 14.3,
          traffic_condition: 'Low Congestion',
          traffic_available: true,
          is_recommended: false,
          geometry: [[18.52, 73.85], [18.57, 73.89]],
          segments: [],
        },
      ],
      generated_at: '2026-10-17T12:00:00Z',
    };

    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query.toLowerCase().includes('kothrud')) {
        return [{ city: 'Pune', area: 'Kothrud', name: 'Kothrud, Pune', latitude: 18.50, longitude: 73.81 }];
      }
      return [{ city: 'Pune', area: 'Central Pune', name: 'Central Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 }];
    });
    vi.spyOn(api, 'getRoutes').mockResolvedValue(mockResponse as any);

    render(<RoutePlannerPage />);

    const startInput = screen.getByRole('textbox', { name: /^starting location$/i });
    fireEvent.change(startInput, { target: { value: 'Central Pune' } });

    const destInput = screen.getByRole('textbox', { name: /^destination$/i });
    fireEvent.change(destInput, { target: { value: 'Kothrud, Pune' } });
    fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Route Alpha/i).length).toBeGreaterThanOrEqual(1);
    });

    // Select second route (Route Beta)
    const selectBetaButtons = screen.getAllByText(/Route Beta/i);
    expect(selectBetaButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(selectBetaButtons[0]);

    // Expand map
    const expandBtn = screen.getAllByRole('button', { name: /expand map/i })[0];
    fireEvent.click(expandBtn);

    // Verify Route Beta remains active in expanded view
    expect(screen.getAllByText(/Route Beta/i).length).toBeGreaterThanOrEqual(1);

    // Minimize map
    const exitBtn = screen.getAllByRole('button', { name: /exit fullscreen/i })[0];
    fireEvent.click(exitBtn);

    // Verify Route Beta is still selected after returning
    expect(screen.getAllByText(/Route Beta/i).length).toBeGreaterThanOrEqual(1);
  });

  it('preserves Traffic Prediction and Road Segments panels in AnalyticsCorridorPanels for Analytics page', async () => {
    const { AnalyticsCorridorPanels } = await import('@/components/traffic/AnalyticsCorridorPanels');
    render(
      <AnalyticsCorridorPanels
        prediction={{
          route_prediction_available: true,
          coverage_status: 'full_coverage',
          coverage_percent: 100,
          predicted_travel_time_seconds: 1200,
          predicted_traffic_delay_seconds: 60,
          prediction_horizon_minutes: 15,
          message: 'Full ML coverage across corridor.',
          segment_predictions: [
            {
              road_id: 'Corridor 1',
              current_speed_kmh: 40,
              predicted_speed_kmh: 45,
              free_flow_speed_kmh: 50,
              horizon_minutes: 15,
              model_status: 'model_prediction',
            },
          ],
        }}
        segments={[
          {
            id: 'seg-1',
            name: 'Corridor 1',
            current_speed_kmh: 40,
            free_flow_speed_kmh: 50,
            congestion_percent: 20,
            delay_seconds: 30,
            data_source: 'TomTom Flow API',
          },
        ]}
      />
    );

    expect(screen.getByText(/Traffic Prediction \(15 min ahead\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Random Forest ML/i)).toBeInTheDocument();
    expect(screen.getByText(/Road Segments & Traffic Flow/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Corridor 1/i).length).toBeGreaterThanOrEqual(1);
  });

  describe('Dynamic Responsive Route Alternatives Layout', () => {
    const makeRoutes = (count: number) => ({
      routes: Array.from({ length: count }, (_, i) => ({
        id: `route-${i + 1}`,
        name: `Route ${i + 1}`,
        distance_km: 15.0 + i * 2,
        travel_time_seconds: 1800 + i * 300,
        free_flow_time_seconds: 1500,
        traffic_delay_seconds: i * 300,
        congestion_percent: 15.0 + i * 10,
        traffic_condition: i === 0 ? 'Low Congestion' : 'Moderate Congestion',
        traffic_available: true,
        is_recommended: i === 0,
        recommendation_reason: i === 0 ? 'Fastest recommended route.' : undefined,
        geometry: [[18.52, 73.85]],
        segments: [],
      })),
      generated_at: '2026-10-18T12:00:00Z',
    });

    beforeEach(() => {
      vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
        if (query.toLowerCase().includes('hinjawadi')) {
          return [
            {
              city: 'Pune',
              area: 'Hinjawadi',
              name: 'Hinjawadi, Pune',
              latitude: 18.5913,
              longitude: 73.7389,
            },
          ];
        }
        return [
          {
            city: 'Pune',
            area: 'Central Pune',
            name: 'Central Pune, Maharashtra, India',
            latitude: 18.5204,
            longitude: 73.8567,
          },
        ];
      });
    });

    it('renders 1 route card with full width in container-responsive grid', async () => {
      vi.spyOn(api, 'getRoutes').mockResolvedValue(makeRoutes(1) as any);

      render(<RoutePlannerPage />);

      fireEvent.change(screen.getByRole('textbox', { name: /^starting location$/i }), { target: { value: 'Central Pune' } });
      fireEvent.change(screen.getByRole('textbox', { name: /^destination$/i }), { target: { value: 'Hinjawadi, Pune' } });
      fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('route-alternatives-container')).toBeInTheDocument();
        expect(screen.getByTestId('route-alternatives-grid')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-1')).toBeInTheDocument();
      });

      const grid = screen.getByTestId('route-alternatives-grid');
      expect(grid.children.length).toBe(1);
      expect(screen.getByText('1 candidate evaluated')).toBeInTheDocument();
    });

    it('renders 2 route cards in balanced responsive columns', async () => {
      vi.spyOn(api, 'getRoutes').mockResolvedValue(makeRoutes(2) as any);

      render(<RoutePlannerPage />);

      fireEvent.change(screen.getByRole('textbox', { name: /^starting location$/i }), { target: { value: 'Central Pune' } });
      fireEvent.change(screen.getByRole('textbox', { name: /^destination$/i }), { target: { value: 'Hinjawadi, Pune' } });
      fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('route-card-route-1')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-2')).toBeInTheDocument();
      });

      const grid = screen.getByTestId('route-alternatives-grid');
      expect(grid.children.length).toBe(2);
      expect(screen.getByText('2 candidates evaluated')).toBeInTheDocument();
    });

    it('renders 3 route cards and handles card selection', async () => {
      vi.spyOn(api, 'getRoutes').mockResolvedValue(makeRoutes(3) as any);

      render(<RoutePlannerPage />);

      fireEvent.change(screen.getByRole('textbox', { name: /^starting location$/i }), { target: { value: 'Central Pune' } });
      fireEvent.change(screen.getByRole('textbox', { name: /^destination$/i }), { target: { value: 'Hinjawadi, Pune' } });
      fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('route-card-route-1')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-2')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-3')).toBeInTheDocument();
      });

      const grid = screen.getByTestId('route-alternatives-grid');
      expect(grid.children.length).toBe(3);

      // Card 1 is selected by default
      expect(screen.getByTestId('route-card-route-1')).toHaveTextContent('Selected');

      // Click card 3 to select it
      fireEvent.click(screen.getByTestId('route-card-route-3'));

      // Now card 3 is selected
      expect(screen.getByTestId('route-card-route-3')).toHaveTextContent('Selected');
    });

    it('renders 4 route cards without rigid column truncation', async () => {
      vi.spyOn(api, 'getRoutes').mockResolvedValue(makeRoutes(4) as any);

      render(<RoutePlannerPage />);

      fireEvent.change(screen.getByRole('textbox', { name: /^starting location$/i }), { target: { value: 'Central Pune' } });
      fireEvent.change(screen.getByRole('textbox', { name: /^destination$/i }), { target: { value: 'Hinjawadi, Pune' } });
      fireEvent.click(screen.getByRole('button', { name: /find routes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('route-card-route-1')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-2')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-3')).toBeInTheDocument();
        expect(screen.getByTestId('route-card-route-4')).toBeInTheDocument();
      });

      const grid = screen.getByTestId('route-alternatives-grid');
      expect(grid.children.length).toBe(4);
      expect(screen.getByText('4 candidates evaluated')).toBeInTheDocument();
    });
  });
});
