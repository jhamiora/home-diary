import { useLiveQuery } from "dexie-react-hooks";
import { Check, Share2 } from "lucide-react";
import { PRIORITIES, db, dayKey, isOpen, type Job } from "../lib/db";
import { buildShoppingList, lineLabel, setLineHave, shoppingText, type ShopLine } from "../lib/materials";
import { placeLabel } from "../lib/places";
import { Switch, useStoredState, useToast } from "../lib/ui";
import { PRIORITY_BAR } from "../components/JobRow";

// Each line sits under the highest priority of the notes that need it.
function linePriority(line: ShopLine, jobs: Job[]) {
  return Math.min(...line.refs.map((r) => jobs.find((j) => j.id === r.jobId)?.priority ?? 3));
}

function MaterialRow({ line, jobs }: { line: ShopLine; jobs: Job[] }) {
  const notes = [...new Set(line.refs.map((r) => r.jobId))]
    .map((id) => jobs.find((j) => j.id === id))
    .filter(Boolean)
    .map((j) => (j!.area ? `${j!.title} (${placeLabel(j!.area)})` : j!.title));
  return (
    <button className="flex w-full items-center gap-3 border-b border-line py-3 pl-4 pr-3 text-left active:bg-soft" onClick={() => setLineHave(line, !line.have)}>
      <span role="checkbox" aria-checked={line.have} className="check">
        {line.have && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${line.have ? "text-muted line-through" : "font-medium"}`}>{lineLabel(line)}</span>
        <span className="block truncate text-[13px] text-muted">{notes.join(", ")}</span>
      </span>
    </button>
  );
}

export function MaterialsPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const [todayOnly, setTodayOnly] = useStoredState("materials:todayOnly", false);
  const toast = useToast();
  const today = dayKey();

  const open = (jobs ?? []).filter(isOpen);
  const scoped = todayOnly ? open.filter((j) => j.todayDate === today) : open;
  const lines = buildShoppingList(scoped);
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

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-display text-[20px] font-extrabold uppercase leading-none tracking-[-0.02em]">Materials</h1>
            <p className="mt-1 text-[11px] tracking-[0.04em] text-muted">
              {need.length ? `${need.length} to get` : "Nothing to get"}
              {todayOnly ? " for today's jobs" : " across all open notes"}
            </p>
          </div>
          {need.length > 0 && (
            <button className="btn h-9 shrink-0 px-3 text-[14px]" onClick={share}>
              <Share2 size={16} strokeWidth={1.75} />
              Send list
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-[12px] text-muted">Highest priority first. Tick what you've got.</span>
          <Switch on={todayOnly} onChange={setTodayOnly} label="Today's jobs" />
        </div>
      </div>

      {jobs && !lines.length && (
        <div className="px-8 py-16 text-center">
          <div className="text-[15px] font-medium">{todayOnly ? "No materials on today's jobs" : "No materials yet"}</div>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            {todayOnly
              ? "Put notes on today with the Today button on each card, or turn Today's jobs off."
              : "Tap Materials on the Add site note box to add what each job needs."}
          </p>
        </div>
      )}

      {PRIORITIES.map((p) => {
        const group = lines.filter((l) => linePriority(l, scoped) === p.value);
        if (!group.length) return null;
        return (
          <div key={p.value}>
            <div className="flex items-center gap-2 px-4 pb-2 pt-5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
              <span className={`h-2 w-2 ${PRIORITY_BAR[p.value]}`} />
              {p.label}
              <span className="font-normal">{group.filter((l) => !l.have).length}</span>
            </div>
            <div className="border-t border-line">
              {group.map((l) => (
                <MaterialRow key={l.key} line={l} jobs={scoped} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
