// Parses the text an iOS Shortcut copies from Apple Health, e.g.
//   "TC steps=8,123 count kcal=412.5 kcal km=5.61 km min=34 min"
// Health values arrive with thousands separators and units, and distance may
// be in miles depending on region, so parsing is deliberately lenient.

export interface HealthValues {
  steps?: number;
  active_kcal?: number;
  walk_km?: number;
  exercise_min?: number;
}

function num(raw: string): number | undefined {
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : undefined;
}

export function parseHealthText(text: string): HealthValues | null {
  const t = text.toLowerCase();
  const grab = (key: string) => {
    const m = t.match(new RegExp(`\\b${key}\\s*[=:]\\s*([\\d.,]+)\\s*([a-z]*)`));
    return m ? { value: num(m[1]), unit: m[2] } : undefined;
  };
  const out: HealthValues = {};
  const steps = grab("steps");
  if (steps?.value != null) out.steps = Math.round(steps.value);
  const kcal = grab("kcal");
  if (kcal?.value != null) out.active_kcal = Math.round(kcal.unit.startsWith("kj") ? kcal.value / 4.184 : kcal.value);
  const km = grab("km");
  if (km?.value != null) out.walk_km = Math.round((km.unit.startsWith("mi") ? km.value * 1.609 : km.unit === "m" ? km.value / 1000 : km.value) * 100) / 100;
  const min = grab("min");
  if (min?.value != null) out.exercise_min = Math.round(min.unit.startsWith("h") ? min.value * 60 : min.value);
  return Object.keys(out).length ? out : null;
}

/** Friendly words for step counts (the home screen avoids raw numbers). */
export function stepWords(steps?: number): string {
  if (steps == null) return "No steps imported yet";
  if (steps >= 10000) return "Superstar walker today! 🌟";
  if (steps >= 7000) return "Lovely and active 💕";
  if (steps >= 4000) return "A nice amount of walking";
  if (steps >= 1500) return "A gentle start — a short walk would be lovely";
  return "Resting so far — maybe a little stroll?";
}
