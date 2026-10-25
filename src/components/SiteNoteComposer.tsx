import { useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle, ChevronDown, ImagePlus, Mic, Package, PenLine, Plus, Search, Square, Sun, X } from "lucide-react";
import { PRIORITIES, askPersistentStorage, db, dayKey, uid, type Job, type Material, type Priority } from "../lib/db";
import { OUTSIDE, WHOLE_HOUSE, parseMaterial, placeLabel, usePeople, usePlaces } from "../lib/places";
import { lineLabel } from "../lib/materials";
import { savePhotoFiles, usePhotoUrl } from "../lib/photos";
import { MenuLabel, Pop, Screen, Switch, useStoredState, useToast } from "../lib/ui";
import { PhotoViewer } from "./Photos";
import { MarkupEditor } from "./MarkupEditor";

/*
 * The Titus site diary "New site note" box, for the house. Same order:
 * words with the mic, then Search who / Photo / Add note, then
 * Place / Multi / Priority / More, then materials, photos and the switches.
 * Units are parts of the house; subbies are whoever is doing it.
 */

const MAX_PHOTOS = 10;

export const PRIORITY_STYLE: Record<Priority, string> = {
  1: "border-high text-high",
  2: "border-med text-med",
  3: "border-line text-muted",
};

interface Draft {
  text: string;
  photoIds: string[];
  materials: Omit<Material, "have">[];
  who: string[];
  priority: Priority;
  today: boolean;
}

const emptyDraft = (keep?: Partial<Draft>): Draft => ({
  text: "",
  photoIds: [],
  materials: [],
  who: [],
  priority: 2,
  today: false,
  ...keep,
});

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
};

const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;

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

function WhoSheet({
  open,
  onClose,
  picked,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  picked: string[];
  onToggle: (name: string) => void;
}) {
  const { people, addPerson } = usePeople();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => input.current?.focus({ preventScroll: true }), 50);
    }
  }, [open]);
  const query = q.trim().toLowerCase();
  const list = people.filter((p) => !query || p.toLowerCase().includes(query));
  const exact = people.some((p) => p.toLowerCase() === query);
  return (
    <Screen
      open={open}
      onClose={onClose}
      title="Who's doing it?"
      right={
        <button className="btn btn-primary mr-1 h-9 px-4 text-[14px]" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-white p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            className="field pl-9"
            placeholder="Search or add a name, e.g. Me, Dad, Sparky"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) {
                const name = exact ? people.find((p) => p.toLowerCase() === query)! : addPerson(q);
                if (!picked.includes(name)) onToggle(name);
                setQ("");
              }
            }}
          />
        </div>
      </div>
      {q.trim() && !exact && (
        <button
          className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left text-[15px] text-navy active:bg-soft"
          onClick={() => {
            const name = addPerson(q);
            if (!picked.includes(name)) onToggle(name);
            setQ("");
          }}
        >
          <Plus size={18} />
          Add "{q.trim()}"
        </button>
      )}
      {list.map((p) => {
        const on = picked.includes(p);
        return (
          <button key={p} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left text-[15px] active:bg-soft" onClick={() => onToggle(p)}>
            <span role="checkbox" aria-checked={on} className="check">
              {on && <Check size={14} strokeWidth={3} />}
            </span>
            {p}
          </button>
        );
      })}
      {!people.length && !q.trim() && <p className="px-4 py-6 text-[14px] text-muted">Type a name to add who's doing the work.</p>}
    </Screen>
  );
}

