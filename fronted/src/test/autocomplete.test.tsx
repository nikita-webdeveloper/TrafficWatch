import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import {
  LocationAutocomplete,
  getRecentSearches,
  saveRecentSearch,
  clearRecentSearches,
} from '@/components/traffic/LocationAutocomplete';
import * as api from '@/services/api';
import type { Location } from '@/types/traffic';

const MOCK_LOCATIONS: Location[] = [
  {
    name: 'Shivajinagar, Pune, Maharashtra',
    city: 'Pune',
    area: 'Shivajinagar',
    latitude: 18.5314,
    longitude: 73.8446,
  },
  {
    name: 'Swargate, Pune, Maharashtra',
    city: 'Pune',
    area: 'Swargate',
    latitude: 18.5018,
    longitude: 73.8582,
  },
  {
    name: 'Bandra Kurla Complex, Mumbai, Maharashtra',
    city: 'Mumbai',
    area: 'BKC',
    latitude: 19.0657,
    longitude: 72.8687,
  },
];

describe('Google Maps-Style LocationAutocomplete Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(api, 'searchLocations').mockResolvedValue([...MOCK_LOCATIONS]);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders input with custom placeholder, label, and accessible attributes', () => {
    render(
      <LocationAutocomplete
        label="Test Starting Point"
        placeholder="Type to search places…"
        onSelect={() => {}}
      />
    );

    const input = screen.getByRole('textbox', { name: /test starting point/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Type to search places…');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('displays live suggestions on a single character query (e.g. "S") without requiring Enter', async () => {
    render(
      <LocationAutocomplete
        label="Origin"
        placeholder="Search origin…"
        onSelect={() => {}}
        debounceMs={50}
      />
    );

    const input = screen.getByRole('textbox', { name: /origin/i });
    fireEvent.change(input, { target: { value: 'S' } });

    await waitFor(() => {
      expect(api.searchLocations).toHaveBeenCalledWith('S', expect.any(AbortSignal));
      expect(screen.getByRole('listbox', { name: /location suggestions/i })).toBeInTheDocument();
      expect(screen.getByText('Shivajinagar')).toBeInTheDocument();
      expect(screen.getByText('Swargate')).toBeInTheDocument();
    });

    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('updates suggestions dynamically as query changes from "S" to "Sh" to "Shiv"', async () => {
    vi.spyOn(api, 'searchLocations').mockImplementation(async (query: string) => {
      if (query === 'Shiv') {
        return [MOCK_LOCATIONS[0]]; // Only Shivajinagar
      }
      return MOCK_LOCATIONS;
    });

    render(
      <LocationAutocomplete
        label="Origin"
        placeholder="Search origin…"
        onSelect={() => {}}
        debounceMs={20}
      />
    );

    const input = screen.getByRole('textbox', { name: /origin/i });

    // Type 'S'
    fireEvent.change(input, { target: { value: 'S' } });
    await waitFor(() => {
      expect(screen.getByText('Swargate')).toBeInTheDocument();
    });

    // Update to 'Shiv'
    fireEvent.change(input, { target: { value: 'Shiv' } });
    await waitFor(() => {
      expect(screen.getByText('Shivajinagar')).toBeInTheDocument();
      expect(screen.queryByText('Swargate')).not.toBeInTheDocument();
    });
  });

  it('selects a suggestion and retains its verified coordinates and geographic data', async () => {
    const handleSelect = vi.fn();

    render(
      <LocationAutocomplete
        label="Starting Place"
        placeholder="Search starting place…"
        onSelect={handleSelect}
        debounceMs={20}
      />
    );

    const input = screen.getByRole('textbox', { name: /starting place/i });
    fireEvent.change(input, { target: { value: 'Shiv' } });

    await waitFor(() => {
      expect(screen.getByText('Shivajinagar')).toBeInTheDocument();
    });

    // Click on Shivajinagar suggestion
    const option = screen.getByText('Shivajinagar');
    fireEvent.click(option);

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Shivajinagar, Pune, Maharashtra',
        city: 'Pune',
        area: 'Shivajinagar',
        latitude: 18.5314,
        longitude: 73.8446,
      })
    );

    // Dropdown should close and input should display the place name
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Shivajinagar, Pune, Maharashtra');
  });

  it('supports full keyboard navigation: ArrowDown, ArrowUp, and Enter selection', async () => {
    const handleSelect = vi.fn();

    render(
      <LocationAutocomplete
        label="Destination"
        placeholder="Search destination…"
        onSelect={handleSelect}
        debounceMs={20}
      />
    );

    const input = screen.getByRole('textbox', { name: /destination/i });
    fireEvent.change(input, { target: { value: 'P' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);

    // Arrow down to highlight first option (Shivajinagar)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Arrow down to highlight second option (Swargate)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    // Arrow up to return to first option (Shivajinagar)
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Press Enter to select highlighted option
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSelect).toHaveBeenCalledWith(MOCK_LOCATIONS[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Shivajinagar, Pune, Maharashtra');
  });

  it('closes suggestions on Escape and when clicking outside', async () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <LocationAutocomplete
          label="Test Input"
          placeholder="Search…"
          onSelect={() => {}}
          debounceMs={20}
        />
      </div>
    );

    const input = screen.getByRole('textbox', { name: /test input/i });
    fireEvent.change(input, { target: { value: 'Shiv' } });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Reopen by focusing and typing
    fireEvent.change(input, { target: { value: 'Shiva' } });
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('displays empty state notice when no locations match the search query', async () => {
    vi.spyOn(api, 'searchLocations').mockResolvedValueOnce([]);

    render(
      <LocationAutocomplete
        label="Empty Test"
        placeholder="Search…"
        onSelect={() => {}}
        debounceMs={20}
      />
    );

    const input = screen.getByRole('textbox', { name: /empty test/i });
    fireEvent.change(input, { target: { value: 'NonexistentPlace123' } });

    await waitFor(() => {
      expect(screen.getByText(/no matching places found/i)).toBeInTheDocument();
      expect(screen.getByText(/nonexistentplace123/i)).toBeInTheDocument();
    });
  });

  it('displays error state notice when search request fails', async () => {
    vi.spyOn(api, 'searchLocations').mockRejectedValueOnce(new Error('Network offline'));

    render(
      <LocationAutocomplete
        label="Error Test"
        placeholder="Search…"
        onSelect={() => {}}
        debounceMs={20}
      />
    );

    const input = screen.getByRole('textbox', { name: /error test/i });
    fireEvent.change(input, { target: { value: 'Pune' } });

    await waitFor(() => {
      expect(screen.getByText('Network offline')).toBeInTheDocument();
    });
  });

  it('displays recent searches when focused and empty, and clears them on Clear all', async () => {
    saveRecentSearch(MOCK_LOCATIONS[0]);
    saveRecentSearch(MOCK_LOCATIONS[1]);

    const handleSelect = vi.fn();

    render(
      <LocationAutocomplete
        label="Recent Test"
        placeholder="Search…"
        onSelect={handleSelect}
        showRecentSearches={true}
      />
    );

    const input = screen.getByRole('textbox', { name: /recent test/i });
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText(/recent places/i)).toBeInTheDocument();
      expect(screen.getByText('Swargate')).toBeInTheDocument();
      expect(screen.getByText('Shivajinagar')).toBeInTheDocument();
    });

    // Click 'Clear all'
    const clearAllBtn = screen.getByRole('button', { name: /clear all/i });
    fireEvent.click(clearAllBtn);

    expect(getRecentSearches()).toHaveLength(0);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('invalidates previous location selection when user edits the text', async () => {
    function ControlledTest() {
      const [selected, setSelected] = useState<Location | null>(MOCK_LOCATIONS[0]);
      return (
        <div>
          <span data-testid="selected-coords">
            {selected ? `${selected.latitude},${selected.longitude}` : 'none'}
          </span>
          <LocationAutocomplete
            label="Controlled Place"
            value={selected}
            onSelect={setSelected}
          />
        </div>
      );
    }

    render(<ControlledTest />);

    const input = screen.getByRole('textbox', { name: /controlled place/i });
    expect(screen.getByTestId('selected-coords')).toHaveTextContent('18.5314,73.8446');

    // User modifies text to something else
    fireEvent.change(input, { target: { value: 'Shivajinagar Custom Modified' } });

    // The previously selected place coordinates should be invalidated
    expect(screen.getByTestId('selected-coords')).toHaveTextContent('none');
  });

  it('clears query and resets selection when clear (X) button is clicked', async () => {
    const handleSelect = vi.fn();
    const handleClear = vi.fn();

    render(
      <LocationAutocomplete
        label="Clearable Input"
        defaultValue="Pune, Maharashtra"
        onSelect={handleSelect}
        onClear={handleClear}
      />
    );

    const input = screen.getByRole('textbox', { name: /clearable input/i });
    expect(input).toHaveValue('Pune, Maharashtra');

    const clearBtn = screen.getByRole('button', { name: /clear location input/i });
    fireEvent.click(clearBtn);

    expect(input).toHaveValue('');
    expect(handleSelect).toHaveBeenCalledWith(null);
    expect(handleClear).toHaveBeenCalled();
  });
});
