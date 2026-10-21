import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CongestionHotspots } from '@/components/traffic/CongestionHotspots';
import * as api from '@/services/api';
import type { TrafficSegment } from '@/types/traffic';

// Mock HotspotMap since Leaflet needs real DOM canvas/container
vi.mock('@/components/traffic/HotspotMap', () => ({
  HotspotMap: ({
    segments,
    selectedSegmentId,
    onSelectSegment,
    isExpanded,
    onToggleExpand,
  }: any) => (
    <div data-testid="hotspot-map-mock">
      <span>Mocked HotspotMap Canvas</span>
      <span data-testid="map-selected-id">{selectedSegmentId || 'none'}</span>
      <span data-testid="map-expanded">{isExpanded ? 'true' : 'false'}</span>
      {onToggleExpand && (
        <button onClick={onToggleExpand} aria-label="Toggle Expand Map">
          Toggle Map Size
        </button>
      )}
      {segments?.map((s: any) => (
        <button
          key={s.id}
          data-testid={`map-seg-btn-${s.id}`}
          onClick={() => onSelectSegment?.(s.id)}
        >
          Select {s.name || s.id}
        </button>
      ))}
    </div>
  ),
}));

const MOCK_HOTSPOTS: TrafficSegment[] = [
  {
    id: 'pune-hotspot-1',
    name: 'Yadnyavalkya Road, Kasba Peth',
    coordinates: [
      [18.5195, 73.8553],
      [18.5201, 73.8560],
    ],
    current_speed_kmh: 12.0,
    free_flow_speed_kmh: 40.0,
    congestion_percent: 70.0, // Heavy (>=60%)
    delay_seconds: 180,
    confidence: 1.0,
    frc: 'FRC2',
    last_updated: '2026-10-17T12:00:00Z',
  },
  {
    id: 'pune-hotspot-2',
    name: 'University Road, Shivaji Nagar',
    coordinates: [
      [18.5308, 73.8474],
      [18.5315, 73.8480],
    ],
    current_speed_kmh: 24.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 46.7, // Moderate (30-60%)
    delay_seconds: 75,
    confidence: 0.95,
    frc: 'FRC1',
    last_updated: '2026-10-17T12:00:00Z',
  },
  {
    id: 'pune-hotspot-3',
    name: 'Senapati Bapat Road',
    coordinates: [
      [18.5284, 73.8341],
      [18.5290, 73.8348],
    ],
    current_speed_kmh: 38.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 15.6, // Low (<30%)
    delay_seconds: 0,
    confidence: 1.0,
    frc: 'FRC2',
    last_updated: '2026-10-17T12:00:00Z',
  },
  {
    id: 'pune-hotspot-4',
    name: 'Karve Road, Kothrud',
    coordinates: [
      [18.5082, 73.8291],
      [18.5090, 73.8300],
    ],
    current_speed_kmh: 10.0,
    free_flow_speed_kmh: 50.0,
    congestion_percent: 80.0, // Heavy (>=60%)
    delay_seconds: 240,
    confidence: 0.9,
    frc: 'FRC1',
    last_updated: '2026-10-17T12:00:00Z',
  },
];

