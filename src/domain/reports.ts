// Weekly review, monthly report, checkpoint comparison and annual report.
// Everything here is objective statistics — no "success score".

import type { Tables } from "../db/types";
import { addDays, daysBetween, weekStart } from "./dates";
import { currentValue, seriesFor, startValue, whr } from "./body";
import { adherence } from "./hrt";
import { averageIntake, proteinCompliance, weightTrend, weightSeries } from "./nutrition";
import { addMonths, phaseFor, plannedResistanceDays, templateFor, TEMPLATES } from "./program";

export type DB = { [K in keyof Tables]: Tables[K][] };

export function sessionsPlanned(from: string, to: string, programStart: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < programStart) continue;
    const month = monthOf(programStart, d);
    if (templateFor(month, d).kind === "resistance") n++;
  }
  return n;
}

export function monthOf(start: string, date: string): number {
  let m = 1;
  while (addMonths(start, m) <= date) m++;
  return m;
}

export function sessionsCompleted(db: DB, from: string, to: string): number {
  return db.workouts.filter(
    (w) => w.finished_at && w.date >= from && w.date <= to && TEMPLATES[w.template]?.kind === "resistance",
  ).length;
}

/** Per day, the larger of logged cardio and watch exercise minutes (so the same walk isn't counted twice). */
export function cardioMinutes(db: DB, from: string, to: string): number {
  const byDay = new Map<string, number>();
  for (const w of db.workouts) if (w.date >= from && w.date <= to) byDay.set(w.date, (byDay.get(w.date) ?? 0) + (w.cardio_minutes ?? 0));
  for (const a of db.activity ?? []) if (a.date >= from && a.date <= to && a.exercise_min) byDay.set(a.date, Math.max(byDay.get(a.date) ?? 0, a.exercise_min));
  let total = 0;
  for (const v of byDay.values()) total += v;
  return total;
}

export function hypnoStats(db: DB, from: string, to: string) {
  const s = db.hypno.filter((h) => h.date >= from && h.date <= to);
  const minutes = s.reduce((a, h) => a + h.minutes, 0);
  const moodDelta = s.length ? s.reduce((a, h) => a + (h.mood_after - h.mood_before), 0) / s.length : null;
  const relaxation = s.length ? s.reduce((a, h) => a + h.relaxation, 0) / s.length : null;
  return { sessions: s.length, minutes, moodDelta, relaxation };
}

