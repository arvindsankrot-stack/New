import { useRef, useState } from "react";
import { useApp } from "../../app-context";
import { exportPlain, importPlain } from "../../db/store";
import { vault, WrongPasscodeError } from "../../db/vault";
import { Card, Field, Notice, PageHead, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";
import { todayISO } from "../../domain/dates";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataSettings({ onBack }: { onBack: () => void }) {
  const { lock } = useApp();
  const plainIn = useRef<HTMLInputElement>(null);
  const encIn = useRef<HTMLInputElement>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  return (
    <>
      <PageHead title="Privacy & data" onBack={onBack} />
      <Notice kind="good" title="How your data is protected">
        Stored only on this device, encrypted with AES-256-GCM using a key derived from your passcode (PBKDF2, 600,000 rounds). No server, no analytics, no tracking, nothing in URLs. The app auto-locks and hides its content in the app switcher.
      </Notice>

      <Card title="Backup">
        <p className="small muted">An encrypted backup includes everything (photos too) and can only be restored with the passcode in use when it was made. Store it somewhere safe, like iCloud Drive or Files.</p>
        <button className="btn block" onClick={async () => download(`coach-backup-${todayISO()}.json`, await vault.exportEncrypted())}>
          <Icon name="download" size={18} /> Download encrypted backup
        </button>
        <button className="btn block ghost" style={{ marginTop: 8 }} onClick={() => encIn.current?.click()}>
          <Icon name="upload" size={18} /> Restore encrypted backup
        </button>
        <input
          ref={encIn}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!confirm("Restoring replaces ALL current data on this device with the backup. Continue?")) return;
            try {
              await vault.restoreEncrypted(await f.text());
              toast("Restored — unlock with the backup's passcode");
              lock();
            } catch (x) {
              toast(x instanceof Error ? x.message : "Restore failed");
            }
          }}
        />
      </Card>

      <Card title="Export readable data">
        <Notice kind="warn">This file is NOT encrypted — anyone who opens it can read your health data. Use it to move data or for your own analysis, then delete it.</Notice>
        <button
          className="btn block"
          onClick={() => {
            if (confirm("Download an unencrypted, readable copy of your data?")) download(`coach-export-${todayISO()}.json`, exportPlain());
          }}
        >
          <Icon name="download" size={18} /> Export JSON (readable)
        </button>
        <button className="btn block ghost" style={{ marginTop: 8 }} onClick={() => plainIn.current?.click()}>
          <Icon name="upload" size={18} /> Import JSON export (merge)
        </button>
        <input
          ref={plainIn}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const n = await importPlain(await f.text());
              toast(`Imported ${n} records`);
            } catch (x) {
              toast(x instanceof Error ? x.message : "Import failed");
            }
          }}
        />
      </Card>

      <Card title="Change passcode">
        <Field label="Current passcode">
          <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="New passcode (6+ characters)">
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new passcode">
          <input className="input" type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} />
        </Field>
        <button
          className="btn block"
          disabled={busy || !cur || next.length < 6 || next !== next2}
          onClick={async () => {
            setBusy(true);
            try {
              await vault.changePasscode(cur, next);
              toast("Passcode changed");
              setCur("");
              setNext("");
              setNext2("");
            } catch (x) {
              toast(x instanceof WrongPasscodeError ? "Current passcode is incorrect" : "Couldn't change passcode");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Re-encrypting…" : "Change passcode"}
        </button>
      </Card>

      <Card title="Delete all data">
        <p className="small muted">Permanently erases every record, photo and your passcode from this device. This can't be undone.</p>
        <Field label='Type "DELETE" to confirm'>
          <input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        </Field>
        <button
          className="btn danger block"
          disabled={confirmDelete !== "DELETE"}
          onClick={async () => {
            await vault.wipe();
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
            location.reload();
          }}
        >
          <Icon name="trash" size={18} /> Delete everything
        </button>
      </Card>
    </>
  );
}
