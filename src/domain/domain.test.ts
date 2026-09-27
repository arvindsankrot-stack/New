import { describe, expect, it } from "vitest";
import { FOODS } from "../data/foods";
import type { Medication, MedicationLog, Profile, WorkoutSession } from "../db/types";
import { interpret, parseFoods } from "./coach";
import { addDays, weekStart, weekday } from "./dates";
import { adherence, labFlag, slotsOn } from "./hrt";
import { bmr, calorieAdvice, calorieTarget, weightTrend } from "./nutrition";
import { addMonths, missedYesterday, prescribe, programPosition, TEMPLATES, templateFor } from "./program";
import { chastityAlert } from "./safety";

const base = { id: "x", user_id: "u", date: "2026-01-01", created_at: "", updated_at: "" };

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("finds Monday week start", () => {
    expect(weekday("2026-09-27")).toBe(0); // Sunday
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });
});

describe("programme position", () => {
  it("day 1 is month 1", () => {
    const p = programPosition("2026-10-01", "2026-10-01");
    expect(p.day).toBe(1);
    expect(p.month).toBe(1);
  });
  it("day 71 is month 3", () => {
    const p = programPosition("2026-10-01", addDays("2026-10-01", 70));
    expect(p.day).toBe(71);
    expect(p.month).toBe(3);
  });
  it("detects last day of month", () => {
    expect(programPosition("2026-10-01", "2026-10-31").isLastDayOfMonth).toBe(true);
    expect(programPosition("2026-10-01", "2026-10-30").isLastDayOfMonth).toBe(false);
  });
  it("clamps month end dates", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("uses 3 resistance days early and 4 from month 4", () => {
    const count = (m: number) =>
      [0, 1, 2, 3, 4, 5, 6].filter((i) => templateFor(m, addDays("2026-09-27", i)).kind === "resistance").length;
    expect(count(1)).toBe(3);
    expect(count(4)).toBe(4);
  });
});

function session(date: string, ex: string, target: number, done: number, load?: number, effort = 3): WorkoutSession {
  return {
    ...base,
    id: date,
    date,
    template: "glutes_a",
    title: "",
    started_at: date,
    finished_at: date,
    effort,
    sets: [1, 2, 3].map((n) => ({ exercise_id: ex, set_no: n, target, done, load_kg: load, completed: true })),
  };
}

describe("adaptive progression", () => {
  const item = TEMPLATES.glutes_a.items[0]; // hip thrust 8–15
  it("starts at the bottom of the range", () => {
    expect(prescribe(item, 4, [], "2026-05-01").reps).toBe(8);
  });
  it("month 1 starts with at most 2 sets", () => {
    expect(prescribe(item, 1, [], "2026-05-01").sets).toBe(2);
  });
  it("adds a rep when all sets hit", () => {
    expect(prescribe(item, 4, [session("2026-04-28", "hip_thrust", 10, 10, 10)], "2026-05-01").reps).toBe(11);
  });
  it("adds load at top of range", () => {
    const p = prescribe(item, 4, [session("2026-04-28", "hip_thrust", 15, 15, 10)], "2026-05-01");
    expect(p.reps).toBe(8);
    expect(p.load_kg).toBe(12.5);
  });
  it("eases back after two misses", () => {
    const h = [session("2026-04-28", "hip_thrust", 12, 9, 20), session("2026-04-24", "hip_thrust", 12, 10, 20)];
    const p = prescribe(item, 4, h, "2026-05-01");
    expect(p.reps).toBe(11);
    expect(p.load_kg).toBe(18);
  });
  it("offers yesterday's missed workout, no doubling", () => {
    // 2026-09-28 is Monday → foundation_a in month 1
    expect(missedYesterday(1, "2026-09-29", [])?.id).toBe("foundation_a");
    expect(missedYesterday(1, "2026-09-29", [session("2026-09-28", "bw_squat", 8, 8)])).toBeNull();
  });
});

describe("nutrition", () => {
  const profile: Profile = {
    ...base,
    name: "",
    birth_year: 1986,
    height_cm: 173,
    timezone: "Asia/Kolkata",
    program_start: "2026-09-27",
    calc_basis: "average",
    activity: "light",
    calorie_target_override: null,
    protein_target: { min: 120, max: 135 },
    target_loss_kg_per_week: 0.45,
    units: "in",
    theme: "system",
    auto_lock_minutes: 5,
    modules: { hypno: true, chastity: true, pelvic: true, feminization: true },
    hypno_daily_goal_min: 15,
    cardio_weekly_goal_min: 150,
  };
  it("computes Mifflin-St Jeor", () => {
    expect(bmr(78, 173, 40, "male")).toBeCloseTo(1666.25, 1);
  });
  it("target is a gentle deficit and never below BMR", () => {
    const t = calorieTarget(profile, 78, "2026-09-27");
    expect(t.target).toBeGreaterThanOrEqual(t.bmr);
    expect(t.target).toBeLessThan(t.tdee);
    expect(t.target % 50).toBe(0);
  });
  it("respects override", () => {
    expect(calorieTarget({ ...profile, calorie_target_override: 1800 }, 78, "2026-09-27").target).toBe(1800);
  });
  it("computes a weekly trend", () => {
    const pts = Array.from({ length: 15 }, (_, i) => ({ date: addDays("2026-09-01", i), kg: 78 - i * 0.07 }));
    expect(weightTrend(pts, "2026-09-15")!.kgPerWeek).toBeCloseTo(-0.49, 2);
  });
  it("does not force weight loss when waist is improving", () => {
    const a = calorieAdvice({ trendKgPerWeek: 0, currentTarget: 1900, avgLoggedKcal: 1880, loggedDays: 20, waistChange28d: -0.5, floor: 1500 });
    expect(a.kind).toBe("recomp");
    expect(a.suggestedTarget).toBeUndefined();
  });
  it("suggests eating more when losing too fast", () => {
    const a = calorieAdvice({ trendKgPerWeek: -1, currentTarget: 1700, avgLoggedKcal: 1700, loggedDays: 20, waistChange28d: null, floor: 1500 });
    expect(a.kind).toBe("too_fast");
    expect(a.suggestedTarget).toBe(1850);
  });
  it("won't go below floor", () => {
    const a = calorieAdvice({ trendKgPerWeek: 0, currentTarget: 1500, avgLoggedKcal: 1500, loggedDays: 20, waistChange28d: 0, floor: 1500 });
    expect(a.suggestedTarget).toBeUndefined();
  });
});

describe("coach", () => {
  it("parses the example sentence", () => {
    const p = parseFoods("Today I ate 3 chapati, 200g paneer and had one whey shake.", FOODS);
    expect(p.map((x) => [x.food.id, x.servings])).toEqual([
      ["chapati", 3],
      ["paneer_100", 2],
      ["whey", 1],
    ]);
  });
  it("routes dose questions to the clinician", () => {
    expect(interpret("should I increase my estradiol dose?", FOODS, "2026-09-27").type).toBe("dose_question");
  });
  it("records medication without changes", () => {
    expect(interpret("I took my prescribed HRT", FOODS, "2026-09-27").type).toBe("log_meds_taken");
  });
  it("recognises a waist plateau", () => {
    expect(interpret("My waist hasn't changed for four weeks", FOODS, "2026-09-27")).toEqual({ type: "plateau", measure: "waist" });
  });
  it("recognises missed workouts", () => {
    expect(interpret("I missed yesterday's workout", FOODS, "2026-09-27").type).toBe("missed_workout");
  });
});

describe("hrt", () => {
  const med: Medication = {
    ...base,
    id: "m1",
    name: "Estradiol",
    category: "estradiol",
    dose: 2,
    unit: "mg",
    route: "oral",
    times: ["08:00", "20:00"],
    frequency: "twice_daily",
    start_date: "2026-09-20",
    clinician: "Dr",
    active: true,
  };
  it("schedules slots", () => {
    expect(slotsOn(med, "2026-09-27")).toEqual(["08:00", "20:00"]);
    expect(slotsOn(med, "2026-09-19")).toEqual([]);
    expect(slotsOn({ ...med, frequency: "weekly" }, "2026-09-27")).toEqual(["08:00"]);
    expect(slotsOn({ ...med, frequency: "weekly" }, "2026-09-26")).toEqual([]);
  });
  it("computes adherence", () => {
    const log = (date: string, slot: string): MedicationLog => ({ ...base, id: date + slot, date, medication_id: "m1", slot, status: "taken" });
    const a = adherence([med], [log("2026-09-27", "08:00"), log("2026-09-26", "08:00"), log("2026-09-26", "20:00")], "2026-09-27", 2);
    expect(a).toEqual({ scheduled: 4, taken: 3, pct: 0.75 });
  });
  it("flags only against user-entered ranges", () => {
    const r = { ...base, kind: "potassium" as const, label: "K", value: 5.4, unit: "mmol/L" };
    expect(labFlag(r)).toBe("no_range");
    expect(labFlag({ ...r, ref_low: 3.5, ref_high: 5.1 })).toBe("above");
  });
});

describe("chastity safety", () => {
  const ok = { pain: false, numbness: false, discoloration: false, swelling: false, skin_injury: false, urination_difficulty: false, irritation: false, comfort: 8 };
  it("no alert when fine", () => expect(chastityAlert(ok)).toBeNull());
  it("stop on any red flag", () => {
    for (const k of ["pain", "numbness", "discoloration", "swelling", "skin_injury", "urination_difficulty"] as const) {
      expect(chastityAlert({ ...ok, [k]: true })?.level).toBe("stop");
    }
  });
  it("check on irritation", () => expect(chastityAlert({ ...ok, irritation: true })?.level).toBe("check"));
});

import { glowWords } from "../pages/SimpleHome";
describe("glow words", () => {
  it("describes progress without numbers", () => {
    const g = { min: 26, max: 28 };
    expect(glowWords("waist", 32, 32, g).pos).toBe(0);
    const half = glowWords("waist", 32, 30, g);
    expect(half.pos).toBeCloseTo(0.5);
    expect(half.text).not.toMatch(/\d/);
    expect(glowWords("waist", 32, 27.5, g).pos).toBe(1);
    expect(glowWords("hips", 39.5, 40.5, { min: 41, max: 43 }).text).toContain("fuller");
    expect(glowWords("waist", 32, 32.5, g).pos).toBe(0);
  });
});

import { parseHealthText } from "./activity";
describe("health import", () => {
  it("parses shortcut text with units and separators", () => {
    expect(parseHealthText("TC steps=8,123 count kcal=412.5 kcal km=5.61 km min=34 min")).toEqual({ steps: 8123, active_kcal: 413, walk_km: 5.61, exercise_min: 34 });
  });
  it("handles miles, missing values and junk", () => {
    expect(parseHealthText("TC steps=5000 km=2 mi")).toEqual({ steps: 5000, walk_km: 3.22 });
    expect(parseHealthText("hello")).toBeNull();
  });
});
