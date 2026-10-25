import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock, Image, Package, Pencil, RotateCcw, Share2, Sun, Trash2 } from "lucide-react";
import { db, dayKey, deleteJob, type Job } from "../lib/db";
import { lineLabel } from "../lib/materials";
import { placeLabel } from "../lib/places";
import { ConfirmSheet, useToast } from "../lib/ui";
import { PhotoThumb, PhotoViewer } from "./Photos";
import { useJobActions, useOpenJob } from "./JobRow";

const PRIORITY_BADGE: Record<number, [string, string]> = {
  1: ["HIGH", "border-[#f3b8b2] bg-[#fdecea] text-high"],
  2: ["MEDIUM", "border-[#f1d3a8] bg-[#fdf3e3] text-med"],
  3: ["LOW", "border-line bg-soft text-muted"],
};

export function timeAgo(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

async function shareNote(job: Job) {
  const text = [
    job.title,
    job.area ? `Where: ${job.area}` : "",
    job.materials.length ? `Materials: ${job.materials.map(lineLabel).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const photos = (await db.photos.bulkGet(job.photoIds)).filter(Boolean);
  const files = photos.map((p, i) => new File([p!.blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" }));
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // The phone's share sheet when it has one; otherwise the text is copied.
  try {
    if (files.length && nav.canShare?.({ files, text })) return await navigator.share({ files, text });
    if (navigator.share) return await navigator.share({ text });
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

export function SiteNoteCard({ job, expanded, onToggle }: { job: Job; expanded: boolean; onToggle: () => void }) {
  const openJob = useOpenJob();
  const toast = useToast();
  const { setDone, setToday } = useJobActions();
  const [viewAt, setViewAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = job.status === "done";
  const onToday = job.todayDate === dayKey() && !done;
  const toGet = job.materials.filter((m) => !m.have);
  const [pLabel, pClass] = PRIORITY_BADGE[job.priority];
  const overflow = job.photoIds.length - 3;

  const toggleMaterial = (id: string) =>
    db.jobs.update(job.id, {
      materials: job.materials.map((m) => (m.id === id ? { ...m, have: !m.have } : m)),
      updatedAt: Date.now(),
    });

  return (
    <div className={`overflow-hidden rounded border border-line ${done ? "bg-soft/60 opacity-70" : "bg-white"}`}>
      <div className="cursor-pointer px-3.5 pb-2 pt-3" onClick={onToggle}>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {!done && <span className={`h-4 rounded-[3px] border px-1 text-[9px] font-semibold leading-[14px] ${pClass}`}>{pLabel}</span>}
          <div className="flex-1" />
          {!done && (
            <button
              aria-pressed={onToday}
              onClick={(e) => {
                e.stopPropagation();
                setToday(job, !onToday);
              }}
              className={`-my-1 flex h-7 items-center gap-1 rounded border px-2 text-[11px] font-medium ${
                onToday ? "border-navy bg-navy text-white" : "border-line text-muted"
              }`}
            >
              <Sun size={12} fill={onToday ? "currentColor" : "none"} />
              Today
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
        </div>

        <p className={`whitespace-pre-wrap text-[14px] leading-snug ${expanded ? "" : "line-clamp-3"} ${done ? "text-muted line-through" : ""}`}>
          {job.title}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span>{placeLabel(job.area)}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Clock size={12} />
            {timeAgo(job.createdAt)}
          </span>
          {job.photoIds.length > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Image size={12} />
                {job.photoIds.length}
              </span>
            </>
          )}
        </div>

        {done && job.doneAt && (
          <div className="mt-1.5 flex items-center gap-1 text-[12px] text-ok">
            <Check size={12} /> Completed {timeAgo(job.doneAt)}
          </div>
        )}

        {job.materials.length > 0 && (
          <div className="mt-2 rounded border border-line bg-soft/60 px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              <Package size={11} />
              Materials
              <span className="ml-auto font-normal normal-case tracking-normal">{toGet.length ? `${toGet.length} to get` : "All in hand"}</span>
            </div>
            {job.materials.map((m) => (
              <button key={m.id} className="flex w-full items-center gap-2.5 py-1.5 text-left" onClick={() => toggleMaterial(m.id)}>
                <span role="checkbox" aria-checked={m.have} aria-label={m.have ? "Got it" : "Need it"} className="check h-5 w-5">
                  {m.have && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={`text-[14px] ${m.have ? "text-muted line-through" : ""}`}>{lineLabel(m)}</span>
              </button>
            ))}
          </div>
        )}

        {!expanded && job.photoIds.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {job.photoIds.slice(0, 3).map((id, i) => (
              <div key={id} onClick={(e) => e.stopPropagation()}>
                <PhotoThumb id={id} onClick={() => setViewAt(i)} className="h-12 w-12 border border-line" />
              </div>
            ))}
            {overflow > 0 && (
              <div className="flex h-12 w-12 items-center justify-center rounded border border-line bg-soft text-[12px] text-muted">+{overflow}</div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-2">
          {job.photoIds.length > 0 && (
            <div className="mb-3 mt-1 flex flex-wrap gap-2">
              {job.photoIds.map((id, i) => (
                <PhotoThumb key={id} id={id} onClick={() => setViewAt(i)} className="h-20 w-20 border border-line" />
              ))}
            </div>
          )}
          {job.notes && <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{job.notes}</p>}
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-line/70 px-3.5 pb-3 pt-2">
        <button className="flex h-8 shrink-0 items-center gap-1 rounded border border-line px-2 text-[12px]" onClick={() => openJob(job.id)}>
          <Pencil size={12} /> Edit
        </button>
        <button
          className="flex h-8 shrink-0 items-center gap-1 rounded border border-line px-2 text-[12px]"
          onClick={async () => {
            try {
              if ((await shareNote(job)) === "copied") toast("Copied");
            } catch {
              /* cancelled */
            }
          }}
        >
          <Share2 size={12} /> Share
        </button>
        <button aria-label="Delete" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-muted" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={12} />
        </button>
        <button
          className={`ml-auto flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded px-2.5 text-[12px] font-medium ${
            done ? "border border-navy text-navy" : "bg-ok text-white"
          }`}
          onClick={async () => {
            await setDone(job, !done);
            if (done) toast("Back on the list");
          }}
        >
          {done ? <RotateCcw size={12} /> : <Check size={12} />}
          {done ? "Reopen" : "Complete"}
        </button>
      </div>

      {viewAt !== null && (
        <PhotoViewer ids={job.photoIds} start={viewAt} onClose={() => setViewAt(null)} />
      )}
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this task?"
        body="Its photos and materials go too."
        confirmLabel="Delete task"
        danger
        onConfirm={async () => {
          await deleteJob(job);
          toast("Task deleted");
        }}
      />
    </div>
  );
}
