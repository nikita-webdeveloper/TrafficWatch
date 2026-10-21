import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

const MapCanvas = lazy(() => import('./MapCanvas'));

export interface TrafficMapProps {
  expanded?: boolean;
  isFullscreen?: boolean;
  height?: string | number;
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
  className?: string;
}

export function TrafficMap({
  expanded = false,
  isFullscreen = false,
  height,
  selectedSegmentIndex,
  onSelectSegment,
  className = '',
}: TrafficMapProps) {
  const fallback = (
    <div className="map-loading flex flex-col items-center justify-center gap-2 p-12 text-muted-foreground bg-muted/20 rounded-lg border border-border min-h-[380px]">
      <Loader2 className="animate-spin text-primary" size={24} />
      <span className="text-sm font-medium">Loading live traffic map…</span>
    </div>
  );

  return (
    <div
      className={`traffic-map ${expanded ? 'expanded' : ''} ${
        isFullscreen ? 'fullscreen' : ''
      } ${className}`}
      style={height ? { height: typeof height === 'number' ? `${height}px` : height } : undefined}
    >
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <MapCanvas
            expanded={expanded}
            isFullscreen={isFullscreen}
            height={height}
            selectedSegmentIndex={selectedSegmentIndex}
            onSelectSegment={onSelectSegment}
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
