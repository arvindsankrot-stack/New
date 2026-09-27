import { useState } from "react";
import { useApp, useDB, useProfile, useToday } from "../app-context";
import { remove, upsert } from "../db/store";
import type { FeminizationEntry, LabKind, LabResult, LabSchedule, MedCategory, Medication } from "../db/types";
import { fmtDate } from "../domain/dates";
import { adherence, CLINICIAN_NOTE, dosesOn, LAB_KINDS, labDue, labFlag } from "../domain/hrt";
import { toggleDose } from "../actions";
import { LineChart } from "../ui/Chart";
import { Card, Check, Chips, Empty, Field, ListItem, Notice, PageHead, pct, Seg, Sheet, Slider, Stat, Stepper, toast } from "../ui/components";
import { Icon } from "../ui/icons";

type Sub = "today" | "regimen" | "labs" | "changes";

export function HRT({ sub }: { sub?: string }) {
  const { go } = useApp();
  const profile = useProfile();
  const tab = (sub as Sub) || "today";
  const options: { value: Sub; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "regimen", label: "Regimen" },
    { value: "labs", label: "Labs" },
    ...(profile.modules.feminization ? [{ value: "changes" as Sub, label: "Changes" }] : []),
  ];
  return (
    <>
      <PageHead eyebrow="HRT" title="Medication & monitoring" />
      <Notice kind="info">
        <span className="tag medical">MEDICAL</span>
        This section records what your clinician prescribes and reminds you. It never suggests starting, stopping or changing a dose. HRT decisions are made with your clinician.
      </Notice>
      <Seg value={tab} options={options} onChange={(v) => go("hrt", v)} />
      {tab === "today" && <TodayTab />}
      {tab === "regimen" && <RegimenTab />}
      {tab === "labs" && <LabsTab />}
      {tab === "changes" && <ChangesTab />}
    </>
  );
}

function TodayTab() {
  const db = useDB();
  const today = useToday();
  const { go } = useApp();
  const doses = dosesOn(db.medications, db.medLogs, today);
  const a1 = adherence(db.medications, db.medLogs, today, 1);
  const a7 = adherence(db.medications, db.medLogs, today, 7);
  const a30 = adherence(db.medications, db.medLogs, today, 30);
  return (
    <>
      <Card title="Today's doses" action={<button className="btn sm" onClick={() => go("track", "hrt")}>Log other days</button>}>
        {doses.length === 0 ? (
          db.medications.length ? <Empty>Nothing scheduled today.</Empty> : <Empty>Enter your regimen in the Regimen tab.</Empty>
        ) : (
          doses.map((d) => (
            <Check key={d.med.id + d.slot} on={d.log?.status === "taken"} onToggle={() => toggleDose(d.med, d.slot, today)} sub={`${d.med.dose} ${d.med.unit} · ${d.med.route} · ${d.slot}`}>
              {d.med.name}
            </Check>
          ))
        )}
      </Card>
      <Card title="Adherence">
        <div className="grid3">
          <Stat label="Today" value={pct(a1.pct)} sub={`${a1.taken}/${a1.scheduled}`} />
          <Stat label="7 days" value={pct(a7.pct)} sub={`${a7.taken}/${a7.scheduled}`} />
          <Stat label="30 days" value={pct(a30.pct)} sub={`${a30.taken}/${a30.scheduled}`} />
        </div>
      </Card>
    </>
  );
}

const CATS: { value: MedCategory; label: string }[] = [
  { value: "estradiol", label: "Estradiol" },
  { value: "antiandrogen", label: "Antiandrogen" },
  { value: "progesterone", label: "Progesterone" },
  { value: "other", label: "Other" },
];

