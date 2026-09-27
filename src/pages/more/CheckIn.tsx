import { useState } from "react";
import { useApp, useDB, usePosition, useProfile } from "../../app-context";
import { upsert } from "../../db/store";
import type { BodyMeasurement } from "../../db/types";
import { fmtDate } from "../../domain/dates";
import { labDue } from "../../domain/hrt";
import { phaseFor } from "../../domain/program";
import { monthlyReport } from "../../domain/reports";
import { Card, Field, Notice, PageHead, pct, Stat, Stepper, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";
import { MeasureSheet } from "../track/BodyTab";

export function CheckIn({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const { go } = useApp();
  const month = pos.month;
  const existing = db.checkins.find((c) => c.month === month);
  const [measure, setMeasure] = useState(false);
  const [mid, setMid] = useState<string | undefined>(existing?.measurement_id);
  const [sys, setSys] = useState<number | undefined>(existing?.bp_systolic);
  const [dia, setDia] = useState<number | undefined>(existing?.bp_diastolic);
  const [refl, setRefl] = useState(existing?.reflections ?? "");
  const r = monthlyReport(db, profile.program_start, month, profile.protein_target.min, pos.today);
  const photosThisMonth = db.photos.filter((p) => p.month === month).length;
  const labsDue = db.labSchedules.filter((s) => labDue(s, pos.today).due);
  const measured = db.measurements.find((m) => m.id === mid);

  return (
    <>
      <PageHead eyebrow={`Month ${month} · ${phaseFor(month).title}`} title="Monthly check-in" onBack={onBack} sub={pos.isLastDayOfMonth ? "Today is check-in day." : `Scheduled for ${fmtDate(pos.monthEnd, { day: "numeric", month: "long" })} — you can do it any time.`} />

      <Card title="1 · Measurements">
        {measured ? (
          <p className="small num">
            ✓ {fmtDate(measured.date)} — weight {measured.weight ?? "—"} · waist {measured.waist ?? "—"} · belly {measured.belly ?? "—"} · hips {measured.hips ?? "—"} · bust {measured.bust ?? "—"} · underbust {measured.underbust ?? "—"} · thigh {measured.thigh ?? "—"} · arm {measured.arm ?? "—"}
          </p>
        ) : (
          <p className="small muted">Weight, waist, belly, hips, bust, underbust, thigh, arm.</p>
        )}
        <button className="btn block" onClick={() => setMeasure(true)}>
          <Icon name="ruler" size={18} /> {measured ? "Edit" : "Enter"} measurements
        </button>
      </Card>

      <Card title="2 · Photos">
        <p className="small muted">{photosThisMonth}/3 angles this month (front, side, back).</p>
        <button className="btn block" onClick={() => go("more", "photos")}>
          <Icon name="camera" size={18} /> Progress photos
        </button>
      </Card>

      <Card title="3 · Blood pressure">
        <div className="grid2">
          <Field label="Systolic">
            <Stepper value={sys} onChange={setSys} min={60} max={250} label="Systolic" placeholder={120} />
          </Field>
          <Field label="Diastolic">
            <Stepper value={dia} onChange={setDia} min={30} max={160} label="Diastolic" placeholder={80} />
          </Field>
        </div>
        <p className="tiny muted">Seated, rested 5 minutes. Share readings with your clinician.</p>
      </Card>

      <Card title="4 · Labs">
        {labsDue.length ? (
          <Notice kind="warn" title="Due">
            {labsDue.map((s) => s.label).join(", ")}
          </Notice>
        ) : (
          <p className="small muted">No lab tests due by your clinician's schedule.</p>
        )}
        <button className="btn block" onClick={() => go("hrt", "labs")}>
          Enter lab results
        </button>
      </Card>

      <Card title="5 · This month in numbers">
        <div className="grid2">
          <Stat label="Workouts" value={`${r.completed}/${r.planned}`} sub={pct(r.planned ? r.completed / r.planned : null)} />
          <Stat label="Protein target met" value={pct(r.protein.pct)} sub={`${r.protein.hit}/${r.protein.logged} logged days`} />
          <Stat label="Medication" value={pct(r.hrt.pct)} sub={`${r.hrt.taken}/${r.hrt.scheduled}`} />
          <Stat label="Mobility" value={r.mobility.sessions} sub={`${r.mobility.minutes} min`} />
          {profile.modules.hypno && <Stat label="Hypno" value={r.hypno.sessions} sub={`${r.hypno.minutes} min`} />}
          <Stat label="Avg calories" value={r.avgKcal != null ? Math.round(r.avgKcal) : "—"} sub={`${r.loggedDays} logged days`} />
        </div>
        <Field label="Reflections (optional)">
          <textarea className="input" value={refl} onChange={(e) => setRefl(e.target.value)} placeholder="What went well? What felt hard? Any changes you noticed?" />
        </Field>
      </Card>

      <Card title="Next month">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {r.objectives.map((o) => (
            <li key={o} style={{ marginBottom: 6 }}>{o}</li>
          ))}
        </ul>
      </Card>

      <button
        className="btn primary block"
        onClick={() => {
          upsert("checkins", { id: existing?.id, date: pos.today, month, measurement_id: mid, bp_systolic: sys, bp_diastolic: dia, reflections: refl || undefined, next_month_objectives: r.objectives });
          if (sys) upsert("labs", { date: pos.today, kind: "bp_systolic", label: "BP systolic", value: sys, unit: "mmHg" });
          if (dia) upsert("labs", { date: pos.today, kind: "bp_diastolic", label: "BP diastolic", value: dia, unit: "mmHg" });
          toast("Check-in saved");
          go("progress", "month");
        }}
      >
        Save check-in & view report
      </button>

      {measure && <MeasureSheet open existing={measured} onClose={() => setMeasure(false)} onSaved={(m: BodyMeasurement) => setMid(m.id)} />}
    </>
  );
}
