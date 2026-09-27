import { useState } from "react";
import { useDB, useToday } from "../../app-context";
import { remove, upsert } from "../../db/store";
import type { ChastitySession } from "../../db/types";
import { fmtDate, fmtTime, isoDateOf } from "../../domain/dates";
import { chastityAlert, durationHours, type SafetyAlert } from "../../domain/safety";
import { Card, Check, Field, Notice, Slider, Stat, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";

type Flags = Pick<ChastitySession, "irritation" | "numbness" | "pain" | "swelling" | "discoloration" | "skin_injury" | "urination_difficulty">;

const FLAG_LABELS: [keyof Flags, string][] = [
  ["pain", "Pain"],
  ["numbness", "Numbness / tingling"],
  ["swelling", "Swelling"],
  ["discoloration", "Discolouration"],
  ["skin_injury", "Broken skin / injury"],
  ["urination_difficulty", "Difficulty urinating"],
  ["irritation", "Irritation / chafing"],
];

const NO_FLAGS: Flags = { irritation: false, numbness: false, pain: false, swelling: false, discoloration: false, skin_injury: false, urination_difficulty: false };

function localInput(ts: string | Date) {
  const d = new Date(ts);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function SafetyBanner({ alert }: { alert: SafetyAlert | null }) {
  if (!alert) return null;
  return (
    <Notice kind={alert.level === "stop" ? "danger" : "warn"} title={alert.title}>
      {alert.body}
    </Notice>
  );
}

export function ChastityTab() {
  const db = useDB();
  const today = useToday();
  const active = db.chastity.find((c) => c.worn && !c.end);
  const [flags, setFlags] = useState<Flags>(active ? pickFlags(active) : NO_FLAGS);
  const [comfort, setComfort] = useState(active?.comfort ?? 8);
  const [skin, setSkin] = useState(active?.skin_condition ?? 8);
  const [notes, setNotes] = useState(active?.notes ?? "");
  const [startAt, setStartAt] = useState(localInput(new Date()));
  const liveAlert = chastityAlert({ ...flags, comfort });
  const history = [...db.chastity].sort((a, b) => (a.start < b.start ? 1 : -1));
  const last30 = db.chastity.filter((c) => c.start >= new Date(Date.now() - 30 * 86400000).toISOString() && c.worn);
  const hours30 = last30.reduce((a, c) => a + durationHours(c), 0);
  const flagged30 = last30.filter((c) => chastityAlert(c)?.level === "stop").length;

  const saveCheck = (end: boolean) => {
    if (!active) return;
    upsert("chastity", { ...active, ...flags, comfort, skin_condition: skin, notes: notes || undefined, end: end ? new Date().toISOString() : undefined });
    toast(end ? "Session ended" : "Check-in saved");
    if (end) {
      setFlags(NO_FLAGS);
      setNotes("");
    }
  };

  return (
    <>
      <p className="muted small" style={{ marginTop: 12 }}>
        A private log. Comfort and skin health come first — the app never encourages continuing through pain or injury.
      </p>
      <Card>
        <div className="grid3">
          <Stat label="Status" value={<span style={{ fontSize: 17 }}>{active ? "On" : "Off"}</span>} sub={active ? `${durationHours(active).toFixed(1)} h` : " "} />
          <Stat label="30 days" value={`${hours30.toFixed(0)} h`} sub={`${last30.length} sessions`} />
          <Stat label="Red flags" value={flagged30} sub="last 30 days" />
        </div>
      </Card>

      {active ? (
        <Card title="Current session" action={<span className="muted small">since {fmtTime(active.start)}{isoDateOf(active.start) !== today ? `, ${fmtDate(isoDateOf(active.start))}` : ""}</span>}>
          <SafetyBanner alert={liveAlert} />
          <h3>How is it right now?</h3>
          {FLAG_LABELS.map(([k, l]) => (
            <Check key={k} on={flags[k]} onToggle={() => setFlags({ ...flags, [k]: !flags[k] })}>
              {l}
            </Check>
          ))}
          <Slider label="Comfort" value={comfort} onChange={setComfort} min={1} max={10} left="uncomfortable" right="comfortable" />
          <Slider label="Skin condition" value={skin} onChange={setSkin} min={1} max={10} left="sore" right="healthy" />
          <Field label="Notes">
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="grid2">
            <button className="btn" onClick={() => saveCheck(false)} disabled={liveAlert?.level === "stop"}>
              Save check-in
            </button>
            <button className={`btn ${liveAlert?.level === "stop" ? "danger" : "primary"}`} onClick={() => saveCheck(true)}>
              {liveAlert?.level === "stop" ? "Removed — end session" : "End session"}
            </button>
          </div>
        </Card>
      ) : (
        <Card title="Start a session">
          <Field label="Start time">
            <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <div className="grid2">
            <button
              className="btn primary"
              onClick={() => {
                upsert("chastity", { date: isoDateOf(new Date(startAt).toISOString()), worn: true, start: new Date(startAt).toISOString(), comfort: 8, ...NO_FLAGS });
                setFlags(NO_FLAGS);
                setComfort(8);
                setSkin(8);
                setNotes("");
                toast("Session started");
              }}
            >
              Start
            </button>
            <button
              className="btn"
              onClick={() => {
                upsert("chastity", { date: today, worn: false, start: new Date().toISOString(), end: new Date().toISOString(), ...NO_FLAGS });
                toast("Logged: not worn today");
              }}
            >
              Not worn today
            </button>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card title="History">
          {history.slice(0, 20).map((c) => {
            const a = chastityAlert(c);
            return (
              <div key={c.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                <div className="grow">
                  <b>{fmtDate(c.date, { weekday: "short", day: "numeric", month: "short" })}</b>{" "}
                  {!c.worn ? <span className="badge">not worn</span> : !c.end ? <span className="badge accent">active</span> : null}
                  {a && <span className={`badge ${a.level === "stop" ? "danger" : "warn"}`} style={{ marginLeft: 4 }}>{a.reasons.join(", ")}</span>}
                  {c.worn && (
                    <div className="muted small num">
                      {fmtTime(c.start)}–{c.end ? fmtTime(c.end) : "now"} · {durationHours(c).toFixed(1)} h{c.comfort != null ? ` · comfort ${c.comfort}` : ""}
                    </div>
                  )}
                </div>
                <button className="iconbtn" aria-label="Delete entry" onClick={() => confirm("Delete this entry?") && remove("chastity", c.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

function pickFlags(c: ChastitySession): Flags {
  return {
    irritation: c.irritation,
    numbness: c.numbness,
    pain: c.pain,
    swelling: c.swelling,
    discoloration: c.discoloration,
    skin_injury: c.skin_injury,
    urination_difficulty: c.urination_difficulty,
  };
}
