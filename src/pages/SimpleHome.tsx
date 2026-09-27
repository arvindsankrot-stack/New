// The default, low-number home screen: a gentle checklist, words instead of
// figures, and small visuals. Exact numbers live one tap away (Detailed view).

import { useState } from "react";
import { addFood, allFoods, toggleDose } from "../actions";
import { useApp, useDB, usePosition, useProfile } from "../app-context";
import { MORNING_SHAKE } from "../data/foods";
import { upsert } from "../db/store";
import type { MeasureKey } from "../db/types";
import { currentValue, goalFor, startValue } from "../domain/body";
import { dosesOn, labDue } from "../domain/hrt";
import { dayTotals, weightSeries } from "../domain/nutrition";
import { missedYesterday, phaseFor, templateFor } from "../domain/program";
import { durationHours } from "../domain/safety";
import { Notice, toast } from "../ui/components";
import { Icon } from "../ui/icons";
import { WeighIn } from "./Home";
import { ActivityCard } from "./ActivityCard";

const AFFIRMATIONS = [
  "Soft, strong and becoming more you every day.",
  "Little steps make a big glow-up.",
  "Your body is your home. Treat her gently today.",
  "Consistency over perfection, always.",
  "You're allowed to take up space and feel pretty doing it.",
  "Every stretch, every sip of protein, every rep is a tiny gift to future you.",
  "Rest is part of the plan too.",
  "You don't have to be perfect to be making progress.",
  "Confidence grows from keeping small promises to yourself.",
  "Be proud of how far you've come, not just where you're going.",
];

const CUTE_WORKOUT: Record<string, { emoji: string; name: string }> = {
  foundation_a: { emoji: "🍑", name: "Legs & booty basics" },
  foundation_b: { emoji: "💪", name: "Arms & core basics" },
  foundation_c: { emoji: "✨", name: "Full-body basics" },
  glutes_a: { emoji: "🍑", name: "Booty day A" },
  glutes_b: { emoji: "🍑", name: "Booty day B" },
  upper_core: { emoji: "💪", name: "Arms & core" },
  full_core: { emoji: "✨", name: "Full-body glow" },
  mobility_cardio: { emoji: "🌷", name: "Stretch & stroll" },
  cardio: { emoji: "🚶‍♀️", name: "Pretty walk" },
  rest: { emoji: "🛁", name: "Rest & glow day" },
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Sweet dreams";
}

/** Describe a change in words (no figures) and how far along the way to the goal it is (0–1). */
export function glowWords(key: MeasureKey, start?: number, cur?: number, goal?: { min: number; max: number }) {
  if (start == null || cur == null) return { text: "Measure once to see your journey", pos: 0 };
  const shrink = key === "waist" || key === "belly" || key === "weight";
  if (goal && cur >= goal.min && cur <= goal.max) return { text: "in your dream range 💖", pos: 1 };
  const edge = goal ? (shrink ? goal.max : goal.min) : start;
  const toGo = shrink ? start - edge : edge - start;
  const moved = shrink ? start - cur : cur - start;
  const pos = toGo > 0 ? Math.max(0, Math.min(1, moved / toGo)) : 0;
  const tiny = key === "weight" ? 0.4 : 0.2;
  if (Math.abs(moved) < tiny) return { text: "just getting started, keep going", pos };
  if (moved < 0) return { text: shrink ? "a touch up, totally normal, keep going" : "holding steady, keep going", pos: 0 };
  if (shrink) return { text: pos > 0.5 ? "getting noticeably smaller ✨" : "a little smaller than when you started ✨", pos };
  return { text: pos > 0.5 ? "noticeably fuller 🍑" : "a little fuller than when you started 🍑", pos };
}

function proteinWords(p: number, min: number) {
  const r = p / min;
  if (r >= 1) return "Full! Protein done for today 💖";
  if (r >= 0.75) return "Almost there — one more protein bite";
  if (r >= 0.4) return "Halfway there";
  if (r > 0) return "Just getting started";
  return "Start with your morning shake";
}

interface Item {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  done: boolean;
  onTap: () => void;
}

