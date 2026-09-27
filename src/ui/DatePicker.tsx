import { addDays, fmtDate } from "../domain/dates";
import { Icon } from "./icons";

/** Compact day switcher: ‹ Today › with a native date picker behind the label. */
export function DayPicker({ value, onChange, today }: { value: string; onChange: (d: string) => void; today: string }) {
  const label = value === today ? "Today" : value === addDays(today, -1) ? "Yesterday" : fmtDate(value, { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="spread" style={{ margin: "12px 0" }}>
      <button className="iconbtn" onClick={() => onChange(addDays(value, -1))} aria-label="Previous day">
        <Icon name="back" />
      </button>
      <label className="btn ghost grow" style={{ position: "relative" }}>
        <Icon name="calendar" size={18} /> {label}
        <input
          type="date"
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, opacity: 0 }}
          aria-label="Choose date"
        />
      </label>
      <button className="iconbtn" onClick={() => onChange(addDays(value, 1))} disabled={value >= today} aria-label="Next day">
        <Icon name="chevron" />
      </button>
    </div>
  );
}
