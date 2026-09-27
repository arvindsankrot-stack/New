import { useApp, useProfile } from "../app-context";
import { ListItem, Notice, PageHead } from "../ui/components";
import { Card } from "../ui/components";
import { CheckIn } from "./more/CheckIn";
import { Coach } from "./more/Coach";
import { DataSettings } from "./more/DataSettings";
import { Notifications } from "./more/Notifications";
import { Photos } from "./more/Photos";
import { ProfileSettings } from "./more/ProfileSettings";

export function More({ sub }: { sub?: string }) {
  const { go, lock } = useApp();
  const profile = useProfile();
  const back = () => go("more");
  switch (sub) {
    case "profile":
      return <ProfileSettings onBack={back} />;
    case "checkin":
      return <CheckIn onBack={back} />;
    case "photos":
      return <Photos onBack={back} />;
    case "notifications":
      return <Notifications onBack={back} />;
    case "coach":
      return <Coach onBack={back} />;
    case "data":
      return <DataSettings onBack={back} />;
    case "about":
      return <About onBack={back} />;
  }
  return (
    <>
      <PageHead eyebrow="More" title={profile.name ? `Hi, ${profile.name}` : "More"} />
      <Card>
        <ListItem icon="chat" title="Coach" sub="Log in plain words; get trend-based suggestions" onClick={() => go("more", "coach")} />
        <ListItem icon="calendar" title="Monthly check-in" sub="Measurements, photos, BP and report" onClick={() => go("more", "checkin")} />
        <ListItem icon="camera" title="Progress photos" sub="Private, encrypted on this device" onClick={() => go("more", "photos")} />
        <ListItem icon="bell" title="Reminders" sub="Morning, workout, food, relaxation, medication" onClick={() => go("more", "notifications")} />
      </Card>
      <Card>
        <ListItem icon="user" title="Profile, goals & settings" sub="Targets, calorie basis, units, theme, modules" onClick={() => go("more", "profile")} />
        <ListItem icon="shield" title="Privacy & data" sub="Export, import, passcode, delete" onClick={() => go("more", "data")} />
        <ListItem icon="heart" title="How this app works" sub="Guardrails and principles" onClick={() => go("more", "about")} />
        <ListItem icon="lock" title="Lock now" onClick={lock} />
      </Card>
    </>
  );
}

function About({ onBack }: { onBack: () => void }) {
  return (
    <>
      <PageHead title="How this app works" onBack={onBack} />
      <Card title="Consistency over perfection">
        <p>Missing a workout, a food log, a medication check or a session is never punished. There are no streaks to break and no success score — just objective numbers and the next step.</p>
      </Card>
      <Card title="What the app does">
        <p>Reminds · records · calculates · visualises · summarises · identifies trends.</p>
        <p className="small muted">Every coach message is labelled:</p>
        <p className="small">
          <span className="tag fact">TRACKED FACT</span> something you logged
          <br />
          <span className="tag estimate">ESTIMATE</span> a calculation or approximation
          <br />
          <span className="tag goal">GOAL</span> a target you chose — never a guarantee
          <br />
          <span className="tag medical">MEDICAL</span> a topic for your clinician
        </p>
      </Card>
      <Card title="What it will never do">
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Prescribe HRT, or suggest increasing, decreasing or combining hormones</li>
          <li>Suggest medication changes based on breast size or any measurement</li>
          <li>Diagnose, or tell you to ignore an abnormal lab result</li>
          <li>Tell you to double a missed dose</li>
          <li>Encourage continuing chastity wear despite pain, numbness, swelling or injury</li>
          <li>Guarantee breast size, body shape, genital, sexual or orgasmic outcomes</li>
          <li>Use pain as a progression metric for stretching or pelvic-floor work</li>
          <li>Push crash dieting — calories never go below your BMR or 1400 kcal</li>
        </ul>
      </Card>
      <Card title="Mental conditioning">
        <p className="small">Relaxation and hypno tracking supports identity, confidence, body acceptance, mindfulness and chosen submissiveness — always chosen, always reversible. Your ability to decide for yourself, consent and say no is never a target for change.</p>
      </Card>
      <Notice kind="warn" title="If something feels wrong">
        Chest pain, leg swelling or pain, sudden shortness of breath, severe headache or vision changes while on HRT need urgent medical care — don't wait for an app reminder.
      </Notice>
    </>
  );
}