export function SiteNoteComposer({ onClose, onAdded }: { onClose: () => void; onAdded?: (ids: string[]) => void }) {
  const toast = useToast();
  const { places, addPlace } = usePlaces();
  const [draft, setDraft] = useStoredState<Draft>("composer:draft", emptyDraft());
  // The place sticks between notes, like the site diary's unit.
  const [picked, setPicked] = useStoredState<string[]>("composer:places", [WHOLE_HOUSE]);
  const [multi, setMulti] = useStoredState("composer:multi", false);
  const [addAnother, setAddAnother] = useStoredState("composer:addAnother", false);
  const [keepWho, setKeepWho] = useStoredState("composer:keepWho", false);
  const [showMaterial, setShowMaterial] = useState(draft.materials.length > 0);
  const [materialText, setMaterialText] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [placeOpen, setPlaceOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [viewAt, setViewAt] = useState<number | null>(null);
  const [markupId, setMarkupId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const placeBtn = useRef<HTMLButtonElement>(null);
  const priorityBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const photoBtn = useRef<HTMLButtonElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);
  const rec = useRef<SpeechRec | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const validPicked = picked.filter((p) => p === WHOLE_HOUSE || p === OUTSIDE || places.includes(p));
  const placesPicked = validPicked.length ? validPicked : [WHOLE_HOUSE];
  const placeSummary = placesPicked.length > 1 ? `${placesPicked.length} places` : placeLabel(placesPicked[0]);
  const moreCount = draft.materials.length + (draft.today ? 1 : 0);

  useEffect(() => () => rec.current?.stop(), []);

  const toggleDictation = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    if (!SpeechRecognitionCtor) return;
    const r = new SpeechRecognitionCtor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-NZ";
    r.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      said = said.trim();
      if (said) setDraft((d) => ({ ...d, text: d.text.trim() ? `${d.text.trim()} ${said}` : said.charAt(0).toUpperCase() + said.slice(1) }));
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      toast("Dictation didn't work, try again");
    };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - draft.photoIds.length;
    const ids = await savePhotoFiles(Array.from(files).slice(0, room));
    if (ids.length) setDraft((d) => ({ ...d, photoIds: [...d.photoIds, ...ids] }));
    if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos a note`);
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
    if (!multi || p === WHOLE_HOUSE || p === OUTSIDE) {
      setPicked([p]);
      if (!multi) setPlaceOpen(false);
      return;
    }
    const without = placesPicked.filter((x) => x !== WHOLE_HOUSE && x !== OUTSIDE && x !== p);
    setPicked(placesPicked.includes(p) ? (without.length ? without : [WHOLE_HOUSE]) : [...without, p]);
  };

  const close = async () => {
    rec.current?.stop();
    onClose();
  };

  const discard = async () => {
    await db.photos.bulkDelete(draft.photoIds);
    setDraft(emptyDraft({ priority: draft.priority }));
    setMaterialText("");
    close();
  };

  const submit = async () => {
    const text = draft.text.trim();
    if (!text || busy) return;
    setBusy(true);
    rec.current?.stop();
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
          who: draft.who,
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
      setDraft(emptyDraft({ priority: draft.priority, who: addAnother && keepWho ? draft.who : [] }));
      setMaterialText("");
      onAdded?.(ids);
      if (addAnother) textRef.current?.focus();
      else onClose();
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
              placeholder={SpeechRecognitionCtor ? "What needs doing? (or tap mic to dictate)" : "What needs doing?"}
              value={draft.text}
              readOnly={listening}
              onChange={(e) => patch({ text: e.target.value })}
            />
            {SpeechRecognitionCtor && (
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

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setWhoOpen(true)}
              className="flex h-9 min-w-9 flex-1 items-center gap-1.5 overflow-hidden rounded border border-line bg-white px-2.5 text-left text-[14px] text-muted"
            >
              <Search size={16} className="shrink-0" />
              <span className="truncate">{draft.who.length ? "Add who" : "Search who"}</span>
            </button>
            <button
              type="button"
              disabled={draft.photoIds.length >= MAX_PHOTOS}
              onClick={() => camInput.current?.click()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded border border-navy px-2.5 text-[14px] font-semibold text-navy disabled:opacity-40"
            >
              <Camera size={16} />
              Photo
            </button>
            <button
              type="button"
              disabled={!draft.text.trim() || busy || listening}
              onClick={submit}
              className="h-9 shrink-0 rounded bg-navy px-3 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {placesPicked.length > 1 ? `Add ${placesPicked.length} notes` : "Add note"}
            </button>
          </div>
          {draft.who.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {draft.who.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => patch({ who: draft.who.filter((x) => x !== w) })}
                  className="inline-flex h-6 items-center gap-1 rounded border border-line px-2 text-[12px]"
                >
                  {w}
                  <X size={11} className="text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex shrink-0 items-center gap-1">
            <button
              ref={placeBtn}
              type="button"
              onClick={() => setPlaceOpen(true)}
              className="flex h-9 shrink-0 items-center gap-1 rounded border border-line px-2 text-[14px] font-medium"
            >
              <span className="max-w-[8rem] truncate">{placeSummary}</span>
              <ChevronDown size={12} className="opacity-50" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMulti(!multi);
                if (multi && placesPicked.length > 1) setPicked([placesPicked[0]]);
              }}
              className={`whitespace-nowrap rounded px-2 py-1.5 text-[12px] font-medium ${multi ? "bg-navy text-white" : "bg-soft text-muted"}`}
            >
              Multi
            </button>
          </div>
          <button
            ref={priorityBtn}
            type="button"
            onClick={() => setPriorityOpen(true)}
            className={`flex h-9 shrink-0 items-center gap-1 rounded border px-2 text-[12px] font-semibold ${PRIORITY_STYLE[draft.priority]}`}
          >
            {priorityLabel}
            <ChevronDown size={12} className="opacity-50" />
          </button>
          <button
            ref={moreBtn}
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`relative flex h-9 min-w-[3.75rem] flex-1 items-center justify-center gap-1 rounded border px-1.5 text-[12px] font-medium ${
              moreCount ? "border-navy text-navy" : "border-line"
            }`}
          >
            <span>More</span>
            {moreCount > 0 && (
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-navy px-1 text-[10px] text-white">
                {moreCount}
              </span>
            )}
            <ChevronDown size={12} className="opacity-50" />
          </button>
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

        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <button
              ref={photoBtn}
              type="button"
              aria-label="Add photo"
              disabled={draft.photoIds.length >= MAX_PHOTOS}
              onClick={() => setPhotoMenu(true)}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-dashed border-[#c3c9ce] text-muted disabled:opacity-40"
            >
              <ImagePlus size={20} strokeWidth={1.6} />
            </button>
            {draft.photoIds.map((id, i) => (
              <StagedThumb key={id} id={id} onView={() => setViewAt(i)} onMarkup={() => setMarkupId(id)} onRemove={() => removePhoto(id)} />
            ))}
          </div>
          {(draft.today || draft.priority === 1) && (
            <div className="flex max-w-[48%] shrink-0 flex-col items-end gap-1">
              {draft.today && (
                <button type="button" onClick={() => patch({ today: false })} className="inline-flex items-center gap-1 rounded bg-navy px-2 py-0.5 text-[11px] font-medium text-white">
                  Today <X size={10} />
                </button>
              )}
              {draft.priority === 1 && (
                <button type="button" onClick={() => patch({ priority: 2 })} className="inline-flex items-center gap-1 rounded bg-high px-2 py-0.5 text-[11px] font-medium text-white">
                  High <X size={10} />
                </button>
              )}
            </div>
          )}
        </div>
        {draft.photoIds.length > 0 && <p className="-mt-2 text-[11px] text-muted">Tap the pencil on a photo to mark it up before saving.</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch on={addAnother} onChange={setAddAnother} label="Add another" />
          {addAnother && <Switch on={keepWho} onChange={setKeepWho} label="Keep who" />}
        </div>

        {placesPicked.length > 1 && (
          <p className="text-[12px] text-muted">{placesPicked.length} separate notes, one per place.</p>
        )}
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
              if (multi) setPicked([...placesPicked.filter((x) => x !== WHOLE_HOUSE && x !== OUTSIDE), n]);
              else {
                setPicked([n]);
                setPlaceOpen(false);
              }
            }
          }}
        >
          <input
            className="h-9 min-w-0 flex-1 rounded border border-line px-2 text-[16px] outline-none focus:border-navy"
            placeholder="Add a part of the house"
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

      <Pop anchor={moreBtn} open={moreOpen} onClose={() => setMoreOpen(false)} align="end" width={260}>
        <MenuLabel>Plan</MenuLabel>
        <button
          onClick={() => patch({ today: !draft.today })}
          className={`flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] font-medium ${draft.today ? "bg-navy text-white" : "bg-soft text-muted"}`}
        >
          <Sun size={13} /> Do today
        </button>
        <div className="mt-3 border-t border-line pt-1">
          <MenuLabel>Add to lists</MenuLabel>
          <button
            onClick={() => {
              setShowMaterial(!showMaterial);
              setMoreOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] font-medium ${showMaterial ? "bg-navy text-white" : "bg-soft text-muted"}`}
          >
            <Package size={13} /> Material needed
            {draft.materials.length > 0 && (
              <span className="ml-auto rounded border border-[#bbe5c8] bg-[#effaf2] px-1 text-[10px] text-ok">{draft.materials.length}</span>
            )}
          </button>
        </div>
      </Pop>

      <WhoSheet
        open={whoOpen}
        onClose={() => setWhoOpen(false)}
        picked={draft.who}
        onToggle={(name) => setDraft((d) => ({ ...d, who: d.who.includes(name) ? d.who.filter((w) => w !== name) : [...d.who, name] }))}
      />
      {viewAt !== null && <PhotoViewer ids={draft.photoIds} start={viewAt} onClose={() => setViewAt(null)} onDelete={removePhoto} />}
      {markupId && <MarkupEditor photoId={markupId} onClose={() => setMarkupId(null)} />}
    </div>
  );
}
