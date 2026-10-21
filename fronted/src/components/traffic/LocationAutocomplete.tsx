import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Search, MapPin, Clock, X, Loader2, History, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { searchLocations } from '@/services/api';
import type { Location } from '@/types/traffic';

const RECENT_SEARCHES_KEY = 'trafficwatch_recent_locations';
const MAX_RECENT_SEARCHES = 5;

export interface LocationAutocompleteProps {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  value?: Location | null;
  defaultValue?: string;
  inputValue?: string;
  onSelect: (location: Location | null) => void;
  onInputChange?: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  compact?: boolean;
  autoFocus?: boolean;
  icon?: React.ReactNode;
  iconColor?: string;
  rightAction?: React.ReactNode;
  showRecentSearches?: boolean;
  debounceMs?: number;
  onSearchSubmit?: (query: string) => void;
  'aria-label'?: string;
  resetKey?: number | string;
}

/** Retrieve safely parsed recent location searches from localStorage */
export function getRecentSearches(): Location[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        item =>
          item &&
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number' &&
          Number.isFinite(item.latitude) &&
          Number.isFinite(item.longitude)
      );
    }
  } catch (e) {
    console.warn('Failed to parse recent locations from localStorage:', e);
  }
  return [];
}

/** Save a newly selected location to recent searches */
export function saveRecentSearch(loc: Location): void {
  if (typeof window === 'undefined' || !loc) return;
  try {
    const existing = getRecentSearches();
    // Filter out duplicates by proximity or identical name
    const filtered = existing.filter(
      item =>
        !(
          Math.abs(item.latitude - loc.latitude) < 0.0001 &&
          Math.abs(item.longitude - loc.longitude) < 0.0001
        ) && item.name?.trim().toLowerCase() !== loc.name?.trim().toLowerCase()
    );
    const updated = [loc, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save recent location to localStorage:', e);
  }
}

/** Clear all stored recent searches */
export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (e) {
    console.warn('Failed to clear recent locations from localStorage:', e);
  }
}

/**
 * Google Maps-Style Live Location Autocomplete Component
 * - Single-character live search triggering
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape, Tab)
 * - Accessible combobox/listbox attributes
 * - Recent searches dropdown when empty & focused
 * - Request cancellation & debounce for responsive performance
 * - Smooth hover, focus, and entrance transitions
 */
