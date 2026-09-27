// Local reminders. Fired while the app is open or backgrounded-but-alive (the
// page checks every 30s). Notification text is deliberately generic so nothing
// sensitive shows on the lock screen. True background push on iOS requires a
// push server (Phase 3); see README.

import { all } from "./db/store";
import { todayISO } from "./domain/dates";
import { slotsOn } from "./domain/hrt";
import { programPosition, templateFor } from "./domain/program";
import { toast } from "./ui/components";

const FIRED_KEY = "tc-fired";

function fired(): Record<string, true> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || "{}");
    return typeof raw === "object" && raw ? raw : {};
  } catch {
    return {};
  }
}

function markFired(id: string) {
  try {
    const today = todayISO();
    const f = Object.fromEntries(Object.entries(fired()).filter(([k]) => k.startsWith(today)));
    f[id] = true;
    localStorage.setItem(FIRED_KEY, JSON.stringify(f));
  } catch {
    /* storage unavailable — reminder may repeat, harmless */
  }
}

async function show(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) {
        await reg.showNotification(title, { body, icon: "icon-192.png", tag: title });
        return;
      }
      new Notification(title, { body });
      return;
    } catch {
      /* fall through to toast */
    }
  }
  toast(body);
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function checkReminders(now = new Date()) {
  const profile = all("profile")[0];
  if (!profile) return;
  const today = todayISO(now);
  const time = hhmm(now);
  const done = fired();
  const pos = programPosition(profile.program_start, today);
  const due = (id: string, at: string) => at && at <= time && !done[`${today}:${id}`];

  for (const n of all("notifications")) {
    if (!n.enabled || n.kind === "medication") continue;
    if (n.kind === "weekly" && new Date().getDay() !== 0) continue;
    if (n.kind === "monthly" && !pos.isLastDayOfMonth) continue;
    if (n.kind === "workout" && templateFor(pos.month, today).kind === "rest") continue;
    if (!due(n.kind, n.time)) continue;
    markFired(`${today}:${n.kind}`);
    const msg = n.kind === "workout" ? `Today's workout: ${templateFor(pos.month, today).title}.` : n.message;
    void show("Coach", msg);
  }

  const medPref = all("notifications").find((n) => n.kind === "medication");
  if (medPref?.enabled) {
    const logs = all("medLogs");
    for (const m of all("medications")) {
      for (const slot of slotsOn(m, today)) {
        const id = `med:${m.id}:${slot}`;
        if (!due(id, slot)) continue;
        if (logs.some((l) => l.medication_id === m.id && l.date === today && l.slot === slot)) continue;
        markFired(`${today}:${id}`);
        void show("Coach", "Medication check: a prescribed dose is scheduled now.");
      }
    }
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}
