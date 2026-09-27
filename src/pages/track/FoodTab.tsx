import { useMemo, useState } from "react";
import { addFood, allFoods } from "../../actions";
import { useDB, useProfile, useToday } from "../../app-context";
import type { FoodSeed } from "../../data/foods";
import { remove, upsert } from "../../db/store";
import type { Meal } from "../../db/types";
import { addDays, daysBetween } from "../../domain/dates";
import { averageIntake, calorieAdvice, calorieTarget, dayTotals, weightSeries, weightTrend } from "../../domain/nutrition";
import { currentValue, signed } from "../../domain/body";
import { Card, Chips, Field, Notice, Progress, Sheet, Stat, Stepper, ToggleRow, toast } from "../../ui/components";
import { DayPicker } from "../../ui/DatePicker";
import { Icon } from "../../ui/icons";

const MEALS: { value: Meal; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "midday", label: "Midday" },
  { value: "evening", label: "Evening" },
  { value: "snack", label: "Snack" },
];

const DEFAULT_QUICK = ["whey", "chapati", "sabji", "dal", "paneer_100", "egg", "chicken_curry", "soya_curry", "curd", "tea"];

function defaultMeal(): Meal {
  const h = new Date().getHours();
  return h < 11 ? "morning" : h < 16 ? "midday" : h < 23 ? "evening" : "snack";
}

