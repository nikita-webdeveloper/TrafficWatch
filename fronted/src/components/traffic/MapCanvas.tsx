import React, { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';
import type * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw, AlertCircle, MapPin, Radio, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTraffic, locationKey } from './TrafficProvider';
import type { TrafficSegment } from '@/types/traffic';

import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';
export { getTrafficColor, getTrafficCondition };

function getLineWeights(zoom: number) {
  if (zoom <= 12) return { outline: 7, inner: 4 };
  if (zoom <= 14) return { outline: 9, inner: 6 };
  if (zoom <= 16) return { outline: 11, inner: 7 };
  return { outline: 13, inner: 8 };
}

function MapController({
  onZoomChange,
  onMapClick,
}: {
  onZoomChange: (z: number) => void;
  onMapClick?: () => void;
}) {
  const { location, selectLocation } = useTraffic();
  const map = useMap();
  const prevCoordRef = useRef<[number, number]>([location.latitude, location.longitude]);

  // Center smoothly ONLY when coordinate actually changes (prevent auto-refresh jumping)
  useEffect(() => {
    const [prevLat, prevLng] = prevCoordRef.current;
    const latDiff = Math.abs(prevLat - location.latitude);
    const lngDiff = Math.abs(prevLng - location.longitude);

    if (latDiff > 0.0001 || lngDiff > 0.0001) {
      prevCoordRef.current = [location.latitude, location.longitude];
      map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 14), {
        duration: 0.8,
      });
    }
  }, [location.latitude, location.longitude, map]);

  useMapEvents({
    zoomend: e => {
      onZoomChange(e.target.getZoom());
    },
    click: e => {
      onMapClick?.();
      selectLocation({
        city: 'Map selection',
        area: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`,
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
      });
    },
  });

  return null;
}

function SelectedSegmentController({
  selectedSegmentIndex,
  segments,
}: {
  selectedSegmentIndex?: number | null;
  segments: TrafficSegment[];
}) {
  const map = useMap();
  useEffect(() => {
    if (
      selectedSegmentIndex !== null &&
      selectedSegmentIndex !== undefined &&
      segments[selectedSegmentIndex]?.coordinates?.length
    ) {
      const coords = segments[selectedSegmentIndex].coordinates;
      const mid = coords[Math.floor(coords.length / 2)];
      map.panTo([mid[0], mid[1]], { animate: true, duration: 0.5 });
    }
  }, [selectedSegmentIndex, segments, map]);
  return null;
}

function MapAutoResize({ expanded, isFullscreen }: { expanded?: boolean; isFullscreen?: boolean }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const container = map.getContainer();
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    const onFullscreenChange = () => {
      setTimeout(() => map.invalidateSize(), 150);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    const onWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      resizeObserver?.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [map]);

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [expanded, isFullscreen, map]);

  return null;
}

export interface MapCanvasProps {
  selectedSegmentIndex?: number | null;
  onSelectSegment?: (index: number | null) => void;
  className?: string;
  expanded?: boolean;
  isFullscreen?: boolean;
  height?: string | number;
}

export default function MapCanvas({
  selectedSegmentIndex = null,
  onSelectSegment,
  className = '',
  expanded = false,
  isFullscreen = false,
  height,
}: MapCanvasProps = {}) {
  const {
    location,
    selectLocation,
    segments,
    segmentsLoading,
    segmentsError,
    refresh,
    lastRefreshedAt,
    lastUpdated,
    monitoredLocations,
  } = useTraffic();

  const [currentZoom, setCurrentZoom] = useState(14);
  const weights = getLineWeights(currentZoom);
  const polylineRefs = useRef<(L.Polyline | null)[]>([]);

  useEffect(() => {
    if (selectedSegmentIndex !== null && selectedSegmentIndex !== undefined) {
      const poly = polylineRefs.current[selectedSegmentIndex];
      if (poly) {
        poly.openPopup();
      }
    }
  }, [selectedSegmentIndex]);

  const formattedTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div
      className={`relative w-full rounded-lg overflow-hidden border border-border ${
        isFullscreen ? 'h-full min-h-[420px]' : expanded ? 'h-[500px] lg:h-[600px]' : 'h-full min-h-[380px]'
      } ${className}`}
      style={height ? { height: typeof height === 'number' ? `${height}px` : height } : undefined}
    >
      {/* Top Map Header Bar with Controls */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Selected location indicator badge */}
        <div className="pointer-events-auto bg-card/95 backdrop-blur-md border border-border shadow-md rounded-md px-3 py-1.5 flex items-center gap-2 text-xs">
          <MapPin size={14} className="text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
            {location.area}, {location.city}
          </span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            ({location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°)
          </span>
        </div>

        {/* Live Refresh & Status Badge */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-card/95 backdrop-blur-md border border-border shadow-md rounded-md px-2.5 py-1 text-xs">
          {segmentsLoading ? (
            <div className="flex items-center gap-1.5 text-primary">
              <RefreshCw size={13} className="animate-spin" />
              <span className="text-[11px] font-medium">Updating…</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px]">
                {formattedTime ? `Updated ${formattedTime}` : 'Live (60s refresh)'}
              </span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
            onClick={refresh}
            disabled={segmentsLoading}
            title="Refresh live traffic map"
            aria-label="Refresh live traffic map"
          >
            <RefreshCw size={12} className={segmentsLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Segments Error Notification */}
      {segmentsError && (
        <div className="absolute top-14 left-3 right-3 z-[1000] bg-destructive/90 text-destructive-foreground text-xs p-2.5 rounded-md shadow-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{segmentsError}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px]"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty State Banner if no segments found */}
      {!segmentsLoading && segments.length === 0 && !segmentsError && (
        <div className="absolute bottom-14 left-3 z-[1000] bg-card/90 backdrop-blur border border-border text-xs px-3 py-2 rounded-md shadow flex items-center gap-2 text-muted-foreground">
          <Compass size={14} className="text-amber-500" />
          <span>No active traffic flow segments returned for this point. Click the map to check nearby roads.</span>
        </div>
      )}

      {/* Leaflet Map */}
      <MapContainer
        center={[location.latitude, location.longitude]}
        zoom={14}
        zoomControl={false}
        scrollWheelZoom
        className="map-canvas h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <ZoomControl position="bottomright" />
        <MapAutoResize expanded={expanded} isFullscreen={isFullscreen} />
        <MapController
          onZoomChange={setCurrentZoom}
          onMapClick={() => onSelectSegment?.(null)}
        />
        <SelectedSegmentController
          selectedSegmentIndex={selectedSegmentIndex}
          segments={segments}
        />

        {/* Render Multiple Road Segments with Dual Lines */}
        {segments.map((segment, index) => {
          if (!segment.coordinates || segment.coordinates.length < 2) return null;

          const color = getTrafficColor(segment.congestion_percent);
          const condition = getTrafficCondition(segment.congestion_percent);
          const startPt = segment.coordinates[0];
          const midPt = segment.coordinates[Math.floor(segment.coordinates.length / 2)];
          const key = `seg-${segment.id || index}-${startPt[0].toFixed(4)}-${midPt[1].toFixed(4)}`;
          const isSelected = selectedSegmentIndex === index;

          return (
            <React.Fragment key={key}>
              {/* Outer dark/highlight outline for contrast */}
              <Polyline
                positions={segment.coordinates}
                pathOptions={{
                  color: isSelected ? '#1e40af' : '#0f172a',
                  weight: isSelected ? weights.outline + 6 : weights.outline,
                  opacity: isSelected ? 1 : 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />

              {/* Inner colored flow line */}
              <Polyline
                ref={el => {
                  polylineRefs.current[index] = el;
                }}
                positions={segment.coordinates}
                pathOptions={{
                  color: isSelected ? '#3b82f6' : color,
                  weight: isSelected ? weights.inner + 3 : weights.inner,
                  opacity: 1,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: e => {
                    e.originalEvent?.stopPropagation();
                    onSelectSegment?.(index);
                  },
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[210px] text-xs space-y-2 text-foreground font-sans">
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <span className="font-bold text-sm flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block"
                          style={{ backgroundColor: color }}
                        />
                        {condition}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {segment.name || `Road segment ${index + 1}`}
                      </span>
                    </div>

                    <div className="space-y-1 text-muted-foreground pt-0.5">
                      <div className="flex justify-between">
                        <span>Congestion:</span>
                        <strong className="text-foreground">
                          {segment.congestion_percent !== null && Number.isFinite(segment.congestion_percent)
                            ? `${segment.congestion_percent.toFixed(1)}%`
                            : 'N/A'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Speed:</span>
                        <strong className="text-foreground">
                          {segment.current_speed_kmh !== null && Number.isFinite(segment.current_speed_kmh)
                            ? `${segment.current_speed_kmh} km/h`
                            : 'N/A'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Free-flow Speed:</span>
                        <strong className="text-foreground">
                          {segment.free_flow_speed_kmh !== null && Number.isFinite(segment.free_flow_speed_kmh)
                            ? `${segment.free_flow_speed_kmh} km/h`
                            : 'N/A'}
                        </strong>
                      </div>
                      {segment.current_travel_time_seconds !== null &&
                        segment.current_travel_time_seconds !== undefined && (
                          <div className="flex justify-between">
                            <span>Est. Travel Time:</span>
                            <strong className="text-foreground">
                              {(segment.current_travel_time_seconds / 60).toFixed(1)} min
                            </strong>
                          </div>
                        )}
                      {segment.confidence !== null && segment.confidence !== undefined && (
                        <div className="flex justify-between">
                          <span>Confidence:</span>
                          <strong className="text-foreground">
                            {(segment.confidence * 100).toFixed(0)}%
                          </strong>
                        </div>
                      )}
                      {segment.frc && (
                        <div className="flex justify-between">
                          <span>Road Class:</span>
                          <strong className="text-foreground uppercase">{segment.frc}</strong>
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5 flex items-center justify-between">
                      <span>Source: TomTom Flow API</span>
                      <span className="text-emerald-600 font-semibold">
                        {lastUpdated
                          ? new Date(lastUpdated).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : formattedTime
                          ? `Updated ${formattedTime}`
                          : 'Live'}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        })}

        {/* Monitored Locations Markers */}
        {monitoredLocations.map(place => (
          <CircleMarker
            key={`monitored-${locationKey(place)}`}
            center={[place.latitude, place.longitude]}
            radius={7}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#059669',
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 p-0.5">
                <div className="font-semibold text-foreground flex items-center gap-1">
                  <Radio size={12} className="text-emerald-600" />
                  {place.name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {place.city} · Monitored Location
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2 h-6 text-[10px]"
                  onClick={() =>
                    selectLocation({
                      name: place.name,
                      city: place.city,
                      area: place.area || place.name,
                      latitude: place.latitude,
                      longitude: place.longitude,
                    })
                  }
                >
                  Select this location
                </Button>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Selected Active Location Marker */}
        <CircleMarker
          center={[location.latitude, location.longitude]}
          radius={10}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor: '#2563eb',
            fillOpacity: 1,
          }}
        >
          <Popup>
            <div className="text-xs space-y-1 p-0.5">
              <strong className="text-sm text-foreground flex items-center gap-1">
                <MapPin size={13} className="text-primary" />
                {location.area}
              </strong>
              <div className="text-muted-foreground">{location.city}</div>
              <div className="text-[10px] text-muted-foreground">
                {location.latitude.toFixed(4)}° N, {location.longitude.toFixed(4)}° E
              </div>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>

      {/* Traffic Map Legend conforming strictly to required colors */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-card/95 backdrop-blur-md border-t border-border px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-bold text-[11px] tracking-wider uppercase text-muted-foreground">
            Congestion:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
            <span className="text-foreground text-[11px]">Low (&lt;30%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#eab308]" />
            <span className="text-foreground text-[11px]">Moderate (30–59%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
            <span className="text-foreground text-[11px]">Heavy (≥60%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#64748b]" />
            <span className="text-foreground text-[11px]">Data Unavailable</span>
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
          <span>Click road for segment details</span>
          <span>·</span>
          <span>Click map to relocate</span>
        </div>
      </div>
    </div>
  );
}