describe('Congestion Hotspots Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(api, 'getHotspots').mockResolvedValue({
      hotspots: MOCK_HOTSPOTS,
      total_monitored: 4,
      generated_at: '2026-10-17T12:05:00Z',
    });

    vi.spyOn(api, 'searchLocations').mockResolvedValue([
      {
        name: 'Connaught Place, New Delhi',
        city: 'New Delhi',
        area: 'Connaught Place',
        latitude: 28.6315,
        longitude: 77.2167,
      },
    ]);
  });

  it('renders page header with title, description, and refresh button', async () => {
    render(<CongestionHotspots />);

    expect(screen.getByRole('heading', { level: 1, name: /congestion hotspots/i })).toBeInTheDocument();
    expect(screen.getByText(/real-time congestion monitoring and live road rankings/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh traffic hotspots/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getHotspots).toHaveBeenCalled();
    });
  });

  it('calculates and displays summary metric cards accurately', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      // Total monitored: 4 segments
      expect(screen.getByText('TOTAL MONITORED')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();

      // Heavy congestion: 2 segments (70% and 80%)
      expect(screen.getByText('HEAVY CONGESTION')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();

      // Moderate congestion: 1 segment (46.7%), Low congestion: 1 segment (15.6%)
      expect(screen.getByText('MODERATE CONGESTION')).toBeInTheDocument();
      expect(screen.getByText('LOW CONGESTION')).toBeInTheDocument();
      expect(screen.getAllByText('1').length).toBe(2);
    });
  });

  it('ranks road segments descending by congestion % by default', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    });

    // #1 should be Karve Road (80%), #2 Yadnyavalkya Road (70%), #3 University Road (46.7%), #4 Senapati Bapat Road (15.6%)
    const rows = screen.getAllByRole('row');
    // Header is row 0
    expect(rows[1]).toHaveTextContent('#1');
    expect(rows[1]).toHaveTextContent('Karve Road, Kothrud');
    expect(rows[1]).toHaveTextContent('80.0%');

    expect(rows[2]).toHaveTextContent('#2');
    expect(rows[2]).toHaveTextContent('Yadnyavalkya Road, Kasba Peth');
    expect(rows[2]).toHaveTextContent('70.0%');

    expect(rows[3]).toHaveTextContent('#3');
    expect(rows[3]).toHaveTextContent('University Road, Shivaji Nagar');
    expect(rows[3]).toHaveTextContent('46.7%');

    expect(rows[4]).toHaveTextContent('#4');
    expect(rows[4]).toHaveTextContent('Senapati Bapat Road');
    expect(rows[4]).toHaveTextContent('15.6%');
  });

  it('filters ranked roads by severity tabs (Heavy, Moderate, Low, All)', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    });

    // Click 'Heavy' filter tab
    const heavyBtn = screen.getByRole('button', { name: /^heavy \(2\)$/i });
    fireEvent.click(heavyBtn);

    // Should only show the 2 heavy segments
    expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    expect(screen.getByText('Yadnyavalkya Road, Kasba Peth')).toBeInTheDocument();
    expect(screen.queryByText('University Road, Shivaji Nagar')).not.toBeInTheDocument();
    expect(screen.queryByText('Senapati Bapat Road')).not.toBeInTheDocument();

    // Click 'Moderate' filter tab
    const modBtn = screen.getByRole('button', { name: /^moderate \(1\)$/i });
    fireEvent.click(modBtn);

    expect(screen.getByText('University Road, Shivaji Nagar')).toBeInTheDocument();
    expect(screen.queryByText('Karve Road, Kothrud')).not.toBeInTheDocument();

    // Click 'All' filter tab
    const allBtn = screen.getByRole('button', { name: /^all \(4\)$/i });
    fireEvent.click(allBtn);

    expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    expect(screen.getByText('Senapati Bapat Road')).toBeInTheDocument();
  });

  it('allows sorting by lowest congestion first', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    });

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'asc' } });

    // Now row 1 should be Senapati Bapat Road (15.6%)
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Senapati Bapat Road');
    expect(rows[1]).toHaveTextContent('15.6%');
  });

  it('synchronizes road selection between ranked list, map, and details panel', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    });

    // Before selection: Details panel shows empty guidance prompt
    expect(screen.getByText(/no road segment selected/i)).toBeInTheDocument();

    // Click on row for University Road
    const universityRow = screen.getByText('University Road, Shivaji Nagar').closest('tr')!;
    fireEvent.click(universityRow);

    // Details panel now shows University Road telemetry
    expect(screen.getByRole('heading', { level: 3, name: 'University Road, Shivaji Nagar' })).toBeInTheDocument();
    expect(screen.getAllByText(/24\.0 km\/h/).length).toBeGreaterThanOrEqual(1); // Current speed
    expect(screen.getAllByText(/45\.0 km\/h/).length).toBeGreaterThanOrEqual(1); // Free-flow speed
    expect(screen.getAllByText('46.7%').length).toBeGreaterThanOrEqual(1); // Congestion
    expect(screen.getAllByText('+1 min delay').length).toBeGreaterThanOrEqual(1); // 75 seconds lost
    expect(screen.getByText('95%')).toBeInTheDocument(); // Confidence
    expect(screen.getAllByText('Major Arterial').length).toBeGreaterThanOrEqual(1); // FRC1 description

    // Map also receives selected id
    expect(screen.getByTestId('map-selected-id')).toHaveTextContent('pune-hotspot-2');

    // Deselect
    const clearBtn = screen.getByRole('button', { name: /clear selection/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText(/no road segment selected/i)).toBeInTheDocument();
    expect(screen.getByTestId('map-selected-id')).toHaveTextContent('none');
  });

  it('allows selecting segment from the interactive map', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByText('Karve Road, Kothrud')).toBeInTheDocument();
    });

    // Click segment button inside mocked map
    const mapSegBtn = screen.getByTestId('map-seg-btn-pune-hotspot-1');
    fireEvent.click(mapSegBtn);

    // Selected segment should be Yadnyavalkya Road
    expect(screen.getByRole('heading', { level: 3, name: 'Yadnyavalkya Road, Kasba Peth' })).toBeInTheDocument();
    expect(screen.getAllByText('70.0%').length).toBeGreaterThanOrEqual(1);
  });

  it('supports quick preset location chips', async () => {
    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(api.getHotspots).toHaveBeenCalledWith(18.5204, 73.8567, 'Pune');
    });

    // Click 'Connaught Place' preset chip
    const cpChip = screen.getByRole('button', { name: 'Connaught Place' });
    fireEvent.click(cpChip);

    await waitFor(() => {
      expect(api.getHotspots).toHaveBeenCalledWith(28.6315, 77.2167, 'New Delhi');
    });
  });

  it('supports searching city / monitored area via search input and button', async () => {
    render(<CongestionHotspots />);

    const searchInput = screen.getByRole('textbox', { name: /search city or monitored area/i });
    fireEvent.change(searchInput, { target: { value: 'Delhi' } });

    const searchBtn = screen.getByRole('button', { name: /^search$/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(api.searchLocations).toHaveBeenCalledWith('Delhi');
      expect(screen.getByText('Connaught Place, New Delhi')).toBeInTheDocument();
    });

    // Pick the searched result
    const resultItem = screen.getByText('Connaught Place, New Delhi');
    fireEvent.click(resultItem);

    await waitFor(() => {
      expect(api.getHotspots).toHaveBeenCalledWith(28.6315, 77.2167, 'New Delhi');
    });
  });

  it('displays error notice with retry button when API fails', async () => {
    vi.spyOn(api, 'getHotspots').mockRejectedValueOnce(new Error('Connection timeout to TomTom'));

    render(<CongestionHotspots />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/connection timeout to tomtom/i)).toBeInTheDocument();
    });

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.getHotspots).toHaveBeenCalledTimes(2);
    });
  });

  it('supports toggling expand map size', async () => {
    render(<CongestionHotspots />);

    const toggleBtn = screen.getByRole('button', { name: /toggle expand map/i });
    expect(screen.getByTestId('map-expanded')).toHaveTextContent('false');

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('map-expanded')).toHaveTextContent('true');

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('map-expanded')).toHaveTextContent('false');
  });
});
