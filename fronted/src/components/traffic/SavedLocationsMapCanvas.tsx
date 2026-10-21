import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2, Navigation, MapPin } from 'lucide-react';
import type { SavedLocation, LocationLabel } from '@/types/traffic';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';

export interface SavedLocationsMapCanvasProps {
  locations?: SavedLocation[];
  selectedLocationId?: string | null;
  onSelectLocation?: (id: string) => void;
  onPlanRoute?: (location: SavedLocation, role: 'start' | 'destination') => void;
  center?: [number, number];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function getLabelColor(label?: LocationLabel | string): string {
  switch (label?.toLowerCase()) {
    case 'home':
      return '#2563eb'; // Blue
    case 'work':
      return '#4f46e5'; // Indigo
    case 'office':
      return '#0284c7'; // Sky
    case 'college':
      return '#9333ea'; // Purple
    default:
      return '#64748b'; // Slate
  }
}

function FitBoundsController({
  locations,
  selectedLocationId,
  isExpanded,
}: {
  locations?: SavedLocation[];
  selectedLocationId?: string | null;
  isExpanded?: boolean;
}) {
  const map = useMap();

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
    if (selectedLocationId && locations && locations.length > 0) {
      const selected = locations.find(l => l.id === selectedLocationId);
      if (selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude)) {
        map.flyTo([selected.latitude, selected.longitude], 15, { animate: true });
        return;
      }
    }

    if (locations && locations.length > 0) {
      const validPoints: [number, number][] = locations
        .filter(l => Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
        .map(l => [l.latitude, l.longitude]);

      if (validPoints.length === 1) {
        map.flyTo(validPoints[0], 14, { animate: true });
      } else if (validPoints.length > 1) {
        map.fitBounds(validPoints, {
          padding: [50, 50],
          maxZoom: 15,
          animate: true,
        });
      }
    }
  }, [map, locations, selectedLocationId]);

  return null;
}

export default function SavedLocationsMapCanvas({
  locations = [],
  selectedLocationId = null,
  onSelectLocation,
  onPlanRoute,
  center,
  isExpanded = false,
  onToggleExpand,
}: SavedLocationsMapCanvasProps) {
  const mapCenter: [number, number] = useMemo(() => {
    if (center) return center;
    if (locations.length > 0) {
      const valid = locations.filter(l => Number.isFinite(l.latitude) && Number.isFinite(l.longitude));
      if (valid.length > 0) {
        return [
          valid.reduce((sum, l) => sum + l.latitude, 0) / valid.length,
          valid.reduce((sum, l) => sum + l.longitude, 0) / valid.length,
        ];
      }
    }
    return [18.5204, 73.8567]; // Pune default
  }, [center, locations]);

  return (
    <div className="relative h-full w-full isolate">
      {/* Floating Expand/Minimize Button */}
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

      {/* Floating Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-md p-2.5 text-xs pointer-events-auto">
        <div className="font-semibold text-foreground mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Saved Places
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb] inline-block shadow-xs" />
            <span className="text-foreground">Home</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4f46e5] inline-block shadow-xs" />
            <span className="text-foreground">Work</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0284c7] inline-block shadow-xs" />
            <span className="text-foreground">Office</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#9333ea] inline-block shadow-xs" />
            <span className="text-foreground">College</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#64748b] inline-block shadow-xs" />
            <span className="text-foreground">Other Place</span>
          </div>
          {selectedLocationId && (
            <div className="flex items-center gap-1.5 col-span-2 pt-1 border-t border-border mt-0.5">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-[#06b6d4] bg-primary inline-block" />
              <span className="text-foreground font-semibold">Active Selection</span>
            </div>
          )}
        </div>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <ZoomControl position="bottomright" />

        <FitBoundsController
          locations={locations}
          selectedLocationId={selectedLocationId}
          isExpanded={isExpanded}
        />

        {locations.map(loc => {
          if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return null;
          const isSelected = loc.id === selectedLocationId;
          const color = getLabelColor(loc.label);

          return (
            <React.Fragment key={`saved-loc-${loc.id}`}>
              {/* Selected location glowing halo */}
              {isSelected && (
                <CircleMarker
                  center={[loc.latitude, loc.longitude]}
                  radius={16}
                  pathOptions={{
                    color: '#06b6d4',
                    fillColor: '#38bdf8',
                    fillOpacity: 0.25,
                    weight: 3,
                  }}
                  interactive={false}
                />
              )}

              {/* Saved place pin marker */}
              <CircleMarker
                center={[loc.latitude, loc.longitude]}
                radius={isSelected ? 10 : 8}
                pathOptions={{
                  color: isSelected ? '#ffffff' : '#ffffff',
                  fillColor: isSelected ? '#0284c7' : color,
                  fillOpacity: 1,
                  weight: isSelected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => onSelectLocation?.(loc.id),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[210px] text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                      <strong className="text-foreground text-sm font-semibold truncate">
                        {loc.name}
                      </strong>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {loc.label || 'Saved'}
                      </span>
                    </div>

                    <div className="text-muted-foreground text-[11px] leading-relaxed">
                      {loc.address || `${loc.area}, ${loc.city}`}
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono">
                      {loc.latitude.toFixed(4)}°, {loc.longitude.toFixed(4)}°
                    </div>

                    {/* Nearby Traffic status if loaded */}
                    {loc.traffic_status === 'available' && loc.congestion_percent !== null && loc.congestion_percent !== undefined ? (
                      <div className="p-2 rounded bg-muted/40 border border-border space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">Traffic Condition:</span>
                          <span
                            className="font-bold text-white px-1.5 py-0.2 rounded text-[10px]"
                            style={{ backgroundColor: getTrafficColor(loc.congestion_percent) }}
                          >
                            {getTrafficCondition(loc.congestion_percent)}
                          </span>
                        </div>
                        <div className="flex justify-between text-muted-foreground text-[10px]">
                          <span>Speed: {loc.current_speed_kmh?.toFixed(1) ?? '—'} km/h</span>
                          <span>Congestion: {loc.congestion_percent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ) : loc.traffic_status === 'unavailable' ? (
                      <div className="text-[11px] text-muted-foreground italic bg-muted/30 p-1.5 rounded">
                        Traffic data unavailable nearby
                      </div>
                    ) : null}

                    {/* Quick Plan Route Actions */}
                    {onPlanRoute && (
                      <div className="pt-1.5 border-t border-border flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPlanRoute(loc, 'start')}
                          className="flex-1 py-1 px-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-center font-medium text-[11px] cursor-pointer"
                        >
                          Use as Start
                        </button>
                        <button
                          type="button"
                          onClick={() => onPlanRoute(loc, 'destination')}
                          className="flex-1 py-1 px-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border text-center font-medium text-[11px] cursor-pointer"
                        >
                          Use as Dest
                        </button>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
