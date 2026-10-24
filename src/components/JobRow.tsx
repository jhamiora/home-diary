import { createContext, useContext } from "react";
import { Check, Sun } from "lucide-react";
import { db, dayKey, type Job } from "../lib/db";
import { useToast } from "../lib/ui";
import { PhotoThumb } from "./Photos";

export const OpenJobCtx = createContext<(id: string) => void>(() => {});
export const useOpenJob = () => useContext(OpenJobCtx);

export const PRIORITY_BAR: Record<number, string> = { 1: "bg-high", 2: "bg-med", 3: "bg-low" };
export const PRIORITY_TEXT: Record<number, string> = { 1: "text-high", 2: "text-med", 3: "text-low" };

export function useJobActions() {
  const toast = useToast();
  const setDone = async (job: Job, done: boolean) => {
    await db.jobs.update(job.id, {
      status: done ? "done" : "open",
      doneAt: done ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    if (done) toast(`Done: ${job.title}`, { label: "Undo", run: () => setDone(job, false) });
  };
  const setToday = async (job: Job, on: boolean) => {
    await db.jobs.update(job.id, { todayDate: on ? dayKey() : undefined, updatedAt: Date.now() });
  };
  return { setDone, setToday };
}

export function JobRow({ job, showToday = true }: { job: Job; showToday?: boolean }) {
  const openJob = useOpenJob();
  const { setDone, setToday } = useJobActions();
  const done = job.status === "done";
  const onToday = job.todayDate === dayKey();
  const toGet = job.materials.filter((m) => !m.have && m.name.trim()).length;
  const meta = [
    job.area,
    job.materials.length ? (toGet ? `${toGet} to get` : "Materials ready") : "",
    job.photoIds.length ? `${job.photoIds.length} photo${job.photoIds.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean);

  return (
    <div className="relative flex items-center gap-3 border-b border-line bg-white py-3 pl-4 pr-2">
      {!done && <span className={`absolute bottom-3 left-0 top-3 w-[3px] ${PRIORITY_BAR[job.priority]}`} />}
      <button
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Mark not done" : "Mark done"}
        className="check"
        onClick={() => setDone(job, !done)}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openJob(job.id)}>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[15px] ${done ? "text-muted line-through" : "font-medium"}`}>{job.title}</div>
          {meta.length > 0 && <div className="mt-0.5 truncate text-[13px] text-muted">{meta.join("  ·  ")}</div>}
        </div>
        {job.photoIds[0] && <PhotoThumb id={job.photoIds[0]} className="pointer-events-none h-10 w-10 shrink-0" />}
      </button>
      {showToday && !done && (
        <button
          aria-label={onToday ? "Take off today" : "Add to today"}
          aria-pressed={onToday}
          className={`icon-btn shrink-0 ${onToday ? "text-navy" : "text-[#c3c9ce]"}`}
          onClick={() => setToday(job, !onToday)}
        >
          <Sun size={19} strokeWidth={onToday ? 2.25 : 1.75} fill={onToday ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
