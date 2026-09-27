import { useMemo, useState } from "react";
import { useApp, useDB, usePosition } from "../app-context";
import { remove, upsert } from "../db/store";
import type { ExerciseSet, WorkoutSession } from "../db/types";
import { addDays, fmtDate, weekStart, WEEKDAYS } from "../domain/dates";
import { EXERCISES } from "../domain/exercises";
import { cardioWeeklyTarget, phaseFor, planFor, prescribe, TEMPLATES, templateFor, walkMinutesToday } from "../domain/program";
import { cardioMinutes } from "../domain/reports";
import { Card, Chips, Empty, Field, Notice, PageHead, Progress, Slider, Stepper, toast } from "../ui/components";
import { Icon } from "../ui/icons";
import { ActivityCard } from "./ActivityCard";

export function Workout({ sub }: { sub?: string }) {
  if (sub?.startsWith("start")) return <Session templateId={sub.split(":")[1]} />;
  return <Overview />;
}

function Overview() {
  const db = useDB();
  const pos = usePosition();
  const { go } = useApp();
  const plan = planFor(pos.month, pos.today, db.workouts);
  const ws = weekStart(pos.today);
  const cardio = cardioMinutes(db, ws, addDays(ws, 6));
  const cardioGoal = cardioWeeklyTarget(pos.month);
  const [cardioMin, setCardioMin] = useState<number | undefined>(walkMinutesToday(pos.month));
  const [cardioType, setCardioType] = useState("walking");
  const history = [...db.workouts].filter((w) => w.finished_at).sort((a, b) => (a.date < b.date ? 1 : -1));
  const phase = phaseFor(pos.month);

  return (
    <>
      <PageHead eyebrow={`Month ${pos.month} · ${phase.title}`} title="Workout" sub={`${phase.resistancePerWeek} resistance sessions per week. Reps and load adapt to what you log.`} />
      <Card title={`Today · ${plan.template.title}`}>
        {plan.template.kind === "rest" ? (
          <p className="muted">Rest or a gentle walk. Recovery is part of the programme.</p>
        ) : (
          <>
            {plan.prescriptions.map((p) => {
              const ex = EXERCISES[p.exercise];
              return (
                <div key={p.exercise} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <div className="spread">
                    <b>{ex.name}</b>
                    <span className="num">
                      {ex.id === "walk" ? `${walkMinutesToday(pos.month)} min` : `${p.sets} × ${p.reps}${ex.unit === "sec" ? " s" : ""}`}
                      {p.load_kg ? ` · ${p.load_kg} kg` : ""}
                    </span>
                  </div>
                  {p.note && <div className="muted small">{p.note}</div>}
                </div>
              );
            })}
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => go("workout", "start")}>
              <Icon name="play" size={18} /> Start workout
            </button>
          </>
        )}
      </Card>

      <Card title="Cardio this week">
        <div className="spread small">
          <span>{cardio} min</span>
          <span className="muted">goal {cardioGoal} min (ramping toward 150–210)</span>
        </div>
        <Progress value={cardio} max={cardioGoal} good={cardio >= cardioGoal} />
        <div className="row" style={{ marginTop: 12 }}>
          <div className="grow">
            <Stepper value={cardioMin} onChange={setCardioMin} step={5} min={1} max={300} label="Cardio minutes" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Chips value={cardioType} onChange={(v) => setCardioType(v as string)} options={["walking", "incline walk", "cycling", "treadmill", "easy cardio"].map((v) => ({ value: v, label: v }))} />
        </div>
        <button
          className="btn block"
          style={{ marginTop: 10 }}
          disabled={!cardioMin}
          onClick={() => {
            upsert("workouts", { date: pos.today, template: "cardio", title: `Cardio · ${cardioType}`, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), sets: [], cardio_minutes: cardioMin, cardio_type: cardioType });
            toast(`${cardioMin} min logged`);
          }}
        >
          <Icon name="walk" size={18} /> Log {cardioMin ?? 0} min
        </button>
      </Card>

      <ActivityCard cute={false} />

      <Card title="This week">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(ws, i);
          const t = templateFor(pos.month, d);
          const done = db.workouts.some((w) => w.date === d && w.finished_at && (w.template === t.id || TEMPLATES[w.template]?.kind === "resistance"));
          return (
            <div key={d} className="spread" style={{ padding: "8px 0", borderTop: i ? "1px solid var(--border)" : undefined, fontWeight: d === pos.today ? 700 : 400 }}>
              <span>
                {WEEKDAYS[(i + 1) % 7].slice(0, 3)} <span className="muted small">{fmtDate(d)}</span>
              </span>
              <span className="row small">
                {t.title}
                {done && <span className="badge good">done</span>}
              </span>
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>Months 1–3: three foundation sessions. From month 4: Glutes A · Upper · Mobility · Glutes B · Full body.</p>
      </Card>

      <Card title="History">
        {history.length === 0 && <Empty>Completed sessions appear here.</Empty>}
        {history.slice(0, 15).map((w) => {
          const sets = w.sets.filter((s) => s.completed).length;
          return (
            <div key={w.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="grow">
                <b>{w.title}</b>
                <div className="muted small num">
                  {fmtDate(w.date, { weekday: "short", day: "numeric", month: "short" })}
                  {sets ? ` · ${sets} sets` : ""}
                  {w.cardio_minutes ? ` · ${w.cardio_minutes} min` : ""}
                  {w.effort ? ` · effort ${w.effort}/5` : ""}
                </div>
              </div>
              <button className="iconbtn" aria-label="Delete session" onClick={() => confirm("Delete this session?") && remove("workouts", w.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          );
        })}
      </Card>

      <Card title="Exercise guide">
        {Object.values(EXERCISES)
          .filter((e) => e.category !== "pelvic")
          .map((e) => (
            <details key={e.id} style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 32, display: "flex", alignItems: "center" }}>{e.name}</summary>
              <p className="small muted">{e.cue}</p>
            </details>
          ))}
      </Card>
    </>
  );
}

