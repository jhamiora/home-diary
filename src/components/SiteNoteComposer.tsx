import { useRef, useState } from "react";
import { Camera, CheckCircle, ImagePlus, MapPin, Mic, Package, PenLine, Square, X } from "lucide-react";
import { PRIORITIES, askPersistentStorage, db, dayKey, uid, type Job, type Material, type Priority } from "../lib/db";
import { OUTSIDE, WHOLE_HOUSE, parseMaterial, placeLabel, usePlaces } from "../lib/places";
import { lineLabel } from "../lib/materials";
import { savePhotoFiles, usePhotoUrl } from "../lib/photos";
import { MenuLabel, Pop, useStoredState, useToast } from "../lib/ui";
import { appendSaid, dictationSupported, useDictation } from "../lib/dictation";
import { PhotoViewer } from "./Photos";
import { MarkupEditor } from "./MarkupEditor";

/*
 * The Titus site diary "New site note" box, for the house. Same order:
 * words with the mic, then Materials / Photo / Add note, then
 * Location / Priority / Do today, then materials and photos.
 * Units are parts of the house. The box stays open after each note.
 */

const MAX_PHOTOS = 10;

export const PRIORITY_STYLE: Record<Priority, string> = {
  1: "border-high text-high",
  2: "border-med text-med",
  3: "border-line text-muted",
};

const PRIORITY_DOT: Record<Priority, string> = { 1: "bg-high", 2: "bg-med", 3: "bg-low" };

interface Draft {
  text: string;
  photoIds: string[];
  materials: Omit<Material, "have">[];
  priority: Priority;
  today: boolean;
}

const emptyDraft = (keep?: Partial<Draft>): Draft => ({
  text: "",
  photoIds: [],
  materials: [],
  priority: 2,
  today: false,
  ...keep,
});

