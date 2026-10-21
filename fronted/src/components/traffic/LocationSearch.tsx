import React from 'react';
import { useTraffic } from './TrafficProvider';
import { LocationAutocomplete } from './LocationAutocomplete';
import type { Location } from '@/types/traffic';

export interface LocationSearchProps {
  compact?: boolean;
  placeholder?: string;
  className?: string;
  onSelect?: (place: Location) => void;
}

/**
 * Universal LocationSearch connected to the global TrafficProvider.
 * Powered by Google Maps-style live autocomplete with single-character matching,
 * recent searches, keyboard navigation, and verified coordinate persistence.
 */
export function LocationSearch({
  compact = false,
  placeholder,
  className = '',
  onSelect: customOnSelect,
}: LocationSearchProps) {
  const { selectLocation } = useTraffic();

  const handleSelect = (place: Location | null) => {
    if (!place) return;
    selectLocation(place);
    customOnSelect?.(place);
  };

  return (
    <div className={`location-search relative ${compact ? 'compact' : 'w-full'} ${className}`}>
      <LocationAutocomplete
        compact={compact}
        placeholder={
          placeholder ||
          (compact
            ? 'Search city or area…'
            : 'Search any city, area, or road (e.g. Pune, Koregaon Park, Shivajinagar)…')
        }
        aria-label="Search locations by city, area, or road"
        onSelect={handleSelect}
        showRecentSearches={true}
      />
    </div>
  );
}
