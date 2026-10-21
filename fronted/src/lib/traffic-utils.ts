/**
 * Application traffic classification thresholds:
 * - Below 30%: Low Congestion
 * - From 30% to below 60%: Moderate Congestion
 * - 60% and above: Heavy Congestion
 * Alert threshold:
 * - 50% and above: Elevated Congestion Warning
 */
export const CONGESTION_THRESHOLDS = {
  LOW_MAX: 30,
  MODERATE_MAX: 60,
  ALERT_MIN: 50,
} as const;

/** Full traffic condition label */
export function getTrafficCondition(congestion: number | null | undefined): string {
  if (congestion === null || congestion === undefined || !Number.isFinite(congestion)) {
    return 'Data Unavailable';
  }
  if (congestion < CONGESTION_THRESHOLDS.LOW_MAX) return 'Low Congestion';
  if (congestion < CONGESTION_THRESHOLDS.MODERATE_MAX) return 'Moderate Congestion';
  return 'Heavy Congestion';
}

/** Short classification label (e.g. Low, Moderate, Heavy) */
export function getTrafficLevel(congestion: number | null | undefined): string {
  if (congestion === null || congestion === undefined || !Number.isFinite(congestion)) {
    return 'Unavailable';
  }
  if (congestion < CONGESTION_THRESHOLDS.LOW_MAX) return 'Low';
  if (congestion < CONGESTION_THRESHOLDS.MODERATE_MAX) return 'Moderate';
  return 'Heavy';
}

/** Traffic colors conforming to application design system:
 * Low: Below 30% -> Green #059669
 * Moderate: 30–59% -> Yellow #eab308
 * Heavy: 60% and above -> Red #dc2626
 * Unknown: No data -> Gray #64748b
 */
export function getTrafficColor(congestion: number | null | undefined): string {
  if (congestion === null || congestion === undefined || !Number.isFinite(congestion)) {
    return '#64748b';
  }
  if (congestion < CONGESTION_THRESHOLDS.LOW_MAX) return '#059669';
  if (congestion < CONGESTION_THRESHOLDS.MODERATE_MAX) return '#eab308';
  return '#dc2626';
}
