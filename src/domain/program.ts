// The 12-month programme (extendable to 24) and the logic that turns it into
// a concrete plan for a given day.

import type { WorkoutSession } from "../db/types";
import { addDays, daysBetween, weekday } from "./dates";
import { EXERCISES } from "./exercises";

export interface Phase {
  month: number;
  title: string;
  focus: string;
  goals: string[];
  resistancePerWeek: number;
  checkpoint?: boolean;
}

export const PHASES: Phase[] = [
  {
    month: 1,
    title: "Foundation",
    focus: "Establish the daily routine",
    goals: [
      "Start clinician-supervised HRT if appropriate",
      "Log food daily and start a morning protein shake",
      "3 workouts per week (2 sets is fine to begin)",
      "Daily 10-minute mobility",
      "Baseline measurements and photos",
      "Medication and relaxation logging",
    ],
    resistancePerWeek: 3,
  },
  {
    month: 2,
    title: "Habit formation",
    focus: "Consistency and progression",
    goals: [
      "Hit the protein target most days",
      "Progress reps/load each week",
      "Gradual fat loss (0.3–0.6 kg/week)",
      "More walking",
      "Hip mobility",
      "Consistent HRT adherence",
    ],
    resistancePerWeek: 3,
  },
  {
    month: 3,
    title: "First checkpoint",
    focus: "Review everything against baseline",
    goals: [
      "Full measurements + photos at month end",
      "Review strength and mobility gains",
      "Review adherence, labs and side effects with your clinician",
    ],
    resistancePerWeek: 3,
    checkpoint: true,
  },
  {
    month: 4,
    title: "Glute development",
    focus: "Move to 4 sessions/week; progressive load",
    goals: ["Hip thrust, RDL, Bulgarian split squat, squat, step-up, abduction", "Add load when rep targets are met"],
    resistancePerWeek: 4,
  },
  {
    month: 5,
    title: "Lower-body development",
    focus: "Glute hypertrophy and waist reduction",
    goals: ["Track progressive overload", "Keep protein on target", "Keep daily mobility"],
    resistancePerWeek: 4,
  },
  {
    month: 6,
    title: "Midpoint review",
    focus: "Month 0 vs Month 6",
    goals: ["Full measurements, photos, labs and adherence review", "Plan the second half with real data"],
    resistancePerWeek: 4,
    checkpoint: true,
  },
  {
    month: 7,
    title: "Silhouette development",
    focus: "Glutes, hips, waist, posture",
    goals: ["4 resistance sessions/week", "Posture work", "Mobility"],
    resistancePerWeek: 4,
  },
  {
    month: 8,
    title: "Mobility",
    focus: "Hip rotation, hamstrings, adductors, hip flexors, deep squat",
    goals: ["Mobility to 15–20 min/day", "Keep training progressive"],
    resistancePerWeek: 4,
  },
  {
    month: 9,
    title: "Transformation checkpoint",
    focus: "Month 0 vs Month 9",
    goals: ["Waist-to-hip ratio, abdomen, glutes, posture, flexibility review"],
    resistancePerWeek: 4,
    checkpoint: true,
  },
  {
    month: 10,
    title: "Refinement",
    focus: "Muscle retention and gradual fat loss",
    goals: ["No crash dieting", "Glute development", "Mobility"],
    resistancePerWeek: 4,
  },
  {
    month: 11,
    title: "Conditioning",
    focus: "Maintain everything",
    goals: ["4 resistance sessions/week", "Cardio", "Mobility", "Nutrition", "HRT adherence", "Mental conditioning"],
    resistancePerWeek: 4,
  },
  {
    month: 12,
    title: "Final year review",
    focus: "Month 0 → 3 → 6 → 9 → 12",
    goals: ["Annual report", "Set Month 13–24 direction from actual results"],
    resistancePerWeek: 4,
    checkpoint: true,
  },
];

export function phaseFor(month: number): Phase {
  if (month <= 12) return PHASES[Math.max(0, month - 1)];
  return {
    month,
    title: month === 24 ? "Year two review" : "Year two",
    focus: "Continue from your annual report",
    goals: ["Follow the Month 13–24 recommendations in Progress → Reports"],
    resistancePerWeek: 4,
    checkpoint: month % 3 === 0,
  };
}

