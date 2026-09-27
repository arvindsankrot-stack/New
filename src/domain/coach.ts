// Rule-based on-device coach. Parses plain-English notes into logs and answers
// with labelled statements so facts, estimates, goals and medical topics are
// never blurred. Nothing leaves the device. An LLM backend can replace
// `interpret` later behind the same `CoachAction` interface.

import type { FoodEntry } from "../db/types";
import type { FoodSeed } from "../data/foods";

export type Label = "TRACKED FACT" | "ESTIMATE" | "GOAL" | "MEDICAL";

export interface CoachLine {
  label: Label;
  text: string;
}

export type CoachAction =
  | { type: "log_food"; entries: Omit<FoodEntry, "id" | "user_id" | "created_at" | "updated_at">[] }
  | { type: "log_weight"; kg: number }
  | { type: "log_meds_taken" }
  | { type: "missed_workout" }
  | { type: "plateau"; measure: "waist" | "weight" | "belly" | "hips" }
  | { type: "dose_question" }
  | { type: "unknown" };

const NUM_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  half: 0.5,
  couple: 2,
};

function gramsPerServing(serving: string): number | null {
  const m = serving.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return m ? Number(m[1]) : null;
}

export interface ParsedFood {
  food: FoodSeed;
  servings: number;
  text: string;
}

export function parseFoods(text: string, foods: FoodSeed[]): ParsedFood[] {
  const lower = text.toLowerCase().replace(/[.;]/g, ",");
  const parts = lower
    .split(/,|\band\b|\bwith\b|\bplus\b|\+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Longest tags first so "palak paneer" beats "paneer".
  const index = foods
    .flatMap((f) => [f.name.toLowerCase(), ...f.tags].map((t) => ({ t, f })))
    .sort((a, b) => b.t.length - a.t.length);
  const out: ParsedFood[] = [];
  for (const part of parts) {
    const hit = index.find(({ t }) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(part));
    if (!hit) continue;
    let servings = 1;
    const grams = part.match(/(\d+(?:\.\d+)?)\s*(g|gm|gms|grams?|ml)\b/);
    const count = part.match(/(\d+(?:\.\d+)?)(?!\s*(?:g|gm|gms|grams?|ml)\b)/);
    const word = part.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join("|")})\\b`));
    const per = gramsPerServing(hit.f.serving);
    if (grams && per) servings = Number(grams[1]) / per;
    else if (count) servings = Number(count[1]);
    else if (word) servings = NUM_WORDS[word[1]];
    if (/\bscoops?\b/.test(part) && hit.f.id === "whey" && count) servings = Number(count[1]);
    out.push({ food: hit.f, servings: Math.round(servings * 100) / 100, text: part });
  }
  return out;
}

export function interpret(text: string, foods: FoodSeed[], date: string): CoachAction {
  const t = text.toLowerCase();
  if (/\b(increase|decrease|raise|lower|change|double|up|more)\b.*\b(dose|estrogen|estradiol|e2|hrt|spiro|cypro|progesterone)\b/.test(t) || /\bshould i (take|stop|start)\b/.test(t)) {
    return { type: "dose_question" };
  }
  if (/\b(took|taken|take|had)\b.*\b(hrt|meds?|medication|estradiol|estrogen|e2|pills?|antiandrogen|spiro|progesterone)\b/.test(t)) {
    return { type: "log_meds_taken" };
  }
  if (/\bmiss(ed)?\b.*\b(workout|training|session|gym|exercise)\b|\bskipped\b.*\b(workout|training)\b/.test(t)) {
    return { type: "missed_workout" };
  }
  const plateau = t.match(/\b(waist|weight|belly|hips?)\b.*\b(hasn'?t|has not|not|no|isn'?t|stuck|same|plateau)/);
  if (plateau) {
    const m = plateau[1].startsWith("hip") ? "hips" : (plateau[1] as "waist" | "weight" | "belly");
    return { type: "plateau", measure: m };
  }
  const w = t.match(/\b(?:weigh(?:ed|t)?|weight is|scale)\D{0,12}(\d{2,3}(?:\.\d)?)\s*(kg)?/);
  if (w) return { type: "log_weight", kg: Number(w[1]) };
  const parsed = parseFoods(text, foods);
  if (parsed.length) {
    const meal = /\b(morning|breakfast)\b/.test(t) ? "morning" : /\b(lunch|afternoon)\b/.test(t) ? "midday" : /\bsnack\b/.test(t) ? "snack" : "evening";
    return {
      type: "log_food",
      entries: parsed.map((p) => ({
        date,
        food_id: p.food.id,
        name: p.food.name,
        meal,
        servings: p.servings,
        kcal: Math.round(p.food.kcal * p.servings),
        protein: round1(p.food.protein * p.servings),
        carbs: round1(p.food.carbs * p.servings),
        fat: round1(p.food.fat * p.servings),
        source: "coach_estimate" as const,
      })),
    };
  }
  return { type: "unknown" };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
