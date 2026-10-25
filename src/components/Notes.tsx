import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreHorizontal } from "lucide-react";
import { db, deleteNote, deletePhotos, uid, type Note } from "../lib/db";
import { ConfirmSheet, Screen, afterOverlayClosed, Sheet, formatTime, useStoredState, useToast } from "../lib/ui";
import { AddPhotoButtons, PhotoGrid } from "./Photos";
import { useOpenJob } from "./JobRow";

/* Composer: same idea as the site diary box. Draft survives closing the app. */

export function NoteComposer({ jobId: fixedJobId, onSaved }: { jobId?: string; onSaved?: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useStoredState(`draft:note:${fixedJobId ?? "diary"}`, {
    text: "",
    photoIds: [] as string[],
    jobId: "",
  });
  const openJobs = useLiveQuery(() => db.jobs.where("status").notEqual("done").sortBy("priority"), []);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = draft.text.trim().length > 0 || draft.photoIds.length > 0;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight is 0 while the tab is hidden; leave the natural height then.
    if (el.scrollHeight) el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [draft.text]);

  const save = async () => {
    if (!dirty) return;
    const note: Note = {
      id: uid(),
      createdAt: Date.now(),
      text: draft.text.trim(),
      photoIds: draft.photoIds,
      jobId: fixedJobId ?? (draft.jobId || undefined),
    };
    await db.notes.add(note);
    setDraft({ text: "", photoIds: [], jobId: draft.jobId });
    toast("Note saved");
    onSaved?.();
  };

  const discard = async () => {
    await deletePhotos(draft.photoIds);
    setDraft({ text: "", photoIds: [], jobId: draft.jobId });
  };

  return (
    <div className="rounded border border-line bg-white p-3">
      <textarea
        ref={area}
        rows={2}
        className="min-h-[48px] w-full resize-none bg-transparent text-[16px] leading-snug outline-none placeholder:text-[#a3abb2]"
        placeholder="What did you do, what's next?"
        value={draft.text}
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
      />
      <div className="mt-2">
        <PhotoGrid
          ids={draft.photoIds}
          onRemove={(id) => {
            setDraft({ ...draft, photoIds: draft.photoIds.filter((p) => p !== id) });
            deletePhotos([id]);
          }}
        />
      </div>
      {!fixedJobId && (
        <select
          className="field mt-2 h-11 py-0 text-[15px]"
          value={draft.jobId}
          onChange={(e) => setDraft({ ...draft, jobId: e.target.value })}
        >
          <option value="">No job</option>
          {openJobs?.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      )}
      <div className="mt-3 flex items-center gap-2">
        <AddPhotoButtons compact onAdded={(ids) => setDraft((d) => ({ ...d, photoIds: [...d.photoIds, ...ids] }))} />
        <div className="flex-1" />
        {dirty && (
          <button className="h-9 px-2 text-[14px] text-muted" onClick={discard}>
            Clear
          </button>
        )}
        <button className="btn btn-save h-9 px-4 text-[14px]" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

export function NoteCard({ note, showJob = true }: { note: Note; showJob?: boolean }) {
  const job = useLiveQuery(() => (note.jobId ? db.jobs.get(note.jobId) : undefined), [note.jobId]);
  const openJob = useOpenJob();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span>{formatTime(note.createdAt)}</span>
        {showJob && job && (
          <>
            <span>·</span>
            <button className="min-w-0 truncate font-medium text-navy" onClick={() => openJob(job.id)}>
              {job.title}
            </button>
          </>
        )}
        <div className="flex-1" />
        <button aria-label="Note options" className="-my-2 -mr-2 flex h-9 w-9 items-center justify-center" onClick={() => setMenu(true)}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {note.text && <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{note.text}</p>}
      {note.photoIds.length > 0 && (
        <div className="mt-2">
          <PhotoGrid ids={note.photoIds} />
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="flex flex-col py-2">
          <button
            className="h-12 px-4 text-left text-[16px] active:bg-soft"
            onClick={() => {
              setMenu(false);
              afterOverlayClosed(() => setEditing(true));
            }}
          >
            Edit note
          </button>
          <button
            className="h-12 px-4 text-left text-[16px] text-high active:bg-soft"
            onClick={() => {
              setMenu(false);
              afterOverlayClosed(() => setConfirmDelete(true));
            }}
          >
            Delete note
          </button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this note?"
        body="Its photos go too. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await deleteNote(note);
          toast("Note deleted");
        }}
      />
      {editing && <NoteEditor note={note} onClose={() => setEditing(false)} />}
    </div>
  );
}

function NoteEditor({ note, onClose }: { note: Note; onClose: () => void }) {
  const [text, setText] = useState(note.text);
  const [photoIds, setPhotoIds] = useState(note.photoIds);
  const [jobId, setJobId] = useState(note.jobId ?? "");
  const jobs = useLiveQuery(() => db.jobs.orderBy("createdAt").reverse().toArray(), []);
  const toast = useToast();
  const added = useRef<string[]>([]);
  const dirty = text !== note.text || photoIds.join() !== note.photoIds.join() || jobId !== (note.jobId ?? "");

  const cancel = () => {
    // Photos added in this edit but not saved get cleaned up.
    deletePhotos(added.current.filter((id) => !note.photoIds.includes(id)));
    onClose();
  };

  const save = async () => {
    await db.notes.update(note.id, { text: text.trim(), photoIds, jobId: jobId || undefined });
    await deletePhotos(note.photoIds.filter((id) => !photoIds.includes(id)));
    toast("Note saved");
    onClose();
  };

  return (
    <Screen
      open
      onClose={cancel}
      title="Edit note"
      right={dirty ? <span className="mr-2 rounded bg-[#fff4e0] px-2 py-0.5 text-[12px] font-medium text-med">Unsaved</span> : null}
      footer={
        <div className="border-t border-line p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button className="btn btn-save w-full" disabled={!dirty} onClick={save}>
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <textarea className="field min-h-[160px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="field h-11 py-0 text-[15px]" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">No job</option>
          {jobs?.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <PhotoGrid ids={photoIds} onRemove={(id) => setPhotoIds((p) => p.filter((x) => x !== id))} />
        <AddPhotoButtons
          onAdded={(ids) => {
            added.current.push(...ids);
            setPhotoIds((p) => [...p, ...ids]);
          }}
        />
      </div>
    </Screen>
  );
}
