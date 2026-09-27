import { useDB, useProfile } from "../../app-context";
import { upsert } from "../../db/store";
import type { ActivityLevel, MeasureKey, Profile, Sex } from "../../db/types";
import { DEFAULT_GOALS, goalFor, MEASURE_LABELS } from "../../domain/body";
import { Card, Chips, Field, PageHead, Stepper, ToggleRow } from "../../ui/components";

export function ProfileSettings({ onBack }: { onBack: () => void }) {
  const p = useProfile();
  const db = useDB();
  const set = (patch: Partial<Profile>) => upsert("profile", { ...p, ...patch });

  return (
    <>
      <PageHead title="Profile & goals" onBack={onBack} />
      <Card title="Profile">
        <Field label="Name">
          <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid2">
          <Field label="Birth year">
            <Stepper value={p.birth_year} onChange={(v) => v && set({ birth_year: v })} min={1930} max={2010} label="Birth year" />
          </Field>
          <Field label="Height (cm)">
            <Stepper value={p.height_cm} onChange={(v) => v && set({ height_cm: v })} min={120} max={220} label="Height" />
          </Field>
        </div>
        <Field label="Programme day 1">
          <input className="input" type="date" value={p.program_start} onChange={(e) => e.target.value && set({ program_start: e.target.value })} />
        </Field>
      </Card>

      <Card title="Nutrition targets">
        <Field label="Calorie formula basis">
          <Chips<Sex>
            value={p.calc_basis}
            onChange={(v) => set({ calc_basis: v as Sex })}
            options={[
              { value: "average", label: "Average" },
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
            ]}
          />
        </Field>
        <p className="tiny muted">HRT gradually shifts body composition, so the BMR constant is your choice. "Average" sits between the two; your real weight trend fine-tunes it either way.</p>
        <Field label="Daily activity (outside workouts)">
          <Chips<ActivityLevel>
            value={p.activity}
            onChange={(v) => set({ activity: v as ActivityLevel })}
            options={[
              { value: "sedentary", label: "Desk" },
              { value: "light", label: "Light" },
              { value: "moderate", label: "Moderate" },
              { value: "active", label: "Active" },
            ]}
          />
        </Field>
        <Field label="Target rate of loss (kg/week)">
          <Chips
            value={String(p.target_loss_kg_per_week)}
            onChange={(v) => set({ target_loss_kg_per_week: Number(v) })}
            options={["0", "0.3", "0.45", "0.6"].map((v) => ({ value: v, label: v === "0" ? "Maintain" : v }))}
          />
        </Field>
        <div className="grid2">
          <Field label="Protein min (g)">
            <Stepper value={p.protein_target.min} onChange={(v) => v && set({ protein_target: { ...p.protein_target, min: v } })} step={5} label="Protein minimum" />
          </Field>
          <Field label="Protein max (g)">
            <Stepper value={p.protein_target.max} onChange={(v) => v && set({ protein_target: { ...p.protein_target, max: v } })} step={5} label="Protein maximum" />
          </Field>
        </div>
      </Card>

      <Card title="Body goals">
        <p className="small muted">Aspirational ranges shown as START → CURRENT → TARGET. They're directions, not guarantees.</p>
        {(["weight", "waist", "belly", "hips", "bust"] as MeasureKey[]).map((k) => {
          const g = goalFor(k, db.goals);
          const def = DEFAULT_GOALS.find((d) => d.key === k)!;
          const range = g?.range ?? { min: def.min, max: def.max };
          const save = (r: { min: number; max: number }) => upsert("goals", { id: g?.id, key: k, range: r, note: g?.note ?? def.note });
          const step = k === "weight" ? 0.5 : 0.25;
          return (
            <div key={k} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
              <b>{MEASURE_LABELS[k]} {k === "weight" ? "(kg)" : "(in)"}</b>
              <div className="grid2">
                <Field label="From">
                  <Stepper value={range.min} onChange={(v) => v != null && save({ ...range, min: v })} step={step} digits={2} label={`${k} target min`} />
                </Field>
                <Field label="To">
                  <Stepper value={range.max} onChange={(v) => v != null && save({ ...range, max: v })} step={step} digits={2} label={`${k} target max`} />
                </Field>
              </div>
              <p className="tiny muted">{g?.note ?? def.note}</p>
            </div>
          );
        })}
      </Card>

      <Card title="Daily goals">
        <Field label="Hypno / relaxation minutes per day">
          <Stepper value={p.hypno_daily_goal_min} onChange={(v) => v && set({ hypno_daily_goal_min: v })} step={5} min={5} max={120} label="Hypno minutes" />
        </Field>
      </Card>

      <Card title="Display & security">
        <Field label="Length units">
          <Chips value={p.units} onChange={(v) => set({ units: v as Profile["units"] })} options={[{ value: "in", label: "Inches" }, { value: "cm", label: "Centimetres" }]} />
        </Field>
        <p className="tiny muted">Unit choice applies to measurement entry; history is stored in inches.</p>
        <Field label="Theme">
          <Chips value={p.theme} onChange={(v) => set({ theme: v as Profile["theme"] })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </Field>
        <Field label="Auto-lock after">
          <Chips value={String(p.auto_lock_minutes)} onChange={(v) => set({ auto_lock_minutes: Number(v) })} options={["1", "5", "15", "30"].map((v) => ({ value: v, label: `${v} min` }))} />
        </Field>
      </Card>

      <Card title="Modules">
        <p className="small muted">Hide anything you don't want visible. Hidden data is kept, just not shown.</p>
        <ToggleRow label="Feminization tracker" on={p.modules.feminization} onChange={(v) => set({ modules: { ...p.modules, feminization: v } })} />
        <ToggleRow label="Hypno / relaxation" on={p.modules.hypno} onChange={(v) => set({ modules: { ...p.modules, hypno: v } })} />
        <ToggleRow label="Chastity log" on={p.modules.chastity} onChange={(v) => set({ modules: { ...p.modules, chastity: v } })} />
        <ToggleRow label="Pelvic floor" on={p.modules.pelvic} onChange={(v) => set({ modules: { ...p.modules, pelvic: v } })} />
      </Card>
    </>
  );
}
