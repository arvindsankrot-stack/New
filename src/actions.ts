// Small shared write operations used by several screens.

import { FOODS, type FoodSeed } from "./data/foods";
import { all, remove, upsert } from "./db/store";
import type { FoodItem, Meal, Medication } from "./db/types";

export function allFoods(): FoodSeed[] {
  const custom = all("foodItems").map((f: FoodItem) => ({ ...f, tags: f.tags ?? [] }));
  return [...custom, ...FOODS];
}

export function addFood(food: FoodSeed, servings: number, meal: Meal, date: string) {
  return upsert("foodEntries", {
    date,
    food_id: food.id,
    name: food.name,
    meal,
    servings,
    kcal: Math.round(food.kcal * servings),
    protein: Math.round(food.protein * servings * 10) / 10,
    carbs: Math.round(food.carbs * servings * 10) / 10,
    fat: Math.round(food.fat * servings * 10) / 10,
    source: "database",
  });
}

export function logWeight(kg: number, date: string) {
  const existing = all("weights").find((w) => w.date === date);
  return upsert("weights", { id: existing?.id, date, kg });
}

/** Tap cycles: not logged → taken → not logged. Missed is set explicitly with a note. */
export function toggleDose(med: Medication, slot: string, date: string) {
  const log = all("medLogs").find((l) => l.medication_id === med.id && l.date === date && l.slot === slot);
  if (log?.status === "taken") remove("medLogs", log.id);
  else upsert("medLogs", { id: log?.id, date, medication_id: med.id, slot, status: "taken", taken_at: new Date().toISOString() });
}

export function markMissed(med: Medication, slot: string, date: string, note: string) {
  const log = all("medLogs").find((l) => l.medication_id === med.id && l.date === date && l.slot === slot);
  upsert("medLogs", { id: log?.id, date, medication_id: med.id, slot, status: "missed", note });
}
