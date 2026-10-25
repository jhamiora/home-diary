import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, Sun, Trash2 } from "lucide-react";
import { PRIORITIES, db, dayKey, deleteJob, deletePhotos, uid, type Job, type Material } from "../lib/db";
import { ConfirmSheet, Screen, SectionLabel, Sheet, useToast } from "../lib/ui";
import { lineLabel } from "../lib/materials";
import { OUTSIDE, WHOLE_HOUSE, placeLabel, usePlaces } from "../lib/places";
import { AddPhotoButtons, PhotoGrid } from "./Photos";
import { useJobActions } from "./JobRow";

export function AreaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { places, addPlace } = usePlaces();
  const [adding, setAdding] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {[WHOLE_HOUSE, OUTSIDE, ...places].map((p) => (
          <button key={p || "whole"} type="button" className="tab" aria-pressed={value === p} onClick={() => onChange(p)}>
            {placeLabel(p)}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const n = addPlace(adding);
          if (n) {
            onChange(n);
            setAdding("");
          }
        }}
      >
        <input className="field h-9 py-0 text-[15px]" placeholder="Add location" value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn h-9 shrink-0 px-3 text-[14px]" disabled={!adding.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

export function PrioritySeg({ value, onChange }: { value: number; onChange: (p: 1 | 2 | 3) => void }) {
  return (
    <div className="seg">
      {PRIORITIES.map((p) => (
        <button key={p.value} type="button" aria-pressed={value === p.value} onClick={() => onChange(p.value)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function MaterialRow({ m, onToggle, onEdit }: { m: Material; onToggle: () => void; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 pl-4 pr-3">
      <button role="checkbox" aria-checked={m.have} aria-label={m.have ? "Need it" : "Got it"} className="check" onClick={onToggle}>
        {m.have && <Check size={14} strokeWidth={3} />}
      </button>
      <button className={`min-w-0 flex-1 truncate text-left text-[15px] ${m.have ? "text-muted line-through" : ""}`} onClick={onEdit}>
        {lineLabel(m)}
      </button>
    </div>
  );
}

function MaterialForm({ initial, onSave, onDelete }: { initial?: Material; onSave: (m: Omit<Material, "id" | "have">) => void; onDelete?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [qty, setQty] = useState(initial?.qty ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const submit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), qty: qty.trim(), unit: unit.trim() });
    if (!initial) {
      setName("");
      setQty("");
      setUnit("");
    }
  };
  return (
    <form
      className="space-y-2 px-4 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input autoFocus className="field" placeholder="Material, e.g. 90x45 framing" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <input className="field w-24" inputMode="decimal" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="field flex-1" placeholder="Unit, e.g. lengths, m, box" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-2">
        {onDelete && (
          <button type="button" className="btn text-high" onClick={onDelete}>
            <Trash2 size={17} strokeWidth={1.75} />
          </button>
        )}
        <button className="btn btn-primary flex-1" disabled={!name.trim()}>
          {initial ? "Save" : "Add material"}
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
  // Typed fields use explicit Save; taps (priority, ticks, photos) save instantly.
  const [title, setTitle] = useState(job.title);
  const [area, setArea] = useState(job.area);
  const [notesText, setNotesText] = useState(job.notes);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = title !== job.title || area !== job.area || notesText !== job.notes;
  const onToday = job.todayDate === dayKey();
  const done = job.status === "done";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (p: Partial<Job>) => db.jobs.update(job.id, { ...p, updatedAt: Date.now() });

  const save = async () => {
    if (!title.trim()) return toast("The job needs a name");
    await patch({ title: title.trim(), area: area.trim(), notes: notesText });
    setTitle(title.trim());
    setArea(area.trim());
    toast("Saved");
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

  const toGet = job.materials.filter((m) => !m.have).length;

  return (
    <Screen
      open
      onClose={onClose}
      title={dirty ? <span className="flex items-center gap-2">Job <span className="rounded bg-[#fff4e0] px-2 py-0.5 text-[12px] font-medium text-med">Unsaved</span></span> : "Job"}
      right={
        dirty ? (
          <button className="btn btn-save mr-1 h-9 px-4 text-[14px]" onClick={save}>
            Save
          </button>
        ) : null
      }
      footer={
        <div className="flex gap-2 border-t border-line p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {!done && (
            <button className={`btn flex-1 ${onToday ? "border-navy text-navy" : ""}`} onClick={() => setToday(job, !onToday)}>
              <Sun size={17} strokeWidth={1.75} fill={onToday ? "currentColor" : "none"} />
              {onToday ? "On today" : "Do today"}
            </button>
          )}
          <button className={`btn flex-1 ${done ? "" : "btn-primary"}`} onClick={() => setDone(job, !done)}>
            <Check size={17} strokeWidth={2} />
            {done ? "Reopen" : "Mark done"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 px-4 pt-4">
        <textarea
          rows={1}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
            }
          }}
          className="w-full resize-none bg-transparent text-[20px] font-semibold leading-snug outline-none placeholder:text-[#a3abb2]"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <PrioritySeg value={job.priority} onChange={(p) => patch({ priority: p })} />
        <AreaPicker value={area} onChange={setArea} />
        <textarea
          className="field min-h-[84px] leading-relaxed"
          placeholder="Notes, measurements, how you'll do it"
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
      </div>

      <SectionLabel>Photos</SectionLabel>
      <div className="space-y-2 px-4">
        <PhotoGrid ids={job.photoIds} onRemove={removePhoto} />
        <AddPhotoButtons onAdded={(ids) => patch({ photoIds: [...job.photoIds, ...ids] })} />
      </div>

      <SectionLabel
        right={
          job.materials.length > 0 && (
            <span className="text-[12px] text-muted">{toGet ? `${toGet} to get` : "All in hand"}</span>
          )
        }
      >
        Materials
      </SectionLabel>
      <div className="border-t border-line">
        {job.materials.map((m) => (
          <MaterialRow
            key={m.id}
            m={m}
            onToggle={() => patch({ materials: job.materials.map((x) => (x.id === m.id ? { ...x, have: !x.have } : x)) })}
            onEdit={() => setEditMaterial(m)}
          />
        ))}
        <button className="flex h-12 w-full items-center gap-3 pl-4 text-[15px] text-navy active:bg-soft" onClick={() => setAddingMaterial(true)}>
          <Plus size={18} strokeWidth={2} />
          Add material
        </button>
      </div>

      <div className="px-4 py-8">
        <button className="flex items-center gap-2 text-[14px] text-high" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} strokeWidth={1.75} />
          Delete job
        </button>
      </div>

      <Sheet open={addingMaterial} onClose={() => setAddingMaterial(false)} title="Add material">
        <MaterialForm
          onSave={(m) => {
            patch({ materials: [...job.materials, { ...m, id: uid(), have: false }] });
            toast(`Added ${m.name}`);
          }}
        />
      </Sheet>
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
        title="Delete this job?"
        body="Its photos and materials go too."
        confirmLabel="Delete job"
        danger
        onConfirm={async () => {
          onClose();
          await deleteJob(job);
          toast("Job deleted");
        }}
      />
    </Screen>
  );
}
