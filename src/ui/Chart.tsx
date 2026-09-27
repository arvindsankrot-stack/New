// Small dependency-free SVG charts: a single-series line (with optional target
// band) and a bar chart (with optional goal line). Both have a hover/tap
// tooltip and a data-table view so values are never colour- or hover-only.

import { useMemo, useRef, useState } from "react";
import { daysBetween, fmtDate } from "../domain/dates";

export interface Pt {
  date: string;
  value: number;
}

const W = 340;
const PAD = { l: 34, r: 10, t: 10, b: 22 };

function niceExtent(vals: number[], extra: number[] = []): [number, number] {
  const all = [...vals, ...extra];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    const d = Math.abs(lo) * 0.05 || 1;
    lo -= d;
    hi += d;
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function ticks(lo: number, hi: number, n = 4): number[] {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export function LineChart({
  points,
  from,
  to,
  band,
  unit = "",
  digits = 1,
  height = 170,
  label,
}: {
  points: Pt[];
  from: string;
  to: string;
  band?: { min: number; max: number };
  unit?: string;
  digits?: number;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const H = height;
  const pts = useMemo(() => points.filter((p) => p.date >= from && p.date <= to), [points, from, to]);
  if (pts.length === 0) return <p className="muted small" style={{ padding: "24px 0", textAlign: "center" }}>No {label.toLowerCase()} entries in this range yet.</p>;
  const span = Math.max(1, daysBetween(from, to));
  const [lo, hi] = niceExtent(
    pts.map((p) => p.value),
    band ? [band.min, band.max].filter((v) => Math.abs(v - pts[pts.length - 1].value) < Math.abs(v) * 0.25) : [],
  );
  const x = (d: string) => PAD.l + (daysBetween(from, d) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const hp = hover != null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} chart`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
        {ticks(lo, hi).map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
              {t % 1 ? t.toFixed(1) : t}
            </text>
          </g>
        ))}
        {band && (
          <rect
            x={PAD.l}
            width={W - PAD.l - PAD.r}
            y={Math.max(PAD.t, y(Math.min(band.max, hi)))}
            height={Math.max(0, Math.min(H - PAD.b, y(Math.max(band.min, lo))) - Math.max(PAD.t, y(Math.min(band.max, hi))))}
            fill="var(--series-3)"
            opacity={0.14}
          />
        )}
        <text x={PAD.l} y={H - 4}>{fmtDate(from)}</text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end">{fmtDate(to)}</text>
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.length <= 40 && pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={3} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />)}
        <circle cx={x(last.date)} cy={y(last.value)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hp.date)} x2={x(hp.date)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeDasharray="3 3" />
            <circle cx={x(hp.date)} cy={y(hp.value)} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <div className="spread tiny muted" style={{ minHeight: 20 }}>
        <span className="num">
          {hp ? (
            <>
              <b style={{ color: "var(--text)" }}>{hp.value.toFixed(digits)}{unit}</b> · {fmtDate(hp.date, { day: "numeric", month: "short", year: "numeric" })}
            </>
          ) : (
            <>
              Latest <b style={{ color: "var(--text)" }}>{last.value.toFixed(digits)}{unit}</b>
              {band && <> · target band {band.min}–{band.max}{unit}</>}
            </>
          )}
        </span>
        <button className="btn sm ghost" onClick={() => setTable(!table)} style={{ minHeight: 28 }}>
          {table ? "Hide data" : "Data"}
        </button>
      </div>
      {table && <DataTable rows={pts.map((p) => [fmtDate(p.date, { day: "numeric", month: "short", year: "2-digit" }), p.value.toFixed(digits) + unit])} head={["Date", label]} />}
    </div>
  );
}

export function BarChart({
  points,
  from,
  to,
  goal,
  unit = "",
  height = 150,
  label,
  digits = 0,
  bucketDays = 1,
  noun = "logged day",
}: {
  bucketDays?: number;
  noun?: string;
  points: Pt[];
  from: string;
  to: string;
  goal?: number;
  unit?: string;
  height?: number;
  label: string;
  digits?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const H = height;
  const pts = points.filter((p) => p.date >= from && p.date <= to);
  if (!pts.length) return <p className="muted small" style={{ padding: "24px 0", textAlign: "center" }}>No {label.toLowerCase()} data in this range yet.</p>;
  const span = Math.max(1, daysBetween(from, to) + 1);
  const hi = Math.max(...pts.map((p) => p.value), goal ?? 0) * 1.1 || 1;
  const bw = ((W - PAD.l - PAD.r) / span) * bucketDays;
  const x = (d: string) => PAD.l + (daysBetween(from, d) * bw) / bucketDays;
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const hp = hover != null ? pts[hover] : null;
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} chart`} onPointerLeave={() => setHover(null)}>
        {ticks(0, hi, 3).map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {pts.map((p, i) => {
          const bx = x(p.date) + Math.min(1, bw * 0.1);
          const w = Math.max(1, bw - Math.min(2, bw * 0.2));
          const h = Math.max(0, H - PAD.b - y(p.value));
          const r = Math.min(4, w / 2, h);
          return (
            <g key={p.date} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={x(p.date)} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} fill="transparent" />
              <path
                d={`M${bx},${H - PAD.b}V${y(p.value) + r}q0,${-r} ${r},${-r}h${w - 2 * r}q${r},0 ${r},${r}V${H - PAD.b}z`}
                fill="var(--series-1)"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
        {goal != null && (
          <g pointerEvents="none">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="var(--text)" strokeDasharray="4 3" strokeWidth={1.2} />
            <text x={W - PAD.r} y={y(goal) - 4} textAnchor="end">goal {goal}</text>
          </g>
        )}
        <text x={PAD.l} y={H - 4}>{fmtDate(from)}</text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end">{fmtDate(to)}</text>
      </svg>
      <div className="spread tiny muted" style={{ minHeight: 20 }}>
        <span className="num">
          {hp ? (
            <>
              <b style={{ color: "var(--text)" }}>{hp.value.toFixed(digits)}{unit}</b> · {fmtDate(hp.date)}
            </>
          ) : (
            <>
              Average <b style={{ color: "var(--text)" }}>{(pts.reduce((a, p) => a + p.value, 0) / pts.length).toFixed(digits)}{unit}</b> over {pts.length} {noun}{pts.length === 1 ? "" : "s"}
            </>
          )}
        </span>
        <button className="btn sm ghost" onClick={() => setTable(!table)} style={{ minHeight: 28 }}>
          {table ? "Hide data" : "Data"}
        </button>
      </div>
      {table && <DataTable rows={pts.map((p) => [fmtDate(p.date, { day: "numeric", month: "short", year: "2-digit" }), p.value.toFixed(digits) + unit])} head={["Date", label]} />}
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="scroll-x" style={{ maxHeight: 240, overflowY: "auto" }}>
      <table className="table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
