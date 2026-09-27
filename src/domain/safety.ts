import type { ChastitySession } from "../db/types";

export interface SafetyAlert {
  level: "stop" | "check";
  title: string;
  body: string;
  reasons: string[];
}

const RED_FLAGS: [keyof ChastitySession, string][] = [
  ["pain", "pain"],
  ["numbness", "numbness"],
  ["discoloration", "discoloration"],
  ["swelling", "swelling"],
  ["skin_injury", "skin injury"],
  ["urination_difficulty", "difficulty urinating"],
];

/** Any red flag → remove and check now. Never suggests continuing through injury. */
export function chastityAlert(s: Pick<ChastitySession, "pain" | "numbness" | "discoloration" | "swelling" | "skin_injury" | "urination_difficulty" | "irritation" | "comfort">): SafetyAlert | null {
  const reasons = RED_FLAGS.filter(([k]) => (s as Record<string, unknown>)[k]).map(([, l]) => l);
  if (reasons.length) {
    return {
      level: "stop",
      title: "Remove the device now and check",
      body:
        "You reported " +
        reasons.join(", ") +
        ". Remove the device and check the area. If discolouration, numbness, swelling or difficulty urinating doesn't resolve promptly after removal, or there's broken skin, seek medical care. Do not resume until everything is fully normal.",
      reasons,
    };
  }
  if (s.irritation || (s.comfort != null && s.comfort <= 3)) {
    return {
      level: "check",
      title: "Take a break and check your skin",
      body: "Irritation or low comfort is a signal to remove, clean, dry and let the skin recover. Check fit before trying again.",
      reasons: s.irritation ? ["irritation"] : ["low comfort"],
    };
  }
  return null;
}

export function durationHours(s: ChastitySession, now = new Date()): number {
  const end = s.end ? new Date(s.end) : now;
  return Math.max(0, (end.getTime() - new Date(s.start).getTime()) / 3_600_000);
}
