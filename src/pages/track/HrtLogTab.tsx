import { useState } from "react";
import { markMissed, toggleDose } from "../../actions";
import { useApp, useDB, useToday } from "../../app-context";
import { adherence, dosesOn, type DoseStatus } from "../../domain/hrt";
import { Card, Check, Empty, Field, Notice, pct, Sheet, Stat } from "../../ui/components";
import { DayPicker } from "../../ui/DatePicker";

export function HrtLogTab() {
  const db = useDB();
  const today = useToday();
  const { go } = useApp();
  const [date, setDate] = useState(today);
  const [missing, setMissing] = useState<DoseStatus | null>(null);
  const [note, setNote] = useState("");
  const doses = dosesOn(db.medications, db.medLogs, date);
  const day = adherence(db.medications, db.medLogs, date, 1);
  const a7 = adherence(db.medications, db.medLogs, today, 7);
  const a30 = adherence(db.medications, db.medLogs, today, 30);

  return (
    <>
      <DayPicker value={date} onChange={setDate} today={today} />
      <Card title="Doses">
        {db.medications.length === 0 && (
          <>
            <Empty>No medications entered yet.</Empty>
            <button className="btn block" onClick={() => go("hrt", "regimen")}>
              Enter prescribed regimen
            </button>
          </>
        )}
        {db.medications.length > 0 && doses.length === 0 && <Empty>Nothing scheduled on this day.</Empty>}
        {doses.map((d) => (
          <div key={d.med.id + d.slot}>
            <Check on={d.log?.status === "taken"} onToggle={() => toggleDose(d.med, d.slot, date)} sub={`${d.med.category} · ${d.med.dose} ${d.med.unit} · ${d.med.route} · ${d.slot}`}>
              {d.med.name}
            </Check>
            {d.log?.status === "missed" ? (
              <p className="small muted" style={{ margin: "0 0 8px 40px" }}>
                Marked missed{d.log.note ? `: ${d.log.note}` : ""}
              </p>
            ) : (
              d.log?.status !== "taken" && (
                <button className="btn sm ghost" style={{ marginLeft: 32 }} onClick={() => { setMissing(d); setNote(""); }}>
                  Mark missed
                </button>
              )
            )}
          </div>
        ))}
      </Card>
      <Card title="Adherence">
        <div className="grid3">
          <Stat label="This day" value={pct(day.pct)} sub={`${day.taken}/${day.scheduled}`} />
          <Stat label="7 days" value={pct(a7.pct)} sub={`${a7.taken}/${a7.scheduled}`} />
          <Stat label="30 days" value={pct(a30.pct)} sub={`${a30.taken}/${a30.scheduled}`} />
        </div>
      </Card>
      <Sheet open={!!missing} onClose={() => setMissing(null)} title="Missed dose">
        <Notice kind="info" title="Follow your clinician's missed-dose instructions">
          This app won't tell you to double up or change timing. If you're unsure what to do, check your prescription leaflet or ask your clinician or pharmacist.
        </Notice>
        <Field label="Note (optional)">
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. travelling, forgot, ran out" />
        </Field>
        <button
          className="btn primary block"
          onClick={() => {
            if (missing) markMissed(missing.med, missing.slot, date, note);
            setMissing(null);
          }}
        >
          Save
        </button>
      </Sheet>
    </>
  );
}
