import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ eyebrow, title, sub, onBack, right }: { eyebrow?: string; title: string; sub?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header style={{ marginBottom: 8 }}>
      <div className="spread">
        <div className="row">
          {onBack && (
            <button className="iconbtn" onClick={onBack} aria-label="Back">
              <Icon name="back" />
            </button>
          )}
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h1>{title}</h1>
          </div>
        </div>
        {right}
      </div>
      {sub && <div className="muted small">{sub}</div>}
    </header>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, multi }: { value: T | T[]; options: { value: T; label: string }[]; onChange: (v: T[] | T) => void; multi?: boolean }) {
  const sel = Array.isArray(value) ? value : [value];
  return (
    <div className="chips">
      {options.map((o) => {
        const on = sel.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`chip ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() => (multi ? onChange(on ? sel.filter((v) => v !== o.value) : [...sel, o.value]) : onChange(o.value))}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Check({ on, onToggle, children, sub }: { on: boolean; onToggle: () => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <button type="button" className={`check ${on ? "on" : ""}`} onClick={onToggle} aria-pressed={on}>
      <span className="box">{on && <Icon name="check" size={18} stroke={3} />}</span>
      <span className="grow">
        <span style={{ fontWeight: 600 }}>{children}</span>
        {sub && <span className="muted small" style={{ display: "block" }}>{sub}</span>}
      </span>
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function ToggleRow({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="spread" style={{ minHeight: 52 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  digits = 0,
  label,
  placeholder,
}: {
  placeholder?: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  label?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (value == null) setText("");
    else if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bump = (d: number) => {
    const base = value ?? placeholder ?? 0;
    const n = Math.min(max, Math.max(min, Number((base + d).toFixed(Math.max(digits, 2)))));
    onChange(n);
  };
  return (
    <div className="stepper">
      <button type="button" className="iconbtn" onClick={() => bump(-step)} aria-label={`Decrease ${label ?? ""}`}>
        −
      </button>
      <input
        className="input"
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder != null ? String(placeholder) : undefined}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(",", ".");
          setText(t);
          if (t.trim() === "") onChange(undefined);
          else if (!isNaN(Number(t))) onChange(Number(t));
        }}
      />
      <button type="button" className="iconbtn" onClick={() => bump(step)} aria-label={`Increase ${label ?? ""}`}>
        +
      </button>
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 10, label, left, right }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; left?: string; right?: string }) {
  return (
    <label className="field">
      <span className="spread">
        <span>{label}</span>
        <span className="num" style={{ color: "var(--text)", fontWeight: 700 }}>
          {value}
        </span>
      </span>
      <input className="slider" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {(left || right) && (
        <span className="spread tiny muted" style={{ fontWeight: 400 }}>
          <span>{left}</span>
          <span>{right}</span>
        </span>
      )}
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Progress({ value, max, good }: { value: number; max: number; good?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${good ? "good" : ""}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && (
          <div className="spread" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warn" | "good" | "danger"; title?: string; children?: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === "danger" ? "alert" : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function ListItem({ icon, title, sub, onClick, right }: { icon?: string; title: ReactNode; sub?: ReactNode; onClick?: () => void; right?: ReactNode }) {
  return (
    <button className="list-item" onClick={onClick}>
      {icon && (
        <span className="iconbtn" style={{ background: "var(--accent-soft)", color: "var(--accent-2)", borderColor: "transparent" }}>
          <Icon name={icon} />
        </span>
      )}
      <span className="grow">
        <span style={{ fontWeight: 600, display: "block" }}>{title}</span>
        {sub && <span className="muted small">{sub}</span>}
      </span>
      {right ?? (onClick && <span className="chev"><Icon name="chevron" size={18} /></span>)}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted small" style={{ textAlign: "center", padding: "12px 0" }}>{children}</p>;
}

let toastSetter: ((m: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSetter?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}
