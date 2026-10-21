import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import type { SavedLocation } from '@/types/traffic';

const Canvas = lazy(() => import('./SavedLocationsMapCanvas'));

export interface SavedLocationsMapProps {
  locations?: SavedLocation[];
  selectedLocationId?: string | null;
  onSelectLocation?: (id: string) => void;
  onPlanRoute?: (location: SavedLocation, role: 'start' | 'destination') => void;
  center?: [number, number];
  height?: number | string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function SavedLocationsMap({
  locations = [],
  selectedLocationId,
  onSelectLocation,
  onPlanRoute,
  center,
  height = 400,
  isExpanded = false,
  onToggleExpand,
}: SavedLocationsMapProps) {
  const fallback = (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/20">
      <Loader2 className="animate-spin text-primary" size={18} />
      <span>Loading saved locations map…</span>
    </div>
  );

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all isolate ${
        isExpanded ? 'h-full flex-1 min-h-[480px]' : ''
      }`}
      style={!isExpanded ? { height } : undefined}
    >
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <Canvas
            locations={locations}
            selectedLocationId={selectedLocationId}
            onSelectLocation={onSelectLocation}
            onPlanRoute={onPlanRoute}
            center={center}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
