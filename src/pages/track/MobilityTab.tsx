import { useState } from "react";
import { usePosition, useDB, useProfile } from "../../app-context";
import { remove, upsert } from "../../db/store";
import type { FlexArea } from "../../db/types";
import { fmtDate } from "../../domain/dates";
import { EXERCISES, FLEX_ROUTINE, PELVIC_ROUTINE } from "../../domain/exercises";
import { mobilityMinutes } from "../../domain/program";
import { Card, Check, Field, Notice, Seg, Slider, Stepper, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";

export const FLEX_AREAS: { key: FlexArea; label: string; test: string }[] = [
  { key: "hips", label: "Hip rotation", test: "90/90 — how easily both knees reach the floor" },
  { key: "hamstrings", label: "Hamstrings", test: "Standing fold — how far down your legs you reach" },
  { key: "adductors", label: "Adductors", test: "Butterfly — how close knees get to the floor" },
  { key: "hip_flexors", label: "Hip flexors", test: "Half-kneeling — how upright you stay with glute squeezed" },
  { key: "deep_squat", label: "Deep squat", test: "How long/comfortably you hold a heels-down squat" },
  { key: "overall", label: "Overall mobility", test: "General feeling of ease" },
];

export function MobilityTab() {
  const profile = useProfile();
  const [mode, setMode] = useState<"mobility" | "pelvic">("mobility");
  return (
    <>
      {profile.modules.pelvic && (
        <div style={{ marginTop: 12 }}>
          <Seg value={mode} onChange={setMode} options={[{ value: "mobility", label: "Flexibility" }, { value: "pelvic", label: "Pelvic floor" }]} />
        </div>
      )}
      <Routine kind={mode} key={mode} />
    </>
  );
}

function Routine({ kind }: { kind: "mobility" | "pelvic" }) {
  const db = useDB();
  const pos = usePosition();
  const routine = kind === "mobility" ? FLEX_ROUTINE : PELVIC_ROUTINE;
  const [done, setDone] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number | undefined>(kind === "mobility" ? mobilityMinutes(pos.month) : 10);
  const [scoring, setScoring] = useState(false);
  const last = [...db.mobility].filter((m) => m.kind === "mobility").sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const [scores, setScores] = useState<Partial<Record<FlexArea, number>>>(last?.scores ?? {});
  const [relax, setRelax] = useState(6);
  const [comfort, setComfort] = useState(7);
  const [aware, setAware] = useState(5);
  const [notes, setNotes] = useState("");
  const history = db.mobility.filter((m) => m.kind === kind).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 10);

  return (
    <>
      {kind === "mobility" ? (
        <Notice kind="info">Ease into each stretch until you feel a mild pull, then breathe. Never force range or push into pain — flexibility comes from regular, relaxed practice.</Notice>
      ) : (
        <Notice kind="info" title="Health-first pelvic floor">
          Relaxation comes before strength. Contractions are gentle (30–50%) and always followed by full release. Pain is never a goal — stop and rest if anything hurts, and see a pelvic-floor physiotherapist for ongoing symptoms.
        </Notice>
      )}
      <Card title={kind === "mobility" ? `Today's routine · ${mobilityMinutes(pos.month)} min` : "Pelvic-floor routine"}>
        {routine.map((id) => {
          const ex = EXERCISES[id];
          return (
            <Check key={id} on={done.includes(id)} onToggle={() => setDone(done.includes(id) ? done.filter((x) => x !== id) : [...done, id])} sub={ex.cue}>
              {ex.name}
            </Check>
          );
        })}
        <Field label="Minutes">
          <Stepper value={minutes} onChange={setMinutes} step={5} min={1} max={120} label="Minutes" />
        </Field>
        {kind === "mobility" ? (
          <>
            <button className="btn block ghost" onClick={() => setScoring(!scoring)}>
              {scoring ? "Hide" : "Add"} flexibility self-check (weekly is plenty)
            </button>
            {scoring &&
              FLEX_AREAS.map((a) => (
                <Slider key={a.key} label={a.label} value={scores[a.key] ?? 5} onChange={(v) => setScores({ ...scores, [a.key]: v })} min={1} max={10} left={a.test} />
              ))}
          </>
        ) : (
          <>
            <Slider label="Relaxation" value={relax} onChange={setRelax} min={1} max={10} left="tense" right="fully relaxed" />
            <Slider label="Comfort" value={comfort} onChange={setComfort} min={1} max={10} left="uncomfortable" right="comfortable" />
            <Slider label="Pelvic-floor awareness" value={aware} onChange={setAware} min={1} max={10} left="hard to feel" right="clear" />
          </>
        )}
        <Field label="Notes">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button
          className="btn primary block"
          disabled={!minutes}
          onClick={() => {
            upsert("mobility", {
              date: pos.today,
              kind,
              minutes: minutes!,
              exercises: done,
              scores: kind === "mobility" && scoring ? scores : {},
              relaxation: kind === "pelvic" ? relax : undefined,
              comfort: kind === "pelvic" ? comfort : undefined,
              awareness: kind === "pelvic" ? aware : undefined,
              notes: notes || undefined,
            });
            setDone([]);
            setNotes("");
            setScoring(false);
            toast("Session logged");
          }}
        >
          Log session
        </button>
      </Card>
      {history.length > 0 && (
        <Card title="Recent">
          {history.map((m) => (
            <div key={m.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="grow">
                <b>{fmtDate(m.date, { weekday: "short", day: "numeric", month: "short" })}</b>
                <div className="muted small num">
                  {m.minutes} min · {m.exercises.length} exercises
                  {m.scores.overall != null && ` · overall ${m.scores.overall}/10`}
                  {m.relaxation != null && ` · relax ${m.relaxation} · comfort ${m.comfort}`}
                </div>
              </div>
              <button className="iconbtn" aria-label="Delete" onClick={() => remove("mobility", m.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
