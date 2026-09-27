// HRT tracking helpers. This module records and reminds — it never prescribes,
// changes doses, or interprets results beyond "outside the range you entered".

import type { LabResult, LabSchedule, Medication, MedicationLog } from "../db/types";
import { addDays, daysBetween, weekday } from "./dates";

export const CLINICIAN_NOTE = "Discuss this result with your clinician.";

/** Scheduled dose slots for a medication on a date. */
export function slotsOn(m: Medication, date: string): string[] {
  if (!m.active || date < m.start_date || (m.end_date && date > m.end_date)) return [];
  const times = m.times.length ? m.times : ["09:00"];
  switch (m.frequency) {
    case "daily":
      return [times[0]];
    case "twice_daily":
      return times.length >= 2 ? times.slice(0, 2) : [times[0], "21:00"];
    case "weekly":
      return weekday(date) === weekday(m.start_date) ? [times[0]] : [];
    case "every_n_days": {
      const n = Math.max(1, m.every_n_days ?? 1);
      return daysBetween(m.start_date, date) % n === 0 ? [times[0]] : [];
    }
    case "as_directed":
      return [];
  }
}

export interface DoseStatus {
  med: Medication;
  slot: string;
  log?: MedicationLog;
}

export function dosesOn(meds: Medication[], logs: MedicationLog[], date: string): DoseStatus[] {
  const out: DoseStatus[] = [];
  for (const med of meds) {
    for (const slot of slotsOn(med, date)) {
      out.push({ med, slot, log: logs.find((l) => l.medication_id === med.id && l.date === date && l.slot === slot) });
    }
  }
  return out.sort((a, b) => (a.slot < b.slot ? -1 : 1));
}

/** Adherence over a window: taken / scheduled. Days before any medication started don't count. */
export function adherence(meds: Medication[], logs: MedicationLog[], to: string, days: number) {
  let scheduled = 0;
  let taken = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(to, -i);
    for (const s of dosesOn(meds, logs, d)) {
      scheduled++;
      if (s.log?.status === "taken") taken++;
    }
  }
  return { scheduled, taken, pct: scheduled ? taken / scheduled : null };
}

export type LabFlag = "in_range" | "below" | "above" | "no_range";

/** Compares only against the reference range the user typed in from their lab report. */
export function labFlag(r: LabResult): LabFlag {
  if (r.ref_low == null && r.ref_high == null) return "no_range";
  if (r.ref_low != null && r.value < r.ref_low) return "below";
  if (r.ref_high != null && r.value > r.ref_high) return "above";
  return "in_range";
}

export function labDue(s: LabSchedule, today: string) {
  if (!s.last_done) return { due: true, dueDate: today, daysUntil: 0 };
  const dueDate = addDays(s.last_done, s.interval_days);
  const daysUntil = daysBetween(today, dueDate);
  return { due: daysUntil <= 0, dueDate, daysUntil };
}

export const LAB_KINDS: { kind: LabResult["kind"]; label: string; unit: string }[] = [
  { kind: "estradiol", label: "Estradiol", unit: "pg/mL" },
  { kind: "testosterone", label: "Testosterone", unit: "ng/dL" },
  { kind: "potassium", label: "Potassium", unit: "mmol/L" },
  { kind: "creatinine", label: "Creatinine", unit: "mg/dL" },
  { kind: "egfr", label: "eGFR", unit: "mL/min/1.73m²" },
  { kind: "prolactin", label: "Prolactin", unit: "ng/mL" },
  { kind: "alt", label: "ALT (liver)", unit: "U/L" },
  { kind: "lipids", label: "LDL cholesterol", unit: "mg/dL" },
  { kind: "glucose", label: "Fasting glucose", unit: "mg/dL" },
  { kind: "hba1c", label: "HbA1c", unit: "%" },
  { kind: "bp_systolic", label: "BP systolic", unit: "mmHg" },
  { kind: "bp_diastolic", label: "BP diastolic", unit: "mmHg" },
  { kind: "other", label: "Other", unit: "" },
];
