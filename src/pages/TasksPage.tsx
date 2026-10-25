import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CheckCircle2, ChevronDown, MapPin, Package, Sun } from "lucide-react";
import { db, dayKey, isOpen, type Job } from "../lib/db";
import { OUTSIDE, WHOLE_HOUSE, placeLabel, usePlaces } from "../lib/places";
import { useStoredState, useToast } from "../lib/ui";
import { PhotoThumb, PhotoViewer } from "../components/Photos";
import { useOpenJob } from "../components/JobRow";

/*
 * Laid out like the Titus subbie token link page: sticky header with progress,
 * tabs, three filters, the urgent box first, then one card per location,
 * a big tick on the right of each row and a completed section at the bottom.
 */

type Tab = "all" | "today";
type Order = "priority" | "newest" | "oldest";

const ACCENT: Record<number, string> = { 1: "border-l-[#ef4444]", 2: "border-l-[#f59e0b]", 3: "border-l-[#cbd5e1]" };
const PRI_BADGE: Record<number, [string, string]> = {
  1: ["High", "bg-[#dc2626] text-white border-[#dc2626]"],
  2: ["Medium", "bg-[#fff7ed] text-[#c2410c] border-[#fdba74]"],
  3: ["Low", "bg-soft text-muted border-line"],
};

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

