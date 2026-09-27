import { upsert, upsertMany } from "./db/store";
import type { NotificationPref, Profile } from "./db/types";
import { BASELINE, DEFAULT_GOALS } from "./domain/body";

export const DEFAULT_NOTIFICATIONS: Pick<NotificationPref, "kind" | "time" | "message" | "enabled">[] = [
  { kind: "morning", time: "07:30", enabled: true, message: "Good morning — log your weight if today is a measurement day and complete your prescribed medication check." },
  { kind: "medication", time: "", enabled: true, message: "Medication check: your prescribed dose is scheduled now." },
  { kind: "workout", time: "18:00", enabled: true, message: "Today's workout is ready." },
  { kind: "evening", time: "21:00", enabled: true, message: "Log today's food and check your protein." },
  { kind: "night", time: "22:15", enabled: true, message: "Your scheduled relaxation/hypno session is ready." },
  { kind: "weekly", time: "10:00", enabled: true, message: "Weekly transformation review." },
  { kind: "monthly", time: "09:00", enabled: true, message: "Monthly measurements and progress photos." },
];

export interface SetupInput {
  name: string;
  birth_year: number;
  height_cm: number;
  weight: number;
  program_start: string;
  modules: Profile["modules"];
}

export function seedNewAccount(input: SetupInput) {
  upsert("profile", {
    id: "profile",
    date: input.program_start,
    name: input.name,
    birth_year: input.birth_year,
    height_cm: input.height_cm,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    program_start: input.program_start,
    calc_basis: "average",
    activity: "light",
    calorie_target_override: null,
    protein_target: { min: 120, max: 135 },
    target_loss_kg_per_week: 0.45,
    units: "in",
    theme: "system",
    auto_lock_minutes: 5,
    modules: input.modules,
    hypno_daily_goal_min: 15,
    cardio_weekly_goal_min: 150,
  });
  upsert("measurements", {
    date: input.program_start,
    ...BASELINE,
    weight: input.weight,
    is_baseline: true,
    notes: "Baseline (Month 0). Approximate starting values — edit if you re-measure.",
  });
  upsertMany(
    "goals",
    DEFAULT_GOALS.map((g) => ({ key: g.key, range: { min: g.min, max: g.max }, note: g.note, date: input.program_start })),
  );
  upsertMany("notifications", DEFAULT_NOTIFICATIONS.map((n) => ({ ...n, date: input.program_start })));
}
