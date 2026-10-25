import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload } from "lucide-react";
import { db } from "../lib/db";
import { exportBackup, importBackup, shareOrDownload } from "../lib/backup";
import { SectionLabel, Sheet, useStoredState, useToast } from "../lib/ui";

const mb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function MorePage() {
  const toast = useToast();
  const counts = useLiveQuery(async () => ({
    jobs: await db.jobs.count(),
    photos: await db.photos.count(),
  }), []);
  const [usage, setUsage] = useState<{ used: number; persisted: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useStoredState<number | null>("backup:last", null);
  const [pending, setPending] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        const persisted = (await navigator.storage?.persisted?.()) ?? false;
        setUsage({ used: est?.usage ?? 0, persisted });
      } catch {
        /* not supported */
      }
    })();
  }, [counts]);

  const backup = async () => {
    setBusy("Preparing backup");
    try {
      const file = await exportBackup();
      const result = await shareOrDownload(file);
      if (result !== "cancelled") {
        setLastBackup(Date.now());
        toast(result === "shared" ? "Backup sent" : "Backup saved to Downloads");
      }
    } catch {
      toast("Backup failed");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (mode: "merge" | "replace") => {
    if (!pending) return;
    setBusy("Restoring");
    try {
      const r = await importBackup(pending, mode);
      toast(`Restored ${r.jobs} notes and ${r.photos} photos`);
    } catch (e) {
      toast((e as Error).message || "Couldn't read that file");
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  return (
    <div className="pb-24">
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">More</h1>
      </div>

      <SectionLabel>On this phone</SectionLabel>
      <div className="mx-4 divide-y divide-line rounded border border-line">
        <Row label="Site notes" value={counts?.jobs ?? 0} />
        <Row label="Photos" value={counts?.photos ?? 0} />
        {usage && <Row label="Space used" value={mb(usage.used)} />}
        {usage && <Row label="Protected from clean-up" value={usage.persisted ? "Yes" : "Not yet"} />}
      </div>
      <p className="px-4 pt-2 text-[13px] leading-relaxed text-muted">
        Everything is saved on this phone only. Nothing goes to a server. Clearing your browser data or uninstalling deletes it, so take a backup now and then.
      </p>

      <SectionLabel>Backup</SectionLabel>
      <div className="space-y-2 px-4">
        <button className="btn btn-primary w-full" disabled={!!busy} onClick={backup}>
          <Download size={17} strokeWidth={1.75} />
          {busy === "Preparing backup" ? busy : "Back up everything"}
        </button>
        <button className="btn w-full" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <Upload size={17} strokeWidth={1.75} />
          {busy === "Restoring" ? busy : "Restore from a backup"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setPending(f);
          }}
        />
        <p className="text-[13px] leading-relaxed text-muted">
          {lastBackup ? `Last backup ${new Date(lastBackup).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}. ` : "No backup taken yet. "}
          The backup is one file with all photos inside. Save it to Google Drive or email it to yourself. To move to a new phone, open this app there and restore it.
        </p>
      </div>

      <SectionLabel>Put it on your home screen</SectionLabel>
      <div className="space-y-1 px-4 text-[14px] leading-relaxed text-muted">
        <p>Android (Chrome): menu, then Add to Home screen or Install app.</p>
        <p>iPhone (Safari): Share, then Add to Home Screen.</p>
        <p>It then opens like a normal app and works with no signal.</p>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)}>
        <div className="space-y-2 px-4 pt-5">
          <div className="text-[17px] font-semibold">Restore this backup?</div>
          <p className="pb-3 text-[14px] leading-relaxed text-muted">
            Add to what's here keeps your current notes. Replace everything is for a fresh phone.
          </p>
          <button className="btn btn-primary w-full" onClick={() => restore("merge")}>
            Add to what's here
          </button>
          <button className="btn w-full text-high" onClick={() => restore("replace")}>
            Replace everything
          </button>
          <button className="btn w-full border-transparent text-muted" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-[15px]">
      <span>{label}</span>
      <span className="text-muted">{value}</span>
    </div>
  );
}
