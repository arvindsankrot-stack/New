import { createContext, useContext, useEffect, useState } from "react";
import { all, useVersion } from "./db/store";
import type { Profile, Tables } from "./db/types";
import { todayISO } from "./domain/dates";
import { programPosition } from "./domain/program";
import type { DB } from "./domain/reports";

export type Tab = "home" | "track" | "workout" | "hrt" | "progress" | "more";

export interface Route {
  tab: Tab;
  sub?: string;
}

export interface AppCtx {
  route: Route;
  go: (tab: Tab, sub?: string) => void;
  lock: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);

export function useApp() {
  return useContext(Ctx);
}

/** Today's date, refreshed when the day rolls over or the app returns to the foreground. */
export function useToday(): string {
  const [t, setT] = useState(todayISO());
  useEffect(() => {
    const tick = () => setT(todayISO());
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return t;
}

export function useProfile(): Profile {
  useVersion();
  return all("profile")[0];
}

/** Snapshot of every table; re-renders on any change. */
export function useDB(): DB {
  useVersion();
  const out = {} as Record<string, unknown>;
  for (const t of Object.keys(TABLE_KEYS)) out[t] = all(t as keyof Tables);
  return out as DB;
}

const TABLE_KEYS: Record<keyof Tables, true> = {
  profile: true,
  measurements: true,
  weights: true,
  goals: true,
  foodItems: true,
  foodEntries: true,
  workouts: true,
  medications: true,
  medLogs: true,
  labs: true,
  labSchedules: true,
  feminization: true,
  mobility: true,
  hypno: true,
  chastity: true,
  checkins: true,
  photos: true,
  notifications: true,
  coach: true,
  activity: true,
};

export function usePosition() {
  const p = useProfile();
  const today = useToday();
  return { today, ...programPosition(p.program_start, today) };
}
