import { useEffect, useRef, useState } from "react";
import { allFoods, logWeight } from "../../actions";
import { useDB, usePosition, useProfile } from "../../app-context";
import { all, remove, upsert, upsertMany } from "../../db/store";
import { currentValue, seriesFor, signed } from "../../domain/body";
import { interpret, type CoachLine } from "../../domain/coach";
import { addDays } from "../../domain/dates";
import { dosesOn } from "../../domain/hrt";
import { averageIntake, dayTotals, proteinCompliance, weightSeries, weightTrend } from "../../domain/nutrition";
import { missedYesterday, planFor } from "../../domain/program";
import { sessionsCompleted } from "../../domain/reports";
import { PageHead } from "../../ui/components";

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

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length]);

  const respond = (input: string): CoachLine[] => {
    const today = pos.today;
    const a = interpret(input, allFoods(), today);
    const proteinGoal = Math.round((profile.protein_target.min + profile.protein_target.max) / 2);
    switch (a.type) {
      case "log_food": {
        upsertMany("foodEntries", a.entries);
        const t = dayTotals(all("foodEntries"), today);
        return [
          ...a.entries.map((e) => ({ label: "ESTIMATE" as const, text: `${e.servings} × ${e.name}: ~${e.kcal} kcal, ${e.protein} g protein` })),
          { label: "TRACKED FACT", text: `Logged ${a.entries.length} item${a.entries.length > 1 ? "s" : ""}. Today so far: ${Math.round(t.kcal)} kcal, ${Math.round(t.protein)} g protein.` },
          { label: "GOAL", text: t.protein >= profile.protein_target.min ? "Protein target reached for today." : `${Math.round(proteinGoal - t.protein)} g protein to go — a shake, eggs, paneer or soya would close the gap.` },
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
    setTimeout(() => upsert("coach", { role: "coach", text: encode(reply), date: pos.today }), 10);
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
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
        <div ref={end} />
      </div>
      <form
        className="row"
        style={{ position: "sticky", bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom) + 8px)", marginTop: 16, background: "var(--bg)", paddingTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the coach" aria-label="Message the coach" />
        <button className="btn primary" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </>
  );
}