function RegimenTab() {
  const db = useDB();
  const [edit, setEdit] = useState<Medication | "new" | null>(null);
  return (
    <>
      <Card title="Prescribed regimen" action={<button className="btn sm primary" onClick={() => setEdit("new")}>Add</button>}>
        {db.medications.length === 0 && <Empty>Enter each medication exactly as your clinician prescribed it.</Empty>}
        {db.medications.map((m) => (
          <ListItem
            key={m.id}
            icon="pill"
            title={
              <>
                {m.name} {!m.active && <span className="badge">stopped</span>}
              </>
            }
            sub={`${m.dose} ${m.unit} · ${m.route} · ${m.frequency.replace("_", " ")}${m.frequency === "every_n_days" ? ` (${m.every_n_days})` : ""} · ${m.times.join(", ")}${m.clinician ? ` · ${m.clinician}` : ""}`}
            onClick={() => setEdit(m)}
          />
        ))}
      </Card>
      <p className="tiny muted">Changing a dose here only records a change your clinician made. Keep old entries by marking them stopped and adding the new one, so your history stays accurate.</p>
      {edit && <MedSheet med={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MedSheet({ med, onClose }: { med?: Medication; onClose: () => void }) {
  const today = useToday();
  const [m, setM] = useState<Partial<Medication>>(
    med ?? { name: "", category: "estradiol", dose: undefined, unit: "mg", route: "oral", times: ["09:00"], frequency: "daily", start_date: today, clinician: "", active: true },
  );
  const set = (p: Partial<Medication>) => setM({ ...m, ...p });
  const ok = m.name && m.dose != null && m.unit && m.start_date;
  return (
    <Sheet open onClose={onClose} title={med ? "Edit medication" : "Add medication"}>
      <Field label="Category">
        <Chips value={m.category!} options={CATS} onChange={(v) => set({ category: v as MedCategory })} />
      </Field>
      <Field label="Medication name">
        <input className="input" value={m.name} onChange={(e) => set({ name: e.target.value })} placeholder="As written on the prescription" />
      </Field>
      <div className="grid2">
        <Field label="Dose">
          <Stepper value={m.dose} onChange={(v) => set({ dose: v })} step={0.5} digits={2} label="Dose" />
        </Field>
        <Field label="Unit">
          <input className="input" value={m.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="mg, mcg/day, ml…" />
        </Field>
      </div>
      <Field label="Route">
        <Chips value={m.route!} onChange={(v) => set({ route: v as string })} options={["oral", "sublingual", "transdermal patch", "gel", "injection", "other"].map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Frequency">
        <select className="input" value={m.frequency} onChange={(e) => set({ frequency: e.target.value as Medication["frequency"] })}>
          <option value="daily">Once daily</option>
          <option value="twice_daily">Twice daily</option>
          <option value="weekly">Weekly (same weekday as start)</option>
          <option value="every_n_days">Every N days</option>
          <option value="as_directed">As directed (no reminders)</option>
        </select>
      </Field>
      {m.frequency === "every_n_days" && (
        <Field label="Every how many days">
          <Stepper value={m.every_n_days} onChange={(v) => set({ every_n_days: v })} min={1} max={60} label="Interval days" />
        </Field>
      )}
      <div className="grid2">
        <Field label={m.frequency === "twice_daily" ? "First time" : "Time"}>
          <input className="input" type="time" value={m.times?.[0] ?? "09:00"} onChange={(e) => set({ times: [e.target.value, ...(m.times?.slice(1) ?? [])] })} />
        </Field>
        {m.frequency === "twice_daily" && (
          <Field label="Second time">
            <input className="input" type="time" value={m.times?.[1] ?? "21:00"} onChange={(e) => set({ times: [m.times?.[0] ?? "09:00", e.target.value] })} />
          </Field>
        )}
      </div>
      <div className="grid2">
        <Field label="Start date">
          <input className="input" type="date" value={m.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </Field>
        <Field label="End date (optional)">
          <input className="input" type="date" value={m.end_date ?? ""} onChange={(e) => set({ end_date: e.target.value || undefined })} />
        </Field>
      </div>
      <Field label="Prescribing clinician">
        <input className="input" value={m.clinician} onChange={(e) => set({ clinician: e.target.value })} />
      </Field>
      <Field label="Notes">
        <textarea className="input" value={m.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Instructions from your clinician" />
      </Field>
      <button
        className="btn primary block"
        disabled={!ok}
        onClick={() => {
          upsert("medications", { ...(m as Medication), times: m.frequency === "twice_daily" ? [m.times?.[0] ?? "09:00", m.times?.[1] ?? "21:00"] : [m.times?.[0] ?? "09:00"], date: m.start_date! });
          toast("Saved");
          onClose();
        }}
      >
        Save
      </button>
      {med && (
        <div className="grid2" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => { upsert("medications", { ...med, active: !med.active, end_date: med.active ? today : undefined }); onClose(); }}>
            {med.active ? "Mark stopped" : "Reactivate"}
          </button>
          <button className="btn danger" onClick={() => { if (confirm("Delete this medication and keep its logs?")) { remove("medications", med.id); onClose(); } }}>
            Delete
          </button>
        </div>
      )}
    </Sheet>
  );
}

function LabsTab() {
  const db = useDB();
  const today = useToday();
  const [adding, setAdding] = useState(false);
  const [sched, setSched] = useState<LabSchedule | "new" | null>(null);
  const [kind, setKind] = useState<LabKind>("estradiol");
  const byKind = LAB_KINDS.filter((k) => db.labs.some((l) => l.kind === k.kind));
  const series = db.labs.filter((l) => l.kind === kind).sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = [...db.labs].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <Card title="Lab reminders" action={<button className="btn sm" onClick={() => setSched("new")}>Add</button>}>
        {db.labSchedules.length === 0 && <Empty>Add the testing interval your clinician asked for (e.g. every 90 days).</Empty>}
        {db.labSchedules.map((s) => {
          const d = labDue(s, today);
          return (
            <ListItem
              key={s.id}
              icon="flask"
              title={s.label}
              sub={`Every ${s.interval_days} days · ${s.last_done ? `last ${fmtDate(s.last_done)}` : "not done yet"} · set by ${s.set_by || "clinician"}`}
              right={<span className={`badge ${d.due ? "warn" : ""}`}>{d.due ? "due" : `in ${d.daysUntil} d`}</span>}
              onClick={() => setSched(s)}
            />
          );
        })}
      </Card>

      <Card title="Results" action={<button className="btn sm primary" onClick={() => setAdding(true)}>Add result</button>}>
        {byKind.length > 0 && (
          <>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as LabKind)} aria-label="Lab to chart">
              {byKind.map((k) => (
                <option key={k.kind} value={k.kind}>{k.label}</option>
              ))}
            </select>
            {series.length > 0 && (
              <LineChart
                points={series.map((l) => ({ date: l.date, value: l.value }))}
                from={series[0].date}
                to={series[series.length - 1].date}
                unit={` ${series[series.length - 1].unit}`}
                band={series[series.length - 1].ref_low != null && series[series.length - 1].ref_high != null ? { min: series[series.length - 1].ref_low!, max: series[series.length - 1].ref_high! } : undefined}
                label={LAB_KINDS.find((k) => k.kind === kind)!.label}
              />
            )}
          </>
        )}
        {recent.length === 0 && <Empty>No results yet.</Empty>}
        {recent.slice(0, 30).map((l) => {
          const f = labFlag(l);
          return (
            <div key={l.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="spread">
                <b>{l.label}</b>
                <span className="num">
                  {l.value} {l.unit}
                </span>
              </div>
              <div className="spread small muted">
                <span>
                  {fmtDate(l.date, { day: "numeric", month: "short", year: "numeric" })}
                  {l.ref_low != null || l.ref_high != null ? ` · ref ${l.ref_low ?? "…"}–${l.ref_high ?? "…"}` : ""}
                </span>
                {f === "above" || f === "below" ? <span className="badge warn">{f} your lab's range</span> : f === "in_range" ? <span className="badge">within range</span> : null}
              </div>
              {(f === "above" || f === "below") && <p className="small" style={{ margin: "4px 0 0" }}>{CLINICIAN_NOTE}</p>}
              <button className="btn sm ghost" onClick={() => confirm("Delete this result?") && remove("labs", l.id)}>
                Delete
              </button>
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>Flags compare only against the reference range you enter from your lab report. {CLINICIAN_NOTE}</p>
      </Card>
      {adding && <LabSheet onClose={() => setAdding(false)} />}
      {sched && <SchedSheet s={sched === "new" ? undefined : sched} onClose={() => setSched(null)} />}
    </>
  );
}

function LabSheet({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const db = useDB();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<LabKind>("estradiol");
  const meta = LAB_KINDS.find((k) => k.kind === kind)!;
  const prev = [...db.labs].filter((l) => l.kind === kind).pop();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState<number | undefined>();
  const [unit, setUnit] = useState(meta.unit);
  const [lo, setLo] = useState<number | undefined>(prev?.ref_low);
  const [hi, setHi] = useState<number | undefined>(prev?.ref_high);
  const [notes, setNotes] = useState("");
  const changeKind = (k: LabKind) => {
    setKind(k);
    const m = LAB_KINDS.find((x) => x.kind === k)!;
    const p = [...db.labs].filter((l) => l.kind === k).pop();
    setUnit(p?.unit ?? m.unit);
    setLo(p?.ref_low);
    setHi(p?.ref_high);
  };
  const draft: Partial<LabResult> = { value, ref_low: lo, ref_high: hi };
  const flag = value != null ? labFlag(draft as LabResult) : "no_range";
  return (
    <Sheet open onClose={onClose} title="Add lab result">
      <Field label="Test">
        <select className="input" value={kind} onChange={(e) => changeKind(e.target.value as LabKind)}>
          {LAB_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
      </Field>
      {kind === "other" && (
        <Field label="Test name">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      )}
      <Field label="Date">
        <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="Result">
          <Stepper value={value} onChange={setValue} step={0.1} digits={2} label="Result" />
        </Field>
        <Field label="Unit">
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Lab range low">
          <Stepper value={lo} onChange={setLo} step={0.1} digits={2} label="Reference low" />
        </Field>
        <Field label="Lab range high">
          <Stepper value={hi} onChange={setHi} step={0.1} digits={2} label="Reference high" />
        </Field>
      </div>
      {(flag === "above" || flag === "below") && <Notice kind="warn" title={`Outside the range you entered (${flag})`}>{CLINICIAN_NOTE}</Notice>}
      <Field label="Notes">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <button
        className="btn primary block"
        disabled={value == null}
        onClick={() => {
          upsert("labs", { date, kind, label: kind === "other" ? label || "Other" : meta.label, value: value!, unit, ref_low: lo, ref_high: hi, notes: notes || undefined });
          for (const s of db.labSchedules) if (s.kinds.includes(kind) && (!s.last_done || s.last_done < date)) upsert("labSchedules", { ...s, last_done: date });
          toast("Result saved");
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

function SchedSheet({ s, onClose }: { s?: LabSchedule; onClose: () => void }) {
  const [label, setLabel] = useState(s?.label ?? "HRT blood panel");
  const [kinds, setKinds] = useState<LabKind[]>(s?.kinds ?? ["estradiol", "testosterone"]);
  const [interval, setIntervalDays] = useState<number | undefined>(s?.interval_days ?? 90);
  const [by, setBy] = useState(s?.set_by ?? "");
  const [last, setLast] = useState(s?.last_done ?? "");
  return (
    <Sheet open onClose={onClose} title="Lab reminder">
      <Field label="Name">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Tests included">
        <Chips multi value={kinds} onChange={(v) => setKinds(v as LabKind[])} options={LAB_KINDS.filter((k) => k.kind !== "other").map((k) => ({ value: k.kind, label: k.label }))} />
      </Field>
      <Field label="Interval (days) — as your clinician advised">
        <Stepper value={interval} onChange={setIntervalDays} step={15} min={7} max={730} label="Interval days" />
      </Field>
      <Field label="Set by">
        <input className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Clinician's name" />
      </Field>
      <Field label="Last done (optional)">
        <input className="input" type="date" value={last} onChange={(e) => setLast(e.target.value)} />
      </Field>
      <button
        className="btn primary block"
        disabled={!interval || !label}
        onClick={() => {
          upsert("labSchedules", { id: s?.id, label, kinds, interval_days: interval!, set_by: by, last_done: last || undefined });
          onClose();
        }}
      >
        Save
      </button>
      {s && (
        <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => { remove("labSchedules", s.id); onClose(); }}>
          Delete reminder
        </button>
      )}
    </Sheet>
  );
}

function ChangesTab() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const list = [...db.feminization].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <Card title="Feminization log" action={<button className="btn sm primary" onClick={() => setOpen(true)}>Monthly entry</button>}>
        <p className="muted small">Record what you notice, once a month. The app shows your own history and never predicts outcomes.</p>
        {list.length === 0 && <Empty>No entries yet.</Empty>}
        {list.map((f) => (
          <details key={f.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{fmtDate(f.date, { day: "numeric", month: "long", year: "numeric" })}</summary>
            <div className="small" style={{ marginTop: 6 }}>
              {f.bust != null && f.underbust != null && <p>Bust {f.bust}″ · underbust {f.underbust}″ · difference {(f.bust - f.underbust).toFixed(1)}″</p>}
              <p className="muted num">
                Tenderness {f.breast_tenderness ?? "—"} · skin softness {f.skin_softness ?? "—"} · oiliness {f.skin_oiliness ?? "—"} · acne {f.acne ?? "—"} · dryness {f.skin_dryness ?? "—"} · facial hair {f.facial_hair ?? "—"} · body hair {f.body_hair ?? "—"} · shaves/week {f.shaves_per_week ?? "—"}
              </p>
              {f.breast_notes && <p>Breast: {f.breast_notes}</p>}
              {f.nipple_changes && <p>Nipples: {f.nipple_changes}</p>}
              {f.libido != null && <p className="muted">Libido {f.libido} · spontaneous erections {f.spontaneous_erections ?? "—"}</p>}
              {f.genital_changes && <p>Genital: {f.genital_changes}</p>}
              {f.other_changes && <p>Other: {f.other_changes}</p>}
              <button className="btn sm ghost" onClick={() => confirm("Delete entry?") && remove("feminization", f.id)}>Delete</button>
            </div>
          </details>
        ))}
      </Card>
      {open && <FemSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function FemSheet({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const db = useDB();
  const lastM = [...db.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const bust = [...lastM].reverse().find((m) => m.bust != null)?.bust;
  const ub = [...lastM].reverse().find((m) => m.underbust != null)?.underbust;
  const [f, setF] = useState<Partial<FeminizationEntry>>({ date: today, bust, underbust: ub, breast_tenderness: 0, skin_oiliness: 5, skin_softness: 5, acne: 0, skin_dryness: 3, facial_hair: 5, body_hair: 5, shaves_per_week: 3 });
  const [privateOpen, setPrivateOpen] = useState(false);
  const set = (p: Partial<FeminizationEntry>) => setF({ ...f, ...p });
  const s = (k: keyof FeminizationEntry, label: string, left: string, right: string) => (
    <Slider label={label} value={(f[k] as number) ?? 0} onChange={(v) => set({ [k]: v })} min={0} max={10} left={left} right={right} />
  );
  return (
    <Sheet open onClose={onClose} title="Monthly feminization entry">
      <Field label="Date">
        <input className="input" type="date" value={f.date} max={today} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <h3>Breast</h3>
      <div className="grid2">
        <Field label="Bust (in)">
          <Stepper value={f.bust} onChange={(v) => set({ bust: v })} step={0.25} digits={2} label="Bust" />
        </Field>
        <Field label="Underbust (in)">
          <Stepper value={f.underbust} onChange={(v) => set({ underbust: v })} step={0.25} digits={2} label="Underbust" />
        </Field>
      </div>
      {f.bust != null && f.underbust != null && <p className="small muted">Difference: {(f.bust - f.underbust).toFixed(2)}″</p>}
      {s("breast_tenderness", "Tenderness", "none", "very")}
      <Field label="Development notes">
        <textarea className="input" value={f.breast_notes ?? ""} onChange={(e) => set({ breast_notes: e.target.value })} />
      </Field>
      <Field label="Nipple changes">
        <input className="input" value={f.nipple_changes ?? ""} onChange={(e) => set({ nipple_changes: e.target.value })} />
      </Field>
      <h3>Skin</h3>
      {s("skin_oiliness", "Oiliness", "dry", "very oily")}
      {s("skin_softness", "Softness", "rough", "very soft")}
      {s("acne", "Acne", "none", "a lot")}
      {s("skin_dryness", "Dryness", "none", "very dry")}
      <h3>Hair</h3>
      {s("facial_hair", "Facial hair", "none", "heavy")}
      {s("body_hair", "Body hair", "none", "heavy")}
      <Field label="Shaves per week">
        <Stepper value={f.shaves_per_week} onChange={(v) => set({ shaves_per_week: v })} min={0} max={21} label="Shaves per week" />
      </Field>
      <button className="btn block ghost" onClick={() => setPrivateOpen(!privateOpen)}>
        <Icon name="lock" size={16} /> {privateOpen ? "Hide" : "Show"} private fields
      </button>
      {privateOpen && (
        <>
          {s("libido", "Libido", "none", "high")}
          {s("spontaneous_erections", "Spontaneous erections", "none", "frequent")}
          <Field label="Genital changes">
            <textarea className="input" value={f.genital_changes ?? ""} onChange={(e) => set({ genital_changes: e.target.value })} />
          </Field>
        </>
      )}
      <Field label="Other changes">
        <textarea className="input" value={f.other_changes ?? ""} onChange={(e) => set({ other_changes: e.target.value })} />
      </Field>
      <button
        className="btn primary block"
        onClick={() => {
          upsert("feminization", f as FeminizationEntry);
          toast("Entry saved");
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