export function FoodTab() {
  const db = useDB();
  const profile = useProfile();
  const today = useToday();
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<FoodSeed | null>(null);
  const [custom, setCustom] = useState(false);
  const foods = allFoods();

  const ws = weightSeries(db.weights, db.measurements);
  const latestKg = ws[ws.length - 1]?.kg ?? 78;
  const cal = calorieTarget(profile, latestKg, today);
  const t = dayTotals(db.foodEntries, date);
  const proteinGoal = Math.round((profile.protein_target.min + profile.protein_target.max) / 2);
  const entries = db.foodEntries.filter((e) => e.date === date);

  const quick = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of db.foodEntries) if (e.food_id && e.date >= addDays(today, -30)) counts.set(e.food_id, (counts.get(e.food_id) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const ids = [...new Set([...ranked, ...DEFAULT_QUICK])].slice(0, 10);
    return ids.map((id) => foods.find((f) => f.id === id)).filter((f): f is FoodSeed => !!f);
  }, [db.foodEntries, foods, today]);

  const results = q.trim()
    ? foods.filter((f) => [f.name, ...f.tags].some((s) => s.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 20)
    : [];

  return (
    <>
      <DayPicker value={date} onChange={setDate} today={today} />
      <Card>
        <div className="grid2">
          <Stat label="Calories" value={<>{Math.round(t.kcal)}</>} sub={`of ${cal.target} · ${Math.max(0, Math.round(cal.target - t.kcal))} left`} />
          <Stat label="Protein" value={<>{Math.round(t.protein)} g</>} sub={`of ${proteinGoal} g · ${Math.max(0, Math.round(proteinGoal - t.protein))} left`} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Progress value={t.protein} max={proteinGoal} good={t.protein >= profile.protein_target.min} />
        </div>
        <div className="spread small muted" style={{ marginTop: 8 }}>
          <span>Carbs {Math.round(t.carbs)} g</span>
          <span>Fat {Math.round(t.fat)} g</span>
          <span>{entries.length} item{entries.length === 1 ? "" : "s"}</span>
        </div>
      </Card>

      <Card title="Add food">
        <input className="input" placeholder="Search: paneer, dal, roti…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search foods" />
        {results.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {results.map((f) => (
              <button key={f.id} className="list-item" onClick={() => setPick(f)}>
                <span className="grow">
                  <b>{f.name}</b>
                  <span className="muted small" style={{ display: "block" }}>
                    {f.serving} · {f.kcal} kcal · {f.protein} g protein
                  </span>
                </span>
                <Icon name="plus" />
              </button>
            ))}
          </div>
        )}
        {!q && (
          <>
            <h3>Quick add</h3>
            <div className="chips">
              {quick.map((f) => (
                <button key={f.id} className="chip" onClick={() => setPick(f)}>
                  {f.name.split(" (")[0].split(",")[0]}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="btn block ghost" style={{ marginTop: 12 }} onClick={() => setCustom(true)}>
          Manual entry / custom food
        </button>
      </Card>

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.value);
        if (!list.length) return null;
        const mt = dayTotals(list, date);
        return (
          <Card key={m.value} title={m.label} action={<span className="muted small num">{Math.round(mt.kcal)} kcal · {Math.round(mt.protein)} g P</span>}>
            {list.map((e) => (
              <div key={e.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {e.servings !== 1 && <span className="num">{e.servings}× </span>}
                    {e.name}
                  </div>
                  <div className="muted small num">
                    {e.kcal} kcal · P {e.protein} · C {e.carbs} · F {e.fat}
                    {e.source === "coach_estimate" && <span className="badge warn" style={{ marginLeft: 6 }}>estimate</span>}
                  </div>
                </div>
                <button className="iconbtn" aria-label={`Delete ${e.name}`} onClick={() => remove("foodEntries", e.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ))}
          </Card>
        );
      })}

      <TargetsCard />

      <AddSheet food={pick} onClose={() => setPick(null)} date={date} />
      <CustomSheet open={custom} onClose={() => setCustom(false)} date={date} />
    </>
  );
}

function AddSheet({ food, onClose, date }: { food: FoodSeed | null; onClose: () => void; date: string }) {
  const [servings, setServings] = useState<number | undefined>(1);
  const [meal, setMeal] = useState<Meal>(defaultMeal());
  if (!food) return null;
  const s = servings ?? 0;
  return (
    <Sheet open onClose={onClose} title={food.name}>
      <p className="muted small">
        1 serving = {food.serving} · values are approximate.
      </p>
      <Field label="Servings">
        <Stepper value={servings} onChange={setServings} step={0.5} digits={1} min={0} max={20} label="Servings" />
      </Field>
      <div className="grid3" style={{ margin: "8px 0" }}>
        <Stat label="kcal" value={Math.round(food.kcal * s)} />
        <Stat label="Protein" value={`${Math.round(food.protein * s)} g`} />
        <Stat label="Carbs/Fat" value={<span style={{ fontSize: 16 }}>{Math.round(food.carbs * s)}/{Math.round(food.fat * s)}</span>} />
      </div>
      <Field label="Meal">
        <Chips value={meal} options={MEALS} onChange={(v) => setMeal(v as Meal)} />
      </Field>
      <button
        className="btn primary block"
        disabled={!s}
        onClick={() => {
          addFood(food, s, meal, date);
          toast(`Added ${food.name}`);
          setServings(1);
          onClose();
        }}
      >
        Add
      </button>
    </Sheet>
  );
}

function CustomSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const [name, setName] = useState("");
  const [serving, setServing] = useState("1 serving");
  const [kcal, setKcal] = useState<number | undefined>();
  const [p, setP] = useState<number | undefined>();
  const [c, setC] = useState<number | undefined>();
  const [f, setF] = useState<number | undefined>();
  const [save, setSave] = useState(true);
  const [meal, setMeal] = useState<Meal>(defaultMeal());
  const ok = name.trim() && kcal != null;
  return (
    <Sheet open={open} onClose={onClose} title="Manual entry">
      <Field label="Food name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Serving description">
        <input className="input" value={serving} onChange={(e) => setServing(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="Calories">
          <Stepper value={kcal} onChange={setKcal} step={10} label="Calories" />
        </Field>
        <Field label="Protein (g)">
          <Stepper value={p} onChange={setP} label="Protein" />
        </Field>
        <Field label="Carbs (g)">
          <Stepper value={c} onChange={setC} label="Carbs" />
        </Field>
        <Field label="Fat (g)">
          <Stepper value={f} onChange={setF} label="Fat" />
        </Field>
      </div>
      <Field label="Meal">
        <Chips value={meal} options={MEALS} onChange={(v) => setMeal(v as Meal)} />
      </Field>
      <ToggleRow label="Save to my foods" sub="Appears in search and quick add" on={save} onChange={setSave} />
      <button
        className="btn primary block"
        disabled={!ok}
        onClick={() => {
          const food: FoodSeed = { id: crypto.randomUUID(), name: name.trim(), serving, kcal: kcal ?? 0, protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0, tags: [] };
          if (save) {
            const rec = upsert("foodItems", { ...food, custom: true, date });
            food.id = rec.id;
          }
          addFood(food, 1, meal, date);
          toast("Added");
          setName("");
          setKcal(undefined);
          setP(undefined);
          setC(undefined);
          setF(undefined);
          onClose();
        }}
      >
        Add
      </button>
    </Sheet>
  );
}

function TargetsCard() {
  const db = useDB();
  const profile = useProfile();
  const today = useToday();
  const ws = weightSeries(db.weights, db.measurements);
  const latestKg = ws[ws.length - 1]?.kg ?? 78;
  const cal = calorieTarget(profile, latestKg, today);
  const week = averageIntake(db.foodEntries, addDays(today, -6), today);
  const two = averageIntake(db.foodEntries, addDays(today, -13), today);
  const trend = weightTrend(ws, today);
  const waistNow = currentValue("waist", db.measurements, db.weights);
  const waistThen = currentValue("waist", db.measurements, db.weights, addDays(today, -28));
  const waistChange = waistNow && waistThen && daysBetween(waistThen.date, waistNow.date) >= 14 ? waistNow.value - waistThen.value : null;
  const advice = calorieAdvice({
    trendKgPerWeek: trend?.kgPerWeek ?? null,
    currentTarget: cal.target,
    avgLoggedKcal: two.kcal,
    loggedDays: two.loggedDays,
    waistChange28d: waistChange,
    floor: Math.max(1400, cal.bmr),
  });
  const apply = (v: number | null) => upsert("profile", { ...profile, calorie_target_override: v });

  return (
    <Card title="Targets & trend">
      <div className="grid2">
        <Stat label="7-day avg calories" value={week.kcal != null ? Math.round(week.kcal) : "—"} sub={`${week.loggedDays} logged days`} />
        <Stat label="7-day avg protein" value={week.protein != null ? `${Math.round(week.protein)} g` : "—"} sub={`target ${profile.protein_target.min}–${profile.protein_target.max} g`} />
        <Stat label="Weight trend" value={trend ? `${signed(trend.kgPerWeek, 2)}` : "—"} sub="kg/week (3-week fit)" />
        <Stat label="Calorie target" value={cal.target} sub={cal.overridden ? `custom · calculated ${cal.calculated}` : "calculated"} />
      </div>
      <Notice kind={advice.kind === "too_fast" ? "warn" : advice.kind === "on_track" || advice.kind === "recomp" ? "good" : "info"}>
        <span className="tag estimate">ESTIMATE</span>
        {advice.message}
        {advice.suggestedTarget && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { apply(advice.suggestedTarget!); toast(`Target set to ${advice.suggestedTarget} kcal`); }}>
              Use {advice.suggestedTarget} kcal
            </button>
          </div>
        )}
      </Notice>
      <details>
        <summary className="small muted" style={{ cursor: "pointer", padding: "6px 0" }}>How this is calculated / adjust</summary>
        <p className="small muted">
          Mifflin–St Jeor BMR {cal.bmr} kcal × activity = maintenance ≈ {cal.tdee} kcal, minus ≈{cal.deficit} kcal for {profile.target_loss_kg_per_week} kg/week. Never set below BMR or 1400 kcal. Suggestions come from your actual weight trend, and weight doesn't have to fall if your waist is improving.
        </p>
        <Field label="Custom daily target (kcal)">
          <Stepper value={profile.calorie_target_override ?? cal.calculated} onChange={(v) => apply(v ?? null)} step={50} min={1200} max={4000} label="Calorie target" />
        </Field>
        {cal.overridden && (
          <button className="btn sm" onClick={() => apply(null)}>
            Reset to calculated ({cal.calculated})
          </button>
        )}
      </details>
    </Card>
  );
}
