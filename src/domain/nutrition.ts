import type { ActivityLevel, BodyMeasurement, FoodEntry, Profile, Sex, WeightEntry } from "../db/types";
import { addDays, daysBetween } from "./dates";

const ACTIVITY: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
const SEX_CONST: Record<Sex, number> = { male: 5, female: -161, average: -78 };
const KCAL_PER_KG = 7700;

/** Mifflin–St Jeor. The sex constant is a user choice ("average" by default) since HRT shifts body composition. */
export function bmr(weightKg: number, heightCm: number, age: number, basis: Sex): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONST[basis];
}

export function tdee(weightKg: number, heightCm: number, age: number, basis: Sex, activity: ActivityLevel): number {
  return bmr(weightKg, heightCm, age, basis) * ACTIVITY[activity];
}

export interface CalorieTarget {
  bmr: number;
  tdee: number;
  deficit: number;
  calculated: number;
  target: number;
  overridden: boolean;
}

export function calorieTarget(p: Profile, weightKg: number, today: string): CalorieTarget {
  const age = Number(today.slice(0, 4)) - p.birth_year;
  const b = bmr(weightKg, p.height_cm, age, p.calc_basis);
  const t = b * ACTIVITY[p.activity];
  const deficit = (p.target_loss_kg_per_week * KCAL_PER_KG) / 7;
  // Never below BMR or 1400 kcal — no crash dieting.
  const calculated = roundTo(Math.max(t - deficit, b, 1400), 50);
  return {
    bmr: Math.round(b),
    tdee: Math.round(t),
    deficit: Math.round(deficit),
    calculated,
    target: p.calorie_target_override ?? calculated,
    overridden: p.calorie_target_override != null,
  };
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function totals(entries: FoodEntry[]): Totals {
  return entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function dayTotals(entries: FoodEntry[], date: string): Totals {
  return totals(entries.filter((e) => e.date === date));
}

/** Averages over days that have any food logged (unlogged days are unknown, not zero). */
export function averageIntake(entries: FoodEntry[], from: string, to: string) {
  const days = new Map<string, Totals>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const t = days.get(e.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    days.set(e.date, { kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat });
  }
  const n = days.size;
  let kcal = 0;
  let protein = 0;
  for (const t of days.values()) {
    kcal += t.kcal;
    protein += t.protein;
  }
  const sum = { kcal, protein };
  return {
    loggedDays: n,
    kcal: n ? sum.kcal / n : null,
    protein: n ? sum.protein / n : null,
    days,
  };
}

export function proteinCompliance(entries: FoodEntry[], from: string, to: string, minProtein: number) {
  const { days } = averageIntake(entries, from, to);
  const span = daysBetween(from, to) + 1;
  const hit = [...days.values()].filter((t) => t.protein >= minProtein * 0.95).length;
  return { hit, logged: days.size, span, pct: days.size ? hit / days.size : null };
}

// ---------- Weight trend ----------

export interface WeightPoint {
  date: string;
  kg: number;
}

/** Merge quick weigh-ins and measurement weights into one daily series (last value per day wins). */
export function weightSeries(weights: WeightEntry[], measurements: BodyMeasurement[]): WeightPoint[] {
  const byDay = new Map<string, { kg: number; at: string }>();
  const add = (date: string, kg: number | undefined, at: string) => {
    if (kg == null || !isFinite(kg)) return;
    const cur = byDay.get(date);
    if (!cur || cur.at < at) byDay.set(date, { kg, at });
  };
  for (const w of weights) add(w.date, w.kg, w.updated_at);
  for (const m of measurements) add(m.date, m.weight, m.updated_at);
  return [...byDay.entries()].map(([date, v]) => ({ date, kg: v.kg })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Least-squares slope (kg/week) over the window ending at `to`. Needs ≥4 points over ≥10 days. */
export function weightTrend(series: WeightPoint[], to: string, windowDays = 21) {
  const from = addDays(to, -windowDays + 1);
  const pts = series.filter((p) => p.date >= from && p.date <= to);
  if (pts.length < 4 || daysBetween(pts[0].date, pts[pts.length - 1].date) < 10) return null;
  const xs = pts.map((p) => daysBetween(from, p.date));
  const ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const perDay = den ? num / den : 0;
  return { kgPerWeek: perDay * 7, points: pts.length, smoothedNow: my + perDay * (windowDays - 1 - mx) };
}

export interface CalorieAdvice {
  kind: "on_track" | "too_fast" | "too_slow" | "recomp" | "need_data" | "log_more";
  message: string;
  suggestedTarget?: number;
}

/**
 * Suggests (never applies) a calorie adjustment from the actual weight trend.
 * Waist improving while weight is flat counts as progress — no forced weight loss.
 */
export function calorieAdvice(opts: {
  trendKgPerWeek: number | null;
  currentTarget: number;
  avgLoggedKcal: number | null;
  loggedDays: number;
  waistChange28d: number | null;
  floor: number;
}): CalorieAdvice {
  const { trendKgPerWeek: r, currentTarget, avgLoggedKcal, loggedDays, waistChange28d, floor } = opts;
  if (r == null) return { kind: "need_data", message: "Weigh in 3–4 times a week for two weeks and a trend will appear here." };
  const loss = -r;
  if (loss > 0.75) {
    return {
      kind: "too_fast",
      message: `Losing about ${loss.toFixed(2)} kg/week — faster than the 0.3–0.6 kg target. Eating a little more protects muscle.`,
      suggestedTarget: roundTo(currentTarget + 150, 50),
    };
  }
  if (loss >= 0.25) return { kind: "on_track", message: `Trend ${loss.toFixed(2)} kg/week — within the gradual range. Keep going.` };
  if (waistChange28d != null && waistChange28d <= -0.25) {
    return {
      kind: "recomp",
      message: `Weight is steady but waist is down ${Math.abs(waistChange28d).toFixed(1)}" in 4 weeks — body composition is improving. No change needed.`,
    };
  }
  if (loggedDays < 10 || (avgLoggedKcal != null && avgLoggedKcal > currentTarget * 1.08)) {
    return {
      kind: "log_more",
      message:
        avgLoggedKcal != null && avgLoggedKcal > currentTarget * 1.08
          ? `Average intake (${Math.round(avgLoggedKcal)} kcal) is above target. Try matching the current target for 2 weeks before lowering it.`
          : "Weight is flat. Log food on most days for two weeks so the adjustment is based on real intake.",
    };
  }
  const next = Math.max(roundTo(currentTarget - 150, 50), floor);
  if (next >= currentTarget) return { kind: "on_track", message: "Weight is flat, and the target is already at its safe minimum. Focus on steps and training." };
  return {
    kind: "too_slow",
    message: `Weight trend ${r >= 0 ? "+" : ""}${r.toFixed(2)} kg/week with steady logging. A small reduction may help.`,
    suggestedTarget: next,
  };
}
