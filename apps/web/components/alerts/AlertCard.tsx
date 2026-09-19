"use client";

import type { Alert } from "@/lib/types";

const SEVERITY_STYLES: Record<Alert["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const ALERT_TYPE_LABELS: Record<Alert["alert_type"], string> = {
  price_increase: "Price increase",
  low_usage: "Low usage",
  trial_ending: "Trial ending",
  duplicate_service: "Duplicate service",
  new_subscription: "New subscription",
};

export function AlertCard({
  alert,
  onDismiss,
}: {
  alert: Alert;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className={`rounded-xl border p-4 ${SEVERITY_STYLES[alert.severity]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
            {ALERT_TYPE_LABELS[alert.alert_type]}
          </span>
          <p className="mt-1 font-medium">{alert.title}</p>
          <p className="mt-1 text-sm opacity-80">{alert.detail}</p>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert.id)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium opacity-70 hover:bg-white/50 hover:opacity-100"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
