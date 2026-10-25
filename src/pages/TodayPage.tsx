import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ListChecks, Share2 } from "lucide-react";
import { PRIORITIES, byPriority, db, dayKey, isOpen, type Job } from "../lib/db";
import { buildShoppingList, lineLabel, setLineHave, shoppingText, type ShopLine } from "../lib/materials";
import { Empty, SectionLabel, Sheet, useStoredState, useToast } from "../lib/ui";
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

function ShopRow({ line }: { line: ShopLine }) {
  const jobs = [...new Set(line.refs.map((r) => r.jobTitle))];
  return (
    <button className="flex w-full items-center gap-3 border-b border-line py-3 pl-4 pr-3 text-left active:bg-soft" onClick={() => setLineHave(line, !line.have)}>
      <span role="checkbox" aria-checked={line.have} className="check">
        {line.have && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${line.have ? "text-muted line-through" : "font-medium"}`}>{lineLabel(line)}</span>
        <span className="block truncate text-[13px] text-muted">{jobs.join(", ")}</span>
      </span>
    </button>
  );
}

export function TodayPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const [planning, setPlanning] = useState(false);
  const [scope, setScope] = useStoredState<"today" | "all">("shop:scope", "today");
  const toast = useToast();
  const { setToday } = useJobActions();
  const today = dayKey();

  const all = jobs ?? [];
  const todays = all.filter((j) => j.todayDate === today && isOpen(j)).sort(byPriority);
  const doneToday = all.filter((j) => j.status === "done" && j.doneAt && dayKey(new Date(j.doneAt)) === today);
  const leftOver = all.filter((j) => isOpen(j) && j.todayDate && j.todayDate < today);

  const shopJobs = scope === "today" ? todays : all.filter(isOpen);
  const lines = buildShoppingList(shopJobs);
  const need = lines.filter((l) => !l.have);

  const share = async () => {
    const text = shoppingText(need);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("List copied");
      }
    } catch {
      /* cancelled */
    }
  };

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

      <SectionLabel
        right={
          need.length > 0 && (
            <button className="flex items-center gap-1.5 text-[13px] font-medium text-navy" onClick={share}>
              <Share2 size={15} strokeWidth={1.75} />
              Send list
            </button>
          )
        }
      >
        Materials to get
      </SectionLabel>
      <div className="px-4 pb-3">
        <div className="seg">
          <button aria-pressed={scope === "today"} onClick={() => setScope("today")}>
            Today's jobs
          </button>
          <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            All open jobs
          </button>
        </div>
      </div>
      <div className="border-t border-line">
        {lines.map((l) => (
          <ShopRow key={l.key} line={l} />
        ))}
        {!need.length && (
          <p className="px-4 py-3 text-[14px] text-muted">
            {lines.length ? `Got all ${lines.length}. Good to go.` : "No materials on these jobs yet. Add them inside each job."}
          </p>
        )}
      </div>

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
