import type { BodyMeasurement, Goal, MeasureKey, WeightEntry } from "../db/types";
import { weightSeries } from "./nutrition";

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  weight: "Weight",
  bust: "Bust",
  underbust: "Underbust",
  waist: "Waist",
  belly: "Belly (navel)",
  hips: "Hips",
  shoulders: "Shoulders",
  wrist: "Wrist",
  thigh: "Thigh",
  arm: "Arm",
};

export const LENGTH_KEYS: Exclude<MeasureKey, "weight">[] = [
  "bust",
  "underbust",
  "waist",
  "belly",
  "hips",
  "thigh",
  "arm",
  "shoulders",
  "wrist",
];

/** Whether "smaller" is the desired direction (for colouring changes; never for judging). */
export const DIRECTION: Partial<Record<MeasureKey, "down" | "up">> = {
  weight: "down",
  waist: "down",
  belly: "down",
  hips: "up",
  bust: "up",
};

export const BASELINE: Partial<Record<MeasureKey, number>> = {
  weight: 78,
  bust: 38,
  underbust: 33,
  waist: 32,
  belly: 37,
  hips: 39.5,
  shoulders: 16,
  wrist: 6.2,
};

export const DEFAULT_GOALS: { key: MeasureKey; min: number; max: number; note: string }[] = [
  { key: "weight", min: 65, max: 70, note: "Initial range; reassess with body composition. Not forced if waist is improving." },
  { key: "waist", min: 26, max: 28, note: "Aspirational — not a guaranteed physiological outcome." },
  { key: "belly", min: 29.5, max: 30.5, note: "Aspirational." },
  { key: "hips", min: 41, max: 43, note: "Via glute development; individual results vary." },
  { key: "bust", min: 38, max: 42, note: "Continued development under medical supervision. No size is guaranteed." },
];

export interface Point {
  date: string;
  value: number;
}

export function seriesFor(key: MeasureKey, measurements: BodyMeasurement[], weights: WeightEntry[]): Point[] {
  if (key === "weight") return weightSeries(weights, measurements).map((p) => ({ date: p.date, value: p.kg }));
  return measurements
    .filter((m) => m[key] != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.updated_at < b.updated_at ? -1 : 1))
    .map((m) => ({ date: m.date, value: m[key] as number }));
}

export function startValue(key: MeasureKey, measurements: BodyMeasurement[], weights: WeightEntry[]): number | undefined {
  const base = measurements.find((m) => m.is_baseline && m[key] != null);
  if (base) return base[key] as number;
  return seriesFor(key, measurements, weights)[0]?.value;
}

export function currentValue(key: MeasureKey, measurements: BodyMeasurement[], weights: WeightEntry[], onOrBefore?: string) {
  const s = seriesFor(key, measurements, weights).filter((p) => !onOrBefore || p.date <= onOrBefore);
  return s[s.length - 1];
}

export function goalFor(key: MeasureKey, goals: Goal[]): Goal | undefined {
  return goals.find((g) => g.key === key);
}

export function whr(waist?: number, hips?: number): number | null {
  return waist && hips ? waist / hips : null;
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  return n == null || !isFinite(n) ? "—" : n.toFixed(digits);
}

export function unitOf(key: MeasureKey): string {
  return key === "weight" ? " kg" : "″";
}

export function signed(n: number, digits = 1): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;
}

export const CM_PER_IN = 2.54;