/** Programme position for a date. Month n starts on the same day-of-month as programme start. */
export function programPosition(start: string, today: string) {
  const day = daysBetween(start, today) + 1;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  const month = Math.max(1, months + 1);
  const monthStart = addMonths(start, month - 1);
  const nextMonthStart = addMonths(start, month);
  return {
    day: Math.max(day, 1),
    started: day >= 1,
    month,
    monthStart,
    monthEnd: addDays(nextMonthStart, -1),
    dayOfMonth: daysBetween(monthStart, today) + 1,
    isLastDayOfMonth: addDays(today, 1) === nextMonthStart,
  };
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

// ---------- Weekly templates ----------

export interface TemplateItem {
  exercise: string;
  sets: number;
  reps: [number, number];
}

export interface DayTemplate {
  id: string;
  title: string;
  kind: "resistance" | "mobility_cardio" | "cardio" | "rest";
  items: TemplateItem[];
}

const it = (exercise: string, sets: number, lo: number, hi: number): TemplateItem => ({ exercise, sets, reps: [lo, hi] });

export const TEMPLATES: Record<string, DayTemplate> = {
  foundation_a: {
    id: "foundation_a",
    title: "Foundation A — Lower + core",
    kind: "resistance",
    items: [
      it("bw_squat", 3, 8, 15),
      it("glute_bridge", 3, 10, 20),
      it("reverse_lunge", 3, 6, 12),
      it("side_leg_raise", 2, 10, 20),
      it("calf_raise", 2, 10, 20),
      it("dead_bug", 2, 6, 10),
    ],
  },
  foundation_b: {
    id: "foundation_b",
    title: "Foundation B — Upper + core",
    kind: "resistance",
    items: [
      it("incline_pushup", 3, 6, 15),
      it("row", 3, 8, 15),
      it("shoulder_press", 2, 8, 15),
      it("glute_bridge", 2, 10, 20),
      it("bird_dog", 2, 6, 10),
      it("side_plank", 2, 15, 45),
    ],
  },
  foundation_c: {
    id: "foundation_c",
    title: "Foundation C — Full body",
    kind: "resistance",
    items: [
      it("bw_squat", 3, 8, 15),
      it("backpack_rdl", 3, 8, 15),
      it("incline_pushup", 2, 6, 15),
      it("row", 2, 8, 15),
      it("side_leg_raise", 2, 10, 20),
      it("dead_bug", 2, 6, 10),
      it("side_plank", 2, 15, 45),
    ],
  },
  glutes_a: {
    id: "glutes_a",
    title: "Glutes / Legs A",
    kind: "resistance",
    items: [
      it("hip_thrust", 3, 8, 15),
      it("squat", 3, 8, 12),
      it("bss", 3, 6, 12),
      it("rdl", 3, 8, 12),
      it("hip_abduction", 3, 12, 25),
      it("calf_raise", 2, 10, 20),
    ],
  },
  upper_core: {
    id: "upper_core",
    title: "Upper body + core",
    kind: "resistance",
    items: [
      it("incline_pushup", 3, 6, 15),
      it("row", 3, 8, 15),
      it("shoulder_press", 3, 8, 12),
      it("dead_bug", 3, 6, 12),
      it("bird_dog", 2, 6, 10),
      it("side_plank", 2, 20, 60),
    ],
  },
  glutes_b: {
    id: "glutes_b",
    title: "Glutes / Legs B",
    kind: "resistance",
    items: [
      it("hip_thrust", 3, 8, 15),
      it("step_up", 3, 8, 12),
      it("bss", 3, 6, 12),
      it("rdl", 3, 8, 12),
      it("glute_bridge", 2, 12, 20),
      it("hip_abduction", 3, 12, 25),
    ],
  },
  full_core: {
    id: "full_core",
    title: "Full body + core",
    kind: "resistance",
    items: [
      it("squat", 3, 8, 12),
      it("row", 3, 8, 15),
      it("pushup", 3, 5, 12),
      it("hip_thrust", 3, 8, 15),
      it("dead_bug", 2, 6, 12),
      it("side_plank", 2, 20, 60),
      it("bird_dog", 2, 6, 10),
    ],
  },
  mobility_cardio: {
    id: "mobility_cardio",
    title: "Mobility + walk",
    kind: "mobility_cardio",
    items: [
      it("walk", 1, 20, 40),
      it("hip_flexor_stretch", 2, 30, 45),
      it("hamstring_stretch", 2, 30, 45),
      it("adductor_stretch", 2, 30, 45),
      it("figure4", 2, 30, 45),
      it("deep_squat_hold", 2, 20, 60),
      it("thoracic_rotation", 2, 6, 10),
    ],
  },
  cardio: {
    id: "cardio",
    title: "Walk / cardio + mobility",
    kind: "cardio",
    items: [it("walk", 1, 20, 45)],
  },
  rest: { id: "rest", title: "Rest or gentle walk", kind: "rest", items: [] },
};

/** weekday (0=Sun) → template id */
export function weeklySchedule(month: number): string[] {
  if (month <= 3) {
    // 3 resistance days, alternating with walks/mobility.
    return ["rest", "foundation_a", "mobility_cardio", "foundation_b", "mobility_cardio", "foundation_c", "cardio"];
  }
  return ["rest", "glutes_a", "upper_core", "mobility_cardio", "glutes_b", "full_core", "cardio"];
}

export function templateFor(month: number, iso: string): DayTemplate {
  return TEMPLATES[weeklySchedule(month)[weekday(iso)]];
}

export function plannedResistanceDays(month: number): number {
  return weeklySchedule(month).filter((t) => TEMPLATES[t].kind === "resistance").length;
}

export function mobilityMinutes(month: number): number {
  if (month <= 3) return 10;
  if (month <= 7) return 15;
  return 20;
}

/** Weekly cardio minutes target — ramps from ~10–20 min walks toward 150–210 min/week. */
export function cardioWeeklyTarget(month: number): number {
  const ramp = [70, 100, 130, 150, 160, 170, 180, 190, 200, 210, 210, 210];
  return ramp[Math.min(month, 12) - 1];
}

export function walkMinutesToday(month: number): number {
  return Math.round(cardioWeeklyTarget(month) / 6 / 5) * 5;
}

// ---------- Adaptive progression ----------

export interface Prescription {
  exercise: string;
  sets: number;
  reps: number;
  load_kg?: number;
  note?: string;
}

interface ExPerf {
  date: string;
  targets: number[];
  done: number[];
  load?: number;
  allHit: boolean;
  effort?: number;
}

function history(exercise: string, sessions: WorkoutSession[], before: string): ExPerf[] {
  return sessions
    .filter((s) => s.finished_at && s.date < before)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => {
      const sets = s.sets.filter((x) => x.exercise_id === exercise);
      if (!sets.length) return null;
      const loads = sets.map((x) => x.load_kg ?? 0);
      return {
        date: s.date,
        targets: sets.map((x) => x.target),
        done: sets.map((x) => (x.completed ? x.done : 0)),
        load: Math.max(...loads) || undefined,
        allHit: sets.every((x) => x.completed && x.done >= x.target),
        effort: s.effort,
      } as ExPerf;
    })
    .filter((x): x is ExPerf => x !== null)
    .slice(0, 3);
}

