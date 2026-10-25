import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, ListChecks, Package } from "lucide-react";
import { PRIORITIES, byPriority, db, dayKey, isOpen, type Job } from "../lib/db";
import { buildShoppingList, lineLabel } from "../lib/materials";
import { useGoTab } from "../lib/nav";
import { Empty, SectionLabel, Sheet, useStoredState } from "../lib/ui";
import { JobRow, PRIORITY_BAR, useJobActions } from "../components/JobRow";

function PlanSheet({ open, onClose, jobs }: { open: boolean; onClose: () => void; jobs: Job[] }) {
  const { setToday } = useJobActions();
  const today = dayKey();
  const openJobs = jobs.filter(isOpen).sort(byPriority);
  return (
    <Sheet open={open} onClose={onClose} title="Pick today's jobs">
      {!openJobs.length && <p className="px-4 pb-4 text-[14px] text-muted">No open jobs. Add some on the Site Diary tab.</p>}
      {PRIORITIES.map((p) => {
        const list = openJobs.filter((j) => j.priority === p.value);
        if (!list.length) return null;
        return (
          <div key={p.value}>
            <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
              <span className={`h-2 w-2 ${PRIORITY_BAR[p.value]}`} />
              {p.label}
            </div>
            {list.map((j) => {
              const on = j.todayDate === today;
              const toGet = j.materials.filter((m) => !m.have).length;
              return (
                <button key={j.id} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-soft" onClick={() => setToday(j, !on)}>
                  <span role="checkbox" aria-checked={on} className="check">
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{j.title}</span>
                    {(j.area || toGet > 0) && (
                      <span className="block truncate text-[13px] text-muted">
                        {[j.area, toGet ? `${toGet} to get` : ""].filter(Boolean).join("  ·  ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="px-4 pt-4">
        <button className="btn btn-primary w-full" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

export function TodayPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const [planning, setPlanning] = useState(false);
  const [, setTodayOnly] = useStoredState("materials:todayOnly", false);
  const goTab = useGoTab();
  const { setToday } = useJobActions();
  const today = dayKey();

  const all = jobs ?? [];
  const todays = all.filter((j) => j.todayDate === today && isOpen(j)).sort(byPriority);
  const doneToday = all.filter((j) => j.status === "done" && j.doneAt && dayKey(new Date(j.doneAt)) === today);
  const leftOver = all.filter((j) => isOpen(j) && j.todayDate && j.todayDate < today);

  const lines = buildShoppingList(todays);
  const need = lines.filter((l) => !l.have);

  const dateLine = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="pb-24">
      <div className="flex items-end justify-between px-4 pb-1 pt-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Today</h1>
          <p className="text-[14px] text-muted">{dateLine}</p>
        </div>
        <button className="btn h-9 px-3 text-[14px]" onClick={() => setPlanning(true)}>
          <ListChecks size={17} strokeWidth={1.75} />
          Pick jobs
        </button>
      </div>

      {leftOver.length > 0 && (
        <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded border border-line bg-soft px-3 py-2.5">
          <span className="text-[14px]">
            {leftOver.length} job{leftOver.length > 1 ? "s" : ""} not finished from before
          </span>
          <button
            className="shrink-0 text-[14px] font-semibold text-navy"
            onClick={() => Promise.all(leftOver.map((j) => setToday(j, true)))}
          >
            Carry over
          </button>
        </div>
      )}

      <SectionLabel>Work through in this order</SectionLabel>
      {todays.length ? (
        <div className="border-t border-line">
          {todays.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing picked for today" body="Tap Pick jobs, or the sun on any job, to plan your day. Your materials list builds itself." />
      )}

      <SectionLabel>Materials</SectionLabel>
      <button
        className="mx-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded border border-line px-3 py-3 text-left active:bg-soft"
        onClick={() => {
          setTodayOnly(true);
          goTab("materials");
        }}
      >
        <Package size={18} strokeWidth={1.75} className="shrink-0 text-navy" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">
            {need.length ? `${need.length} to get for today's jobs` : lines.length ? "Got everything for today" : "No materials on today's jobs"}
          </span>
          <span className="block truncate text-[13px] text-muted">{need.length ? need.map(lineLabel).join(", ") : "Open the Materials tab"}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>

      {doneToday.length > 0 && (
        <>
          <SectionLabel>Done today</SectionLabel>
          <div className="border-t border-line">
            {doneToday.map((j) => (
              <JobRow key={j.id} job={j} showToday={false} />
            ))}
          </div>
        </>
      )}

      <PlanSheet open={planning} onClose={() => setPlanning(false)} jobs={all} />
    </div>
  );
}
