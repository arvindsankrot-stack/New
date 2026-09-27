import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Vault, WrongPasscodeError } from "./vault";

const rec = (id: string, extra = {}) => ({ id, user_id: "u", date: "2026-09-27", created_at: "", updated_at: "", ...extra });

describe("vault", () => {
  it("encrypts, locks, unlocks, rejects wrong passcode, changes passcode, backs up and wipes", async () => {
    const v = new Vault();
    expect(await v.isInitialized()).toBe(false);
    await v.create("correct horse", 1000);
    await v.put("weights", rec("w1", { kg: 77.2 }));

    // Nothing readable on disk.
    const raw = await new Promise<unknown[]>((res) => {
      const r = indexedDB.open("tc-vault");
      r.onsuccess = () => {
        const g = r.result.transaction("records").objectStore("records").getAll();
        g.onsuccess = () => res(g.result);
      };
    });
    expect(JSON.stringify(raw)).not.toContain("77.2");

    v.lock();
    await expect(v.unlock("wrong")).rejects.toBeInstanceOf(WrongPasscodeError);
    const data = await v.unlock("correct horse");
    expect(data.get("weights")?.[0]).toMatchObject({ kg: 77.2 });

    await v.putBlob("b1", new Uint8Array([1, 2, 3]), "image/jpeg");
    await v.changePasscode("correct horse", "new pass");
    v.lock();
    await expect(v.unlock("correct horse")).rejects.toBeInstanceOf(WrongPasscodeError);
    await v.unlock("new pass");
    const blob = await v.getBlob("b1");
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    const backup = await v.exportEncrypted();
    expect(backup).not.toContain("77.2");
    await v.wipe();
    expect(await v.isInitialized()).toBe(false);
    await v.restoreEncrypted(backup);
    const restored = await v.unlock("new pass");
    expect(restored.get("weights")?.[0]).toMatchObject({ kg: 77.2 });
  });
});
