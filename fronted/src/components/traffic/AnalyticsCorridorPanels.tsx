import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  Location,
  RoutePredictionSummary,
  RouteSegmentTraffic,
} from '@/types/traffic';
import { getTrafficColor, getTrafficCondition } from '@/lib/traffic-utils';
import { getPredictions, getNearbySegments } from '@/services/api';

interface AnalyticsCorridorPanelsProps {
  location?: Location | null;
  prediction?: RoutePredictionSummary | null;
  segments?: RouteSegmentTraffic[] | null;
}

export function TrafficPredictionCard({
  prediction,
  loading = false,
}: {
  prediction?: RoutePredictionSummary | null;
  loading?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit size={18} className="text-primary" />
            Traffic Prediction (15 min ahead)
          </CardTitle>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Random Forest ML
          </span>
        </div>
        <CardDescription>
          Trained on historical TomTom flow observations to forecast future corridor speeds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="animate-spin mr-2" size={16} />
            Loading model predictions…
          </div>
        ) : (
          <>
            {/* Coverage Notice */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5">
              <Info size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-foreground">
                  {prediction?.coverage_status === 'full_coverage'
                    ? 'Corridor Prediction Available'
                    : prediction?.coverage_status === 'partial_coverage'
                      ? 'Partial Corridor Prediction Coverage'
                      : 'Segment Predictions Available'}
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {prediction?.message ||
                    'Prediction applies strictly to monitored segments with sufficient historical training data.'}
                </p>
              </div>
            </div>

            {/* Segment Predictions Comparison Table */}
            {prediction?.segment_predictions && prediction.segment_predictions.length > 0 ? (
              <div className="space-y-2">
                <span className="font-semibold text-foreground block">
                  Observed vs. 15-Minute Predicted Speed
                </span>
                <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
                  <div className="bg-muted/70 px-3 py-1.5 font-semibold text-[11px] grid grid-cols-4 text-muted-foreground">
                    <span>SEGMENT</span>
                    <span>CURRENT</span>
                    <span>PREDICTED</span>
                    <span>TREND</span>
                  </div>
                  {prediction.segment_predictions.map((seg, idx) => {
                    const diff =
                      seg.predicted_speed_kmh != null && seg.current_speed_kmh != null
                        ? seg.predicted_speed_kmh - seg.current_speed_kmh
                        : null;

                    return (
                      <div key={`${seg.road_id}-${idx}`} className="px-3 py-2 grid grid-cols-4 items-center">
                        <span className="font-medium text-foreground truncate pr-1">
                          {seg.road_id}
                        </span>
                        <span>
                          {seg.current_speed_kmh != null ? `${seg.current_speed_kmh} km/h` : 'N/A'}
                        </span>
                        <span className="font-semibold text-primary">
                          {seg.predicted_speed_kmh != null ? `${seg.predicted_speed_kmh} km/h` : 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          {diff === null ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : Math.abs(diff) < 0.5 ? (
                            <span className="text-muted-foreground">Stable</span>
                          ) : diff > 0 ? (
                            <span className="text-emerald-600 flex items-center font-medium">
                              <TrendingUp size={12} className="mr-0.5" />+{diff.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center font-medium">
                              <TrendingDown size={12} className="mr-0.5" />
                              {diff.toFixed(1)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-border p-4 text-center text-muted-foreground">
                No monitored road segments on this corridor have sufficient historical observations yet.
              </div>
            )}

            {/* Explanation of model behavior */}
            <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-2 space-y-1">
              <p>
                <strong>Why predictions differ:</strong> Predictions integrate current speed, free-flow speed,
                cyclical time of day (hour), and past speed trends. When congestion tends to clear or peak at
                specific hours, the Random Forest model adjusts expected velocity accordingly.
              </p>
              <p>
                <strong>Data Science Transparency:</strong> High autocorrelation on 15-minute intervals means a
                simple persistence baseline is naturally competitive. Model accuracy and evaluation are verified
                against held-out chronological test sets without future data leakage.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function RoadSegmentsFlowCard({
  segments,
  loading = false,
}: {
  segments?: RouteSegmentTraffic[] | null;
  loading?: boolean;
}) {
  const [expandedDetails, setExpandedDetails] = useState(false);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers size={18} className="text-primary" />
            Road Segments & Traffic Flow
          </CardTitle>
          {segments && segments.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedDetails(!expandedDetails)}
              className="h-7 text-xs"
            >
              {expandedDetails ? (
                <>
                  Collapse <ChevronUp size={13} className="ml-1" />
                </>
              ) : (
                <>
                  Expand <ChevronDown size={13} className="ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
        <CardDescription>
          Detailed segment conditions along the monitored corridor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="animate-spin mr-2" size={16} />
            Loading road segments…
          </div>
        ) : segments && segments.length > 0 ? (
          <div className="space-y-2">
            {(expandedDetails ? segments : segments.slice(0, 3)).map((seg, idx) => {
              const color = getTrafficColor(seg.congestion_percent ?? null);
              const condition = getTrafficCondition(seg.congestion_percent ?? null);

              return (
                <div
                  key={`${seg.id}-${idx}`}
                  className="rounded-lg border border-border p-3 bg-card space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full inline-block"
                        style={{ backgroundColor: color }}
                      />
                      {seg.name}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded"
                      style={{
                        color,
                        backgroundColor: `${color}1a`,
                      }}
                    >
                      {condition}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-muted-foreground text-[11px] pt-1 border-t border-border">
                    <div>
                      <span>Speed: </span>
                      <strong className="text-foreground">
                        {seg.current_speed_kmh != null ? `${seg.current_speed_kmh} km/h` : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span>Free-Flow: </span>
                      <strong className="text-foreground">
                        {seg.free_flow_speed_kmh != null ? `${seg.free_flow_speed_kmh} km/h` : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span>Delay: </span>
                      <strong className="text-foreground">
                        {seg.delay_seconds ? `+${Math.round(seg.delay_seconds / 60)} min` : '0 min'}
                      </strong>
                    </div>
                  </div>

                  <div className="text-[10px] text-muted-foreground flex justify-between pt-0.5">
                    <span>Source: {seg.data_source || 'TomTom Flow API'}</span>
                    {seg.last_updated && (
                      <span>Updated {new Date(seg.last_updated).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {!expandedDetails && segments.length > 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedDetails(true)}
                className="w-full text-xs h-7"
              >
                Show {segments.length - 3} more segments
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded border border-dashed border-border p-4 text-center text-muted-foreground">
            No individual congested bottlenecks were identified on this corridor. Traffic is moving at standard flow.
          </div>
        )}

        {/* Data Attribution Badge */}
        <div className="rounded bg-muted/40 p-2.5 text-[11px] text-muted-foreground space-y-1 border border-border">
          <span className="font-semibold text-foreground block">Data Integrity & Sources:</span>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Distances & Travel Times: TomTom Routing API with live traffic calculations.</li>
            <li>Live Segments: TomTom Flow API (absolute flow speeds).</li>
            <li>Predictions: TrafficWatch Scikit-Learn Regression pipeline (~15m horizon).</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsCorridorPanels({
  location,
  prediction: propPrediction,
  segments: propSegments,
}: AnalyticsCorridorPanelsProps) {
  const [internalPrediction, setInternalPrediction] = useState<RoutePredictionSummary | null>(null);
  const [internalSegments, setInternalSegments] = useState<RouteSegmentTraffic[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If props are provided, use them directly
    if (propPrediction !== undefined || propSegments !== undefined) {
      setInternalPrediction(propPrediction ?? null);
      setInternalSegments(propSegments ?? null);
      return;
    }

    // Otherwise, fetch predictions and segments for location
    if (!location) return;

    let active = true;
    setLoading(true);

    async function fetchData() {
      try {
        const [predRes, segRes] = await Promise.allSettled([
          getPredictions(
            new URLSearchParams({
              city: location!.city,
              area: location!.area,
              latitude: String(location!.latitude),
              longitude: String(location!.longitude),
              horizon_minutes: '15',
            })
          ),
          getNearbySegments(location!.latitude, location!.longitude),
        ]);

        if (!active) return;

        if (predRes.status === 'fulfilled' && predRes.value?.predictions?.length) {
          const first = predRes.value.predictions[0];
          setInternalPrediction({
            route_prediction_available: true,
            coverage_status: 'full_coverage',
            coverage_percent: 100,
            prediction_horizon_minutes: 15,
            message: `15-minute speed forecast for ${location!.area || location!.city}.`,
            segment_predictions: [
              {
                road_id: location!.area || location!.city,
                current_speed_kmh: first?.current_speed_kmh ?? null,
                predicted_speed_kmh: first?.predicted_speed_kmh ?? null,
                free_flow_speed_kmh: first?.free_flow_speed_kmh ?? null,
                horizon_minutes: 15,
                model_status: 'model_prediction',
              },
            ],
          });
        } else {
          setInternalPrediction(null);
        }

        if (segRes.status === 'fulfilled' && Array.isArray(segRes.value)) {
          setInternalSegments(
            segRes.value.map((s, idx) => ({
              id: s.id || `seg-${idx + 1}`,
              name: s.name || `Segment ${idx + 1}`,
              coordinates: s.coordinates,
              current_speed_kmh: s.current_speed_kmh,
              free_flow_speed_kmh: s.free_flow_speed_kmh,
              congestion_percent: s.congestion_percent,
              delay_seconds:
                s.current_travel_time_seconds && s.free_flow_travel_time_seconds
                  ? Math.max(0, s.current_travel_time_seconds - s.free_flow_travel_time_seconds)
                  : 0,
              is_congested_hotspot: (s.congestion_percent ?? 0) >= 30,
              data_source: 'TomTom Flow API',
              last_updated: new Date().toISOString(),
            }))
          );
        } else {
          setInternalSegments(null);
        }
      } catch (err) {
        console.warn('AnalyticsCorridorPanels data fetch failed:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      active = false;
    };
  }, [location, propPrediction, propSegments]);

  return (
    <div className="grid gap-6 lg:grid-cols-2 mt-6">
      <TrafficPredictionCard prediction={propPrediction ?? internalPrediction} loading={loading} />
      <RoadSegmentsFlowCard segments={propSegments ?? internalSegments} loading={loading} />
    </div>
  );
}
