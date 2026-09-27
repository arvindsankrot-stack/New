import { useCallback, useEffect, useRef, useState } from "react";
import { Ctx, useProfile, type Route, type Tab } from "./app-context";
import { all, clearData, loadData, onPersistError } from "./db/store";
import { TooManyAttemptsError, vault, WrongPasscodeError } from "./db/vault";
import { todayISO } from "./domain/dates";
import { Home } from "./pages/Home";
import { HRT } from "./pages/HRT";
import { More } from "./pages/More";
import { Progress } from "./pages/Progress";
import { Track } from "./pages/Track";
import { Workout } from "./pages/Workout";
import { checkReminders } from "./reminders";
import { seedNewAccount } from "./seed";
import { Field, Notice, Stepper, toast, ToastHost, ToggleRow } from "./ui/components";
import { Icon } from "./ui/icons";

type Phase = "loading" | "setup" | "locked" | "open";

export function App() {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    vault.isInitialized().then((init) => setPhase(init ? "locked" : "setup"));
    onPersistError(() => toast("Couldn't save — storage may be full."));
  }, []);

  const lock = useCallback(() => {
    vault.lock();
    clearData();
    setPhase("locked");
  }, []);

  if (phase === "loading") return <div className="lock-screen" />;
  if (phase === "setup") return <Setup onDone={() => setPhase("open")} />;
  if (phase === "locked") return <Lock onUnlocked={() => setPhase("open")} onReset={() => setPhase("setup")} />;
  return <Shell lock={lock} />;
}