export function LocationAutocomplete({
  id: customId,
  name,
  label,
  placeholder = 'Search city, area, landmark, or road…',
  value,
  defaultValue = '',
  inputValue,
  onSelect,
  onInputChange,
  onClear,
  disabled = false,
  required = false,
  className = '',
  inputClassName = '',
  compact = false,
  autoFocus = false,
  icon,
  iconColor = 'text-muted-foreground',
  rightAction,
  showRecentSearches = true,
  debounceMs = 250,
  onSearchSubmit,
  'aria-label': ariaLabel,
  resetKey,
}: LocationAutocompleteProps) {
  const generatedId = useId();
  const inputId = customId || `loc-autocomplete-${generatedId}`;
  const listboxId = `loc-listbox-${generatedId}`;

  // Query state
  const [internalQuery, setInternalQuery] = useState(
    inputValue ?? (value ? value.name || `${value.area}, ${value.city}` : defaultValue)
  );
  const query = inputValue !== undefined ? inputValue : internalQuery;

  const [results, setResults] = useState<Location[] | null>(null);
  const [recentList, setRecentList] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSearchIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal query when `value`, `inputValue`, or `resetKey` changes
  useEffect(() => {
    if (inputValue !== undefined) {
      setInternalQuery(inputValue);
    } else if (value) {
      setInternalQuery(value.name || `${value.area}, ${value.city}`);
    } else if (resetKey !== undefined) {
      setInternalQuery(defaultValue);
      setResults(null);
      setError(null);
    }
  }, [value, inputValue, resetKey, defaultValue]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup pending timer and requests on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  // Fetch search suggestions
  const fetchSuggestions = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < 1) {
        setResults(null);
        setError(null);
        setLoading(false);
        return;
      }

      // Abort previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentSearchId = ++activeSearchIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const places = await searchLocations(trimmed, controller.signal);
        if (!controller.signal.aborted && currentSearchId === activeSearchIdRef.current) {
          setResults(places);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }
      } catch (err) {
        if (!controller.signal.aborted && currentSearchId === activeSearchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Unable to find locations.');
          setResults([]);
          setIsOpen(true);
        }
      } finally {
        if (!controller.signal.aborted && currentSearchId === activeSearchIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  // Handle Input text change
  const handleQueryChange = (val: string) => {
    if (inputValue === undefined) {
      setInternalQuery(val);
    }
    onInputChange?.(val);

    // Invalidate previous selection if text was modified
    if (value && val !== (value.name || `${value.area}, ${value.city}`)) {
      onSelect(null);
    }

    if (!val.trim()) {
      setResults(null);
      setError(null);
      setLoading(false);
      if (showRecentSearches) {
        setRecentList(getRecentSearches());
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
      return;
    }

    // Debounce search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      void fetchSuggestions(val);
    }, debounceMs);
  };

  // Handle focus
  const handleFocus = () => {
    if (!query.trim()) {
      if (showRecentSearches) {
        const recents = getRecentSearches();
        setRecentList(recents);
        if (recents.length > 0) {
          setIsOpen(true);
        }
      }
    } else if (results && results.length > 0) {
      setIsOpen(true);
    } else if (query.trim().length >= 1) {
      void fetchSuggestions(query);
    }
  };

  // Handle item selection
  const handleSelect = (place: Location) => {
    saveRecentSearch(place);
    const displayName = place.name || `${place.area}, ${place.city}`;
    if (inputValue === undefined) {
      setInternalQuery(displayName);
    }
    onInputChange?.(displayName);
    onSelect(place);
    setIsOpen(false);
    setResults(null);
    setError(null);
    setHighlightedIndex(-1);
  };

  // Handle clear input
  const handleClear = () => {
    if (inputValue === undefined) {
      setInternalQuery('');
    }
    onInputChange?.('');
    onSelect(null);
    setResults(null);
    setError(null);
    setHighlightedIndex(-1);
    onClear?.();
    if (showRecentSearches) {
      const recents = getRecentSearches();
      setRecentList(recents);
      setIsOpen(recents.length > 0);
    } else {
      setIsOpen(false);
    }
    inputRef.current?.focus();
  };

  // Current active list for keyboard navigation
  const isShowingRecents = !query.trim() && showRecentSearches && recentList.length > 0;
  const activeItems: Location[] = isShowingRecents ? recentList : results || [];
  const itemCount = activeItems.length;

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (itemCount > 0) {
        setHighlightedIndex(prev => (prev + 1 >= itemCount ? 0 : prev + 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (itemCount > 0) {
        setHighlightedIndex(prev => (prev <= 0 ? itemCount - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < itemCount) {
        e.preventDefault();
        handleSelect(activeItems[highlightedIndex]);
      } else if (onSearchSubmit) {
        e.preventDefault();
        setIsOpen(false);
        onSearchSubmit(query);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {/* Optional Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-foreground tracking-wide flex items-center justify-between"
        >
          <span className="flex items-center gap-1.5">
            {icon || <MapPin size={14} className={iconColor} />}
            {label}
            {required && <span className="text-red-500">*</span>}
          </span>
          {rightAction}
        </label>
      )}

      {/* Input container */}
      <div className="relative flex items-center">
        {/* Leading Search/Pin Icon */}
        <div className="absolute left-3 text-muted-foreground pointer-events-none flex items-center justify-center">
          {icon ? (
            React.isValidElement(icon) ? (
              React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
                className: `${iconColor} shrink-0`,
              })
            ) : (
              icon
            )
          ) : (
            <Search size={15} className={`${iconColor} shrink-0`} />
          )}
        </div>

        {/* Text Input */}
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          aria-label={ariaLabel || label || placeholder}
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          onChange={e => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={`h-9 w-full rounded-md border border-input bg-background pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed ${
            compact ? 'h-8 text-xs' : ''
          } ${inputClassName}`}
        />

        {/* Trailing Controls (Loading spinner, Clear button) */}
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {loading && (
            <div className="p-1 text-primary">
              <Loader2 size={14} className="animate-spin" aria-label="Searching locations…" />
            </div>
          )}

          {query && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear location input"
              onClick={handleClear}
            >
              <X size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Suggestions Dropdown (Google Maps Style) */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute top-[calc(100%+4px)] left-0 right-0 z-[1100] max-h-72 overflow-y-auto rounded-lg border border-border bg-card dark:bg-card p-1.5 shadow-xl transition-all animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header for Recent Searches */}
          {isShowingRecents && (
            <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-border text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <History size={12} className="text-primary" />
                Recent Places
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  clearRecentSearches();
                  setRecentList([]);
                  setIsOpen(false);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Search Results list */}
          {itemCount > 0 ? (
            <div className="space-y-0.5">
              {activeItems.map((item, idx) => {
                const isHighlighted = highlightedIndex === idx;
                const isRecent = isShowingRecents;
                const primaryText =
                  item.area && item.area !== 'Selected area' && item.area !== 'Selected road'
                    ? item.area
                    : item.name
                    ? item.name.split(',')[0].trim()
                    : item.city;

                const secondaryText =
                  item.name && item.name.includes(',')
                    ? item.name.split(',').slice(1).join(',').trim()
                    : item.city
                    ? `${item.city}, Maharashtra, India`
                    : 'Verified geographic coordinates';

                return (
                  <div
                    key={`${item.latitude}-${item.longitude}-${idx}`}
                    id={`${listboxId}-option-${idx}`}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(item)}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-md text-xs cursor-pointer transition-colors duration-150 select-none ${
                      isHighlighted
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted/60'
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        isHighlighted
                          ? 'bg-primary text-primary-foreground'
                          : isRecent
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {isRecent ? <Clock size={13} /> : <MapPin size={13} />}
                    </div>

                    {/* Text Details */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {primaryText}
                        </span>
                        {item.city && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium shrink-0">
                            {item.city}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {secondaryText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : loading ? (
            <div className="py-6 px-4 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span>Searching locations…</span>
            </div>
          ) : error ? (
            <div className="py-4 px-3 text-xs text-red-500 flex items-center gap-2 bg-red-500/10 rounded-md">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : query.trim().length >= 1 ? (
            <div className="py-6 px-4 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">No matching places found</p>
              <p className="text-[11px]">
                No verified locations found for "{query}". Try another landmark, street, or city.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
