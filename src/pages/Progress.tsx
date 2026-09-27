import { useState } from "react";
import { useApp, useDB, usePosition, useProfile } from "../app-context";
import type { MeasureKey } from "../db/types";
import { fmtNum, goalFor, MEASURE_LABELS, seriesFor, signed, whr } from "../domain/body";
import { addDays, dateRange, fmtDate, weekStart } from "../domain/dates";
import { EXERCISES } from "../domain/exercises";
import { adherence, dosesOn } from "../domain/hrt";
import { averageIntake, calorieTarget, proteinCompliance, weightSeries } from "../domain/nutrition";
import { addMonths } from "../domain/program";
import { checkpointTable, hypnoStats, monthlyReport, sessionsCompleted, sessionsPlanned, weeklyReview, yearTwoRecommendations } from "../domain/reports";
import { BarChart, LineChart, type Pt } from "../ui/Chart";
import { Card, Empty, Notice, PageHead, pct, Seg, Stat } from "../ui/components";
import { Icon } from "../ui/icons";

type Sub = "charts" | "week" | "month" | "year";

export function Progress({ sub }: { sub?: string }) {
  const { go } = useApp();
  const tab = (sub as Sub) || "charts";
  return (
    <>
      <PageHead eyebrow="Progress" title={{ charts: "Charts", week: "Weekly review", month: "Monthly report", year: "Checkpoints" }[tab]} />
      <Seg
        value={tab}
        onChange={(v) => go("progress", v)}
        options={[
          { value: "charts", label: "Charts" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
          { value: "year", label: "Checkpoints" },
        ]}
      />
      {tab === "charts" && <Charts />}
      {tab === "week" && <Week />}
      {tab === "month" && <Month />}
      {tab === "year" && <Year />}
    </>
  );
}

type RangeKey = "1m" | "3m" | "6m" | "12m" | "all";

function Charts() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const [range, setRange] = useState<RangeKey>("3m");
  const to = pos.today;
  const firstData = [profile.program_start, ...db.measurements.map((m) => m.date), ...db.weights.map((w) => w.date)].sort()[0];
  const rangeFrom = addMonths(to, -{ "1m": 1, "3m": 3, "6m": 6, "12m": 12 }[range as Exclude<RangeKey, "all">] || 0);
  // Don't stretch the axis over empty months before tracking began.
  const floor = addDays(firstData, -7) < addDays(to, -28) ? addDays(firstData, -7) : addDays(to, -28);
  const from = range === "all" ? firstData : rangeFrom > floor ? rangeFrom : floor;

  const line = (k: MeasureKey) => {
    const g = goalFor(k, db.goals);
    return (
      <Card key={k} title={MEASURE_LABELS[k]}>
        <LineChart points={seriesFor(k, db.measurements, db.weights)} from={from} to={to} band={g?.range} unit={k === "weight" ? " kg" : "″"} label={MEASURE_LABELS[k]} />
      </Card>
    );
  };

  const whrPts: Pt[] = (() => {
    const w = seriesFor("waist", db.measurements, db.weights);
    const h = seriesFor("hips", db.measurements, db.weights);
    return w.map((p) => {
      const hp = [...h].reverse().find((x) => x.date <= p.date);
      return hp ? { date: p.date, value: p.value / hp.value } : null;
    }).filter((x): x is Pt => !!x);
  })();

  const days = dateRange(from < addDays(to, -400) ? addDays(to, -400) : from, to);
  const intake = averageIntake(db.foodEntries, from, to).days;
  const protein: Pt[] = [...intake.entries()].map(([date, t]) => ({ date, value: t.protein }));
  const kcal: Pt[] = [...intake.entries()].map(([date, t]) => ({ date, value: t.kcal }));
  const ws = weightSeries(db.weights, db.measurements);
  const target = calorieTarget(profile, ws[ws.length - 1]?.kg ?? 78, to).target;
  const adh: Pt[] = days
    .map((d) => {
      const doses = dosesOn(db.medications, db.medLogs, d);
      return doses.length ? { date: d, value: (doses.filter((x) => x.log?.status === "taken").length / doses.length) * 100 } : null;
    })
    .filter((x): x is Pt => !!x);
  const hyp: Pt[] = [...db.hypno.reduce((m, h) => m.set(h.date, (m.get(h.date) ?? 0) + h.minutes), new Map<string, number>())].map(([date, value]) => ({ date, value }));
  const weeks: Pt[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push({ date: w, value: sessionsCompleted(db, w, addDays(w, 6)) });
  const flex: Pt[] = db.mobility.filter((m) => m.scores.overall != null).map((m) => ({ date: m.date, value: m.scores.overall! })).sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <>
      <div style={{ marginTop: 12 }}>
        <Seg value={range} onChange={setRange} options={[{ value: "1m", label: "1M" }, { value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "12m", label: "12M" }, { value: "all", label: "All" }]} />
      </div>
      {(["weight", "waist", "belly", "hips", "bust", "underbust"] as MeasureKey[]).map(line)}
      <Card title="Waist-to-hip ratio">
        <LineChart points={whrPts} from={from} to={to} digits={3} label="Waist-to-hip ratio" />
      </Card>
      <Card title="Protein per day (g)">
        <BarChart points={protein} from={from} to={to} goal={profile.protein_target.min} unit=" g" label="Protein" />
      </Card>
      <Card title="Calories per day">
        <BarChart points={kcal} from={from} to={to} goal={target} label="Calories" />
      </Card>
      <Card title="Resistance workouts per week">
        <BarChart points={weeks} from={weekStart(from)} to={to} unit="" label="Workouts" bucketDays={7} noun="week" />
      </Card>
      <Card title="HRT adherence per day (%)">
        <BarChart points={adh} from={from} to={to} unit="%" label="Adherence" />
      </Card>
      {profile.modules.hypno && (
        <Card title="Hypno minutes per day">
          <BarChart points={hyp} from={from} to={to} goal={profile.hypno_daily_goal_min} unit=" min" label="Hypno minutes" />
        </Card>
      )}
      <Card title="Flexibility (overall self-rating)">
        <LineChart points={flex} from={from} to={to} digits={0} unit="/10" label="Flexibility" />
      </Card>
    </>
  );
}

