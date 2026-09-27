import { useState } from "react";
import { useDB, useProfile, useToday } from "../../app-context";
import { remove, upsert } from "../../db/store";
import type { BodyMeasurement, MeasureKey } from "../../db/types";
import { CM_PER_IN, currentValue, fmtNum, LENGTH_KEYS, MEASURE_LABELS, whr } from "../../domain/body";
import { fmtDate } from "../../domain/dates";
import { Card, Field, Notice, Sheet, Stat, Stepper, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";

type Vals = Partial<Record<MeasureKey, number>>;

export function BodyTab() {
  const db = useDB();
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [adding, setAdding] = useState(false);
  const w = currentValue("waist", db.measurements, db.weights)?.value;
  const h = currentValue("hips", db.measurements, db.weights)?.value;
  const b = currentValue("bust", db.measurements, db.weights)?.value;
  const ub = currentValue("underbust", db.measurements, db.weights)?.value;
  const history = [...db.measurements].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1));

  return (
    <>
      <Card>
        <div className="grid2">
          <Stat label="Waist-to-hip ratio" value={fmtNum(whr(w, h), 3)} sub={w && h ? `${w}″ / ${h}″` : "needs waist + hips"} />
          <Stat label="Bust − underbust" value={b && ub ? `${(b - ub).toFixed(1)}″` : "—"} sub="tracked, not predicted" />
        </div>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
          <Icon name="ruler" size={18} /> New measurements
        </button>
        <p className="tiny muted" style={{ marginTop: 8 }}>Each entry is saved as a new record — history is never overwritten. Daily weight is quickest from Home → Weigh in.</p>
      </Card>

      <Card title="History">
        {history.map((m) => (
          <button key={m.id} className="list-item" onClick={() => setEditing(m)}>
            <span className="grow">
              <b>
                {fmtDate(m.date, { day: "numeric", month: "short", year: "numeric" })}
                {m.is_baseline && <span className="badge accent" style={{ marginLeft: 6 }}>Baseline</span>}
              </b>
              <span className="muted small num" style={{ display: "block" }}>
                {(["weight", "waist", "belly", "hips", "bust"] as MeasureKey[])
                  .filter((k) => m[k] != null)
                  .map((k) => `${MEASURE_LABELS[k].split(" ")[0]} ${m[k]}${k === "weight" ? " kg" : "″"}`)
                  .join(" · ")}
              </span>
            </span>
            <Icon name="edit" size={18} />
          </button>
        ))}
      </Card>

      <MeasureSheet open={adding} onClose={() => setAdding(false)} />
      {editing && <MeasureSheet open existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function MeasureSheet({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing?: BodyMeasurement; onSaved?: (m: BodyMeasurement) => void }) {
  const db = useDB();
  const profile = useProfile();
  const today = useToday();
  const [date, setDate] = useState(existing?.date ?? today);
  const [vals, setVals] = useState<Vals>(() => {
    if (!existing) return {};
    const v: Vals = {};
    for (const k of ["weight", ...LENGTH_KEYS] as MeasureKey[]) if (existing[k] != null) v[k] = existing[k];
    return v;
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const cm = profile.units === "cm";
  const show = (k: MeasureKey, v?: number) => (v == null ? undefined : k === "weight" || !cm ? v : Math.round(v * CM_PER_IN * 10) / 10);
  const store = (k: MeasureKey, v?: number) => (v == null ? undefined : k === "weight" || !cm ? v : Math.round((v / CM_PER_IN) * 100) / 100);

  const save = () => {
    const rec = upsert("measurements", { id: existing?.id, date, ...vals, is_baseline: existing?.is_baseline, notes: notes || undefined });
    toast(existing ? "Updated" : "Measurements saved");
    onSaved?.(rec);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "Edit measurement" : "New measurements"}>
      <Notice kind="info">Measure relaxed, same time of day, tape snug but not compressing. Leave anything you didn't measure blank.</Notice>
      <Field label="Date">
        <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {(["weight", ...LENGTH_KEYS] as MeasureKey[]).map((k) => {
        const last = currentValue(k, db.measurements, db.weights)?.value;
        return (
          <Field key={k} label={`${MEASURE_LABELS[k]} (${k === "weight" ? "kg" : cm ? "cm" : "in"})`}>
            <Stepper
              value={show(k, vals[k])}
              placeholder={show(k, last)}
              onChange={(v) => setVals({ ...vals, [k]: store(k, v) })}
              step={k === "weight" ? 0.1 : cm ? 0.5 : 0.25}
              digits={2}
              label={MEASURE_LABELS[k]}
            />
          </Field>
        );
      })}
      <Field label="Notes">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <button className="btn primary block" onClick={save} disabled={!Object.values(vals).some((v) => v != null)}>
        Save
      </button>
      {existing && !existing.is_baseline && (
        <button
          className="btn danger block"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm("Delete this measurement record?")) {
              remove("measurements", existing.id);
              onClose();
            }
          }}
        >
          Delete record
        </button>
      )}
    </Sheet>
  );
}
