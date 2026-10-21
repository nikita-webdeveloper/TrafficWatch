import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Location, PlannedRoute } from '@/types/traffic';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';

export const ROUTE_COLORS = [
  '#16a34a', // Emerald Green - Recommended / Fastest
  '#2563eb', // Blue - Alternative 1
  '#9333ea', // Purple - Alternative 2
  '#d97706', // Amber - Shortest / Alternative 3
  '#0891b2', // Cyan
];

type Props = {
  source: Location | null;
  destination: Location | null;
  routes: PlannedRoute[];
  selectedRouteId: string | null;
  onSelectRoute?: (id: string) => void;
  centerPune?: [number, number];
  highlightedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
};

function FitBoundsController({
  source,
  destination,
  routes,
  selectedRouteId,
  highlightedSegmentId,
  isExpanded,
}: {
  source: Location | null;
  destination: Location | null;
  routes: PlannedRoute[];
  selectedRouteId: string | null;
  highlightedSegmentId?: string | null;
  isExpanded?: boolean;
}) {
  const map = useMap();

  // Invalidate map size on mount, resize, or expand/minimize transitions
  useEffect(() => {
    const timers = [
      setTimeout(() => map.invalidateSize(), 0),
      setTimeout(() => map.invalidateSize(), 100),
      setTimeout(() => map.invalidateSize(), 250),
      setTimeout(() => map.invalidateSize(), 500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, [map, isExpanded]);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map]);

  useEffect(() => {
    const activeRoute = routes.find(r => r.id === selectedRouteId) || routes[0];

    // If a segment is explicitly highlighted, focus on it
    if (highlightedSegmentId && activeRoute?.segments) {
      const seg = activeRoute.segments.find(s => s.id === highlightedSegmentId);
      if (seg && seg.coordinates && seg.coordinates.length > 0) {
        if (seg.coordinates.length === 1) {
          map.flyTo(seg.coordinates[0], 15, { animate: true });
        } else {
          map.fitBounds(seg.coordinates, {
            padding: [70, 70],
            maxZoom: 16,
            animate: true,
          });
        }
        return;
      }
    }

    const points: [number, number][] = [];

    if (source) points.push([source.latitude, source.longitude]);
    if (destination) points.push([destination.latitude, destination.longitude]);

    // Focus on selected route geometry, or all routes if none selected
    if (activeRoute?.geometry?.length) {
      activeRoute.geometry.forEach(p => points.push(p));
    } else {
      routes.forEach(r => r.geometry?.forEach(p => points.push(p)));
    }

    if (points.length >= 2) {
      map.fitBounds(points, {
        padding: [45, 45],
        maxZoom: 15,
        animate: true,
      });
    } else if (source) {
      map.flyTo([source.latitude, source.longitude], 13);
    }
  }, [map, source, destination, routes, selectedRouteId, highlightedSegmentId]);

  return null;
}

export function RouteMap({
  source,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  centerPune = [18.5204, 73.8567],
  highlightedSegmentId = null,
  onSelectSegment,
  isExpanded = false,
  onToggleExpand,
}: Props) {
  // Center map on source/dest midpoint, or source, or Pune center
  const initialCenter: [number, number] = useMemo(() => {
    if (source && destination) {
      return [(source.latitude + destination.latitude) / 2, (source.longitude + destination.longitude) / 2];
    }
    if (source) return [source.latitude, source.longitude];
    return centerPune;
  }, [source, destination, centerPune]);

  const activeRoute = routes.find(r => r.id === selectedRouteId) || routes[0] || null;
  const hasValidGeometry = routes.some(r => (r.geometry?.length || 0) > 1);

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-border shadow-sm transition-all ${
        isExpanded
          ? 'h-full flex-1 min-h-[480px]'
          : 'h-[480px] sm:h-[500px] lg:h-[520px]'
      }`}
      aria-label="Route alternative comparison map"
    >
      {/* Floating Expand/Minimize Map button */}
      {onToggleExpand && (
        <div className="absolute top-3 right-3 z-[1000]">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/95 hover:bg-card border border-border text-xs font-semibold text-foreground shadow-md backdrop-blur transition-all hover:scale-105 active:scale-95 cursor-pointer"
            aria-label={isExpanded ? 'Exit Fullscreen' : 'Expand Map'}
            title={isExpanded ? 'Exit Fullscreen (Esc)' : 'Expand Map'}
          >
            {isExpanded ? (
              <>
                <Minimize2 size={14} className="text-primary" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 size={14} className="text-primary" />
                <span>Expand Map</span>
              </>
            )}
          </button>
        </div>
      )}

      <MapContainer
        center={initialCenter}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />

        <FitBoundsController
          source={source}
          destination={destination}
          routes={routes}
          selectedRouteId={selectedRouteId}
          highlightedSegmentId={highlightedSegmentId}
          isExpanded={isExpanded}
        />

        {/* 1. Inactive routes rendered underneath */}
        {routes.map((route, index) => {
          if (!route.geometry || route.geometry.length < 2) return null;
          const isSelected = route.id === selectedRouteId || (!selectedRouteId && index === 0);
          if (isSelected) return null; // Render selected on top

          const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
          return (
            <Polyline
              key={`bg-${route.id}`}
              positions={route.geometry}
              pathOptions={{
                color,
                weight: 5,
                opacity: 0.55,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => onSelectRoute?.(route.id),
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 p-1">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                    {route.name || `Alternative ${index + 1}`}
                  </div>
                  <div className="text-muted-foreground">
                    Distance: <strong>{route.distance_km.toFixed(1)} km</strong> · Est. Time:{' '}
                    <strong>{Math.round(route.travel_time_seconds / 60)} min</strong>
                  </div>
                  {route.traffic_delay_seconds ? (
                    <div className="text-amber-600 font-medium">
                      Traffic Delay: +{Math.round(route.traffic_delay_seconds / 60)} min
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectRoute?.(route.id)}
                    className="mt-1 text-[11px] text-primary underline block cursor-pointer"
                  >
                    Select this route
                  </button>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* 2. Selected route rendered prominently with double-stroke outline */}
        {activeRoute?.geometry && activeRoute.geometry.length > 1 && (
          <>
            {/* Dark background casing for contrast */}
            <Polyline
              positions={activeRoute.geometry}
              pathOptions={{
                color: '#0f172a',
                weight: 10,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              interactive={false}
            />
            {/* Colored active stroke */}
            <Polyline
              positions={activeRoute.geometry}
              pathOptions={{
                color: ROUTE_COLORS[routes.findIndex(r => r.id === activeRoute.id) % ROUTE_COLORS.length] || '#16a34a',
                weight: 7,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 p-1">
                  <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full inline-block bg-primary" />
                    {activeRoute.name || 'Selected Route'}
                    {activeRoute.is_recommended && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold ml-1">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    Distance: <strong>{activeRoute.distance_km.toFixed(1)} km</strong> · Est. Time:{' '}
                    <strong>{Math.round(activeRoute.travel_time_seconds / 60)} min</strong>
                  </div>
                  {activeRoute.traffic_delay_seconds ? (
                    <div className="text-amber-600 font-medium">
                      Traffic Delay: +{Math.round(activeRoute.traffic_delay_seconds / 60)} min
                    </div>
                  ) : (
                    <div className="text-emerald-600 font-medium">No notable traffic delay</div>
                  )}
                  {activeRoute.recommendation_reason && (
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                      {activeRoute.recommendation_reason}
                    </p>
                  )}
                </div>
              </Popup>
            </Polyline>
          </>
        )}

        {/* 3. Congested road sections on selected route and user-selected segment */}
        {activeRoute?.segments?.map(seg => {
          if (!seg.coordinates || seg.coordinates.length < 2) return null;
          const isHighlighted = seg.id === highlightedSegmentId;
          if (!seg.is_congested_hotspot && !isHighlighted) return null;

          const color = getTrafficColor(seg.congestion_percent ?? null);
          const condition = getTrafficCondition(seg.congestion_percent ?? null);

          return (
            <React.Fragment key={`seg-frag-${seg.id}`}>
              {isHighlighted && (
                <Polyline
                  positions={seg.coordinates}
                  pathOptions={{
                    color: '#06b6d4', // Bright cyan halo for clicked segment
                    weight: 14,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  interactive={false}
                />
              )}
              <Polyline
                key={`hotspot-${seg.id}`}
                positions={seg.coordinates}
                pathOptions={{
                  color: isHighlighted ? '#0284c7' : color || '#dc2626',
                  weight: isHighlighted ? 10 : 9,
                  opacity: 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: () => onSelectSegment?.(seg.id),
                }}
              >
              <Popup>
                <div className="text-xs space-y-1 p-1 min-w-[170px]">
                  <div className="font-semibold text-foreground flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: color }} />
                    {seg.name}
                  </div>
                  <div className="text-destructive font-medium">{condition}</div>
                  {seg.current_speed_kmh !== null && seg.current_speed_kmh !== undefined && (
                    <div className="text-muted-foreground">
                      Current Speed: <strong>{seg.current_speed_kmh} km/h</strong> (Free flow:{' '}
                      {seg.free_flow_speed_kmh} km/h)
                    </div>
                  )}
                  {seg.delay_seconds ? (
                    <div className="text-amber-600 font-medium">
                      Section Delay: ~{Math.round(seg.delay_seconds / 60)} min
                    </div>
                  ) : null}
                  <div className="text-[10px] text-muted-foreground border-t border-border pt-1">
                    Source: {seg.data_source || 'TomTom Live Flow'}
                  </div>
                </div>
              </Popup>
            </Polyline>
            </React.Fragment>
          );
        })}

        {/* 4. Origin & Destination Markers */}
        {source && (
          <CircleMarker
            center={[source.latitude, source.longitude]}
            radius={9}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: '#16a34a',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs p-1">
                <span className="font-semibold text-emerald-600 block">Origin / Start</span>
                <span className="font-medium text-foreground">{source.name || `${source.area}, ${source.city}`}</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  {source.latitude.toFixed(4)}°, {source.longitude.toFixed(4)}°
                </span>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {destination && (
          <CircleMarker
            center={[destination.latitude, destination.longitude]}
            radius={9}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: '#ef4444',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs p-1">
                <span className="font-semibold text-red-600 block">Destination</span>
                <span className="font-medium text-foreground">{destination.name || `${destination.area}, ${destination.city}`}</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  {destination.latitude.toFixed(4)}°, {destination.longitude.toFixed(4)}°
                </span>
              </div>
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Empty State Banner if no routes yet */}
      {routes.length === 0 && (
        <div className="absolute top-4 left-4 right-4 z-[1000] max-w-md mx-auto bg-card/95 backdrop-blur-md border border-border p-3.5 rounded-xl shadow-lg text-center pointer-events-none">
          <p className="text-xs font-semibold text-foreground">
            Enter your starting location and destination to view available routes.
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Color-coded alternative routes with real-time congestion will appear here.
          </p>
        </div>
      )}

      {/* Warning banner if geometry is unavailable */}
      {!hasValidGeometry && routes.length > 0 && (
        <div className="absolute top-3 left-3 right-3 z-[1000] bg-muted/90 backdrop-blur border border-border px-3 py-2 text-xs text-muted-foreground rounded shadow-sm">
          Route lines will appear as soon as the routing provider returns complete geometry coordinates.
        </div>
      )}

      {/* Map Bottom Legend for Route & Traffic Congestion */}
      {routes.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-card/95 backdrop-blur-md border-t border-border px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
              Routes:
            </span>
            {routes.map((r, i) => {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              const isSelected = r.id === selectedRouteId || (!selectedRouteId && i === 0);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectRoute?.(r.id)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors text-[11px] cursor-pointer ${
                    isSelected ? 'bg-primary/10 font-bold border border-primary/30' : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                  <span>
                    {r.name || `Route ${i + 1}`}
                    {r.is_recommended ? ' ★' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[11px] border-l border-border pl-3">
            <span className="text-muted-foreground uppercase font-semibold text-[10px]">Traffic:</span>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#059669]" />
              <span className="text-muted-foreground text-[10px]">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#eab308]" />
              <span className="text-muted-foreground text-[10px]">Moderate</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
              <span className="text-muted-foreground text-[10px]">Congested</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