function StagedThumb({ id, onView, onMarkup, onRemove }: { id: string; onView: () => void; onMarkup: () => void; onRemove: () => void }) {
  const url = usePhotoUrl(id, "thumb");
  return (
    <div className="relative h-14 w-14 shrink-0">
      <button type="button" onClick={onView} className="h-full w-full overflow-hidden rounded border border-line bg-soft">
        {url && <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />}
      </button>
      <button
        type="button"
        aria-label="Mark up photo"
        onClick={onMarkup}
        className="absolute -bottom-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded border border-line bg-white text-ink shadow-sm"
      >
        <PenLine size={12} />
      </button>
      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded bg-ink text-white"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function SiteNoteComposer({ onClose, onAdded }: { onClose: () => void; onAdded?: (ids: string[]) => void }) {
  const toast = useToast();
  const { places, addPlace } = usePlaces();
  const [draft, setDraft] = useStoredState<Draft>("composer:draft", emptyDraft());
  // The place sticks between notes, like the site diary's unit.
  const [picked, setPicked] = useStoredState<string[]>("composer:places", [WHOLE_HOUSE]);
  const [showMaterial, setShowMaterial] = useState(draft.materials.length > 0);
  const [materialText, setMaterialText] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [placeOpen, setPlaceOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [viewAt, setViewAt] = useState<number | null>(null);
  const [markupId, setMarkupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const placeBtn = useRef<HTMLButtonElement>(null);
  const priorityBtn = useRef<HTMLButtonElement>(null);
  const photoBtn = useRef<HTMLButtonElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const { listening, toggle: toggleDictation, stop: stopDictation } = useDictation(
    (said) => setDraft((d) => ({ ...d, text: appendSaid(d.text, said) })),
    () => toast("Dictation didn't work, try again"),
  );
  const validPicked = picked.filter((p) => p === WHOLE_HOUSE || p === OUTSIDE || places.includes(p));
  const placesPicked = [validPicked[0] ?? WHOLE_HOUSE];
  const placeSummary = placeLabel(placesPicked[0]);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - draft.photoIds.length;
    const { ids, failed } = await savePhotoFiles(Array.from(files).slice(0, room));
    if (ids.length) setDraft((d) => ({ ...d, photoIds: [...d.photoIds, ...ids] }));
    if (failed) toast(failed > 1 ? `${failed} photos couldn't be read` : "That photo couldn't be read");
    else if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos a note`);
    if (camInput.current) camInput.current.value = "";
    if (galInput.current) galInput.current.value = "";
  };

  const removePhoto = (id: string) => {
    setDraft((d) => ({ ...d, photoIds: d.photoIds.filter((p) => p !== id) }));
    db.photos.delete(id);
  };

  const addMaterial = () => {
    if (!materialText.trim()) return;
    patch({ materials: [...draft.materials, parseMaterial(materialText)] });
    setMaterialText("");
  };

  const pickPlace = (p: string) => {
    setPicked([p]);
    setPlaceOpen(false);
  };

  const close = async () => {
    stopDictation();
    onClose();
  };

  const discard = async () => {
    await db.photos.bulkDelete(draft.photoIds);
    setDraft(emptyDraft({ priority: draft.priority }));
    setMaterialText("");
    close();
  };

  const submit = async () => {
    // Close the keyboard first so it commits the word it is still holding;
    // otherwise Gboard puts the old words back after the box clears.
    const el = textRef.current;
    const text = (el?.value ?? draft.text).trim();
    el?.blur();
    if (!text || busy) return;
    setBusy(true);
    stopDictation();
    try {
      const now = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < placesPicked.length; i++) {
        // Each place gets its own note; extra notes get their own copy of the photos.
        let photoIds = draft.photoIds;
        if (i > 0) {
          const originals = await db.photos.bulkGet(draft.photoIds);
          const copies = originals.filter(Boolean).map((p) => ({ ...p!, id: uid() }));
          await db.photos.bulkAdd(copies);
          photoIds = copies.map((c) => c.id);
        }
        const job: Job = {
          id: uid(),
          title: text,
          notes: "",
          priority: draft.priority,
          area: placesPicked[i],
          status: "open",
          createdAt: now + i,
          updatedAt: now + i,
          photoIds,
          materials: draft.materials.map((m) => ({ ...m, id: uid(), have: false })),
          todayDate: draft.today ? dayKey() : undefined,
        };
        await db.jobs.add(job);
        ids.push(job.id);
      }
      askPersistentStorage();
      toast(ids.length > 1 ? `${ids.length} notes added` : "Note added");
      setDraft(emptyDraft({ priority: draft.priority }));
      setMaterialText("");
      if (el) el.value = "";
      requestAnimationFrame(() => {
        if (textRef.current) textRef.current.value = "";
      });
      onAdded?.(ids);
    } finally {
      setBusy(false);
    }
  };

  const priorityLabel = PRIORITIES.find((p) => p.value === draft.priority)!.label;

  return (
    <div className="screen-in rounded border border-line bg-white shadow-sm">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium">New site note</h3>
          <div className="flex items-center">
            {(draft.text.trim() || draft.photoIds.length > 0) && (
              <button className="h-8 px-2 text-[13px] text-muted" onClick={discard}>
                Clear
              </button>
            )}
            <button aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded active:bg-soft" onClick={close}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="relative">
            <textarea
              ref={textRef}
              className="field min-h-[80px] resize-none pr-12 leading-snug"
              placeholder={dictationSupported ? "What needs doing? (or tap mic to dictate)" : "What needs doing?"}
              value={draft.text}
              readOnly={listening}
              onChange={(e) => patch({ text: e.target.value })}
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
            {listening && <div className="absolute bottom-3.5 right-12 text-[12px] text-muted">Listening...</div>}
          </div>

        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={showMaterial}
            onClick={() => setShowMaterial(!showMaterial)}
            className={`relative flex h-10 items-center justify-center gap-1.5 rounded border text-[14px] font-medium ${
              showMaterial ? "border-navy bg-navy text-white" : "border-line"
            }`}
          >
            <Package size={16} />
            Materials
            {draft.materials.length > 0 && (
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-ok px-1 text-[10px] text-white">
                {draft.materials.length}
              </span>
            )}
          </button>
          <button
            ref={photoBtn}
            type="button"
            disabled={draft.photoIds.length >= MAX_PHOTOS}
            onClick={() => setPhotoMenu(true)}
            className="flex h-10 items-center justify-center gap-1.5 rounded border border-line text-[14px] font-medium disabled:opacity-40"
          >
            <Camera size={16} />
            Photo
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] text-muted">Location</div>
            <button
              ref={placeBtn}
              type="button"
              onClick={() => setPlaceOpen(true)}
              className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded border border-line px-2.5 text-[13px] font-medium"
            >
              <MapPin size={13} className="shrink-0 text-muted" />
              <span className="truncate">{placeSummary}</span>
            </button>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] text-muted">Priority</div>
            <button
              ref={priorityBtn}
              type="button"
              onClick={() => setPriorityOpen(true)}
              className="flex h-9 w-full items-center gap-[7px] rounded border border-line px-2.5 text-[13px] font-medium"
            >
              <span className={`h-2 w-2 shrink-0 rounded-[2px] ${PRIORITY_DOT[draft.priority]}`} />
              {priorityLabel}
            </button>
          </div>
        </div>

        {showMaterial && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addMaterial();
            }}
          >
            <input
              autoFocus
              className="h-9 flex-1 rounded border border-line px-2.5 text-[16px] outline-none focus:border-navy"
              placeholder="e.g. 6 lengths 140x32 decking"
              value={materialText}
              onChange={(e) => setMaterialText(e.target.value)}
            />
            <button className="h-9 shrink-0 rounded border border-line px-3 text-[13px] font-medium disabled:opacity-40" disabled={!materialText.trim()}>
              Add
            </button>
          </form>
        )}
        {draft.materials.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.materials.map((m) => (
              <span key={m.id} className="inline-flex items-center rounded border border-[#bbe5c8] bg-[#effaf2] pl-2 text-[12px] text-ok">
                <CheckCircle size={11} className="mr-1" />
                {lineLabel(m)}
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => patch({ materials: draft.materials.filter((x) => x.id !== m.id) })}
                  className="ml-1 p-1.5"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {draft.photoIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {draft.photoIds.map((id, i) => (
              <StagedThumb key={id} id={id} onView={() => setViewAt(i)} onMarkup={() => setMarkupId(id)} onRemove={() => removePhoto(id)} />
            ))}
          </div>
        )}
        {draft.photoIds.length > 0 && <p className="-mt-2 text-[11px] text-muted">Tap the pencil on a photo to mark it up before saving.</p>}

        <button
          type="button"
          disabled={!draft.text.trim() || busy || listening}
          onClick={submit}
          className="h-[46px] w-full rounded bg-navy text-[15px] font-semibold text-white disabled:opacity-40"
        >
          Add note
        </button>

      </div>

      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addPhotos(e.target.files)} />
      <input ref={galInput} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />

      <Pop anchor={photoBtn} open={photoMenu} onClose={() => setPhotoMenu(false)} width={210}>
        <button className="flex h-11 w-full items-center gap-2 rounded px-2 text-[14px] active:bg-soft" onClick={() => { setPhotoMenu(false); camInput.current?.click(); }}>
          <Camera size={16} /> Take Photo
        </button>
        <button className="flex h-11 w-full items-center gap-2 rounded px-2 text-[14px] active:bg-soft" onClick={() => { setPhotoMenu(false); galInput.current?.click(); }}>
          <ImagePlus size={16} /> Choose from Gallery
        </button>
      </Pop>

      <Pop anchor={placeBtn} open={placeOpen} onClose={() => setPlaceOpen(false)} width={240}>
        {[WHOLE_HOUSE, OUTSIDE, ...places].map((p) => (
          <label key={p || "whole"} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[14px] active:bg-soft">
            <input type="checkbox" className="h-4 w-4 accent-[#062932]" checked={placesPicked.includes(p)} onChange={() => pickPlace(p)} />
            {placeLabel(p)}
          </label>
        ))}
        <form
          className="mt-1 flex gap-1.5 border-t border-line pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = addPlace(newPlace);
            if (n) {
              setNewPlace("");
              setPicked([n]);
              setPlaceOpen(false);
            }
          }}
        >
          <input
            className="h-9 min-w-0 flex-1 rounded border border-line px-2 text-[16px] outline-none focus:border-navy"
            placeholder="Add location"
            value={newPlace}
            onChange={(e) => setNewPlace(e.target.value)}
          />
          <button className="h-9 shrink-0 rounded bg-navy px-3 text-[13px] font-medium text-white disabled:opacity-40" disabled={!newPlace.trim()}>
            Add
          </button>
        </form>
      </Pop>

      <Pop anchor={priorityBtn} open={priorityOpen} onClose={() => setPriorityOpen(false)} width={200}>
        <MenuLabel>Priority</MenuLabel>
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              patch({ priority: p.value });
              setPriorityOpen(false);
            }}
            className={`mt-1 flex w-full items-center gap-2 rounded border px-3 py-2 text-[13px] font-medium ${
              draft.priority === p.value ? "border-navy bg-navy text-white" : PRIORITY_STYLE[p.value]
            }`}
          >
            {p.label}
          </button>
        ))}
      </Pop>

      {viewAt !== null && <PhotoViewer ids={draft.photoIds} start={viewAt} onClose={() => setViewAt(null)} onDelete={removePhoto} />}
      {markupId && <MarkupEditor photoId={markupId} onClose={() => setMarkupId(null)} />}
    </div>
  );
}