function Week() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const [offset, setOffset] = useState(0);
  const day = addDays(pos.today, -7 * offset);
  const r = weeklyReview(db, day, profile.program_start, profile.protein_target.min);
  const inch = (v: number | null, c: number | null) => (v == null ? "—" : `${v.toFixed(1)}″${c != null ? ` (${signed(c)})` : ""}`);
  return (
    <>
      <div className="spread" style={{ margin: "12px 0" }}>
        <button className="iconbtn" onClick={() => setOffset(offset + 1)} aria-label="Previous week">
          <Icon name="back" />
        </button>
        <b>
          {fmtDate(r.from)} – {fmtDate(r.to)}
        </b>
        <button className="iconbtn" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Next week">
          <Icon name="chevron" />
        </button>
      </div>
      <Card title="Weight">
        <div className="grid3">
          <Stat label="Start of week" value={fmtNum(r.weight.start)} />
          <Stat label="Current" value={fmtNum(r.weight.current)} />
          <Stat label="Change" value={r.weight.change != null ? signed(r.weight.change) : "—"} sub="kg" />
        </div>
      </Card>
      <Card title="Measurements">
        <div className="grid2">
          <Stat label="Waist" value={<span style={{ fontSize: 17 }}>{inch(r.waist.current, r.waist.change)}</span>} />
          <Stat label="Belly" value={<span style={{ fontSize: 17 }}>{inch(r.belly.current, r.belly.change)}</span>} />
          <Stat label="Hips" value={<span style={{ fontSize: 17 }}>{inch(r.hips.current, r.hips.change)}</span>} />
          <Stat label="Bust" value={<span style={{ fontSize: 17 }}>{inch(r.bust.current, r.bust.change)}</span>} />
        </div>
      </Card>
      <Card title="Nutrition">
        <div className="grid2">
          <Stat label="Average calories" value={r.avgKcal != null ? Math.round(r.avgKcal) : "—"} sub={`${r.loggedDays} logged days`} />
          <Stat label="Average protein" value={r.avgProtein != null ? `${Math.round(r.avgProtein)} g` : "—"} sub={`target met ${r.protein.hit}/${r.protein.logged} days`} />
        </div>
      </Card>
      <Card title="Exercise">
        <div className="grid3">
          <Stat label="Planned" value={r.planned} />
          <Stat label="Completed" value={r.completed} />
          <Stat label="Cardio" value={r.cardio} sub="min" />
        </div>
      </Card>
      <Card title="HRT · Hypno · Mobility">
        <div className="grid3">
          <Stat label="Medication" value={pct(r.hrt.pct)} sub={`${r.hrt.taken}/${r.hrt.scheduled} doses`} />
          {profile.modules.hypno && <Stat label="Hypno" value={r.hypno.sessions} sub={`${r.hypno.minutes} min`} />}
          <Stat label="Mobility" value={r.mobility.sessions} sub={r.mobility.overall != null ? `flex ${r.mobility.overall}/10` : `${r.mobility.minutes} min`} />
        </div>
      </Card>
      <p className="tiny muted">Objective statistics only — there's no score to live up to. Consistency over perfection.</p>
    </>
  );
}

