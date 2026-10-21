import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MyLocations } from '@/components/traffic/MyLocations';
import * as api from '@/services/api';
import type { SavedLocation } from '@/types/traffic';

// Mock SavedLocationsMap since Leaflet needs real DOM canvas/container
vi.mock('@/components/traffic/SavedLocationsMap', () => ({
  SavedLocationsMap: ({
    locations,
    selectedLocationId,
    onSelectLocation,
    onPlanRoute,
    isExpanded,
    onToggleExpand,
  }: any) => (
    <div data-testid="saved-locations-map-mock">
      <span>Mocked SavedLocationsMap Canvas</span>
      <span data-testid="map-selected-id">{selectedLocationId || 'none'}</span>
      <span data-testid="map-expanded">{isExpanded ? 'true' : 'false'}</span>
      {onToggleExpand && (
        <button onClick={onToggleExpand} aria-label="Toggle Expand Map">
          Toggle Map Size
        </button>
      )}
      {locations?.map((l: any) => (
        <div key={l.id} data-testid={`map-item-${l.id}`}>
          <button onClick={() => onSelectLocation?.(l.id)}>
            Select {l.name}
          </button>
          <button onClick={() => onPlanRoute?.(l, 'start')}>
            Plan Start {l.name}
          </button>
          <button onClick={() => onPlanRoute?.(l, 'destination')}>
            Plan Dest {l.name}
          </button>
        </div>
      ))}
    </div>
  ),
}));

const MOCK_SAVED_LOCATIONS: SavedLocation[] = [
  {
    id: 'loc-1',
    name: 'My Apartment',
    label: 'Home',
    address: 'Central Pune, Maharashtra, India',
    city: 'Pune',
    area: 'Central Pune',
    latitude: 18.5204,
    longitude: 73.8567,
    created_at: '2026-10-15T09:00:00Z',
    updated_at: '2026-10-15T09:00:00Z',
    traffic_status: 'available',
    current_speed_kmh: 32.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 28.9, // Low (<30%)
    delay_seconds: 0,
    traffic_last_updated: '2026-10-17T12:00:00Z',
  },
  {
    id: 'loc-2',
    name: 'Tech Office',
    label: 'Work',
    address: 'Hinjawadi Rajiv Gandhi Infotech Park, Pune, Maharashtra',
    city: 'Pune',
    area: 'Hinjawadi',
    latitude: 18.5913,
    longitude: 73.7389,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
    traffic_status: 'available',
    current_speed_kmh: 18.0,
    free_flow_speed_kmh: 45.0,
    congestion_percent: 60.0, // Heavy (>=60%)
    delay_seconds: 150,
    traffic_last_updated: '2026-10-17T12:00:00Z',
  },
  {
    id: 'loc-3',
    name: 'COEP Engineering Campus',
    label: 'College',
    address: 'Shivaji Nagar, Pune, Maharashtra',
    city: 'Pune',
    area: 'Shivaji Nagar',
    latitude: 18.5308,
    longitude: 73.8474,
    created_at: '2026-10-16T11:00:00Z',
    updated_at: '2026-10-16T11:00:00Z',
    traffic_status: 'unavailable',
  },
];