export function SimpleHome() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const { go, lock } = useApp();
  const today = pos.today;
  const [weighIn, setWeighIn] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const phase = phaseFor(pos.month);
  const tpl = templateFor(pos.month, today);
  const cute = CUTE_WORKOUT[tpl.id] ?? { emoji: "✨", name: tpl.title };
  const t = dayTotals(db.foodEntries, today);
  const doses = dosesOn(db.medications, db.medLogs, today);
  const hadShake = db.foodEntries.some((f) => f.date === today && f.meal === "morning");
  const workoutDone = db.workouts.some((w) => w.date === today && w.finished_at && (w.template === tpl.id || (tpl.kind !== "resistance" && w.cardio_minutes)));
  const stretched = db.mobility.some((m) => m.date === today);
  const relaxed = db.hypno.some((h) => h.date === today);
  const missed = pos.started ? missedYesterday(pos.month, today, db.workouts) : null;
  const activeCage = db.chastity.find((c) => c.worn && !c.end);
  const labsDue = db.labSchedules.filter((s) => labDue(s, today).due);
  const ws = weightSeries(db.weights, db.measurements);

  const items: Item[] = [
    {
      key: "shake",
      emoji: "🥤",
      title: "Morning protein shake",
      sub: hadShake ? "Yum, done!" : "Tap to add whey + milk + banana",
      done: hadShake,
      onTap: () => {
        if (hadShake) return go("track", "food");
        const foods = allFoods();
        for (const id of MORNING_SHAKE) addFood(foods.find((f) => f.id === id)!, 1, "morning", today);
        toast("Shake added 🥤");
      },
    },
    ...(doses.length
      ? [
          {
            key: "meds",
            emoji: "💊",
            title: "Take your prescribed meds",
            sub: doses.every((d) => d.log?.status === "taken") ? "All taken 💕" : doses.length === 1 ? "Tap when taken" : "Tap to tick them off",
            done: doses.every((d) => d.log?.status === "taken"),
            onTap: () => (doses.length === 1 ? toggleDose(doses[0].med, doses[0].slot, today) : go("hrt")),
          },
        ]
      : []),
    ...(tpl.kind !== "rest"
      ? [
          {
            key: "move",
            emoji: cute.emoji,
            title: cute.name,
            sub: workoutDone ? "Done — you're glowing" : tpl.kind === "resistance" ? "Tap to start your session" : "A gentle walk and stretch",
            done: workoutDone,
            onTap: () => go("workout", tpl.kind === "resistance" ? "start" : undefined),
          },
        ]
      : []),
    {
      key: "stretch",
      emoji: "🧘‍♀️",
      title: "Little stretch",
      sub: stretched ? "Flexy and happy" : "Hips, legs, deep breaths",
      done: stretched,
      onTap: () => go("track", "mobility"),
    },
    {
      key: "food",
      emoji: "🍽️",
      title: "Eat your protein",
      sub: proteinWords(t.protein, profile.protein_target.min),
      done: t.protein >= profile.protein_target.min,
      onTap: () => go("track", "food"),
    },
    ...(profile.modules.hypno
      ? [
          {
            key: "relax",
            emoji: "🌙",
            title: "Relax & listen",
            sub: relaxed ? "Calm and cosy 💤" : "Your relaxation session",
            done: relaxed,
            onTap: () => go("track", "hypno"),
          },
        ]
      : []),
  ];
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  const affirmation = AFFIRMATIONS[pos.day % AFFIRMATIONS.length];
  const name = profile.name?.trim();

  const glow: { key: MeasureKey; label: string }[] = [
    { key: "waist", label: "Waist" },
    { key: "hips", label: "Hips" },
    { key: "bust", label: "Bust" },
    { key: "belly", label: "Tummy" },
  ];

  return (
    <>
      <section className="hero">
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="hero-hello">{greeting()}{name ? `, ${name}` : ""} 🎀</div>
            <div className="hero-chapter">
              Chapter {pos.month} · {phase.title}
            </div>
          </div>
          <button className="iconbtn hero-btn" onClick={lock} aria-label="Lock app">
            <Icon name="lock" />
          </button>
        </div>
        <p className="hero-quote">“{affirmation}”</p>
        <div className="hearts" aria-label={`${doneCount} of ${items.length} done today`}>
          {items.map((i) => (
            <span key={i.key}>{i.done ? "💗" : "🤍"}</span>
          ))}
        </div>
      </section>

      {!name && (
        <div className="card">
          <b>What should I call you?</b>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="input grow" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" aria-label="Your name" />
            <button className="btn primary" disabled={!nameDraft.trim()} onClick={() => upsert("profile", { ...profile, name: nameDraft.trim() })}>
              Save
            </button>
          </div>
        </div>
      )}

      {missed && !workoutDone && <Notice kind="info" title="Missed yesterday? That's okay 💕">Let's just continue today. No catching up needed.</Notice>}
      {activeCage && (
        <Notice kind="warn" title="Personal log: session open">
          Started {durationHours(activeCage) < 1 ? "less than an hour" : `about ${Math.round(durationHours(activeCage))} hours`} ago. Remove at any pain, numbness or swelling.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => go("track", "chastity")}>Check in / end</button>
          </div>
        </Notice>
      )}
      {pos.isLastDayOfMonth && (
        <Notice kind="good" title="It's check-in day 📸">
          Measurements and photos for this chapter.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => go("more", "checkin")}>Let's do it</button>
          </div>
        </Notice>
      )}
      {labsDue.length > 0 && <Notice kind="warn" title="Blood test reminder 🩸">Your clinician's check-up is due. <button className="btn sm" style={{ marginTop: 6 }} onClick={() => go("hrt", "labs")}>Open</button></Notice>}

      <section className="card">
        <div className="card-head">
          <h2>Today's little list</h2>
          <span className="muted small">{allDone ? "all done!" : `${items.length - doneCount} to go`}</span>
        </div>
        {items.map((i) => (
          <button key={i.key} className={`todo ${i.done ? "done" : ""}`} onClick={i.onTap}>
            <span className="todo-emoji">{i.emoji}</span>
            <span className="grow">
              <span className="todo-title">{i.title}</span>
              <span className="todo-sub">{i.sub}</span>
            </span>
            <span className="todo-check">{i.done ? <Icon name="check" size={18} stroke={3} /> : null}</span>
          </button>
        ))}
        {allDone && <p className="celebrate">You did everything today! So proud of you 🎀</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Your glow-up ✨</h2>
          <button className="btn sm ghost" onClick={() => setWeighIn(true)}>⚖️ Weigh in</button>
        </div>
        {glow.map(({ key, label }) => {
          const s = startValue(key, db.measurements, db.weights);
          const c = currentValue(key, db.measurements, db.weights)?.value;
          const w = glowWords(key, s, c, goalFor(key, db.goals)?.range);
          return (
            <div key={key} className="glow-row">
              <b>{label}</b>
              <div className="glow-track" aria-hidden="true">
                <span className="glow-dot" style={{ left: `calc(${Math.round(w.pos * 100)}% - 9px)` }}>💗</span>
                <span className="glow-goal">🌸</span>
              </div>
              <div className="small muted">{w.text}</div>
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>
          The heart travels toward the flower as you get closer to your goal. Goals are dreams to work toward, not promises.
          {ws.length === 0 ? " Weigh in any time." : ""}
        </p>
      </section>

      <ActivityCard />

      <button className="list-item card" style={{ padding: 16 }} onClick={() => go("more", "coach")}>
        <span style={{ fontSize: 28 }}>💬</span>
        <span className="grow">
          <b>Tell me what you ate</b>
          <span className="muted small" style={{ display: "block" }}>"2 roti, dal and a whey shake"</span>
        </span>
      </button>

      {profile.modules.chastity && !activeCage && (
        <button className="list-item card" style={{ padding: 16 }} onClick={() => go("track", "chastity")}>
          <span style={{ fontSize: 28 }}>🔒</span>
          <span className="grow">
            <b>Personal log</b>
            <span className="muted small" style={{ display: "block" }}>Private and just for you</span>
          </span>
        </button>
      )}

      <button className="btn ghost block" onClick={() => upsert("profile", { ...profile, simple_home: false })}>
        Show detailed view with numbers
      </button>
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>Day {Math.max(pos.day, 1)} of your journey · consistency over perfection</p>

      <WeighIn open={weighIn} onClose={() => setWeighIn(false)} today={today} last={ws[ws.length - 1]?.kg ?? 78} />
    </>
  );
}