function Shell({ lock }: { lock: () => void }) {
  const profile = useProfile();
  const [route, setRoute] = useState<Route>({ tab: "home" });
  const [hidden, setHidden] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const lastActive = useRef(Date.now());
  const lockMs = (profile?.auto_lock_minutes ?? 5) * 60_000;

  const go = useCallback((tab: Tab, sub?: string) => {
    setRoute({ tab, sub });
    window.scrollTo({ top: 0 });
  }, []);

  // Theme
  useEffect(() => {
    const t = profile?.theme ?? "system";
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [profile?.theme]);

  // Auto-lock after inactivity or time in background; cover content in the app switcher.
  useEffect(() => {
    const activity = () => (lastActive.current = Date.now());
    const vis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        setHidden(true);
      } else {
        setHidden(false);
        if (lockMs > 0 && hiddenAt.current && Date.now() - hiddenAt.current > lockMs) lock();
        hiddenAt.current = null;
        lastActive.current = Date.now();
      }
    };
    const idle = setInterval(() => {
      if (lockMs > 0 && Date.now() - lastActive.current > lockMs) lock();
    }, 15_000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(idle);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [lock, lockMs]);

  // iOS keeps the fixed tab bar above the keyboard, where it covers inputs. Hide it while typing.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.matches("input:not([type=checkbox]):not([type=range]):not([type=file]), textarea, select");
    const on = (e: FocusEvent) => isField(e.target) && document.body.classList.add("typing");
    const off = () => setTimeout(() => !isField(document.activeElement) && document.body.classList.remove("typing"), 50);
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
      document.body.classList.remove("typing");
    };
  }, []);

  useEffect(() => {
    checkReminders();
    const id = setInterval(() => checkReminders(), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!profile) return null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "track", label: "Track", icon: "plus" },
    { id: "workout", label: "Workout", icon: "dumbbell" },
    { id: "hrt", label: "HRT", icon: "pill" },
    { id: "progress", label: "Progress", icon: "chart" },
    { id: "more", label: "More", icon: "more" },
  ];

  return (
    <Ctx.Provider value={{ route, go, lock }}>
      <main className="app">
        {route.tab === "home" && <Home />}
        {route.tab === "track" && <Track sub={route.sub} />}
        {route.tab === "workout" && <Workout sub={route.sub} />}
        {route.tab === "hrt" && <HRT sub={route.sub} />}
        {route.tab === "progress" && <Progress sub={route.sub} />}
        {route.tab === "more" && <More sub={route.sub} />}
      </main>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {tabs.map((t) => (
            <button key={t.id} className={route.tab === t.id ? "on" : ""} aria-current={route.tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <ToastHost />
      {hidden && (
        <div className="privacy-cover" aria-hidden="true">
          <div className="logo">
            <Icon name="lock" size={30} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function Lock({ onUnlocked, onReset }: { onUnlocked: () => void; onReset: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    setErr("");
    try {
      loadData(await vault.unlock(code));
      setCode("");
      onUnlocked();
    } catch (x) {
      if (x instanceof WrongPasscodeError) setErr("That passcode didn't match.");
      else if (x instanceof TooManyAttemptsError) setErr(`Too many attempts. Try again after ${new Date(x.retryAt).toLocaleTimeString()}.`);
      else setErr("Couldn't open your data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="logo">
        <Icon name="lock" size={30} />
      </div>
      <h1>Welcome back</h1>
      <p className="muted">Enter your passcode to unlock your private data.</p>
      <form onSubmit={submit}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Passcode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Passcode"
        />
        {err && <p style={{ color: "var(--danger)", marginTop: 8 }}>{err}</p>}
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      <div style={{ marginTop: 32 }}>
        {!confirmReset ? (
          <button className="btn ghost block sm" onClick={() => setConfirmReset(true)}>
            Forgot passcode?
          </button>
        ) : (
          <Notice kind="danger" title="Erase everything?">
            <p>Your data is encrypted with your passcode and cannot be recovered without it. The only option is to erase all data on this device and start again (you can restore from an encrypted backup if you have one and remember its passcode).</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn sm danger"
                onClick={async () => {
                  await vault.wipe();
                  onReset();
                }}
              >
                Erase all data
              </button>
            </div>
          </Notice>
        )}
      </div>
    </div>
  );
}

function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState<number | undefined>(new Date().getFullYear() - 40);
  const [height, setHeight] = useState<number | undefined>(173);
  const [weight, setWeight] = useState<number | undefined>(78);
  const [start, setStart] = useState(todayISO());
  const [modules, setModules] = useState({ hypno: true, chastity: true, pelvic: true, feminization: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const finish = async () => {
    setBusy(true);
    try {
      await vault.create(code);
      loadData(new Map());
      seedNewAccount({ name: name.trim(), birth_year: birthYear ?? 1986, height_cm: height ?? 173, weight: weight ?? 78, program_start: start, modules });
      // Wait for the first writes to land before showing the app.
      await new Promise((r) => setTimeout(r, 50));
      if (!all("profile").length) throw new Error();
      onDone();
    } catch {
      setErr("Setup failed. Is private browsing blocking storage?");
      setBusy(false);
    }
  };

  const codeOk = code.length >= 6 && code === code2;

  return (
    <div className="lock-screen">
      <div className="logo">
        <Icon name="sparkle" size={30} />
      </div>
      {step === 0 && (
        <>
          <h1>Your private coach</h1>
          <p className="muted">A 12-month transformation tracker for fitness, nutrition, mobility, HRT and wellbeing.</p>
          <Notice kind="info" title="Private by design">
            Everything stays on this device, encrypted with a passcode only you know. No account on a server, no analytics, nothing shared.
          </Notice>
          <Notice kind="warn" title="Tracking, not prescribing">
            The app reminds, records, calculates and visualises. It never prescribes or adjusts HRT, never diagnoses, and treats every body target as a goal, not a guarantee.
          </Notice>
          <button className="btn primary block" onClick={() => setStep(1)}>
            Get started
          </button>
        </>
      )}
      {step === 1 && (
        <>
          <h1>Create a passcode</h1>
          <p className="muted">At least 6 characters. It encrypts your data and cannot be recovered — keep it somewhere safe.</p>
          <Field label="Passcode">
            <input className="input" type="password" autoComplete="new-password" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Confirm passcode">
            <input className="input" type="password" autoComplete="new-password" value={code2} onChange={(e) => setCode2(e.target.value)} />
          </Field>
          {code2 && code !== code2 && <p style={{ color: "var(--danger)" }}>Passcodes don't match.</p>}
          <div className="row">
            <button className="btn" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn primary grow" disabled={!codeOk} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h1>About you</h1>
          <p className="muted">Pre-filled with your baseline — adjust anything.</p>
          <Field label="Name (optional)">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should the coach call you?" />
          </Field>
          <div className="grid2">
            <Field label="Birth year">
              <Stepper value={birthYear} onChange={setBirthYear} min={1930} max={2010} label="Birth year" />
            </Field>
            <Field label="Height (cm)">
              <Stepper value={height} onChange={setHeight} min={120} max={220} label="Height" />
            </Field>
          </div>
          <Field label="Current weight (kg)">
            <Stepper value={weight} onChange={setWeight} step={0.1} digits={1} min={30} max={250} label="Weight" />
          </Field>
          <Field label="Programme day 1">
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <h3>Show these private modules</h3>
          <ToggleRow label="Feminization tracker" on={modules.feminization} onChange={(v) => setModules({ ...modules, feminization: v })} />
          <ToggleRow label="Hypno / relaxation" on={modules.hypno} onChange={(v) => setModules({ ...modules, hypno: v })} />
          <ToggleRow label="Chastity log" on={modules.chastity} onChange={(v) => setModules({ ...modules, chastity: v })} />
          <ToggleRow label="Pelvic floor" on={modules.pelvic} onChange={(v) => setModules({ ...modules, pelvic: v })} />
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn primary grow" disabled={busy} onClick={finish}>
              {busy ? "Encrypting…" : "Start my programme"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
