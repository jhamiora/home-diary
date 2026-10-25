import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, ChevronDown, MapPin, Plus, Search, X } from "lucide-react";
import { db, dayKey, isOpen, type Job } from "../lib/db";
import { OUTSIDE, WHOLE_HOUSE, placeLabel, usePlaces } from "../lib/places";
import { Pop, Switch, formatDay, useStoredState } from "../lib/ui";
import { SiteNoteComposer } from "../components/SiteNoteComposer";
import { SiteNoteCard } from "../components/SiteNoteCard";

type View = "list" | "places" | "dates";

// Highest priority first, newest first within a priority.
const diaryOrder = (a: Job, b: Job) => a.priority - b.priority || b.createdAt - a.createdAt;

export function SiteDiaryPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const { places } = usePlaces();
  // The box stays open after each note; only the X folds it away.
  const [composerOpen, setComposerOpen] = useStoredState("diary:composerOpen", true);
  const [view, setView] = useStoredState<View>("diary:view", "list");
  const [search, setSearch] = useState("");
  const [place, setPlace] = useStoredState<string | null>("diary:place", null);
  const [todayOnly, setTodayOnly] = useStoredState("diary:todayOnly", false);
  const [showCompleted, setShowCompleted] = useStoredState("diary:showCompleted", false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const placeBtn = useRef<HTMLButtonElement>(null);

  const q = search.trim().toLowerCase();
  const filtered = (jobs ?? []).filter(
    (j) =>
      (place === null || j.area === place) &&
      (!todayOnly || j.todayDate === dayKey()) &&
      (!q || j.title.toLowerCase().includes(q) || j.materials.some((m) => m.name.toLowerCase().includes(q))),
  );
  const open = filtered.filter(isOpen).sort(diaryOrder);
  const completed = filtered.filter((j) => !isOpen(j)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const hasFilters = !!q || place !== null || todayOnly;

  const card = (j: Job) => (
    <SiteNoteCard key={j.id} job={j} expanded={expanded === j.id} onToggle={() => setExpanded(expanded === j.id ? null : j.id)} />
  );

  const groups: [string, Job[]][] = [];
  if (view === "places") {
    for (const p of [WHOLE_HOUSE, OUTSIDE, ...places]) {
      const list = open.filter((j) => j.area === p);
      if (list.length) groups.push([placeLabel(p), list]);
    }
  } else if (view === "dates") {
    const byDay = new Map<string, Job[]>();
    for (const j of [...open].sort((a, b) => b.createdAt - a.createdAt)) {
      const k = dayKey(new Date(j.createdAt));
      byDay.set(k, [...(byDay.get(k) ?? []), j]);
    }
    for (const [, list] of byDay) groups.push([formatDay(list[0].createdAt), list]);
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-display text-[20px] font-extrabold uppercase leading-none tracking-[-0.02em]">Site Diary</h1>
            <p className="mt-1 text-[11px] tracking-[0.04em] text-muted">Jobs, photos &amp; materials around the house</p>
          </div>
          <div className="seg shrink-0">
            {(["list", "places", "dates"] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className="!h-8 px-2.5 !text-[12px] capitalize">
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-3 pt-4">
        {composerOpen ? (
          <SiteNoteComposer onClose={() => setComposerOpen(false)} />
        ) : (
          <button className="flex h-11 items-center gap-2 rounded bg-navy px-5 text-[15px] font-medium text-white active:opacity-90" onClick={() => setComposerOpen(true)}>
            <Plus size={16} />
            Add site note
          </button>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field h-9 py-0 pl-9 text-[14px]" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </div>
          <div>
            <button ref={placeBtn} className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded border border-line px-3 text-[14px]" onClick={() => setPlaceOpen(true)}>
              <span className="flex min-w-0 items-center gap-2">
                <MapPin size={16} className="shrink-0 text-muted" />
                <span className={`truncate ${place !== null ? "font-semibold text-navy" : ""}`}>{place === null ? "All places" : placeLabel(place)}</span>
              </span>
              <ChevronDown size={16} className="shrink-0 opacity-50" />
            </button>
          </div>
          <div className="-mt-1 flex min-h-6 items-center gap-2">
            <Switch on={todayOnly} onChange={setTodayOnly} label="Today's jobs" />
            {hasFilters && (
              <button
                className="h-7 px-1 text-[12px] text-muted"
                onClick={() => {
                  setSearch("");
                  setPlace(null);
                  setTodayOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
            <div className="ml-auto">
              <Switch on={showCompleted} onChange={setShowCompleted} label={`Completed${showCompleted ? ` ${completed.length}` : ""}`} />
            </div>
          </div>
        </div>

        {jobs && !open.length && !(showCompleted && completed.length) && (
          <div className="py-12 text-center">
            <div className="text-[15px] font-medium">{hasFilters ? "No notes found" : "Nothing on the list"}</div>
            <p className="mt-1 text-[14px] text-muted">
              {hasFilters ? "Try clearing the filters." : "Tap Add site note to log a job with photos and materials."}
            </p>
          </div>
        )}

        {view === "list" ? (
          <div className="space-y-2">{open.map(card)}</div>
        ) : (
          <div className="space-y-4">
            {groups.map(([label, list]) => (
              <div key={label}>
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {label}
                  <span className="font-normal">{list.length}</span>
                </div>
                <div className="space-y-2">{list.map(card)}</div>
              </div>
            ))}
          </div>
        )}

        {showCompleted && completed.length > 0 && (
          <div>
            <div className="mb-2 mt-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-ok">
              <CheckCircle2 size={14} />
              Completed notes
              <span className="font-normal">{completed.length}</span>
            </div>
            <div className="space-y-2">{completed.map(card)}</div>
          </div>
        )}
      </div>

      <Pop anchor={placeBtn} open={placeOpen} onClose={() => setPlaceOpen(false)} align="end" width={240}>
        {[null, WHOLE_HOUSE, OUTSIDE, ...places].map((p) => (
          <button
            key={p ?? "all"}
            className={`flex h-10 w-full items-center rounded px-2 text-left text-[14px] active:bg-soft ${place === p ? "font-semibold text-navy" : ""}`}
            onClick={() => {
              setPlace(p);
              setPlaceOpen(false);
            }}
          >
            {p === null ? "All places" : placeLabel(p)}
          </button>
        ))}
      </Pop>
    </div>
  );
}
