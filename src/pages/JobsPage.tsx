import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Plus } from "lucide-react";
import { PRIORITIES, askPersistentStorage, db, uid, type Job, type Priority } from "../lib/db";
import { Empty, Sheet, afterOverlayClosed, SectionLabel, useStoredState, useToast } from "../lib/ui";
import { JobRow, PRIORITY_BAR, useOpenJob } from "../components/JobRow";
import { AreaPicker, PrioritySeg, useAreas } from "../components/JobDetail";

export const byPriority = (a: Job, b: Job) => a.priority - b.priority || a.createdAt - b.createdAt;

export function NewJobSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const openJob = useOpenJob();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useStoredState<Priority>("newjob:priority", 2);
  const [area, setArea] = useStoredState("newjob:area", "");

  const add = async (thenOpen: boolean) => {
    if (!title.trim()) return;
    const now = Date.now();
    const job: Job = {
      id: uid(),
      title: title.trim(),
      notes: "",
      priority,
      area: area.trim(),
      status: "open",
      createdAt: now,
      updatedAt: now,
      photoIds: [],
      materials: [],
    };
    setTitle("");
    await db.jobs.add(job);
    askPersistentStorage();
    if (thenOpen) {
      onClose();
      afterOverlayClosed(() => openJob(job.id));
    } else toast(`Added ${job.title}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New job">
      <form
        className="space-y-3 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          add(false);
        }}
      >
        <input
          autoFocus
          className="field"
          placeholder="What needs doing? e.g. Fix gate latch"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <PrioritySeg value={priority} onChange={setPriority} />
        <AreaPicker value={area} onChange={setArea} />
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn flex-1" disabled={!title.trim()} onClick={() => add(true)}>
            Add details
          </button>
          <button className="btn btn-primary flex-1" disabled={!title.trim()}>
            Add job
          </button>
        </div>
        <p className="text-center text-[12px] text-muted">Add job keeps this open so you can rattle off a few.</p>
      </form>
    </Sheet>
  );
}

export function JobsPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const areas = useAreas();
  const [filter, setFilter] = useStoredState("jobs:area", "");
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);

  const visible = (jobs ?? []).filter((j) => !filter || j.area.trim() === filter);
  const open = visible.filter((j) => j.status === "open").sort(byPriority);
  const done = visible.filter((j) => j.status === "done").sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  return (
    <div className="pb-28">
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Jobs</h1>
        <p className="text-[14px] text-muted">{open.length} to do, highest priority first</p>
      </div>
      {areas.length > 0 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-3">
          <button className="tab" aria-pressed={!filter} onClick={() => setFilter("")}>
            All
          </button>
          {areas.map((a) => (
            <button key={a} className="tab" aria-pressed={filter === a} onClick={() => setFilter(filter === a ? "" : a)}>
              {a}
            </button>
          ))}
        </div>
      )}

      {jobs && !open.length && !done.length && (
        <Empty title="No jobs yet" body="Add the things that need doing around the house. Give each one a priority and the materials it needs." />
      )}

      {PRIORITIES.map((p) => {
        const list = open.filter((j) => j.priority === p.value);
        if (!list.length) return null;
        return (
          <div key={p.value}>
            <SectionLabel>
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 ${PRIORITY_BAR[p.value]}`} />
                {p.label}
                <span className="font-normal">{list.length}</span>
              </span>
            </SectionLabel>
            <div className="border-t border-line">
              {list.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div>
          <button className="flex w-full items-center gap-1 px-4 pb-2 pt-6 text-[12px] font-medium uppercase tracking-[0.06em] text-muted" onClick={() => setShowDone(!showDone)}>
            Done {done.length}
            <ChevronDown size={14} className={showDone ? "rotate-180" : ""} />
          </button>
          {showDone && (
            <div className="border-t border-line">
              {done.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </div>
      )}

      <button
        aria-label="New job"
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded bg-navy px-5 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(6,41,50,0.28)] active:opacity-90"
        onClick={() => setAdding(true)}
      >
        <Plus size={18} strokeWidth={2.25} />
        New job
      </button>
      <NewJobSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
