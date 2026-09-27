import { useEffect, useRef, useState } from "react";
import { useDB, usePosition } from "../../app-context";
import { remove, upsert, uid } from "../../db/store";
import type { ProgressPhoto } from "../../db/types";
import { vault } from "../../db/vault";
import { Check, Card, Notice, PageHead, toast } from "../../ui/components";
import { Icon } from "../../ui/icons";

const ANGLES: ProgressPhoto["angle"][] = ["front", "side", "back"];
const CHECKS: [keyof ProgressPhoto["checklist"], string][] = [
  ["lighting", "Same lighting"],
  ["distance", "Same distance"],
  ["clothing", "Same clothing"],
  ["posture", "Same relaxed posture"],
  ["camera_height", "Same camera height (about navel)"],
];

/** Downscale to ≤1400px JPEG before encrypting — keeps storage small and strips EXIF/location. */
async function compress(file: File): Promise<Uint8Array<ArrayBuffer>> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
  return new Uint8Array(await blob.arrayBuffer());
}

function Thumb({ photo, reveal }: { photo: ProgressPhoto; reveal: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    vault.getBlob(photo.blob_id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [photo.blob_id]);
  return url ? <img src={url} alt={`${photo.angle} progress photo, month ${photo.month}`} style={{ filter: reveal ? "none" : "blur(18px)" }} /> : null;
}

export function Photos({ onBack }: { onBack: () => void }) {
  const db = useDB();
  const pos = usePosition();
  const [month, setMonth] = useState(pos.month);
  const [reveal, setReveal] = useState(false);
  const [checklist, setChecklist] = useState<ProgressPhoto["checklist"]>({ lighting: false, distance: false, clothing: false, posture: false, camera_height: false });
  const input = useRef<HTMLInputElement>(null);
  const [angle, setAngle] = useState<ProgressPhoto["angle"]>("front");
  const months = [...new Set([0, ...db.photos.map((p) => p.month), pos.month])].sort((a, b) => a - b);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const bytes = await compress(f);
      const blob_id = uid();
      await vault.putBlob(blob_id, bytes, "image/jpeg");
      const old = db.photos.find((p) => p.month === month && p.angle === angle);
      upsert("photos", { date: pos.today, month, angle, blob_id, checklist });
      if (old) {
        remove("photos", old.id);
        await vault.removeBlob(old.blob_id);
      }
      toast("Photo saved privately");
    } catch {
      toast("Couldn't save that photo");
    }
  };

  return (
    <>
      <PageHead title="Progress photos" onBack={onBack} right={<button className="btn sm" onClick={() => setReveal(!reveal)}>{reveal ? "Blur" : "Reveal"}</button>} />
      <Notice kind="info">Photos are encrypted on this device, never uploaded, and never analysed automatically. They're blurred until you tap Reveal.</Notice>
      <div className="chips" style={{ margin: "12px 0" }}>
        {months.map((m) => (
          <button key={m} className={`chip ${m === month ? "on" : ""}`} onClick={() => setMonth(m)}>
            {m === 0 ? "Baseline" : `Month ${m}`}
          </button>
        ))}
      </div>
      <Card title={month === 0 ? "Baseline" : `Month ${month}`}>
        <div className="photo-grid">
          {ANGLES.map((a) => {
            const p = db.photos.find((x) => x.month === month && x.angle === a);
            return (
              <button
                key={a}
                className="ph"
                style={{ cursor: "pointer", padding: 0 }}
                onClick={() => {
                  setAngle(a);
                  input.current?.click();
                }}
                aria-label={`${p ? "Replace" : "Add"} ${a} photo`}
              >
                {p ? <Thumb photo={p} reveal={reveal} /> : <span className="muted small" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><Icon name="camera" />{a}</span>}
                {p && <span className="badge" style={{ position: "absolute", bottom: 6, left: 6 }}>{a}</span>}
              </button>
            );
          })}
        </div>
      </Card>
      <Card title="Consistency checklist">
        {CHECKS.map(([k, l]) => (
          <Check key={k} on={checklist[k]} onToggle={() => setChecklist({ ...checklist, [k]: !checklist[k] })}>
            {l}
          </Check>
        ))}
      </Card>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
