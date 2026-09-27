import { useEffect, useRef, useState } from "react";
import { allFoods, logWeight } from "../../actions";
import { useDB, usePosition, useProfile } from "../../app-context";
import { all, remove, upsert, upsertMany } from "../../db/store";
import type { CoachMessage } from "../../db/types";
import { currentValue, seriesFor, signed } from "../../domain/body";
import { interpret, type CoachLine } from "../../domain/coach";
import { addDays } from "../../domain/dates";
import { dosesOn } from "../../domain/hrt";
import { averageIntake, dayTotals, proteinCompliance, weightSeries, weightTrend } from "../../domain/nutrition";
import { missedYesterday, planFor } from "../../domain/program";
import { sessionsCompleted } from "../../domain/reports";
import { PageHead, Stepper, toast } from "../../ui/components";

const TAG: Record<CoachLine["label"], string> = { "TRACKED FACT": "fact", ESTIMATE: "estimate", GOAL: "goal", MEDICAL: "medical" };

function encode(lines: CoachLine[]): string {
  return lines.map((l) => `[${l.label}] ${l.text}`).join("\n");
}

function Bubble({ text, role }: { text: string; role: "user" | "coach" }) {
  if (role === "user") return <div className="bubble user">{text}</div>;
  return (
    <div className="bubble coach">
      {text.split("\n").map((line, i) => {
        const m = line.match(/^\[(TRACKED FACT|ESTIMATE|GOAL|MEDICAL)\] (.*)$/);
        return (
          <div key={i} style={{ marginTop: i ? 6 : 0 }}>
            {m ? (
              <>
                <span className={`tag ${TAG[m[1] as CoachLine["label"]]}`}>{m[1]}</span>
                {m[2]}
              </>
            ) : (
              line
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Coach({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgs = [...db.coach].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(-60);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length, msgs[msgs.length - 1]?.food_status]);

  let pendingFood: CoachMessage["pending_food"];
  const respond = (input: string): CoachLine[] => {
    pendingFood = undefined;
    const today = pos.today;
    const a = interpret(input, allFoods(), today);
    switch (a.type) {
      case "log_food": {
        pendingFood = a.entries;
        const kcal = a.entries.reduce((x, e) => x + e.kcal, 0);
        const protein = a.entries.reduce((x, e) => x + e.protein, 0);
        return [
          { label: "ESTIMATE", text: `I found ${a.entries.length} item${a.entries.length > 1 ? "s" : ""}: about ${Math.round(kcal)} kcal and ${Math.round(protein)} g protein. Check the amounts below, then tap "Add to food log".` },
        ];
      }
      case "log_weight": {
        logWeight(a.kg, today);
        const tr = weightTrend(weightSeries(all("weights"), all("measurements")), today);
        return [
          { label: "TRACKED FACT", text: `Weight ${a.kg} kg logged for today.` },
          tr ? { label: "ESTIMATE", text: `3-week trend: ${signed(tr.kgPerWeek, 2)} kg/week.` } : { label: "ESTIMATE", text: "A few more weigh-ins and a trend will appear." },
        ];
      }
      case "log_meds_taken": {
        const doses = dosesOn(db.medications, db.medLogs, today).filter((d) => d.log?.status !== "taken");
        const now = new Date().toTimeString().slice(0, 5);
        const due = doses.filter((d) => d.slot <= now || doses.length === 1);
        if (!db.medications.length) return [{ label: "MEDICAL", text: "No regimen is entered yet. Add your prescribed medication in HRT → Regimen so doses can be recorded." }];
        if (!due.length) return [{ label: "TRACKED FACT", text: "All of today's scheduled doses are already recorded." }];
        for (const d of due) upsert("medLogs", { date: today, medication_id: d.med.id, slot: d.slot, status: "taken", taken_at: new Date().toISOString() });
        return [
          { label: "TRACKED FACT", text: `Recorded as taken: ${due.map((d) => `${d.med.name} (${d.slot})`).join(", ")}.` },
          { label: "MEDICAL", text: "Your prescription is unchanged — any changes are for your clinician." },
        ];
      }
      case "dose_question":
        return [{ label: "MEDICAL", text: "I can't advise on starting, stopping or changing hormone doses. Bring your logged adherence, labs and changes to your clinician — the Monthly report is a good summary to show them." }];
      case "missed_workout": {
        const plan = planFor(pos.month, today, db.workouts);
        const missed = missedYesterday(pos.month, today, db.workouts);
        return [
          { label: "TRACKED FACT", text: `${sessionsCompleted(db, addDays(today, -6), today)} resistance session(s) completed in the last 7 days.` },
          plan.template.kind === "resistance"
            ? { label: "GOAL", text: `Missed yesterday. Let's continue today: ${plan.template.title}. No need to double up — the plan picks up where you left off.` }
            : { label: "GOAL", text: `Missed yesterday. Let's continue today. Today is a lighter day, so you could do ${missed?.title ?? "yesterday's session"} instead (Home → Do workout), or just keep today's plan.` },
        ];
      }
      case "plateau": {
        const k = a.measure;
        const pts = seriesFor(k, db.measurements, db.weights);
        const now = currentValue(k, db.measurements, db.weights);
        const then = [...pts].reverse().find((p) => p.date <= addDays(today, -28));
        const intake = averageIntake(db.foodEntries, addDays(today, -27), today);
        const pc = proteinCompliance(db.foodEntries, addDays(today, -27), today, profile.protein_target.min);
        const tr = weightTrend(weightSeries(db.weights, db.measurements), today, 28);
        const done = sessionsCompleted(db, addDays(today, -27), today);
        const lines: CoachLine[] = [];
        if (now && then) lines.push({ label: "TRACKED FACT", text: `${k[0].toUpperCase() + k.slice(1)}: ${then.value} → ${now.value} over 4 weeks (${signed(now.value - then.value)}).` });
        else lines.push({ label: "TRACKED FACT", text: `Not enough ${k} measurements across the last 4 weeks to see a trend — measure weekly for a clearer picture.` });
        if (tr) lines.push({ label: "ESTIMATE", text: `Weight trend ${signed(tr.kgPerWeek, 2)} kg/week.` });
        lines.push({ label: "TRACKED FACT", text: `Last 4 weeks: ${intake.loggedDays} days of food logged (avg ${intake.kcal ? Math.round(intake.kcal) : "—"} kcal), protein target met ${pc.hit}/${pc.logged} days, ${done} resistance sessions.` });
        const tips: string[] = [];
        if (intake.loggedDays < 18) tips.push("log food on more days so intake is clear");
        if (pc.pct != null && pc.pct < 0.7) tips.push("hit protein on more days");
        if (done < 10) tips.push("aim for every planned session");
        tips.push("add 10–15 min to daily walks");
        if (k === "waist" && tr && tr.kgPerWeek > -0.2) tips.push("if logging is steady, try the suggested calorie adjustment in Track → Food");
        lines.push({ label: "GOAL", text: `Before changing the target, try: ${tips.join("; ")}. Waist changes lag behind habits — 4 weeks is a short window.` });
        return lines;
      }
      default:
        return [{ label: "ESTIMATE", text: 'I didn\'t catch that. Try: "2 roti, dal and 150g chicken", "weight 76.4", "I took my HRT", "I missed yesterday\'s workout" or "my waist hasn\'t changed".' }];
    }
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    upsert("coach", { role: "user", text: t, date: pos.today });
    const reply = respond(t);
    const food = pendingFood;
    setTimeout(() => upsert("coach", { role: "coach", text: encode(reply), date: pos.today, pending_food: food, food_status: food ? "pending" : undefined }), 10);
    setText("");
  };

  return (
    <>
      <PageHead title="Coach" onBack={onBack} sub="Runs on this device. Facts, estimates, goals and medical topics are always labelled." right={msgs.length ? <button className="btn sm ghost" onClick={() => confirm("Clear coach history?") && db.coach.forEach((m) => remove("coach", m.id))}>Clear</button> : undefined} />
      <div className="chat" style={{ marginTop: 12 }}>
        {msgs.length === 0 && (
          <Bubble
            role="coach"
            text={encode([
              { label: "GOAL", text: "Tell me what you ate, your weight, that you took your prescribed medication, or how things are going." },
              { label: "ESTIMATE", text: 'e.g. "Today I ate 3 chapati, 200g paneer and had one whey shake."' },
            ])}
          />
        )}
        {msgs.map((m) => (
          <div key={m.id} className="chat">
            <Bubble role={m.role} text={m.text} />
            {m.pending_food && <FoodConfirm msg={m} />}
          </div>
        ))}
      </div>
      <div ref={end} style={{ height: 88, scrollMarginBottom: "calc(var(--nav-h) + 90px)" }} />
      <div className="composer">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input className="input grow" enterKeyHint="send" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 2 roti, dal, 150g chicken" aria-label="Message the coach" />
          <button className="btn primary" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}

/** Recognised foods wait here until the user confirms, so nothing is logged by surprise. */
function FoodConfirm({ msg }: { msg: CoachMessage }) {
  const profile = useProfile();
  const items = msg.pending_food ?? [];
  const foods = allFoods();
  if (msg.food_status === "dismissed") return <div className="muted small" style={{ alignSelf: "flex-start" }}>Not logged.</div>;
  if (msg.food_status === "logged") {
    const t = dayTotals(all("foodEntries"), items[0]?.date ?? msg.date);
    return (
      <div className="bubble coach">
        <span className="tag fact">TRACKED FACT</span>Added {items.length} item{items.length > 1 ? "s" : ""} to your food log. That day so far: {Math.round(t.kcal)} kcal, {Math.round(t.protein)} g protein
        {t.protein < profile.protein_target.min ? ` (${Math.round(profile.protein_target.min - t.protein)} g to reach your protein minimum).` : " — protein target reached."}
      </div>
    );
  }
  const setServings = (i: number, servings: number) => {
    const next = items.map((e, j) => {
      if (j !== i) return e;
      const f = foods.find((x) => x.id === e.food_id);
      if (!f) return { ...e, servings };
      return { ...e, servings, kcal: Math.round(f.kcal * servings), protein: Math.round(f.protein * servings * 10) / 10, carbs: Math.round(f.carbs * servings * 10) / 10, fat: Math.round(f.fat * servings * 10) / 10 };
    }).filter((e) => e.servings > 0);
    upsert("coach", { ...msg, pending_food: next, food_status: next.length ? "pending" : "dismissed" });
  };
  return (
    <div className="card" style={{ margin: 0, alignSelf: "stretch" }}>
      {items.map((e, i) => (
        <div key={i} style={{ padding: "6px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
          <div className="spread">
            <b>{e.name}</b>
            <span className="muted small num">{e.kcal} kcal · {e.protein} g P</span>
          </div>
          <div className="row small" style={{ marginTop: 4 }}>
            <span className="muted">Servings</span>
            <div className="grow">
              <Stepper value={e.servings} onChange={(v) => setServings(i, v ?? 0)} step={0.5} digits={1} min={0} max={20} label={`${e.name} servings`} />
            </div>
          </div>
        </div>
      ))}
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => upsert("coach", { ...msg, food_status: "dismissed" })}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            upsertMany("foodEntries", items);
            upsert("coach", { ...msg, food_status: "logged" });
            toast("Added to food log");
          }}
        >
          Add to food log
        </button>
      </div>
    </div>
  );
}