function Month() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const { go } = useApp();
  const [month, setMonth] = useState(pos.month);
  const r = monthlyReport(db, profile.program_start, month, profile.protein_target.min, pos.today);
  return (
    <>
      <div className="spread" style={{ margin: "12px 0" }}>
        <button className="iconbtn" disabled={month <= 1} onClick={() => setMonth(month - 1)} aria-label="Previous month">
          <Icon name="back" />
        </button>
        <div style={{ textAlign: "center" }}>
          <b>Month {month} · {r.phase.title}</b>
          <div className="tiny muted">{fmtDate(r.from)} – {fmtDate(r.to)}</div>
        </div>
        <button className="iconbtn" disabled={month >= pos.month} onClick={() => setMonth(month + 1)} aria-label="Next month">
          <Icon name="chevron" />
        </button>
      </div>
      {month === pos.month && (
        <Notice kind="info">
          This month is in progress. {pos.isLastDayOfMonth ? "It's check-in day!" : `Check-in on ${fmtDate(pos.monthEnd, { day: "numeric", month: "long" })}.`}
          <div style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => go("more", "checkin")}>Monthly check-in</button>
          </div>
        </Notice>
      )}
      <Card title="Body">
        <table className="table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>{month === 1 ? "Start" : "Prev"}</th>
              <th>Now</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {r.body.map((b) => (
              <tr key={b.key}>
                <td>{MEASURE_LABELS[b.key]}</td>
                <td>{fmtNum(b.previous)}</td>
                <td>{fmtNum(b.current)}</td>
                <td>{b.change != null ? signed(b.change) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted">Weight in kg, lengths in inches. Waist-to-hip ratio: {fmtNum(r.whr, 3)}. Trend: {r.trend != null ? `${signed(r.trend, 2)} kg/week` : "—"}.</p>
      </Card>
      <Card title="Fitness">
        <div className="grid3">
          <Stat label="Workouts" value={`${r.completed}/${r.planned}`} sub={pct(r.planned ? r.completed / r.planned : null)} />
          <Stat label="Cardio" value={r.cardio} sub="min" />
          <Stat label="Mobility" value={r.mobility.sessions} sub={`${r.mobility.minutes} min`} />
        </div>
        {r.strength.length > 0 && (
          <>
            <h3>Strength (best set, first vs last 2 weeks)</h3>
            {r.strength.map((s) => (
              <div key={s.exercise} className="spread small" style={{ padding: "4px 0" }}>
                <span>{EXERCISES[s.exercise]?.name}</span>
                <span className="num">
                  {s.first.reps}{s.first.load ? ` @ ${s.first.load}kg` : ""} → <b>{s.last.reps}{s.last.load ? ` @ ${s.last.load}kg` : ""}</b>
                </span>
              </div>
            ))}
          </>
        )}
      </Card>
      <Card title="Nutrition">
        <div className="grid3">
          <Stat label="Avg calories" value={r.avgKcal != null ? Math.round(r.avgKcal) : "—"} />
          <Stat label="Avg protein" value={r.avgProtein != null ? `${Math.round(r.avgProtein)}g` : "—"} />
          <Stat label="Logged" value={`${r.loggedDays}/${r.days}`} sub="days" />
        </div>
      </Card>
      <Card title="HRT">
        <div className="grid2">
          <Stat label="Adherence" value={pct(r.hrt.pct)} sub={`${r.hrt.taken}/${r.hrt.scheduled} doses`} />
          <Stat label="Lab results" value={r.labs.length} sub="this month" />
        </div>
        {r.labs.map((l) => (
          <div key={l.id} className="spread small" style={{ padding: "4px 0" }}>
            <span>{l.label}</span>
            <span className="num">{l.value} {l.unit}</span>
          </div>
        ))}
        {r.feminization.length > 0 && <p className="small muted" style={{ marginTop: 6 }}>{r.feminization.length} feminization log entr{r.feminization.length === 1 ? "y" : "ies"} this month (HRT → Changes).</p>}
      </Card>
      {profile.modules.hypno && (
        <Card title="Hypno">
          <div className="grid3">
            <Stat label="Sessions" value={r.hypno.sessions} />
            <Stat label="Minutes" value={r.hypno.minutes} />
            <Stat label="Mood change" value={r.hypno.moodDelta != null ? signed(r.hypno.moodDelta) : "—"} sub="avg per session" />
          </div>
        </Card>
      )}
      <Card title={`Next month objectives`}>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {r.objectives.map((o) => (
            <li key={o} style={{ marginBottom: 6 }}>{o}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Year() {
  const db = useDB();
  const profile = useProfile();
  const pos = usePosition();
  const months = [0, 3, 6, 9, 12].filter((m) => m === 0 || m <= pos.month);
  const table = checkpointTable(db, profile.program_start, months);
  const w = table.find((r) => r.key === "weight")!.values;
  const waist = table.find((r) => r.key === "waist")!.values;
  const hips = table.find((r) => r.key === "hips")!.values;
  const from = profile.program_start;
  const to = pos.today;
  const planned = sessionsPlanned(from, to, profile.program_start);
  const done = sessionsCompleted(db, from, to);
  const pc = proteinCompliance(db.foodEntries, from, to, profile.protein_target.min);
  const adh = adherence(db.medications, db.medLogs, to, Math.max(1, pos.day));
  const hyp = hypnoStats(db, from, to);
  const last = months.length - 1;

  return (
    <>
      <Notice kind="info">Checkpoints at months 3, 6, 9 and 12 compare against your Month 0 baseline. Goals are directional, not guarantees.</Notice>
      <Card title="Month 0 → now">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Measure</th>
                {months.map((m) => (
                  <th key={m}>M{m}</th>
                ))}
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => {
                const a = r.values[0];
                const b = r.values[last];
                return (
                  <tr key={r.key}>
                    <td>{MEASURE_LABELS[r.key].replace(" (navel)", "")}</td>
                    {r.values.map((v, i) => (
                      <td key={i}>{fmtNum(v)}</td>
                    ))}
                    <td>{a != null && b != null && last > 0 ? signed(b - a) : "—"}</td>
                  </tr>
                );
              })}
              <tr>
                <td>Waist/hip</td>
                {months.map((_, i) => (
                  <td key={i}>{fmtNum(whr(waist[i] ?? undefined, hips[i] ?? undefined), 3)}</td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Programme statistics">
        <div className="grid2">
          <Stat label="Weight change" value={w[0] != null && w[last] != null && last > 0 ? `${(((w[last]! - w[0]) / w[0]) * 100).toFixed(1)}%` : "—"} sub={w[0] != null && w[last] != null && last > 0 ? `${signed(w[last]! - w[0])} kg` : "at checkpoints"} />
          <Stat label="Workout completion" value={pct(planned ? done / planned : null)} sub={`${done}/${planned} sessions`} />
          <Stat label="Protein compliance" value={pct(pc.pct)} sub={`${pc.hit}/${pc.logged} logged days`} />
          <Stat label="Medication adherence" value={pct(adh.pct)} sub={`${adh.taken}/${adh.scheduled} doses`} />
          {profile.modules.hypno && <Stat label="Hypno" value={hyp.sessions} sub={`${hyp.minutes} min total`} />}
          <Stat label="Programme day" value={pos.day} sub={`month ${pos.month}`} />
        </div>
      </Card>
      <Card title="Month 13–24 direction">
        {pos.month >= 12 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {yearTwoRecommendations(db, profile.program_start, profile.protein_target.min, pos.today).map((r) => (
              <li key={r} style={{ marginBottom: 6 }}>{r}</li>
            ))}
          </ul>
        ) : (
          <Empty>Generated from your actual results at the Month 12 review.</Empty>
        )}
      </Card>
    </>
  );
}
