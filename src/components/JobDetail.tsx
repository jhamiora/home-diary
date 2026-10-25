import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Check, ImagePlus, MapPin, Mic, Package, Square, Sun, Trash2 } from "lucide-react";
import { PRIORITIES, db, dayKey, deleteJob, deletePhotos, uid, type Job, type Material } from "../lib/db";
import { ConfirmSheet, Pop, Screen, Sheet, useToast } from "../lib/ui";
import { lineLabel } from "../lib/materials";
import { parseMaterial, placeLabel } from "../lib/places";
import { savePhotoFiles } from "../lib/photos";
import { appendSaid, dictationSupported, useDictation } from "../lib/dictation";
import { PhotoThumb, PhotoViewer } from "./Photos";
import { LocationMenu, PRIORITY_DOT, PriorityMenu } from "./Pickers";
import { useJobActions } from "./JobRow";

/*
 * Edit a task, laid out like the add box (mockup A): the words with the mic,
 * then location / priority / Do today tags, the materials box, photos and notes.
 * Typed text waits for Save; taps (tags, ticks, photos) save at once.
 */

const MAX_PHOTOS = 10;

function MaterialForm({ initial, onSave, onDelete }: { initial: Material; onSave: (m: Omit<Material, "id" | "have">) => void; onDelete: () => void }) {
  const [name, setName] = useState(initial.name);
  const [qty, setQty] = useState(initial.qty);
  const [unit, setUnit] = useState(initial.unit);
  return (
    <form
      className="space-y-2 px-4 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), qty: qty.trim(), unit: unit.trim() });
      }}
    >
      <input autoFocus className="field" placeholder="Material" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <input className="field w-24" inputMode="decimal" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="field flex-1" placeholder="Unit, e.g. lengths, m, box" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" aria-label="Delete material" className="btn text-high" onClick={onDelete}>
          <Trash2 size={17} strokeWidth={1.75} />
        </button>
        <button className="btn btn-primary flex-1" disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

export function JobDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const job = useLiveQuery(() => db.jobs.get(jobId).then((j) => j ?? null), [jobId]);
  if (!job) return null;
  return <JobDetailInner job={job} onClose={onClose} />;
}