function Session({ templateId }: { templateId?: string }) {
  const db = useDB();
  const pos = usePosition();
  const { go } = useApp();
  const template = templateId ? TEMPLATES[templateId] : templateFor(pos.month, pos.today);
  const existing = db.workouts.find((w) => w.date === pos.today && w.template === template.id && !w.finished_at);

  const initial = useMemo<ExerciseSet[]>(() => {
    if (existing) return existing.sets;
    return template.items
      .filter((i) => EXERCISES[i.exercise].category !== "cardio")
      .flatMap((i) => {
        const p = prescribe(i, pos.month, db.workouts, pos.today);
        return Array.from({ length: p.sets }, (_, n) => ({ exercise_id: i.exercise, set_no: n + 1, target: p.reps, done: p.reps, load_kg: p.load_kg, completed: false }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const [sets, setSets] = useState<ExerciseSet[]>(initial);
  const [effort, setEffort] = useState(3);
  const [notes, setNotes] = useState("");
  const hasWalk = template.items.some((i) => i.exercise === "walk");
  const [walk, setWalk] = useState<number | undefined>(hasWalk ? walkMinutesToday(pos.month) : undefined);
  const [draftId] = useState(existing?.id ?? crypto.randomUUID());
  const [startedAt] = useState(existing?.started_at ?? new Date().toISOString());

  const save = (next: ExerciseSet[], finished = false): WorkoutSession =>
    upsert("workouts", {
      id: draftId,
      date: pos.today,
      template: template.id,
      title: template.title,
      started_at: startedAt,
      finished_at: finished ? new Date().toISOString() : undefined,
      sets: next,
      effort: finished ? effort : undefined,
      notes: notes || undefined,
      cardio_minutes: walk,
      cardio_type: walk ? "walking" : undefined,
    });

  const update = (idx: number, patch: Partial<ExerciseSet>) => {
    const next = sets.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setSets(next);
    save(next);
  };

  const byEx = [...new Set(sets.map((s) => s.exercise_id))];
  const completed = sets.filter((s) => s.completed).length;

  return (
    <>
      <PageHead eyebrow="Workout" title={template.title} onBack={() => go("workout")} sub={`${completed}/${sets.length} sets done · progress saves as you go`} />
      <Progress value={completed} max={sets.length || 1} good={completed === sets.length && sets.length > 0} />
      {byEx.map((exId) => {
        const ex = EXERCISES[exId];
        const exSets = sets.map((s, i) => ({ s, i })).filter(({ s }) => s.exercise_id === exId);
        const unit = ex.unit === "sec" ? "sec" : "reps";
        return (
          <Card key={exId} title={ex.name} action={ex.perSide ? <span className="badge">each side</span> : undefined}>
            <p className="muted small">{ex.cue}</p>
            <div className="set-row tiny muted" style={{ fontWeight: 600 }}>
              <span>Set</span>
              <span style={{ textAlign: "center" }}>{unit} done / target</span>
              <span style={{ textAlign: "center" }}>{ex.loadable ? "kg" : ""}</span>
              <span />
            </div>
            {exSets.map(({ s, i }) => (
              <div key={i} className="set-row">
                <span className="num" style={{ fontWeight: 700, textAlign: "center" }}>{s.set_no}</span>
                <div className="row" style={{ gap: 4 }}>
                  <input className="input" inputMode="numeric" aria-label={`${ex.name} set ${s.set_no} ${unit}`} value={s.done} onChange={(e) => update(i, { done: Number(e.target.value) || 0 })} />
                  <span className="muted small num">/{s.target}</span>
                </div>
                {ex.loadable ? (
                  <input className="input" inputMode="decimal" aria-label={`${ex.name} set ${s.set_no} load`} value={s.load_kg ?? ""} placeholder="—" onChange={(e) => update(i, { load_kg: e.target.value ? Number(e.target.value) : undefined })} />
                ) : (
                  <span />
                )}
                <button className={`box ${s.completed ? "" : ""}`} style={{ width: 44, height: 44, borderRadius: 12, background: s.completed ? "var(--accent)" : undefined, borderColor: s.completed ? "var(--accent)" : undefined, cursor: "pointer" }} aria-pressed={s.completed} aria-label={`Complete set ${s.set_no}`} onClick={() => update(i, { completed: !s.completed })}>
                  {s.completed && <Icon name="check" stroke={3} />}
                </button>
              </div>
            ))}
            <button
              className="btn sm ghost"
              onClick={() => {
                const last = exSets[exSets.length - 1].s;
                const next = [...sets];
                next.splice(exSets[exSets.length - 1].i + 1, 0, { ...last, set_no: last.set_no + 1, completed: false });
                setSets(next);
                save(next);
              }}
            >
              + set
            </button>
          </Card>
        );
      })}
      {hasWalk && (
        <Card title="Walk">
          <Stepper value={walk} onChange={setWalk} step={5} min={0} max={240} label="Walk minutes" />
        </Card>
      )}
      <Card title="Finish">
        <Slider label="How hard was it overall?" value={effort} onChange={setEffort} min={1} max={5} left="easy" right="very hard" />
        <Field label="Notes">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember next time" />
        </Field>
        {effort >= 5 && <Notice kind="info">Next time the targets will hold steady rather than increase.</Notice>}
        <button
          className="btn primary block"
          onClick={() => {
            save(sets, true);
            toast(completed ? "Workout saved — nice work" : "Saved");
            go("home");
          }}
        >
          Finish workout
        </button>
        <p className="tiny muted" style={{ marginTop: 8 }}>Partial sessions count. Stop any exercise that causes pain.</p>
      </Card>
    </>
  );
}
