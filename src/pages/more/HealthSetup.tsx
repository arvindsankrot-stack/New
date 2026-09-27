import { Card, Notice, PageHead } from "../../ui/components";
import { ActivityCard } from "../ActivityCard";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", padding: "8px 0", borderTop: n > 1 ? "1px solid var(--border)" : undefined }}>
      <span className="badge accent" style={{ minWidth: 26, justifyContent: "center", marginTop: 2 }}>{n}</span>
      <div className="grow small">{children}</div>
    </div>
  );
}

const code = { background: "var(--surface-2)", borderRadius: 6, padding: "1px 5px", fontWeight: 700 } as const;

export function HealthSetup({ onBack }: { onBack: () => void }) {
  return (
    <>
      <PageHead title="Apple Health & Zepp" onBack={onBack} sub="One-time setup, then two taps a day." />
      <Notice kind="info" title="How it works">
        Zepp watch → Apple Health → your “Coach sync” Shortcut copies today's totals → you tap <b>Import from Apple Health</b> here. Web apps can't read Health directly, so the Shortcut is the bridge. Nothing is uploaded anywhere.
      </Notice>

      <Card title="A · Let Zepp write to Apple Health">
        <Step n={1}>Open the <b>Zepp</b> app → <b>Profile</b> → <b>Add accounts</b> (sometimes called <b>Third-party access</b>) → <b>Apple Health</b>.</Step>
        <Step n={2}>Turn <b>everything on</b> (steps, active energy, distance, workouts) and tap <b>Allow</b>.</Step>
        <Step n={3}>Open Zepp once a day so your watch syncs to your phone before you run the Shortcut.</Step>
      </Card>

      <Card title="B · Make the “Coach sync” Shortcut">
        <Step n={1}>Open the <b>Shortcuts</b> app → tap <b>+</b> → name it <span style={code}>Coach sync</span>.</Step>
        <Step n={2}>
          Add action <b>Find Health Samples</b>. Set <b>Type</b> to <b>Steps</b>, add filter <b>Start Date · is today</b>, and set <b>Group By</b> to <b>Day</b>.
          Then add <b>Set Variable</b> and name it <span style={code}>steps</span>.
        </Step>
        <Step n={3}>
          Repeat step 2 three more times:
          <br />• <b>Active Energy</b> → variable <span style={code}>kcal</span>
          <br />• <b>Walking + Running Distance</b> → variable <span style={code}>km</span>
          <br />• <b>Exercise Minutes</b> → variable <span style={code}>min</span> (skip if your watch doesn't record it)
        </Step>
        <Step n={4}>
          Add a <b>Text</b> action and type exactly this, inserting each variable by tapping it above the keyboard:
          <div style={{ ...code, display: "block", margin: "6px 0", padding: 8, fontWeight: 600 }}>TC steps=[steps] kcal=[kcal] km=[km] min=[min]</div>
        </Step>
        <Step n={5}>Add <b>Copy to Clipboard</b> (it uses the Text automatically).</Step>
        <Step n={6}>Optional: add <b>Show Notification</b> “Copied! Open Coach and tap Import 💕”.</Step>
        <Step n={7}>Tap the shortcut's name → <b>Add to Home Screen</b> so it sits next to the Coach icon.</Step>
        <p className="tiny muted" style={{ marginTop: 6 }}>The first run asks permission to read Health data. Tap <b>Allow</b>.</p>
      </Card>

      <Card title="C · Every day">
        <Step n={1}>Tap <b>Coach sync</b> on your Home Screen.</Step>
        <Step n={2}>Open <b>Coach</b> and tap <b>🍎 Import from Apple Health</b>. If iPhone asks, tap <b>Allow Paste</b>.</Step>
        <p className="tiny muted" style={{ marginTop: 6 }}>Tip: in Shortcuts → Automation you can run Coach sync every evening at a set time, so you only need the import tap.</p>
      </Card>

      <ActivityCard cute={false} />
      <p className="tiny muted">Calories burned are shown for information; your food target already allows for normal daily activity, so it doesn't change with each import. Watch exercise minutes count toward your weekly cardio goal.</p>
    </>
  );
}
