import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { TrafficReading, TrafficSegment } from '@/types/traffic';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';

export interface HotspotMapCanvasProps {
  segments?: TrafficSegment[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  readings?: TrafficReading[];
  center?: [number, number];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function FitBoundsController({
  segments,
  selectedSegmentId,
  readings,
  isExpanded,
}: {
  segments?: TrafficSegment[];
  selectedSegmentId?: string | null;
  readings?: TrafficReading[];
  isExpanded?: boolean;
}) {
  const map = useMap();

  // Invalidate map size on mount, resize, and expand/collapse transitions
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

  // Handle zooming / bounds fitting
  useEffect(() => {
    // If a segment is explicitly selected, focus and zoom in on it
    if (selectedSegmentId && segments && segments.length > 0) {
      const selected = segments.find(s => s.id === selectedSegmentId);
      if (selected && selected.coordinates && selected.coordinates.length > 0) {
        if (selected.coordinates.length === 1) {
          map.flyTo(selected.coordinates[0], 16, { animate: true });
        } else {
          map.fitBounds(selected.coordinates, {
            padding: [60, 60],
            maxZoom: 16,
            animate: true,
          });
        }
        return;
      }
    }

    // Otherwise fit to all segments if available
    if (segments && segments.length > 0) {
      const allPoints: [number, number][] = [];
      segments.forEach(s => {
        if (Array.isArray(s.coordinates)) {
          s.coordinates.forEach(pt => allPoints.push(pt));
        }
      });
      if (allPoints.length > 0) {
        map.fitBounds(allPoints, {
          padding: [50, 50],
          maxZoom: 15,
          animate: true,
        });
        return;
      }
    }

    // Fallback to readings if provided
    if (readings && readings.length > 0) {
      const readingPoints: [number, number][] = readings.map(r => [r.latitude, r.longitude]);
      map.fitBounds(readingPoints, {
        padding: [50, 50],
        maxZoom: 14,
        animate: true,
      });
    }
  }, [map, segments, selectedSegmentId, readings]);

  return null;
}

export default function HotspotMapCanvas({
  segments = [],
  selectedSegmentId = null,
  onSelectSegment,
  readings = [],
  center,
  isExpanded = false,
  onToggleExpand,
}: HotspotMapCanvasProps) {
  // Compute initial center if not explicitly provided
  const mapCenter: [number, number] = useMemo(() => {
    if (center) return center;
    if (segments.length > 0) {
      let latSum = 0;
      let lonSum = 0;
      let count = 0;
      segments.forEach(s => {
        if (s.coordinates && s.coordinates.length > 0) {
          latSum += s.coordinates[0][0];
          lonSum += s.coordinates[0][1];
          count += 1;
        }
      });
      if (count > 0) {
        return [latSum / count, lonSum / count];
      }
    }
    if (readings.length > 0) {
      return [
        readings.reduce((sum, r) => sum + r.latitude, 0) / readings.length,
        readings.reduce((sum, r) => sum + r.longitude, 0) / readings.length,
      ];
    }
    return [18.5204, 73.8567]; // Pune default
  }, [center, segments, readings]);

  const hasSegments = segments.length > 0;

  return (
    <div className="relative h-full w-full">
      {/* Floating Expand/Minimize control */}
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

      {/* Floating Traffic Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-md p-2.5 text-xs pointer-events-auto">
        <div className="font-semibold text-foreground mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Congestion Level
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-sm bg-[#059669] inline-block shadow-sm" />
            <span className="text-foreground">Low (&lt;30%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-sm bg-[#eab308] inline-block shadow-sm" />
            <span className="text-foreground">Moderate (30%–60%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-sm bg-[#dc2626] inline-block shadow-sm" />
            <span className="text-foreground">Heavy (≥60%)</span>
          </div>
          {selectedSegmentId && (
            <div className="flex items-center gap-2 pt-1 border-t border-border mt-0.5">
              <span className="h-2.5 w-5 rounded-sm bg-[#06b6d4] inline-block shadow-sm ring-2 ring-[#0284c7]" />
              <span className="text-foreground font-medium">Selected Road</span>
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
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          readings={readings}
          isExpanded={isExpanded}
        />

        {/* 1. Road Segments rendering */}
        {hasSegments &&
          segments.map(seg => {
            if (!seg.coordinates || seg.coordinates.length < 2) return null;
            const isSelected = seg.id === selectedSegmentId;
            const color = getTrafficColor(seg.congestion_percent);
            const condition = getTrafficCondition(seg.congestion_percent);

            return (
              <React.Fragment key={`hotspot-seg-${seg.id}`}>
                {/* Highlight Halo for Selected Segment */}
                {isSelected && (
                  <Polyline
                    positions={seg.coordinates}
                    pathOptions={{
                      color: '#06b6d4',
                      weight: 14,
                      opacity: 0.9,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                    interactive={false}
                  />
                )}

                {/* Road Casing for regular segments to enhance contrast */}
                {!isSelected && (
                  <Polyline
                    positions={seg.coordinates}
                    pathOptions={{
                      color: '#0f172a',
                      weight: 7,
                      opacity: 0.25,
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                    interactive={false}
                  />
                )}

                {/* Primary Colored Segment Polyline */}
                <Polyline
                  positions={seg.coordinates}
                  pathOptions={{
                    color: isSelected ? '#0284c7' : color,
                    weight: isSelected ? 9 : 5.5,
                    opacity: isSelected ? 1.0 : 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  eventHandlers={{
                    click: () => onSelectSegment?.(seg.id),
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[190px] text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                        <strong className="text-foreground text-sm font-semibold truncate">
                          {seg.name || 'Monitored Segment'}
                        </strong>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-semibold text-foreground">{condition}</span>
                        {seg.congestion_percent !== null && seg.congestion_percent !== undefined && (
                          <span className="text-muted-foreground ml-auto font-mono">
                            {seg.congestion_percent.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      <div className="text-muted-foreground space-y-0.5 text-[11px]">
                        <div>
                          Speed:{' '}
                          <span className="font-semibold text-foreground">
                            {seg.current_speed_kmh !== null && seg.current_speed_kmh !== undefined
                              ? `${seg.current_speed_kmh.toFixed(1)} km/h`
                              : '—'}
                          </span>
                          {' '}(Free-flow:{' '}
                          {seg.free_flow_speed_kmh !== null && seg.free_flow_speed_kmh !== undefined
                            ? `${seg.free_flow_speed_kmh.toFixed(1)} km/h`
                            : '—'}
                          )
                        </div>
                        {seg.delay_seconds !== null && seg.delay_seconds !== undefined && (
                          <div className={seg.delay_seconds > 60 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>
                            {seg.delay_seconds > 0
                              ? `Delay: +${Math.round(seg.delay_seconds / 60)} min`
                              : 'No traffic delay'}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectSegment?.(seg.id)}
                        className="w-full mt-1.5 py-1 px-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-center font-medium text-[11px] cursor-pointer"
                      >
                        {isSelected ? 'Currently Selected' : 'Select Segment Details'}
                      </button>
                    </div>
                  </Popup>
                </Polyline>

                {/* Small indicator marker at start of segment */}
                <CircleMarker
                  center={seg.coordinates[0]}
                  radius={isSelected ? 6 : 4}
                  pathOptions={{
                    color: isSelected ? '#0284c7' : color,
                    fillColor: isSelected ? '#38bdf8' : color,
                    fillOpacity: 0.9,
                    weight: isSelected ? 2 : 1,
                  }}
                  eventHandlers={{
                    click: () => onSelectSegment?.(seg.id),
                  }}
                />
              </React.Fragment>
            );
          })}

        {/* 2. Backward-compatible CircleMarkers for historical readings if no segments */}
        {!hasSegments &&
          readings.map(r => {
            const color =
              r.congestion_percent >= 60
                ? '#dc2626'
                : r.congestion_percent >= 30
                ? '#eab308'
                : '#059669';
            return (
              <CircleMarker
                key={`${r.latitude},${r.longitude}`}
                center={[r.latitude, r.longitude]}
                radius={Math.max(6, Math.min(14, 5 + r.congestion_percent / 12))}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
              >
                <Popup>
                  <strong>
                    {r.area}, {r.city}
                  </strong>
                  <br />
                  Congestion: {r.congestion_percent.toFixed(1)}%
                  <br />
                  Speed: {r.current_speed_kmh.toFixed(1)} km/h
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>
    </div>
  );
}
