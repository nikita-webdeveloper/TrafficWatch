import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Briefcase,
  Building2,
  GraduationCap,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Edit2,
  Navigation,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Clock,
  Loader2,
  X,
  AlertCircle,
  Bookmark,
  SlidersHorizontal,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getSavedLocations,
  createSavedLocation,
  updateSavedLocation,
  deleteSavedLocation,
  checkSavedLocationTraffic,
  searchLocations,
  getMonitoredLocations,
  addMonitoredLocation,
} from '@/services/api';
import { LocationAutocomplete } from './LocationAutocomplete';
import type { SavedLocation, LocationLabel, Location, MonitoredLocation } from '@/types/traffic';
import {
  getTrafficColor,
  getTrafficCondition,
  CONGESTION_THRESHOLDS,
} from '@/lib/traffic-utils';
import { SavedLocationsMap } from './SavedLocationsMap';

export const CATEGORY_LABELS: LocationLabel[] = [
  'Home',
  'Work',
  'Office',
  'College',
  'Other',
];

export function getCategoryIcon(label?: LocationLabel | string) {
  switch (label?.toLowerCase()) {
    case 'home':
      return Home;
    case 'work':
      return Briefcase;
    case 'office':
      return Building2;
    case 'college':
      return GraduationCap;
    default:
      return MapPin;
  }
}

export function getCategoryBadgeClasses(label?: LocationLabel | string): {
  badge: string;
  dot: string;
} {
  switch (label?.toLowerCase()) {
    case 'home':
      return {
        badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
        dot: 'bg-blue-600',
      };
    case 'work':
      return {
        badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
        dot: 'bg-indigo-600',
      };
    case 'office':
      return {
        badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
        dot: 'bg-sky-600',
      };
    case 'college':
      return {
        badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
        dot: 'bg-purple-600',
      };
    default:
      return {
        badge: 'bg-muted text-muted-foreground border-border',
        dot: 'bg-slate-500',
      };
  }
}

function formatDelay(delaySeconds?: number | null): string {
  if (delaySeconds === null || delaySeconds === undefined) return '—';
  if (delaySeconds <= 0) return 'No delay';
  const minutes = Math.round(delaySeconds / 60);
  if (minutes < 1) return '< 1 min delay';
  return `+${minutes} min delay`;
}