/**
 * Double progression: stay in a rep range; when every set hits the top of the
 * range at a manageable effort, add load (or, for bodyweight moves, add a set
 * then keep adding reps). Missed targets twice in a row → ease back a little.
 * Never punitive: a missed session simply repeats the last prescription.
 */
export function prescribe(item: TemplateItem, month: number, sessions: WorkoutSession[], today: string): Prescription {
  const ex = EXERCISES[item.exercise];
  const [lo, hi] = item.reps;
  const baseSets = month === 1 ? Math.min(2, item.sets) : item.sets;
  const h = history(item.exercise, sessions, today);
  if (!h.length) {
    return { exercise: item.exercise, sets: baseSets, reps: lo, note: month === 1 ? "Start easy — 2 sets is fine." : undefined };
  }
  const last = h[0];
  const lastTarget = Math.max(...last.targets);
  const sets = Math.max(baseSets, last.targets.length);
  const step = ex.unit === "sec" ? 5 : ex.unit === "min" ? 5 : 1;
  const hard = (last.effort ?? 3) >= 5;

  if (last.allHit && !hard) {
    if (lastTarget + step > hi) {
      if (ex.loadable && last.load) {
        return {
          exercise: item.exercise,
          sets,
          reps: lo,
          load_kg: round(last.load + (last.load < 10 ? 1 : 2.5)),
          note: "Top of range hit — add a little load, reps back to the bottom.",
        };
      }
      if (sets < item.sets + 1) return { exercise: item.exercise, sets: sets + 1, reps: lo, load_kg: last.load, note: "Top of range — add a set." };
      return { exercise: item.exercise, sets, reps: hi, load_kg: last.load, note: ex.loadable ? "Consider adding load (backpack/dumbbell)." : "Holding at the top of the range." };
    }
    return { exercise: item.exercise, sets, reps: lastTarget + step, load_kg: last.load, note: `+${step} from last time.` };
  }
  const missedTwice = h.length >= 2 && !h[0].allHit && !h[1].allHit;
  if (missedTwice) {
    return {
      exercise: item.exercise,
      sets,
      reps: Math.max(lo, lastTarget - step),
      load_kg: last.load && last.load > 2 ? round(last.load * 0.9) : last.load,
      note: "Eased back slightly — build up again from here.",
    };
  }
  return { exercise: item.exercise, sets, reps: Math.max(lo, lastTarget), load_kg: last.load, note: "Same as last time." };
}

function round(n: number): number {
  return Math.round(n * 2) / 2;
}

export function planFor(month: number, iso: string, sessions: WorkoutSession[]): { template: DayTemplate; prescriptions: Prescription[] } {
  const template = templateFor(month, iso);
  return { template, prescriptions: template.items.map((i) => prescribe(i, month, sessions, iso)) };
}

/** If yesterday was a resistance day and nothing was logged, and today is not a
 *  resistance day, offer yesterday's workout. No doubling-up, no guilt. */
export function missedYesterday(month: number, today: string, sessions: WorkoutSession[]): DayTemplate | null {
  const y = addDays(today, -1);
  const yt = templateFor(month, y);
  if (yt.kind !== "resistance") return null;
  if (sessions.some((s) => s.date === y && s.finished_at)) return null;
  return yt;
}
