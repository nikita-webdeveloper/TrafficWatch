import { describe, expect, it } from 'vitest';
import { getTrafficColor, getTrafficCondition } from '@/components/traffic/MapCanvas';
import { initialLocation, locationKey } from '@/components/traffic/TrafficProvider';

describe('Traffic Colors and Condition Logic', () => {
  it('assigns Green (#059669) for low congestion (<30%)', () => {
    expect(getTrafficColor(0)).toBe('#059669');
    expect(getTrafficColor(15.5)).toBe('#059669');
    expect(getTrafficColor(29.9)).toBe('#059669');
    expect(getTrafficCondition(15)).toBe('Low Congestion');
  });

  it('assigns Yellow (#eab308) for moderate congestion (30-59%)', () => {
    expect(getTrafficColor(30)).toBe('#eab308');
    expect(getTrafficColor(45)).toBe('#eab308');
    expect(getTrafficColor(59.9)).toBe('#eab308');
    expect(getTrafficCondition(45)).toBe('Moderate Congestion');
  });

  it('assigns Red (#dc2626) for heavy congestion (>=60%)', () => {
    expect(getTrafficColor(60)).toBe('#dc2626');
    expect(getTrafficColor(85)).toBe('#dc2626');
    expect(getTrafficColor(100)).toBe('#dc2626');
    expect(getTrafficCondition(75)).toBe('Heavy Congestion');
  });

  it('assigns Gray (#64748b) and Data Unavailable for null or missing congestion', () => {
    expect(getTrafficColor(null)).toBe('#64748b');
    expect(getTrafficColor(NaN)).toBe('#64748b');
    expect(getTrafficCondition(null)).toBe('Data Unavailable');
    expect(getTrafficCondition(NaN)).toBe('Data Unavailable');
  });
});

describe('Default Location and Formatting', () => {
  it('has initial default location set to Pune, Maharashtra (18.5204, 73.8567)', () => {
    expect(initialLocation.city).toBe('Pune');
    expect(initialLocation.latitude).toBeCloseTo(18.5204, 4);
    expect(initialLocation.longitude).toBeCloseTo(73.8567, 4);
  });

  it('formats locationKey consistently with 4 decimal precision', () => {
    expect(locationKey({ latitude: 18.520412, longitude: 73.856734 })).toBe('18.5204,73.8567');
  });
});