describe('My Locations Page', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();

    delete (window as any).location;
    window.location = {
      ...originalLocation,
      _href: 'http://localhost:3000/',
      get href() {
        return this._href;
      },
      set href(val: string) {
        this._href = val.startsWith('http') ? val : `http://localhost:3000${val.startsWith('/') ? '' : '/'}${val}`;
      },
      assign: vi.fn(function (this: any, val: string) {
        this.href = val;
      }),
    } as any;

    vi.spyOn(api, 'getSavedLocations').mockResolvedValue([...MOCK_SAVED_LOCATIONS]);

    vi.spyOn(api, 'createSavedLocation').mockImplementation(async data => ({
      id: `loc-new-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
      label: (data.label as any) || 'Other',
      address: data.address || data.name,
      city: data.city || 'Unknown',
      area: data.area || 'Saved Area',
    }));

    vi.spyOn(api, 'updateSavedLocation').mockImplementation(async (id, data) => {
      const existing = MOCK_SAVED_LOCATIONS.find(l => l.id === id)!;
      return {
        ...existing,
        ...data,
        updated_at: new Date().toISOString(),
      };
    });

    vi.spyOn(api, 'deleteSavedLocation').mockResolvedValue(undefined);

    vi.spyOn(api, 'checkSavedLocationTraffic').mockResolvedValue({
      city: 'Pune',
      area: 'Central Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      timestamp: '2026-10-17T14:00:00Z',
      current_speed_kmh: 25.0,
      free_flow_speed_kmh: 50.0,
      congestion_percent: 50.0,
      current_travel_time_seconds: 180,
      free_flow_travel_time_seconds: 90,
      confidence: 0.95,
    });

    vi.spyOn(api, 'searchLocations').mockResolvedValue([
      {
        name: 'Bandra Kurla Complex, Mumbai, Maharashtra',
        city: 'Mumbai',
        area: 'Bandra Kurla',
        latitude: 19.0657,
        longitude: 72.8687,
      },
    ]);
  });

  afterEach(() => {
    window.location = originalLocation as any;
  });

  it('renders header with title, description, and accurate saved location count', async () => {
    render(<MyLocations />);

    expect(screen.getByRole('heading', { level: 1, name: /my locations/i })).toBeInTheDocument();
    expect(screen.getByText(/save and manage your important places/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a new location/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('3 locations')).toBeInTheDocument();
    });
  });

  it('renders cards for saved locations with custom name, category, and address', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
      expect(screen.getByText('Tech Office')).toBeInTheDocument();
      expect(screen.getByText('COEP Engineering Campus')).toBeInTheDocument();
    });

    // Check addresses
    expect(screen.getByText('Central Pune, Maharashtra, India')).toBeInTheDocument();
    expect(screen.getByText('Hinjawadi Rajiv Gandhi Infotech Park, Pune, Maharashtra')).toBeInTheDocument();
  });

  it('displays available traffic observations and handles unavailable traffic gracefully', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    // Available traffic for My Apartment: 28.9%
    expect(screen.getByText('28.9%')).toBeInTheDocument();
    expect(screen.getByText('Low Congestion')).toBeInTheDocument();

    // Available traffic for Tech Office: 60.0%
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('Heavy Congestion')).toBeInTheDocument();

    // Unavailable traffic for COEP: neutral notification
    expect(screen.getByText('Traffic data unavailable nearby')).toBeInTheDocument();
  });

  it('filters locations by category tabs (Home, Work, College, All)', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    // Filter by 'Home'
    const homeTab = screen.getByRole('button', { name: /^home/i });
    fireEvent.click(homeTab);

    expect(screen.getByText('My Apartment')).toBeInTheDocument();
    expect(screen.queryByText('Tech Office')).not.toBeInTheDocument();
    expect(screen.queryByText('COEP Engineering Campus')).not.toBeInTheDocument();

    // Filter by 'Work'
    const workTab = screen.getByRole('button', { name: /^work/i });
    fireEvent.click(workTab);

    expect(screen.getByText('Tech Office')).toBeInTheDocument();
    expect(screen.queryByText('My Apartment')).not.toBeInTheDocument();

    // Filter by 'All'
    const allTab = screen.getByRole('button', { name: /^all \(3\)/i });
    fireEvent.click(allTab);

    expect(screen.getByText('My Apartment')).toBeInTheDocument();
    expect(screen.getByText('COEP Engineering Campus')).toBeInTheDocument();
  });

  it('filters locations by text search input', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search saved places…/i);
    fireEvent.change(searchInput, { target: { value: 'hinjawadi' } });

    expect(screen.getByText('Tech Office')).toBeInTheDocument();
    expect(screen.queryByText('My Apartment')).not.toBeInTheDocument();
    expect(screen.queryByText('COEP Engineering Campus')).not.toBeInTheDocument();
  });

  it('allows checking traffic for an individual saved location', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('COEP Engineering Campus')).toBeInTheDocument();
    });

    // COEP initially has unavailable traffic with a 'Check' button
    const checkBtn = screen.getByRole('button', { name: /^check$/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(api.checkSavedLocationTraffic).toHaveBeenCalledWith(
        18.5308,
        73.8474,
        'Pune',
        'Shivaji Nagar'
      );
      // Now displays 50.0% traffic
      expect(screen.getByText('50.0%')).toBeInTheDocument();
      expect(screen.getByText('Moderate Congestion')).toBeInTheDocument();
    });
  });

  it('opens Add Location dialog, searches for a place, selects result, and saves new location', async () => {
    render(<MyLocations />);

    // Click Add Location button
    const addBtn = screen.getByRole('button', { name: /add a new location/i });
    fireEvent.click(addBtn);

    // Dialog opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add a New Location')).toBeInTheDocument();

    // Search for 'Bandra'
    const searchInput = screen.getByPlaceholderText(/search landmark, street, area, or city…/i);
    fireEvent.change(searchInput, { target: { value: 'Bandra' } });

    const searchBtn = screen.getByRole('button', { name: /^search$/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(api.searchLocations).toHaveBeenCalledWith('Bandra');
      expect(screen.getByText('Bandra Kurla Complex, Mumbai, Maharashtra')).toBeInTheDocument();
    });

    // Select the search result
    const resultItem = screen.getByText('Bandra Kurla Complex, Mumbai, Maharashtra');
    fireEvent.click(resultItem);

    // Verified place selected
    expect(screen.getByText(/verified place selected:/i)).toBeInTheDocument();

    // Select 'Office' category
    const officeBtn = screen.getByRole('button', { name: /^office$/i });
    fireEvent.click(officeBtn);

    // Save location
    const saveBtn = screen.getByRole('button', { name: /^save location$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createSavedLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Office',
          latitude: 19.0657,
          longitude: 72.8687,
        })
      );
    });
  }, 15000);

  it('detects duplicate locations and shows helpful warning preventing duplicates', async () => {
    render(<MyLocations />);

    // Click Add Location button
    const addBtn = screen.getByRole('button', { name: /add a new location/i });
    fireEvent.click(addBtn);

    // Mock searchLocations returning Pune coordinates that match loc-1
    vi.spyOn(api, 'searchLocations').mockResolvedValueOnce([
      {
        name: 'Central Pune, Maharashtra, India',
        city: 'Pune',
        area: 'Central Pune',
        latitude: 18.5204, // exact same as loc-1
        longitude: 73.8567,
      },
    ]);

    const dialog = screen.getByRole('dialog');
    const searchInput = within(dialog).getByPlaceholderText(/search landmark, street, area, or city…/i);
    fireEvent.change(searchInput, { target: { value: 'Central Pune' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      expect(within(dialog).getByText('Central Pune, Maharashtra, India')).toBeInTheDocument();
    });

    // Click the result in the dialog
    fireEvent.click(within(dialog).getByText('Central Pune, Maharashtra, India'));

    // Duplicate warning should appear
    await waitFor(() => {
      expect(
        screen.getByText(/a place with these coordinates is already saved as "my apartment"/i)
      ).toBeInTheDocument();
    });

    // Save Location button should be disabled
    expect(screen.getByRole('button', { name: /^save location$/i })).toBeDisabled();
  });

  it('opens Edit dialog, updates name and label, and saves changes', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    // Click Edit button for My Apartment card
    const card = screen.getByText('My Apartment').closest('.panel')!;
    const editBtn = within(card).getByTitle('Edit location');
    fireEvent.click(editBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Location')).toBeInTheDocument();

    // Change custom name
    const nameInput = screen.getByLabelText(/location name/i);
    fireEvent.change(nameInput, { target: { value: 'Pune Home Deluxe' } });

    // Click Update Location
    const updateBtn = screen.getByRole('button', { name: /^update location$/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(api.updateSavedLocation).toHaveBeenCalledWith(
        'loc-1',
        expect.objectContaining({
          name: 'Pune Home Deluxe',
        })
      );
      expect(screen.getByText('Pune Home Deluxe')).toBeInTheDocument();
    });
  });

  it('opens Delete confirmation dialog, verifies location name, and deletes on confirmation', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('COEP Engineering Campus')).toBeInTheDocument();
    });

    // Click Delete button on COEP Engineering Campus card
    const card = screen.getByText('COEP Engineering Campus').closest('.panel')!;
    const deleteBtn = within(card).getByTitle('Delete location');
    fireEvent.click(deleteBtn);

    // AlertDialog appears with location's name
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/remove saved location\?/i)).toBeInTheDocument();
    expect(screen.getByText(/"COEP Engineering Campus"/)).toBeInTheDocument();

    // Click Delete Location button
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete location$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(api.deleteSavedLocation).toHaveBeenCalledWith('loc-3');
      expect(screen.queryByText('COEP Engineering Campus')).not.toBeInTheDocument();
    });
  });

  it('provides route planning handoff actions (Use as Start, Use as Destination)', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    // Click 'Use Start' on My Apartment card
    const card = screen.getByText('My Apartment').closest('.panel')!;
    const useStartBtn = within(card).getByRole('button', { name: /use start/i });
    fireEvent.click(useStartBtn);

    // Verify it navigates with route params
    expect(window.location.href).toContain('/route-planner');
    expect(window.location.href).toContain('start_name=My+Apartment');
    expect(window.location.href).toContain('start_lat=18.5204');
  });

  it('displays empty state with Add button when no locations are saved', async () => {
    vi.spyOn(api, 'getSavedLocations').mockResolvedValueOnce([]);

    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText(/no saved locations yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add your first location/i })).toBeInTheDocument();
    });
  });

  it('displays error notice with retry button when initial fetch fails', async () => {
    vi.spyOn(api, 'getSavedLocations').mockRejectedValueOnce(new Error('Network error loading saved places'));

    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/network error loading saved places/i)).toBeInTheDocument();
    });

    // Click Retry
    const retryBtn = screen.getByRole('button', { name: /^retry$/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.getSavedLocations).toHaveBeenCalledTimes(2);
    });
  });

  it('ensures Add Location dialog renders with z-[9999], max-height scrolling, and overlay above map', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /add a new location/i });
    fireEvent.click(addBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // DialogContent has z-[9999], responsive width, max-height and overflow-y-auto
    expect(dialog.className).toContain('z-[9999]');
    expect(dialog.className).toContain('max-h-[calc(100dvh-2rem)]');
    expect(dialog.className).toContain('overflow-y-auto');

    // Close button has z-10
    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn.className).toContain('z-10');

    // Overlay has z-[9998]
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    expect(overlay?.className).toContain('z-[9998]');
  });

  it('ensures Edit and Delete dialogs render with z-[9999] above page and map', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    // 1. Edit dialog
    const card = screen.getByText('My Apartment').closest('.panel')!;
    const editBtn = within(card).getByTitle('Edit location');
    fireEvent.click(editBtn);

    const editDialog = screen.getByRole('dialog');
    expect(editDialog.className).toContain('z-[9999]');
    expect(editDialog.className).toContain('overflow-y-auto');

    // Close edit dialog
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // 2. Delete alert dialog
    const deleteBtn = within(card).getByTitle('Delete location');
    fireEvent.click(deleteBtn);

    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog.className).toContain('z-[9999]');
    expect(alertDialog.className).toContain('overflow-y-auto');
  });

  it('ensures the saved locations map panel has isolation: isolate to prevent stacking context leaks', async () => {
    render(<MyLocations />);

    await waitFor(() => {
      expect(screen.getByText('My Apartment')).toBeInTheDocument();
    });

    const mapSection = screen.getByRole('region', { name: /saved places map/i });
    expect(mapSection.className).toContain('isolate');
  });
});