function TaskRow({ job, leaving, onTick }: { job: Job; leaving: boolean; onTick: (job: Job) => void }) {
  const openJob = useOpenJob();
  const [viewAt, setViewAt] = useState<number | null>(null);
  const done = job.status === "done";
  const toGet = job.materials.filter((m) => !m.have).length;
  const [pLabel, pClass] = PRI_BADGE[job.priority];
  const onToday = job.todayDate === dayKey() && !done;

  return (
    <div className={`task-row ${leaving ? "task-leaving" : ""}`}>
      <div
        className={`relative flex items-start justify-between gap-3 rounded border border-l-4 px-3 py-3 transition-colors duration-300 ${
          done ? "border-[#bbf7d0] border-l-[#22c55e] bg-[#f0fdf4]/60" : `border-line bg-white ${ACCENT[job.priority]}`
        }`}
      >
        <div className="min-w-0 flex-1">
          {job.photoIds.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted">Photos</div>
              <div className="grid grid-cols-3 gap-1">
                {job.photoIds.map((id, i) => (
                  <PhotoThumb key={id} id={id} onClick={() => setViewAt(i)} className="w-full border border-line" />
                ))}
              </div>
            </div>
          )}
          <button className="relative block w-full text-left" onClick={() => openJob(job.id)}>
            <span className={`relative text-[14px] font-medium leading-normal ${done ? "text-muted line-through" : ""}`}>
              {job.title}
              {leaving && <span className="strike-draw absolute left-0 top-1/2 h-0.5 bg-[#10b981]" />}
            </span>
          </button>
          <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
            {!done && <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${pClass}`}>{pLabel}</span>}
            {onToday && (
              <span className="flex items-center gap-1 rounded border border-navy bg-navy px-1.5 py-0.5 text-[10px] font-medium text-white">
                <Sun size={10} /> Today
              </span>
            )}
            <span className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
              <MapPin size={10} /> {placeLabel(job.area)}
            </span>
            {job.materials.length > 0 && (
              <span
                className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                  toGet ? "border-[#99f6e4] bg-[#f0fdfa] text-[#115e59]" : "border-line text-muted"
                }`}
              >
                <Package size={10} /> {toGet ? `${toGet} to get` : "Materials in hand"}
              </span>
            )}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            role="checkbox"
            aria-checked={done || leaving}
            aria-label={done ? "Untick" : "Tick off"}
            onClick={() => onTick(job)}
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
              done || leaving ? "tick-pop border-[#16a34a] bg-[#16a34a] text-white" : "border-navy bg-white"
            }`}
          >
            {(done || leaving) && <Check size={16} strokeWidth={3} />}
          </button>
          {leaving &&
            SPARKS.map((a) => (
              <span key={a} className="spark" style={{ ["--a" as string]: `${a}deg` }} aria-hidden="true" />
            ))}
        </div>
      </div>
      {viewAt !== null && <PhotoViewer ids={job.photoIds} start={viewAt} onClose={() => setViewAt(null)} />}
    </div>
  );
}

export function TasksPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const { places } = usePlaces();
  const toast = useToast();
  const [tab, setTab] = useStoredState<Tab>("tasks:tab", "all");
  const [place, setPlace] = useStoredState<string>("tasks:place", "*");
  const [pri, setPri] = useStoredState<string>("tasks:pri", "*");
  const [order, setOrder] = useStoredState<Order>("tasks:order", "priority");
  const [leaving, setLeaving] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);

  const all = jobs ?? [];
  const today = dayKey();
  const inTab = (j: Job) => tab === "all" || j.todayDate === today;
  const scoped = all.filter(inTab);
  const openAll = scoped.filter(isOpen);
  const doneAll = scoped.filter((j) => !isOpen(j));
  const total = scoped.length;
  const pct = total ? Math.round((doneAll.length / total) * 100) : 0;

  const sorter = (a: Job, b: Job) =>
    order === "newest"
      ? b.createdAt - a.createdAt
      : order === "oldest"
        ? a.createdAt - b.createdAt
        : a.priority - b.priority || a.createdAt - b.createdAt;

  const open = openAll
    .filter((j) => (place === "*" || j.area === place) && (pri === "*" || String(j.priority) === pri))
    .sort(sorter);
  const urgent = open.filter((j) => j.priority === 1);
  const rest = open.filter((j) => j.priority !== 1);
  const groups = [WHOLE_HOUSE, OUTSIDE, ...places]
    .map((p) => [p, rest.filter((j) => j.area === p)] as const)
    .filter(([, list]) => list.length);
  const done = doneAll.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  const setDone = (job: Job, d: boolean) =>
    db.jobs.update(job.id, { status: d ? "done" : "open", doneAt: d ? Date.now() : undefined, updatedAt: Date.now() });

  const tick = (job: Job) => {
    if (job.status === "done") {
      setDone(job, false);
      return;
    }
    if (leaving.includes(job.id)) return;
    setLeaving((l) => [...l, job.id]);
    // Let the strike line and slide play, then file it under completed.
    setTimeout(() => {
      setDone(job, true);
      setLeaving((l) => l.filter((id) => id !== job.id));
      toast(`Done: ${job.title}`, { label: "Undo", run: () => setDone(job, false) });
    }, 760);
  };

  const row = (j: Job) => <TaskRow key={j.id} job={j} leaving={leaving.includes(j.id)} onTick={tick} />;
  const selectCls = "h-10 w-full rounded border border-line bg-white px-2 text-[14px]";
  const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 border-b border-line bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <img src="icon.svg" alt="" className="h-9 w-9 rounded" />
          <div className="min-w-0">
            <div className="truncate text-[18px] font-bold leading-tight">Home Task</div>
            <div className="text-[12px] text-muted">
              {new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="mb-1 flex justify-between text-[12px] text-muted">
            <span>
              {doneAll.length}/{total} done
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-[#e5e7eb]">
            <div className={`h-full transition-[width] duration-500 ${pct === 100 ? "bg-[#22c55e]" : "bg-navy"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          {(
            [
              ["all", "All tasks", all.filter(isOpen).length],
              ["today", "Today", all.filter((j) => isOpen(j) && j.todayDate === today).length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex h-9 items-center gap-1.5 rounded border px-3 text-[12px] font-medium ${
                tab === id ? "border-ink bg-ink text-white" : "border-[#e2e8f0] bg-white text-[#334155]"
              }`}
            >
              {id === "today" && <Sun size={13} />}
              {label}
              <span className={`rounded px-1.5 text-[11px] ${tab === id ? "bg-white/20" : "bg-soft text-muted"}`}>{count}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className={labelCls}>Location</span>
            <select className={selectCls} value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="*">All</option>
              {[WHOLE_HOUSE, OUTSIDE, ...places].map((p) => (
                <option key={p || "whole"} value={p}>
                  {placeLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Priority</span>
            <select className={selectCls} value={pri} onChange={(e) => setPri(e.target.value)}>
              <option value="*">All</option>
              <option value="1">High</option>
              <option value="2">Medium</option>
              <option value="3">Low</option>
            </select>
          </label>
          <label>
            <span className={labelCls}>Order</span>
            <select className={selectCls} value={order} onChange={(e) => setOrder(e.target.value as Order)}>
              <option value="priority">Priority</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </label>
        </div>

        {jobs && !total && (
          <div className="py-12 text-center">
            <div className="text-[15px] font-medium">{tab === "today" ? "Nothing on for today" : "No tasks yet"}</div>
            <p className="mt-1 text-[14px] text-muted">
              {tab === "today" ? "Tap Today on a task in Task Builder to put it here." : "Add your first one in Task Builder."}
            </p>
          </div>
        )}

        {jobs && total > 0 && !openAll.length && (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 size={40} className="text-[#16a34a]" />
            <div className="mt-2 text-[15px] font-semibold">All tasks completed</div>
            <p className="mt-0.5 text-[14px] text-muted">Nice work. Nothing outstanding.</p>
          </div>
        )}

        {openAll.length > 0 && !open.length && (
          <p className="py-6 text-center text-[14px] text-muted">
            Nothing open for these filters.{" "}
            <button
              className="font-medium text-navy underline"
              onClick={() => {
                setPlace("*");
                setPri("*");
              }}
            >
              Show everything
            </button>
          </p>
        )}

        {urgent.length > 0 && (
          <div className="rounded border-2 border-[#fda4af] bg-[#fff1f2]/40 p-4">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#be123c]">High priority · {urgent.length}</div>
            <div className="grid grid-cols-1 gap-3">{urgent.map(row)}</div>
          </div>
        )}

        {groups.map(([p, list]) => (
          <div key={p || "whole"} className="rounded border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-muted">
              <span>{placeLabel(p)}</span>
              <span className="font-normal normal-case tracking-normal">{list.length} open</span>
            </div>
            <div className="grid grid-cols-1 gap-3">{list.map(row)}</div>
          </div>
        ))}

        {done.length > 0 && (
          <div>
            <button
              className="flex h-9 w-full items-center justify-between rounded bg-[#f0fdf4] px-3 text-[13px] font-medium text-[#15803d]"
              onClick={() => setShowDone(!showDone)}
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} /> {done.length} completed
              </span>
              <ChevronDown size={16} className={showDone ? "rotate-180" : ""} />
            </button>
            {showDone && <div className="mt-2 grid grid-cols-1 gap-2">{done.map(row)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
