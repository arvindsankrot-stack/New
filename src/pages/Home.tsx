import { useState } from "react";
import { addFood, allFoods, logWeight, toggleDose } from "../actions";
import { useApp, useDB, usePosition, useProfile } from "../app-context";
import { MORNING_SHAKE } from "../data/foods";
import type { MeasureKey } from "../db/types";
import { currentValue, fmtNum, goalFor, MEASURE_LABELS, startValue } from "../domain/body";
import { addDays, fmtDate, weekday, weekdayName } from "../domain/dates";
import { dosesOn, labDue } from "../domain/hrt";
import { calorieTarget, dayTotals, weightSeries } from "../domain/nutrition";
import { mobilityMinutes, missedYesterday, phaseFor, planFor, walkMinutesToday } from "../domain/program";
import { durationHours } from "../domain/safety";
import { EXERCISES } from "../domain/exercises";
import { Card, Check, Notice, Progress, Sheet, Stepper, toast } from "../ui/components";
import { Icon } from "../ui/icons";

export function Home() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const { go, lock } = useApp();
  const today = pos.today;
  const phase = phaseFor(pos.month);
  const [weighIn, setWeighIn] = useState(false);

  const ws = weightSeries(db.weights, db.measurements);
  const latestKg = ws[ws.length - 1]?.kg ?? 78;
  const cal = calorieTarget(profile, latestKg, today);
  const t = dayTotals(db.foodEntries, today);
  const proteinGoal = Math.round((profile.protein_target.min + profile.protein_target.max) / 2);

  const doses = dosesOn(db.medications, db.medLogs, today);
  const plan = planFor(pos.month, today, db.workouts);
  const doneToday = db.workouts.find((w) => w.date === today && w.finished_at);
  const missed = pos.started ? missedYesterday(pos.month, today, db.workouts) : null;
  const yesterdayAnyLog =
    db.foodEntries.some((f) => f.date === addDays(today, -1)) || db.workouts.some((w) => w.date === addDays(today, -1));

  const mobToday = db.mobility.filter((m) => m.date === today && m.kind === "mobility").reduce((a, m) => a + m.minutes, 0);
  const hypnoToday = db.hypno.filter((h) => h.date === today).reduce((a, h) => a + h.minutes, 0);
  const activeCage = db.chastity.find((c) => c.worn && !c.end);
  const labsDue = db.labSchedules.filter((s) => labDue(s, today).daysUntil <= 7);
  const weighedToday = ws.some((p) => p.date === today);

  const journey: MeasureKey[] = ["weight", "waist", "belly", "hips", "bust"];

  return (
    <>
      <header className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Today</div>
          <h1>
            {weekdayName(today)} — Month {pos.month} / Day {pos.day}
          </h1>
          <div className="muted small">
            {phase.title} · {phase.focus}
          </div>
        </div>
        <button className="iconbtn" onClick={lock} aria-label="Lock app">
          <Icon name="lock" />
        </button>
      </header>

      {!pos.started && <Notice kind="info" title="Programme hasn't started yet">Day 1 is {fmtDate(profile.program_start, { day: "numeric", month: "long" })}. You can still log anything now.</Notice>}

      {missed && !doneToday && (
        <Notice kind="info" title="Missed yesterday. Let's continue today.">
          {plan.template.kind === "resistance"
            ? "Today's session is below — no need to make anything up."
            : `Today is a lighter day, so you could do yesterday's ${missed.title} instead if you feel like it.`}
          {plan.template.kind !== "resistance" && (
            <div style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => go("workout", `start:${missed.id}`)}>
                Do {missed.title}
              </button>
            </div>
          )}
        </Notice>
      )}
      {!missed && !yesterdayAnyLog && pos.day > 1 && <Notice kind="info">Consistency over perfection — pick up wherever you are today.</Notice>}

      {activeCage && (
        <Notice kind="warn" title={`Personal log: device on for ${durationHours(activeCage).toFixed(1)} h`}>
          Check comfort regularly. Remove at any sign of pain, numbness, swelling or discolouration.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => go("track", "chastity")}>
              Check in / end
            </button>
          </div>
        </Notice>
      )}
      {pos.isLastDayOfMonth && (
        <Notice kind="good" title={`Month ${pos.month} check-in today`}>
          Measurements, photos and a quick review.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => go("more", "checkin")}>
              Start check-in
            </button>
          </div>
        </Notice>
      )}
      {weekday(today) === 0 && pos.day >= 7 && (
        <Notice kind="info" title="Weekly review is ready">
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => go("progress", "week")}>
            Open weekly review
          </button>
        </Notice>
      )}
      {labsDue.map((s) => {
        const d = labDue(s, today);
        return (
          <Notice key={s.id} kind="warn" title={`${s.label} ${d.due ? "due" : `due in ${d.daysUntil} days`}`}>
            Interval set by {s.set_by || "your clinician"}.{" "}
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => go("hrt", "labs")}>
              Labs
            </button>
          </Notice>
        );
      })}

      <Card
        title={
          <span>
            Transformation day <span className="num">{Math.max(pos.day, 0)}</span>
            <span className="muted" style={{ fontWeight: 500 }}> / 365</span>
          </span>
        }
        action={
          <button className="btn sm" onClick={() => setWeighIn(true)}>
            <Icon name="scale" size={18} /> {weighedToday ? "Update" : "Weigh in"}
          </button>
        }
      >
        <Progress value={Math.min(pos.day, 365)} max={365} />
        <div className="journey tiny muted" style={{ paddingTop: 12 }}>
          <span />
          <span className="c">
            <small>START</small>
          </span>
          <span className="c">
            <small>CURRENT</small>
          </span>
          <span className="c">
            <small>TARGET</small>
          </span>
        </div>
        {journey.map((k) => {
          const s = startValue(k, db.measurements, db.weights);
          const c = currentValue(k, db.measurements, db.weights);
          const g = goalFor(k, db.goals);
          const u = k === "weight" ? "" : "″";
          return (
            <div className="journey" key={k}>
              <span className="k">{MEASURE_LABELS[k].replace(" (navel)", "")}</span>
              <span className="c">{fmtNum(s)}{s != null && u}</span>
              <span className="c cur">{fmtNum(c?.value)}{c && u}</span>
              <span className="c muted">{g ? `${g.range.min}–${g.range.max}${u}` : "—"}</span>
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>Weight in kg. Targets are directional goals, not guarantees.</p>
      </Card>

      <Card title="Nutrition" action={<button className="btn sm" onClick={() => go("track", "food")}>Log food</button>}>
        <div className="spread small">
          <span>Calories</span>
          <span className="num">
            <b>{Math.round(t.kcal)}</b> / {cal.target} kcal
          </span>
        </div>
        <Progress value={t.kcal} max={cal.target} />
        <div className="spread small" style={{ marginTop: 10 }}>
          <span>Protein</span>
          <span className="num">
            <b>{Math.round(t.protein)}</b> / {proteinGoal} g
          </span>
        </div>
        <Progress value={t.protein} max={proteinGoal} good={t.protein >= profile.protein_target.min} />
        <div className="muted tiny" style={{ marginTop: 8 }}>
          {Math.max(0, Math.round(proteinGoal - t.protein))} g protein and {Math.max(0, Math.round(cal.target - t.kcal))} kcal remaining
        </div>
        {!db.foodEntries.some((f) => f.date === today && f.meal === "morning") && (
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            onClick={() => {
              const foods = allFoods();
              for (const id of MORNING_SHAKE) addFood(foods.find((f) => f.id === id)!, 1, "morning", today);
              toast("Morning shake logged");
            }}
          >
            <Icon name="plus" size={18} /> Morning shake (whey + milk + banana)
          </button>
        )}
      </Card>

      <Card title="HRT" action={<button className="btn sm" onClick={() => go("hrt")}>Details</button>}>
        {db.medications.filter((m) => m.active).length === 0 ? (
          <>
            <p className="muted small">Add your clinician-prescribed regimen to get dose reminders and adherence tracking.</p>
            <button className="btn block" onClick={() => go("hrt", "regimen")}>
              Add prescribed medication
            </button>
          </>
        ) : doses.length === 0 ? (
          <p className="muted small">No doses scheduled today.</p>
        ) : (
          doses.map((d) => (
            <Check key={d.med.id + d.slot} on={d.log?.status === "taken"} onToggle={() => toggleDose(d.med, d.slot, today)} sub={`${d.med.dose} ${d.med.unit} · ${d.med.route} · ${d.slot}${d.log?.status === "missed" ? " · marked missed" : ""}`}>
              {d.med.name}
            </Check>
          ))
        )}
      </Card>

      <Card title="Workout" action={doneToday ? <span className="badge good">Done</span> : undefined}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{plan.template.title}</div>
        {plan.template.kind === "rest" ? (
          <p className="muted small">Rest day. A gentle {walkMinutesToday(pos.month)}-minute walk is optional.</p>
        ) : (
          <ul className="small" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {plan.prescriptions.map((p) => {
              const ex = EXERCISES[p.exercise];
              const unit = ex.unit === "reps" ? "" : ex.unit === "sec" ? " s" : " min";
              const reps = ex.id === "walk" ? walkMinutesToday(pos.month) : p.reps;
              return (
                <li key={p.exercise}>
                  {ex.name} {ex.id === "walk" ? `${reps} min` : `${p.sets} × ${reps}${unit}`}
                  {p.load_kg ? ` @ ${p.load_kg} kg` : ""}
                </li>
              );
            })}
          </ul>
        )}
        {plan.template.kind !== "rest" && (
          <button className="btn primary block" onClick={() => go("workout", "start")}>
            <Icon name="play" size={18} /> {doneToday ? "View / log again" : "Start workout"}
          </button>
        )}
      </Card>

      <div className="grid2">
        <Card title="Mobility">
          <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {mobToday}
            <span className="muted small"> / {mobilityMinutes(pos.month)} min</span>
          </div>
          <button className="btn block sm" style={{ marginTop: 8 }} onClick={() => go("track", "mobility")}>
            {mobToday ? "Log more" : "Start"}
          </button>
        </Card>
        {profile.modules.hypno ? (
          <Card title="Hypno">
            <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
              {hypnoToday}
              <span className="muted small"> / {profile.hypno_daily_goal_min} min</span>
            </div>
            <button className="btn block sm" style={{ marginTop: 8 }} onClick={() => go("track", "hypno")}>
              {hypnoToday ? "Log more" : "Start"}
            </button>
          </Card>
        ) : (
          <Card title="Coach">
            <p className="muted tiny">Log in plain words.</p>
            <button className="btn block sm" onClick={() => go("more", "coach")}>
              Open
            </button>
          </Card>
        )}
      </div>

      {profile.modules.chastity && (
        <Card title="Personal log">
          <div className="spread">
            <span>Chastity</span>
            <button className="btn sm" onClick={() => go("track", "chastity")}>
              Log
            </button>
          </div>
        </Card>
      )}

      <button className="list-item card" style={{ padding: 16 }} onClick={() => go("more", "coach")}>
        <span className="iconbtn" style={{ background: "var(--accent-soft)", color: "var(--accent-2)", borderColor: "transparent" }}>
          <Icon name="chat" />
        </span>
        <span className="grow">
          <b>Tell the coach</b>
          <span className="muted small" style={{ display: "block" }}>"3 chapati, 200g paneer and a whey shake"</span>
        </span>
      </button>

      <WeighIn open={weighIn} onClose={() => setWeighIn(false)} today={today} last={latestKg} />
    </>
  );
}

function WeighIn({ open, onClose, today, last }: { open: boolean; onClose: () => void; today: string; last: number }) {
  const [kg, setKg] = useState<number | undefined>(last);
  return (
    <Sheet open={open} onClose={onClose} title="Weigh-in">
      <p className="muted small">Same time, same conditions (morning, after the bathroom) makes the trend meaningful. Daily ups and downs are normal.</p>
      <Stepper value={kg} onChange={setKg} step={0.1} digits={1} min={30} max={250} label="Weight in kg" />
      <button
        className="btn primary block"
        style={{ marginTop: 12 }}
        disabled={!kg}
        onClick={() => {
          logWeight(kg!, today);
          toast("Weight logged");
          onClose();
        }}
      >
        Save {kg?.toFixed(1)} kg
      </button>
    </Sheet>
  );
}