export function mobilityStats(db: DB, from: string, to: string) {
  const s = db.mobility.filter((m) => m.date >= from && m.date <= to && m.kind === "mobility");
  const latest = [...db.mobility]
    .filter((m) => m.date <= to && m.kind === "mobility" && m.scores.overall != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .pop();
  return { sessions: s.length, minutes: s.reduce((a, m) => a + m.minutes, 0), overall: latest?.scores.overall ?? null };
}

export function weeklyReview(db: DB, today: string, programStart: string, minProtein: number) {
  const from = weekStart(today);
  const to = addDays(from, 6);
  const ws = weightSeries(db.weights, db.measurements);
  const inWeek = ws.filter((p) => p.date >= from && p.date <= to);
  const before = ws.filter((p) => p.date < from).pop();
  const startW = before ?? inWeek[0];
  const curW = inWeek[inWeek.length - 1] ?? startW;
  const intake = averageIntake(db.foodEntries, from, to);
  const meas = (k: "waist" | "belly" | "hips" | "bust") => {
    const cur = currentValue(k, db.measurements, db.weights, to);
    const prev = currentValue(k, db.measurements, db.weights, addDays(from, -1));
    return { current: cur?.value ?? null, change: cur && prev && cur.date >= from ? cur.value - prev.value : null };
  };
  return {
    from,
    to,
    weight: { start: startW?.kg ?? null, current: curW?.kg ?? null, change: startW && curW ? curW.kg - startW.kg : null },
    waist: meas("waist"),
    belly: meas("belly"),
    hips: meas("hips"),
    bust: meas("bust"),
    avgKcal: intake.kcal,
    avgProtein: intake.protein,
    loggedDays: intake.loggedDays,
    protein: proteinCompliance(db.foodEntries, from, to, minProtein),
    planned: sessionsPlanned(from, to, programStart),
    completed: sessionsCompleted(db, from, to),
    cardio: cardioMinutes(db, from, to),
    hrt: adherence(db.medications, db.medLogs, to > today ? today : to, Math.min(7, daysBetween(from, today) + 1)),
    hypno: hypnoStats(db, from, to),
    mobility: mobilityStats(db, from, to),
  };
}

const MEASURES = ["weight", "waist", "belly", "hips", "bust", "underbust", "thigh", "arm"] as const;

/** Values of every measure as they stood at the end of each checkpoint month (0 = baseline). */
export function checkpointTable(db: DB, programStart: string, months: number[]) {
  return MEASURES.map((key) => {
    const values = months.map((m) => {
      if (m === 0) return startValue(key, db.measurements, db.weights) ?? null;
      const end = addDays(addMonths(programStart, m), -1);
      const pts = seriesFor(key, db.measurements, db.weights).filter((p) => p.date <= end);
      return pts.length ? pts[pts.length - 1].value : null;
    });
    return { key, values };
  });
}

export function strengthProgress(db: DB, from: string, to: string) {
  const best = (lo: string, hi: string) => {
    const m = new Map<string, { reps: number; load: number }>();
    for (const w of db.workouts) {
      if (!w.finished_at || w.date < lo || w.date > hi) continue;
      for (const s of w.sets) {
        if (!s.completed) continue;
        const cur = m.get(s.exercise_id) ?? { reps: 0, load: 0 };
        const load = s.load_kg ?? 0;
        if (load > cur.load || (load === cur.load && s.done > cur.reps)) m.set(s.exercise_id, { reps: s.done, load });
      }
    }
    return m;
  };
  const first = best(from, addDays(from, 13));
  const last = best(addDays(to, -13), to);
  const out: { exercise: string; first: { reps: number; load: number }; last: { reps: number; load: number } }[] = [];
  for (const [ex, l] of last) {
    const f = first.get(ex);
    if (f) out.push({ exercise: ex, first: f, last: l });
  }
  return out;
}

export function monthlyReport(db: DB, programStart: string, month: number, minProtein: number, today: string) {
  const from = addMonths(programStart, month - 1);
  const end = addDays(addMonths(programStart, month), -1);
  const to = end > today ? today : end;
  const prevEnd = addDays(from, -1);
  const body = MEASURES.map((key) => {
    const cur = currentValue(key, db.measurements, db.weights, to);
    const prev = month === 1 ? { value: startValue(key, db.measurements, db.weights) } : currentValue(key, db.measurements, db.weights, prevEnd);
    return { key, current: cur?.value ?? null, previous: prev?.value ?? null, change: cur && prev?.value != null ? cur.value - prev.value : null };
  });
  const intake = averageIntake(db.foodEntries, from, to);
  const days = daysBetween(from, to) + 1;
  const planned = sessionsPlanned(from, to, programStart);
  const completed = sessionsCompleted(db, from, to);
  const labs = db.labs.filter((l) => l.date >= from && l.date <= to);
  const fem = db.feminization.filter((f) => f.date >= from && f.date <= to);
  const mobFirst = db.mobility.filter((m) => m.kind === "mobility" && m.date >= from && m.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const trend = weightTrend(weightSeries(db.weights, db.measurements), to, 28);
  return {
    month,
    from,
    to,
    phase: phaseFor(month),
    body,
    whr: whr(body.find((b) => b.key === "waist")?.current ?? undefined, body.find((b) => b.key === "hips")?.current ?? undefined),
    avgKcal: intake.kcal,
    avgProtein: intake.protein,
    loggedDays: intake.loggedDays,
    days,
    protein: proteinCompliance(db.foodEntries, from, to, minProtein),
    planned,
    completed,
    cardio: cardioMinutes(db, from, to),
    hrt: adherence(db.medications, db.medLogs, to, days),
    labs,
    feminization: fem,
    hypno: hypnoStats(db, from, to),
    mobility: {
      ...mobilityStats(db, from, to),
      first: mobFirst[0]?.scores ?? null,
      last: mobFirst[mobFirst.length - 1]?.scores ?? null,
    },
    strength: strengthProgress(db, from, to),
    trend: trend?.kgPerWeek ?? null,
    objectives: nextMonthObjectives(db, month, { planned, completed, proteinPct: proteinCompliance(db.foodEntries, from, to, minProtein).pct, loggedDays: intake.loggedDays, days, trend: trend?.kgPerWeek ?? null }),
  };
}

/** Specific, data-driven objectives for next month. */
export function nextMonthObjectives(
  _db: DB,
  month: number,
  s: { planned: number; completed: number; proteinPct: number | null; loggedDays: number; days: number; trend: number | null },
): string[] {
  const out: string[] = [];
  const next = phaseFor(month + 1);
  out.push(`Month ${month + 1} — ${next.title}: ${next.focus}.`);
  const wk = plannedResistanceDays(month + 1);
  if (s.planned && s.completed / s.planned < 0.7) {
    out.push(`Workouts: ${s.completed}/${s.planned} this month. Aim for ${Math.max(2, wk - 1)} sessions each week — consistency over perfection.`);
  } else {
    out.push(`Workouts: keep ${wk} sessions/week and keep adding reps/load when targets are met.`);
  }
  if (s.loggedDays < s.days * 0.6) out.push(`Food logging: ${s.loggedDays}/${s.days} days. A quick log most days makes calorie adjustments accurate.`);
  if (s.proteinPct != null && s.proteinPct < 0.6) out.push("Protein: add the morning shake daily and a protein serving at dinner before cutting chapatis.");
  if (s.trend != null && -s.trend > 0.75) out.push("Weight is dropping fast — eat a little more to protect muscle.");
  if (s.trend != null && -s.trend < 0.2) out.push("Weight is steady — check the waist trend before changing calories.");
  if (phaseFor(month + 1).checkpoint) out.push("Checkpoint month: full measurements, photos and any labs your clinician has requested.");
  return out;
}

/** Month 13–24 recommendations generated from the actual year-one data. */
export function yearTwoRecommendations(db: DB, programStart: string, minProtein: number, today: string): string[] {
  const t = checkpointTable(db, programStart, [0, 12]);
  const val = (k: string, i: number) => t.find((r) => r.key === k)?.values[i] ?? null;
  const recs: string[] = [];
  const w0 = val("weight", 0);
  const w12 = val("weight", 1);
  const waist12 = val("waist", 1);
  const hips0 = val("hips", 0);
  const hips12 = val("hips", 1);
  if (w12 != null && w12 > 70) recs.push(`Weight ${w12.toFixed(1)} kg — a further gentle deficit (0.25–0.4 kg/week) is reasonable if waist is still above target.`);
  else if (w12 != null) recs.push(`Weight ${w12.toFixed(1)} kg is in the initial range — shift to maintenance calories and body recomposition.`);
  if (waist12 != null && waist12 > 28) recs.push(`Waist ${waist12.toFixed(1)}″ — keep the moderate deficit, daily steps and core work; reassess the target with your body-composition trend.`);
  if (hips0 != null && hips12 != null) {
    const d = hips12 - hips0;
    recs.push(
      d < 1
        ? `Hips changed ${d.toFixed(1)}″ — prioritise glute volume (hip thrust, RDL, split squat 12–16 hard sets/week) with more load.`
        : `Hips +${d.toFixed(1)}″ — keep glute training progressive; consider a gym for heavier hip thrusts.`,
    );
  }
  if (w0 != null && w12 != null) recs.push(`Year one weight change: ${(w12 - w0).toFixed(1)} kg (${(((w12 - w0) / w0) * 100).toFixed(1)}%).`);
  const yearFrom = programStart;
  const pc = proteinCompliance(db.foodEntries, yearFrom, today, minProtein);
  if (pc.pct != null && pc.pct < 0.7) recs.push("Protein was below target on many logged days — make protein the first habit of year two.");
  const mob = mobilityStats(db, yearFrom, today);
  recs.push(`Mobility sessions logged: ${mob.sessions}. Year two: keep daily mobility and add longer weekly flexibility work.`);
  recs.push("HRT: review year-one labs and adherence with your clinician; any regimen changes are theirs to make.");
  return recs;
}
