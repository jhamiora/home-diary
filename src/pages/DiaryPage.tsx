import { useLiveQuery } from "dexie-react-hooks";
import { db, type Note } from "../lib/db";
import { Empty, formatDay } from "../lib/ui";
import { NoteCard, NoteComposer } from "../components/Notes";

export function DiaryPage() {
  const notes = useLiveQuery(() => db.notes.orderBy("createdAt").reverse().toArray(), []);

  const days: { label: string; notes: Note[] }[] = [];
  for (const n of notes ?? []) {
    const label = formatDay(n.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.notes.push(n);
    else days.push({ label, notes: [n] });
  }

  return (
    <div className="pb-24">
      <div className="px-4 pb-3 pt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Diary</h1>
      </div>
      <div className="px-4">
        <NoteComposer />
      </div>
      {notes && !notes.length && <Empty title="No notes yet" body="Write what you did, snap progress photos, and link them to a job." />}
      {days.map((d) => (
        <div key={d.label}>
          <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 pb-2 pt-5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted backdrop-blur">
            {d.label}
          </div>
          {d.notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      ))}
    </div>
  );
}
