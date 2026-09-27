import { useState } from "react";
import { useApp, useDB, useToday } from "../app-context";
import { all, upsert } from "../db/store";
import { parseHealthText, stepWords, type HealthValues } from "../domain/activity";
import { Field, Sheet, Stepper, toast } from "../ui/components";

export function saveActivity(date: string, v: HealthValues, source: "apple_health" | "manual") {
  const existing = all("activity").find((a) => a.date === date);
  return upsert("activity", { id: existing?.id, date, ...existing, ...v, source });
}

async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Today's movement from Apple Health (Zepp watch → Health → Shortcut → here). */
export function ActivityCard({ cute = true }: { cute?: boolean }) {
  const db = useDB();
  const today = useToday();
  const { go } = useApp();
  const a = db.activity.find((x) => x.date === today);
  const [open, setOpen] = useState(false);

  const importNow = async () => {
    const text = await readClipboard();
    const v = text ? parseHealthText(text) : null;
    if (!v) {
      setOpen(true);
      return;
    }
    saveActivity(today, v, "apple_health");
    try {
      await navigator.clipboard.writeText("");
    } catch {
      /* not critical */
    }
    toast("Imported from Apple Health 🍎");
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{cute ? "Today's movement 🚶‍♀️" : "Activity (Apple Health)"}</h2>
        {a && <span className="muted tiny">{a.source === "apple_health" ? "from Health" : "typed in"}</span>}
      </div>
      {a ? (
        cute ? (
          <>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{stepWords(a.steps)}</p>
            <div className="chips" style={{ marginTop: 6 }}>
              {a.steps != null && <span className="badge accent">👣 {a.steps.toLocaleString()} steps</span>}
              {a.active_kcal != null && <span className="badge accent">🔥 {a.active_kcal} kcal burned</span>}
              {a.walk_km != null && <span className="badge accent">📍 {a.walk_km} km</span>}
              {a.exercise_min != null && <span className="badge accent">⏱️ {a.exercise_min} min active</span>}
            </div>
          </>
        ) : (
          <div className="grid2">
            <div className="stat"><div className="label">Steps</div><div className="value">{a.steps?.toLocaleString() ?? "—"}</div></div>
            <div className="stat"><div className="label">Active kcal</div><div className="value">{a.active_kcal ?? "—"}</div></div>
            <div className="stat"><div className="label">Walk/run km</div><div className="value">{a.walk_km ?? "—"}</div></div>
            <div className="stat"><div className="label">Exercise min</div><div className="value">{a.exercise_min ?? "—"}</div></div>
          </div>
        )
      ) : (
        <p className="muted small">Run your "Coach sync" Shortcut, then tap below.</p>
      )}
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={importNow}>
        🍎 {a ? "Update from Apple Health" : "Import from Apple Health"}
      </button>
      <div className="spread" style={{ marginTop: 6 }}>
        <button className="btn sm ghost" onClick={() => go("more", "health")}>How to set up</button>
        <button className="btn sm ghost" onClick={() => setOpen(true)}>Type it in</button>
      </div>
      {open && <ActivitySheet onClose={() => setOpen(false)} date={today} />}
    </section>
  );
}

function ActivitySheet({ onClose, date }: { onClose: () => void; date: string }) {
  const db = useDB();
  const cur = db.activity.find((x) => x.date === date);
  const [paste, setPaste] = useState("");
  const [v, setV] = useState<HealthValues>({ steps: cur?.steps, active_kcal: cur?.active_kcal, walk_km: cur?.walk_km, exercise_min: cur?.exercise_min });
  const parsed = paste ? parseHealthText(paste) : null;
  return (
    <Sheet open onClose={onClose} title="Today's activity">
      <p className="small muted">Nothing from the Shortcut was found on your clipboard. Paste its text below, or just type the numbers from your watch.</p>
      <Field label="Paste Shortcut text (optional)">
        <textarea className="input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="TC steps=… kcal=… km=… min=…" />
      </Field>
      {paste && !parsed && <p className="small" style={{ color: "var(--danger)" }}>Couldn't read that. Check the Shortcut's Text action.</p>}
      {!parsed && (
        <div className="grid2">
          <Field label="Steps">
            <Stepper value={v.steps} onChange={(n) => setV({ ...v, steps: n })} step={500} label="Steps" />
          </Field>
          <Field label="Calories burned">
            <Stepper value={v.active_kcal} onChange={(n) => setV({ ...v, active_kcal: n })} step={25} label="Active calories" />
          </Field>
          <Field label="Distance (km)">
            <Stepper value={v.walk_km} onChange={(n) => setV({ ...v, walk_km: n })} step={0.5} digits={1} label="Distance" />
          </Field>
          <Field label="Active minutes">
            <Stepper value={v.exercise_min} onChange={(n) => setV({ ...v, exercise_min: n })} step={5} label="Active minutes" />
          </Field>
        </div>
      )}
      <button
        className="btn primary block"
        disabled={!parsed && Object.values(v).every((x) => x == null)}
        onClick={() => {
          saveActivity(date, parsed ?? v, parsed ? "apple_health" : "manual");
          toast("Saved 💕");
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}
