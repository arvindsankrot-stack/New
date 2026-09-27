import { useState } from "react";
import { useDB } from "../../app-context";
import { upsert } from "../../db/store";
import type { NotificationPref } from "../../db/types";
import { requestNotificationPermission } from "../../reminders";
import { Card, Notice, PageHead, Toggle } from "../../ui/components";

const LABELS: Record<NotificationPref["kind"], string> = {
  morning: "Morning check",
  medication: "Medication (from your regimen times)",
  workout: "Workout",
  evening: "Evening food log",
  night: "Relaxation / hypno",
  weekly: "Weekly review (Sundays)",
  monthly: "Monthly check-in (last day of month)",
};

export function Notifications({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const [perm, setPerm] = useState<string>("Notification" in window ? Notification.permission : "unsupported");
  const order: NotificationPref["kind"][] = ["morning", "medication", "workout", "evening", "night", "weekly", "monthly"];
  const prefs = order.map((k) => db.notifications.find((n) => n.kind === k)).filter((n): n is NotificationPref => !!n);

  return (
    <>
      <PageHead title="Reminders" onBack={onBack} />
      {perm !== "granted" && (
        <Notice kind="info" title="Allow notifications">
          {perm === "unsupported"
            ? "On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there to enable notifications."
            : "Reminders appear in the app while it's open. Allow notifications to also see them as system alerts."}
          {perm !== "unsupported" && perm !== "denied" && (
            <div style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={async () => setPerm(await requestNotificationPermission())}>
                Allow notifications
              </button>
            </div>
          )}
        </Notice>
      )}
      <Card>
        {prefs.map((n) => (
          <div key={n.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div className="spread">
              <b>{LABELS[n.kind]}</b>
              <Toggle on={n.enabled} onChange={(v) => upsert("notifications", { ...n, enabled: v })} label={LABELS[n.kind]} />
            </div>
            {n.kind !== "medication" && (
              <input className="input" type="time" value={n.time} onChange={(e) => upsert("notifications", { ...n, time: e.target.value })} aria-label={`${LABELS[n.kind]} time`} style={{ marginTop: 6, maxWidth: 160 }} />
            )}
            <p className="small muted" style={{ marginTop: 6 }}>"{n.message}"</p>
          </div>
        ))}
      </Card>
      <p className="tiny muted">
        Alerts use neutral wording so nothing private shows on your lock screen. Reminders fire while the app is open or recently backgrounded; fully-closed background push needs a server and is planned for a later version.
      </p>
    </>
  );
}
