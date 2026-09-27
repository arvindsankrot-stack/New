import { useEffect, useState } from "react";
import { useDB, useProfile, useToday } from "../../app-context";
import { remove, upsert } from "../../db/store";
import type { HypnoSession } from "../../db/types";
import { fmtDate, weekStart } from "../../domain/dates";
import { hypnoStats } from "../../domain/reports";
import { Card, Chips, Field, Notice, Progress, Slider, Stat, Stepper, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";

const FOCUS = ["Relaxation", "Feminine identity", "Confidence", "Body acceptance", "Chosen submissiveness", "Mindfulness", "Self-awareness"];
const TIMER_KEY = "tc-hypno-start";

function tod(): HypnoSession["time_of_day"] {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

export function HypnoTab() {
  const db = useDB();
  const profile = useProfile();
  const today = useToday();
  const [start, setStart] = useState<number | null>(() => {
    try {
      const v = Number(sessionStorage.getItem(TIMER_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState<number | undefined>(profile.hypno_daily_goal_min);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(tod());
  const [focus, setFocus] = useState<string[]>(["Relaxation"]);
  const [before, setBefore] = useState(5);
  const [after, setAfter] = useState(6);
  const [relax, setRelax] = useState(6);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start]);

  const todayMin = db.hypno.filter((h) => h.date === today).reduce((a, h) => a + h.minutes, 0);
  const week = hypnoStats(db, weekStart(today), today);
  const longThisWeek = db.hypno.some((h) => h.date >= weekStart(today) && h.minutes >= 30);
  const recent = [...db.hypno].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
  const lowerAfter = recent.slice(0, 3).filter((h) => h.mood_after < h.mood_before).length >= 2;
  const elapsed = start ? Math.floor((now - start) / 1000) : 0;

  const toggleTimer = () => {
    if (start) {
      setMinutes(Math.max(1, Math.round(elapsed / 60)));
      setStart(null);
      try {
        sessionStorage.removeItem(TIMER_KEY);
      } catch {
        /* ignore */
      }
    } else {
      const s = Date.now();
      setStart(s);
      try {
        sessionStorage.setItem(TIMER_KEY, String(s));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <>
      <Card>
        <div className="grid3">
          <Stat label="Today" value={`${todayMin}`} sub={`of ${profile.hypno_daily_goal_min} min`} />
          <Stat label="This week" value={week.sessions} sub={`${week.minutes} min`} />
          <Stat label="Long session" value={longThisWeek ? "✓" : "—"} sub="30–45 min weekly" />
        </div>
        <div style={{ marginTop: 10 }}>
          <Progress value={todayMin} max={profile.hypno_daily_goal_min} good={todayMin >= profile.hypno_daily_goal_min} />
        </div>
      </Card>

      {lowerAfter && (
        <Notice kind="warn" title="Mood has dipped after recent sessions">
          That's useful information, not a failure. Consider shorter or different recordings, a break, or talking it through with someone you trust.
        </Notice>
      )}

      <Card title="Session">
        <button className={`btn block ${start ? "" : "primary"}`} onClick={toggleTimer}>
          <Icon name={start ? "check" : "play"} size={18} />
          {start ? `Stop · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "Start timer"}
        </button>
        <Field label="Duration (minutes)">
          <Stepper value={minutes} onChange={setMinutes} step={5} min={1} max={240} label="Minutes" />
        </Field>
        <Field label="Recording / title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Time of day">
          <Chips value={time} onChange={(v) => setTime(v as HypnoSession["time_of_day"])} options={["morning", "afternoon", "evening", "night"].map((v) => ({ value: v as HypnoSession["time_of_day"], label: v[0].toUpperCase() + v.slice(1) }))} />
        </Field>
        <Field label="Focus">
          <Chips multi value={focus} onChange={(v) => setFocus(v as string[])} options={FOCUS.map((f) => ({ value: f, label: f }))} />
        </Field>
        <Slider label="Mood before" value={before} onChange={setBefore} min={1} max={10} left="low" right="great" />
        <Slider label="Mood after" value={after} onChange={setAfter} min={1} max={10} left="low" right="great" />
        <Slider label="Relaxation" value={relax} onChange={setRelax} min={1} max={10} left="tense" right="deeply relaxed" />
        <Field label="Notes">
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button
          className="btn primary block"
          disabled={!minutes}
          onClick={() => {
            upsert("hypno", { date: today, minutes: minutes!, title: title.trim(), time_of_day: time, focus, mood_before: before, mood_after: after, relaxation: relax, notes: notes || undefined });
            toast("Session logged");
            setTitle("");
            setNotes("");
          }}
        >
          Save session
        </button>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Sessions here are for relaxation, identity, confidence and self-acceptance you choose. You can pause, stop or change direction at any time — your own judgement always comes first.
        </p>
      </Card>

      {recent.length > 0 && (
        <Card title="Recent">
          {recent.map((h) => (
            <div key={h.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="grow">
                <b>{h.title || "Session"}</b>
                <div className="muted small num">
                  {fmtDate(h.date)} · {h.minutes} min · mood {h.mood_before}→{h.mood_after} · relax {h.relaxation}
                </div>
              </div>
              <button className="iconbtn" aria-label="Delete session" onClick={() => remove("hypno", h.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