function formatTime(isoString?: string | null): string {
  if (!isoString || Number.isNaN(Date.parse(isoString))) return 'Not updated';
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MyLocations() {
  // Saved locations list state
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Filter & Search & Selection
  const [categoryFilter, setCategoryFilter] = useState<'all' | LocationLabel>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortOption, setSortOption] = useState<'recent' | 'name'>('recent');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Traffic checking state
  const [checkingTrafficIds, setCheckingTrafficIds] = useState<Set<string>>(new Set());
  const [refreshingAllTraffic, setRefreshingAllTraffic] = useState(false);

  // Add Location Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<Location[] | null>(null);
  const [isSearchingAdd, setIsSearchingAdd] = useState(false);
  const [addSearchError, setAddSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Location | null>(null);
  const [addName, setAddName] = useState('');
  const [addLabel, setAddLabel] = useState<LocationLabel>('Home');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit Location Dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<SavedLocation | null>(null);
  const [editName, setEditName] = useState('');
  const [editLabel, setEditLabel] = useState<LocationLabel>('Other');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete Confirmation Dialog state
  const [deletingLocation, setDeletingLocation] = useState<SavedLocation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Backend monitored locations (FastAPI background scheduler)
  const [monitoredList, setMonitoredList] = useState<MonitoredLocation[]>([]);
  const [selectedMonitoredKey, setSelectedMonitoredKey] = useState<string | null>(null);

  const loadMonitored = useCallback(async () => {
    try {
      const data = await getMonitoredLocations();
      setMonitoredList(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadMonitored();
  }, [loadMonitored]);

  // Load Saved Locations
  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSavedLocations();
      setLocations(data);
      if (data.length > 0 && !selectedLocationId) {
        setSelectedLocationId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved locations.');
    } finally {
      setLoading(false);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  // Check Traffic for a single location
  const checkTrafficForLocation = useCallback(async (loc: SavedLocation) => {
    setCheckingTrafficIds(prev => new Set(prev).add(loc.id));
    try {
      const reading = await checkSavedLocationTraffic(
        loc.latitude,
        loc.longitude,
        loc.city,
        loc.area
      );

      const isValid =
        reading &&
        reading.congestion_percent !== null &&
        reading.congestion_percent !== undefined &&
        Number.isFinite(reading.congestion_percent);

      const delay =
        reading.current_travel_time_seconds && reading.free_flow_travel_time_seconds
          ? Math.max(0, reading.current_travel_time_seconds - reading.free_flow_travel_time_seconds)
          : null;

      setLocations(prev =>
        prev.map(item => {
          if (item.id === loc.id) {
            return {
              ...item,
              current_speed_kmh: isValid ? reading.current_speed_kmh : null,
              free_flow_speed_kmh: isValid ? reading.free_flow_speed_kmh : null,
              congestion_percent: isValid ? reading.congestion_percent : null,
              delay_seconds: isValid ? delay : null,
              traffic_last_updated: reading.timestamp || new Date().toISOString(),
              traffic_status: isValid ? 'available' : 'unavailable',
              traffic_error: null,
            };
          }
          return item;
        })
      );
    } catch (err) {
      setLocations(prev =>
        prev.map(item => {
          if (item.id === loc.id) {
            return {
              ...item,
              traffic_status: 'unavailable',
              traffic_error: err instanceof Error ? err.message : 'Traffic data unavailable',
            };
          }
          return item;
        })
      );
    } finally {
      setCheckingTrafficIds(prev => {
        const next = new Set(prev);
        next.delete(loc.id);
        return next;
      });
    }
  }, []);

  // Refresh traffic for all saved locations
  const handleRefreshAllTraffic = async () => {
    if (locations.length === 0 || refreshingAllTraffic) return;
    setRefreshingAllTraffic(true);
    try {
      await Promise.allSettled(locations.map(loc => checkTrafficForLocation(loc)));
      setFeedbackMessage('Traffic conditions refreshed for your saved locations.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    } finally {
      setRefreshingAllTraffic(false);
    }
  };

  // Plan Route Handoff to Route Planner
  const handlePlanRoute = (loc: SavedLocation, role: 'start' | 'destination') => {
    try {
      const params = new URLSearchParams();
      if (role === 'start') {
        params.set('start_name', loc.name || loc.address);
        params.set('start_lat', String(loc.latitude));
        params.set('start_lon', String(loc.longitude));
        params.set('start_city', loc.city);
        params.set('start_area', loc.area);
      } else {
        params.set('dest_name', loc.name || loc.address);
        params.set('dest_lat', String(loc.latitude));
        params.set('dest_lon', String(loc.longitude));
        params.set('dest_city', loc.city);
        params.set('dest_area', loc.area);
      }

      window.location.href = `/route-planner?${params.toString()}`;
    } catch (err) {
      setError('Unable to navigate to Route Planner.');
    }
  };

  // Search places for Add Location
  const handleSearchPlaces = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = addSearchQuery.trim();
    if (query.length < 1) return;

    setIsSearchingAdd(true);
    setAddSearchError(null);
    setAddSearchResults(null);

    try {
      const results = await searchLocations(query);
      if (!results || results.length === 0) {
        setAddSearchError(`No locations found for "${query}". Try another landmark or street.`);
      } else {
        setAddSearchResults(results);
      }
    } catch (err) {
      setAddSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setIsSearchingAdd(false);
    }
  };

  // Select a place in Add dialog
  const handleSelectPlaceInAdd = (place: Location) => {
    setSelectedPlace(place);
    setAddName(place.name?.split(',')[0].trim() || place.area || 'My Saved Place');
    setAddSearchResults(null);
    setAddSearchError(null);
  };

  // Check duplicate in Add dialog
  const duplicateWarning = useMemo(() => {
    if (!selectedPlace) return null;
    const exists = locations.find(
      l =>
        (Math.abs(l.latitude - selectedPlace.latitude) < 0.0001 &&
          Math.abs(l.longitude - selectedPlace.longitude) < 0.0001) ||
        (l.name.trim().toLowerCase() === addName.trim().toLowerCase() &&
          l.city.trim().toLowerCase() === (selectedPlace.city || '').trim().toLowerCase())
    );
    if (exists) {
      return `A place with these coordinates is already saved as "${exists.name}".`;
    }
    return null;
  }, [selectedPlace, addName, locations]);

  // Submit Add Location
  const handleSaveNewLocation = async () => {
    if (!selectedPlace || !addName.trim() || duplicateWarning) return;

    setIsSubmittingAdd(true);
    try {
      const created = await createSavedLocation({
        name: addName.trim(),
        label: addLabel,
        address: selectedPlace.name || `${selectedPlace.area}, ${selectedPlace.city}`,
        city: selectedPlace.city || 'Unknown',
        area: selectedPlace.area || selectedPlace.name || 'Saved Area',
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
      });

      setLocations(prev => [created, ...prev]);
      setSelectedLocationId(created.id);
      setIsAddOpen(false);
      setSelectedPlace(null);
      setAddSearchQuery('');
      setAddName('');
      setFeedbackMessage(`"${created.name}" was added to your locations.`);
      setTimeout(() => setFeedbackMessage(null), 3500);

      // Check traffic automatically for the new place
      void checkTrafficForLocation(created);
    } catch (err) {
      setAddSearchError(err instanceof Error ? err.message : 'Failed to save location.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Open Edit Dialog
  const handleOpenEdit = (loc: SavedLocation) => {
    setEditingLocation(loc);
    setEditName(loc.name);
    setEditLabel(loc.label || 'Other');
    setIsEditOpen(true);
  };

  // Submit Edit Location
  const handleSaveEditLocation = async () => {
    if (!editingLocation || !editName.trim()) return;

    setIsSubmittingEdit(true);
    try {
      const updated = await updateSavedLocation(editingLocation.id, {
        name: editName.trim(),
        label: editLabel,
      });

      setLocations(prev =>
        prev.map(item => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      setIsEditOpen(false);
      setEditingLocation(null);
      setFeedbackMessage(`"${updated.name}" was updated.`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update location.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Submit Delete Location
  const handleConfirmDelete = async () => {
    if (!deletingLocation) return;

    setIsDeleting(true);
    try {
      await deleteSavedLocation(deletingLocation.id);
      setLocations(prev => prev.filter(item => item.id !== deletingLocation.id));
      if (selectedLocationId === deletingLocation.id) {
        setSelectedLocationId(null);
      }
      setFeedbackMessage(`"${deletingLocation.name}" was removed.`);
      setTimeout(() => setFeedbackMessage(null), 3500);
      setDeletingLocation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete location.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter and Sort locations
  const filteredLocations = useMemo(() => {
    let list = [...locations];

    // Category filter
    if (categoryFilter !== 'all') {
      list = list.filter(l => l.label?.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Text search filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        l =>
          l.name.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.area.toLowerCase().includes(q) ||
          l.label.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      }
      // 'recent': newest created_at first
      const dateA = a.created_at ? Date.parse(a.created_at) : 0;
      const dateB = b.created_at ? Date.parse(b.created_at) : 0;
      return dateB - dateA;
    });

    return list;
  }, [locations, categoryFilter, searchFilter, sortOption]);

  // Selected Location for details & map
  const selectedLocation = useMemo(
    () => locations.find(l => l.id === selectedLocationId) || null,
    [locations, selectedLocationId]
  );

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Home: 0,
      Work: 0,
      Office: 0,
      College: 0,
      Other: 0,
    };
    locations.forEach(l => {
      const key = l.label || 'Other';
      if (counts[key] !== undefined) {
        counts[key] += 1;
      } else {
        counts['Other'] += 1;
      }
    });
    return counts;
  }, [locations]);

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="page-heading flex-wrap gap-4 items-start sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Bookmark className="text-primary shrink-0" size={28} />
            My Locations
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Save and manage your important places, check live nearby traffic conditions, and quickly plan routes.
          </p>
        </div>

        <div className="heading-actions flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-right text-xs text-muted-foreground hidden sm:block mr-2">
            <span className="block text-[11px] text-muted-foreground/80">Saved Places</span>
            <span className="font-semibold text-foreground text-sm">
              {loading ? '…' : `${locations.length} locations`}
            </span>
          </div>

          <Button
            onClick={handleRefreshAllTraffic}
            disabled={refreshingAllTraffic || locations.length === 0}
            variant="outline"
            className="flex items-center gap-2 text-xs font-semibold h-9 px-3.5"
            aria-label="Refresh traffic conditions"
          >
            <RefreshCw
              size={14}
              className={refreshingAllTraffic ? 'animate-spin text-primary' : ''}
            />
            <span>{refreshingAllTraffic ? 'Refreshing…' : 'Refresh Traffic'}</span>
          </Button>

          <Button
            onClick={() => {
              setSelectedPlace(null);
              setAddSearchQuery('');
              setAddSearchResults(null);
              setAddSearchError(null);
              setAddName('');
              setAddLabel('Home');
              setIsAddOpen(true);
            }}
            className="flex items-center gap-2 text-xs font-semibold h-9 px-3.5"
            aria-label="Add a new location"
          >
            <Plus size={16} />
            <span>Add Location</span>
          </Button>
        </div>
      </div>

      {/* Success / Feedback Toast Notice */}
      {feedbackMessage && (
        <div
          className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2"
          role="status"
        >
          <CheckCircle2 size={15} />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 flex items-start gap-3 text-xs sm:text-sm"
          role="alert"
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Location Error</strong>
            <p>{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={loadLocations}
            className="shrink-0 text-xs border-red-500/30 text-red-700 hover:bg-red-500/20"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 2. Interactive Map of Saved Locations */}
      <section className="panel isolate" aria-label="Saved Places Map">
        <div className="panel-heading">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Navigation size={16} className="text-primary" />
              Saved Locations Map
            </h2>
            <p className="text-xs text-muted-foreground">
              Explore your saved places on the interactive map. Click any pin to inspect details or plan a route.
            </p>
          </div>
          {selectedLocation && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-md">
                Focus: {selectedLocation.name}
              </span>
            </div>
          )}
        </div>

        <div className="p-0">
          <SavedLocationsMap
            locations={locations}
            selectedLocationId={selectedLocationId}
            onSelectLocation={setSelectedLocationId}
            onPlanRoute={handlePlanRoute}
            height={380}
            isExpanded={isMapExpanded}
            onToggleExpand={() => setIsMapExpanded(v => !v)}
          />
        </div>
      </section>

      {/* 3. Search & Filter Controls Bar */}
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border'
            }`}
          >
            All ({locations.length})
          </button>
          {CATEGORY_LABELS.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border'
              }`}
            >
              <span>{cat}</span>
              <span className="opacity-75 text-[11px]">({categoryCounts[cat] || 0})</span>
            </button>
          ))}
        </div>

        {/* Text Filter & Sort */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search saved places…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <label htmlFor="locations-sort" className="text-xs text-muted-foreground hidden sm:inline">
              Sort:
            </label>
            <select
              id="locations-sort"
              value={sortOption}
              onChange={e => setSortOption(e.target.value as any)}
              className="text-xs py-1.5 px-2 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="recent">Most Recently Added</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Saved Locations Cards Grid */}
      {loading && locations.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-xs">Loading your saved places…</span>
        </div>
      ) : filteredLocations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLocations.map(loc => {
            const isSelected = loc.id === selectedLocationId;
            const CategoryIcon = getCategoryIcon(loc.label);
            const badgeClasses = getCategoryBadgeClasses(loc.label);
            const isCheckingTraffic = checkingTrafficIds.has(loc.id);

            const hasValidTraffic =
              loc.traffic_status === 'available' &&
              loc.congestion_percent !== null &&
              loc.congestion_percent !== undefined &&
              Number.isFinite(loc.congestion_percent);

            return (
              <div
                key={loc.id}
                onClick={() => setSelectedLocationId(loc.id)}
                className={`panel p-4 flex flex-col justify-between gap-3.5 transition-all cursor-pointer hover:shadow-md ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'hover:border-primary/40'
                }`}
              >
                {/* Card Top: Icon, Label, and Action Menu */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CategoryIcon size={16} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-foreground truncate max-w-[190px]">
                          {loc.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeClasses.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${badgeClasses.dot}`} />
                            {loc.label || 'Saved'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenEdit(loc);
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Edit location"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation();
                          setDeletingLocation(loc);
                        }}
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                        title="Delete location"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {/* Address & Coordinates */}
                  <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-1">
                    {loc.address || `${loc.area}, ${loc.city}`}
                  </div>

                  <div className="text-[11px] text-muted-foreground/80 font-mono mt-1">
                    {loc.latitude.toFixed(4)}°, {loc.longitude.toFixed(4)}°
                  </div>
                </div>

                {/* Traffic Condition Box */}
                <div className="pt-2 border-t border-border">
                  {isCheckingTraffic ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      <span>Checking traffic telemetry…</span>
                    </div>
                  ) : hasValidTraffic ? (
                    <div className="p-2.5 rounded-lg bg-secondary/40 border border-border space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full inline-block"
                            style={{ backgroundColor: getTrafficColor(loc.congestion_percent) }}
                          />
                          <span className="font-semibold text-foreground">
                            {getTrafficCondition(loc.congestion_percent)}
                          </span>
                        </div>
                        <span
                          className="font-bold font-mono text-xs"
                          style={{ color: getTrafficColor(loc.congestion_percent) }}
                        >
                          {loc.congestion_percent?.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                        <div>
                          Speed: <strong className="text-foreground">{loc.current_speed_kmh?.toFixed(1)} km/h</strong>
                        </div>
                        <div>
                          Delay: <strong className="text-foreground">{formatDelay(loc.delay_seconds)}</strong>
                        </div>
                      </div>

                      <div className="text-[10px] text-muted-foreground/75 flex items-center justify-between pt-0.5">
                        <span>Updated: {formatTime(loc.traffic_last_updated)}</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            void checkTrafficForLocation(loc);
                          }}
                          className="text-primary hover:underline cursor-pointer"
                        >
                          Refresh
                        </button>
                      </div>
                    </div>
                  ) : loc.traffic_status === 'unavailable' ? (
                    <div className="p-2 rounded-lg bg-muted/30 border border-border text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Traffic data unavailable nearby</span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          void checkTrafficForLocation(loc);
                        }}
                        className="text-primary hover:underline text-[10px] font-medium cursor-pointer"
                      >
                        Check
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-muted/20 border border-border text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Traffic not checked yet</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation();
                          void checkTrafficForLocation(loc);
                        }}
                        className="text-xs h-6 px-2 text-primary hover:bg-primary/10"
                      >
                        Check Traffic
                      </Button>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-2 border-t border-border flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedLocationId(loc.id);
                    }}
                    className="flex-1 text-xs h-8"
                  >
                    <MapPin size={13} className="mr-1" />
                    {isSelected ? 'Focused' : 'View on Map'}
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={e => {
                        e.stopPropagation();
                        handlePlanRoute(loc, 'start');
                      }}
                      className="text-xs h-8 px-2.5 font-medium"
                      title="Use this location as the starting point in Route Planner"
                    >
                      Use Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={e => {
                        e.stopPropagation();
                        handlePlanRoute(loc, 'destination');
                      }}
                      className="text-xs h-8 px-2.5 font-medium"
                      title="Use this location as the destination in Route Planner"
                    >
                      Use Dest
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : locations.length === 0 ? (
        /* Empty State: No Saved Places */
        <div className="panel p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Bookmark size={30} />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">No Saved Locations Yet</h3>
          <p className="text-xs max-w-md text-muted-foreground leading-relaxed mb-5">
            Save your everyday places like Home, Work, or College to monitor live road traffic near them and calculate alternative routes in one click.
          </p>
          <Button
            onClick={() => {
              setSelectedPlace(null);
              setAddSearchQuery('');
              setAddSearchResults(null);
              setAddSearchError(null);
              setAddName('');
              setAddLabel('Home');
              setIsAddOpen(true);
            }}
            className="text-xs font-semibold h-9 px-4"
          >
            <Plus size={15} className="mr-1.5" />
            Add Your First Location
          </Button>
        </div>
      ) : (
        /* Filter Empty State */
        <div className="panel p-10 text-center text-muted-foreground">
          <SlidersHorizontal size={24} className="mx-auto mb-2 text-muted-foreground opacity-50" />
          <h3 className="text-sm font-semibold text-foreground">No matching saved locations</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            No locations matched "{searchFilter}" or category "{categoryFilter}".
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCategoryFilter('all');
              setSearchFilter('');
            }}
            className="mt-3 text-xs"
          >
            Reset Filters
          </Button>
        </div>
      )}

      {/* 5. Relocated Backend Monitored Corridors Section */}
      <section id="monitored" className="panel mt-8" aria-label="Backend Monitored Corridors">
        <div className="panel-heading flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-emerald-500 animate-pulse" />
              <h2 className="text-sm font-bold text-foreground">Backend Monitored Corridors</h2>
              <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {monitoredList.length} Corridors
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Actively polled every 5 minutes by the FastAPI background scheduler and appended to persistent live traffic records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => void loadMonitored()}
              title="Refresh monitored locations"
              aria-label="Refresh monitored locations"
            >
              <RefreshCw size={13} />
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {monitoredList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Radio size={22} />
              </div>
              <h3>No monitored locations saved yet</h3>
              <p>
                Add your favourite road segment or city area to the monitoring list so the backend scheduler automatically tracks its traffic history.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {monitoredList.map((item, idx) => {
                const key = `${item.latitude}-${item.longitude}`;
                const isSelected = selectedMonitoredKey === key;

                return (
                  <div
                    key={`${key}-${idx}`}
                    className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                          <MapPin size={14} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                          {item.name}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {item.city} · {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          5m poll
                        </span>
                        {isSelected && (
                          <span className="text-[10px] bg-primary text-primary-foreground font-semibold px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isSelected ? 'secondary' : 'outline'}
                      className="w-full text-xs h-7"
                      onClick={() => setSelectedMonitoredKey(key)}
                    >
                      {isSelected ? 'Focused Corridor' : 'Focus Corridor'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 6. Add Location Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="text-primary" size={18} />
              Add a New Location
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Search for an address or landmark, assign a label, and save it to your places.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Step 1: Search Place with Google Maps-style live autocomplete */}
            <form onSubmit={handleSearchPlaces} className="space-y-1.5">
              <label className="font-semibold text-foreground text-xs">
                Search Place / Address <span className="text-red-500">*</span>
              </label>
              <div className="flex items-start gap-2">
                <div className="relative flex-1">
                  <LocationAutocomplete
                    placeholder="Search landmark, street, area, or city…"
                    aria-label="Search landmark, street, area, or city"
                    inputValue={addSearchQuery}
                    onInputChange={val => {
                      setAddSearchQuery(val);
                      if (!val.trim()) {
                        setAddSearchResults(null);
                        setAddSearchError(null);
                      }
                    }}
                    onSelect={place => {
                      if (place) {
                        handleSelectPlaceInAdd(place);
                      }
                    }}
                    onSearchSubmit={() => void handleSearchPlaces()}
                    showRecentSearches={true}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSearchingAdd || addSearchQuery.trim().length < 1}
                  size="sm"
                  className="text-xs h-9 px-3 shrink-0"
                >
                  {isSearchingAdd ? <Loader2 size={13} className="animate-spin" /> : 'Search'}
                </Button>
              </div>
            </form>

            {/* Search Results List */}
            {addSearchResults && addSearchResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto border border-border rounded-lg p-1.5 bg-muted/20">
                <span className="text-[11px] font-semibold text-muted-foreground px-2 py-1 block">
                  Select a verified match:
                </span>
                {addSearchResults.slice(0, 5).map((place, idx) => (
                  <button
                    key={`${place.latitude}-${place.longitude}-${idx}`}
                    type="button"
                    onClick={() => handleSelectPlaceInAdd(place)}
                    className="w-full text-left p-2 rounded-md hover:bg-primary/10 hover:text-primary transition-all text-xs flex items-start gap-2 cursor-pointer"
                  >
                    <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                    <div className="truncate">
                      <div className="font-medium text-foreground truncate">{place.name || place.area}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {place.city} ({place.latitude.toFixed(4)}°, {place.longitude.toFixed(4)}°)
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {addSearchError && (
              <div className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>{addSearchError}</span>
              </div>
            )}

            {/* Selected Place Confirmation */}
            {selectedPlace && (
              <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={14} />
                    Verified Place Selected:
                  </span>
                  <span className="font-mono text-[11px]">
                    {selectedPlace.latitude.toFixed(4)}°, {selectedPlace.longitude.toFixed(4)}°
                  </span>
                </div>
                <div className="text-[11px] text-foreground font-medium">
                  {selectedPlace.name || `${selectedPlace.area}, ${selectedPlace.city}`}
                </div>
              </div>
            )}

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{duplicateWarning}</span>
              </div>
            )}

            {/* Step 2: Custom Name */}
            <div className="space-y-1.5">
              <label htmlFor="add-location-name" className="font-semibold text-foreground text-xs">
                Custom Name <span className="text-red-500">*</span>
              </label>
              <input
                id="add-location-name"
                type="text"
                placeholder="e.g. My Apartment, HQ Office, Main Campus"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Step 3: Category Label */}
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground text-xs">Category / Label</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {CATEGORY_LABELS.map(label => {
                  const Icon = getCategoryIcon(label);
                  const isSelected = addLabel === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAddLabel(label)}
                      className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                          : 'border-border bg-card text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveNewLocation}
              disabled={
                isSubmittingAdd ||
                !selectedPlace ||
                !addName.trim() ||
                !!duplicateWarning
              }
              className="text-xs"
            >
              {isSubmittingAdd ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Save Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Edit Location Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit2 className="text-primary" size={18} />
              Edit Location
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update the name or category of your saved location.
            </DialogDescription>
          </DialogHeader>

          {editingLocation && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border space-y-1">
                <div className="font-semibold text-foreground text-xs">Saved Address</div>
                <div className="text-[11px] text-muted-foreground">{editingLocation.address}</div>
                <div className="text-[10px] text-muted-foreground/75 font-mono">
                  {editingLocation.latitude.toFixed(4)}°, {editingLocation.longitude.toFixed(4)}°
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-location-name" className="font-semibold text-foreground text-xs">
                  Location Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="edit-location-name"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground text-xs">Category / Label</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {CATEGORY_LABELS.map(label => {
                    const Icon = getCategoryIcon(label);
                    const isSelected = editLabel === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setEditLabel(label)}
                        className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                            : 'border-border bg-card text-foreground hover:bg-muted/50'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEditLocation}
              disabled={isSubmittingEdit || !editName.trim()}
              className="text-xs"
            >
              {isSubmittingEdit ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Update Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(deletingLocation)}
        onOpenChange={open => {
          if (!open) setDeletingLocation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <Trash2 size={18} />
              Remove Saved Location?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to remove{' '}
              <strong className="text-foreground">
                "{deletingLocation?.name || 'this location'}"
              </strong>{' '}
              from your saved places? This will permanently delete this location from your personal list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700 text-xs"
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Delete Location
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