function JobDetailInner({ job, onClose }: { job: Job; onClose: () => void }) {
  const toast = useToast();
  const { setDone, setToday } = useJobActions();
  const [title, setTitle] = useState(job.title);
  const [notesText, setNotesText] = useState(job.notes);
  const [materialText, setMaterialText] = useState("");
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [viewAt, setViewAt] = useState<number | null>(null);
  const placeBtn = useRef<HTMLButtonElement>(null);
  const priorityBtn = useRef<HTMLButtonElement>(null);
  const photoBtn = useRef<HTMLButtonElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const dirty = title !== job.title || notesText !== job.notes;
  const onToday = job.todayDate === dayKey();
  const done = job.status === "done";
  const toGet = job.materials.filter((m) => !m.have).length;
  const priorityLabel = PRIORITIES.find((p) => p.value === job.priority)!.label;

  const { listening, toggle: toggleDictation } = useDictation(
    (said) => setTitle((t) => appendSaid(t, said)),
    () => toast("Dictation didn't work, try again"),
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight) el.style.height = `${Math.max(72, el.scrollHeight + 2)}px`;
  }, [title]);

  const patch = (p: Partial<Job>) => db.jobs.update(job.id, { ...p, updatedAt: Date.now() });

  const save = async () => {
    if (!title.trim()) return toast("The task needs some words");
    await patch({ title: title.trim(), notes: notesText });
    setTitle(title.trim());
    toast("Saved");
  };

  const addMaterial = () => {
    if (!materialText.trim()) return;
    patch({ materials: [...job.materials, { ...parseMaterial(materialText), id: uid(), have: false }] });
    setMaterialText("");
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - job.photoIds.length;
    const ids = await savePhotoFiles(Array.from(files).slice(0, room));
    if (ids.length) {
      const fresh = await db.jobs.get(job.id);
      await patch({ photoIds: [...(fresh?.photoIds ?? []), ...ids] });
    }
    if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos a task`);
    if (camInput.current) camInput.current.value = "";
    if (galInput.current) galInput.current.value = "";
  };

  const removePhoto = async (id: string) => {
    await patch({ photoIds: job.photoIds.filter((p) => p !== id) });
    toast("Photo removed", {
      label: "Undo",
      run: async () => {
        const fresh = await db.jobs.get(job.id);
        if (fresh) await db.jobs.update(job.id, { photoIds: [...fresh.photoIds, id] });
      },
    });
    // The photo itself is cleared once Undo has had its chance.
    setTimeout(async () => {
      const fresh = await db.jobs.get(job.id);
      if (!fresh?.photoIds.includes(id)) deletePhotos([id]);
    }, 5500);
  };

  return (
    <Screen
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          Edit task
          {dirty && <span className="rounded bg-[#fff4e0] px-2 py-0.5 text-[12px] font-medium text-med">Unsaved</span>}
        </span>
      }
      right={
        <button
          className={`mr-1 h-9 rounded px-4 text-[14px] font-semibold ${dirty ? "bg-ok text-white" : "bg-soft text-[#a3abb2]"}`}
          disabled={!dirty}
          onClick={save}
        >
          Save
        </button>
      }
      footer={
        <div className="flex gap-2 border-t border-line px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <button
            aria-label="Delete task"
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded border border-line text-high"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} strokeWidth={1.8} />
          </button>
          <button
            className={`flex h-[46px] flex-1 items-center justify-center gap-2 rounded text-[15px] font-semibold ${
              done ? "border border-line text-ink" : "bg-navy text-white"
            }`}
            onClick={() => setDone(job, !done)}
          >
            <Check size={16} strokeWidth={2.5} />
            {done ? "Reopen" : "Mark done"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5 p-4">
        <div className="relative">
          <textarea
            ref={titleRef}
            className="field min-h-[72px] resize-none pr-12 text-[16px] font-medium leading-snug"
            placeholder="What needs doing?"
            value={title}
            readOnly={listening}
            onChange={(e) => setTitle(e.target.value)}
          />
          {dictationSupported && (
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Dictate"}
              onClick={toggleDictation}
              className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded border ${
                listening ? "animate-pulse border-high bg-high text-white" : "border-line bg-white text-ink opacity-60"
              }`}
            >
              {listening ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
            </button>
          )}
        </div>

        <div className="flex min-w-0 gap-1.5">
          <button
            ref={placeBtn}
            className="flex h-8 min-w-0 items-center gap-1.5 rounded border border-line px-2 text-[13px] font-medium"
            onClick={() => setPlaceOpen(true)}
          >
            <MapPin size={13} className="shrink-0 text-muted" />
            <span className="truncate">{placeLabel(job.area)}</span>
          </button>
          <button
            ref={priorityBtn}
            className="flex h-8 shrink-0 items-center gap-[7px] rounded border border-line px-2 text-[13px] font-medium"
            onClick={() => setPriorityOpen(true)}
          >
            <span className={`h-2 w-2 rounded-[2px] ${PRIORITY_DOT[job.priority]}`} />
            {priorityLabel}
          </button>
          {!done && (
            <button
              aria-pressed={onToday}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded border px-2 text-[13px] font-medium ${
                onToday ? "border-navy bg-navy text-white" : "border-line text-muted"
              }`}
              onClick={() => setToday(job, !onToday)}
            >
              <Sun size={13} fill={onToday ? "currentColor" : "none"} />
              Do today
            </button>
          )}
        </div>

        <div className="rounded border border-line bg-[#fafbfb] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            <Package size={12} />
            Materials
            <span className="ml-auto font-normal normal-case tracking-normal">
              {job.materials.length ? (toGet ? `${toGet} to get` : "All in hand") : ""}
            </span>
          </div>
          {job.materials.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 py-1.5">
              <button
                role="checkbox"
                aria-checked={m.have}
                aria-label={m.have ? "Need it" : "Got it"}
                className="check h-5 w-5"
                onClick={() => patch({ materials: job.materials.map((x) => (x.id === m.id ? { ...x, have: !x.have } : x)) })}
              >
                {m.have && <Check size={12} strokeWidth={3} />}
              </button>
              <button className={`min-w-0 flex-1 truncate text-left text-[15px] ${m.have ? "text-muted line-through" : ""}`} onClick={() => setEditMaterial(m)}>
                {lineLabel(m)}
              </button>
            </div>
          ))}
          <form
            className="flex gap-2 pb-1 pt-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addMaterial();
            }}
          >
            <input
              className="h-9 min-w-0 flex-1 rounded border border-line bg-white px-2.5 text-[16px] outline-none focus:border-navy"
              placeholder="Add a material, e.g. 2 tins paint"
              value={materialText}
              onChange={(e) => setMaterialText(e.target.value)}
            />
            <button className="h-9 shrink-0 rounded border border-line bg-white px-3 text-[13px] font-medium disabled:opacity-40" disabled={!materialText.trim()}>
              Add
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            ref={photoBtn}
            aria-label="Add photo"
            disabled={job.photoIds.length >= MAX_PHOTOS}
            className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-[#c3c9ce] text-muted disabled:opacity-40"
            onClick={() => setPhotoMenu(true)}
          >
            <Camera size={20} strokeWidth={1.6} />
          </button>
          {job.photoIds.map((id, i) => (
            <PhotoThumb key={id} id={id} onClick={() => setViewAt(i)} className="h-16 w-16 border border-line" />
          ))}
        </div>

        <textarea
          className="field min-h-[76px] text-[15px] leading-relaxed"
          placeholder="Notes, measurements, how you'll do it"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
      </div>

      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addPhotos(e.target.files)} />
      <input ref={galInput} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />

      <Pop anchor={photoBtn} open={photoMenu} onClose={() => setPhotoMenu(false)} width={210}>
        <button
          className="flex h-11 w-full items-center gap-2 rounded px-2 text-[14px] active:bg-soft"
          onClick={() => {
            setPhotoMenu(false);
            camInput.current?.click();
          }}
        >
          <Camera size={16} /> Take Photo
        </button>
        <button
          className="flex h-11 w-full items-center gap-2 rounded px-2 text-[14px] active:bg-soft"
          onClick={() => {
            setPhotoMenu(false);
            galInput.current?.click();
          }}
        >
          <ImagePlus size={16} /> Choose from Gallery
        </button>
      </Pop>
      <LocationMenu anchor={placeBtn} open={placeOpen} onClose={() => setPlaceOpen(false)} value={job.area} onPick={(area) => patch({ area })} />
      <PriorityMenu anchor={priorityBtn} open={priorityOpen} onClose={() => setPriorityOpen(false)} value={job.priority} onPick={(priority) => patch({ priority })} />

      {viewAt !== null && <PhotoViewer ids={job.photoIds} start={viewAt} onClose={() => setViewAt(null)} onDelete={removePhoto} />}
      <Sheet open={!!editMaterial} onClose={() => setEditMaterial(null)} title="Edit material">
        {editMaterial && (
          <MaterialForm
            initial={editMaterial}
            onSave={(m) => {
              patch({ materials: job.materials.map((x) => (x.id === editMaterial.id ? { ...x, ...m } : x)) });
              setEditMaterial(null);
            }}
            onDelete={() => {
              patch({ materials: job.materials.filter((x) => x.id !== editMaterial.id) });
              setEditMaterial(null);
            }}
          />
        )}
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this task?"
        body="Its photos and materials go too."
        confirmLabel="Delete task"
        danger
        onConfirm={async () => {
          onClose();
          await deleteJob(job);
          toast("Task deleted");
        }}
      />
    </Screen>
  );
}
