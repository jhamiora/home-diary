import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, PenLine, Trash2, X } from "lucide-react";
import { savePhotoFiles, usePhotoUrl } from "../lib/photos";
import { useBackClose, useToast } from "../lib/ui";
import { MarkupEditor } from "./MarkupEditor";

export function PhotoThumb({ id, onClick, className = "" }: { id: string; onClick?: () => void; className?: string }) {
  const url = usePhotoUrl(id, "thumb");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block aspect-square overflow-hidden rounded bg-soft ${className}`}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />}
    </button>
  );
}

export function PhotoGrid({
  ids,
  onRemove,
  cols = 4,
}: {
  ids: string[];
  onRemove?: (id: string) => void;
  cols?: 3 | 4;
}) {
  const [viewAt, setViewAt] = useState<number | null>(null);
  if (!ids.length) return null;
  return (
    <>
      <div className={`grid gap-1.5 ${cols === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
        {ids.map((id, i) => (
          <div key={id} className="relative">
            <PhotoThumb id={id} onClick={() => setViewAt(i)} className="w-full" />
            {onRemove && (
              <button
                aria-label="Remove photo"
                onClick={() => onRemove(id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {viewAt !== null && (
        <PhotoViewer ids={ids} start={viewAt} onClose={() => setViewAt(null)} onDelete={onRemove} />
      )}
    </>
  );
}

export function AddPhotoButtons({ onAdded, compact }: { onAdded: (ids: string[]) => void; compact?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids = await savePhotoFiles(files);
      if (ids.length) onAdded(ids);
      if (ids.length < files.length) toast("Some photos couldn't be added");
    } finally {
      setBusy(false);
      if (cam.current) cam.current.value = "";
      if (gal.current) gal.current.value = "";
    }
  };

  return (
    <div className="flex gap-2">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files)} />
      <input ref={gal} type="file" accept="image/*" multiple hidden onChange={(e) => handle(e.target.files)} />
      <button type="button" className={`btn ${compact ? "h-9 px-3 text-[14px]" : "flex-1"}`} disabled={busy} onClick={() => cam.current?.click()}>
        <Camera size={17} strokeWidth={1.75} />
        {busy ? "Adding" : "Camera"}
      </button>
      <button type="button" className={`btn ${compact ? "h-9 px-3 text-[14px]" : "flex-1"}`} disabled={busy} onClick={() => gal.current?.click()}>
        <ImagePlus size={17} strokeWidth={1.75} />
        Gallery
      </button>
    </div>
  );
}

function ViewerSlide({ id }: { id: string }) {
  const url = usePhotoUrl(id, "full");
  return (
    <div className="flex h-full w-full shrink-0 snap-center items-center justify-center">
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />}
    </div>
  );
}

export function PhotoViewer({
  ids,
  start,
  onClose,
  onDelete,
}: {
  ids: string[];
  start: number;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  useBackClose(true, onClose);
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    // Only on open.
  }, []);

  useEffect(() => {
    if (!ids.length) onClose();
    else if (index > ids.length - 1) setIndex(ids.length - 1);
  }, [ids.length, index, onClose]);

  const current = ids[Math.min(index, ids.length - 1)];

  return (
    <div className="fade-in fixed inset-0 z-[65] flex flex-col bg-black text-white">
      <header className="flex h-[52px] shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button aria-label="Close" className="flex h-10 w-10 items-center justify-center" onClick={onClose}>
          <X size={22} strokeWidth={1.75} />
        </button>
        <div className="text-[14px] text-white/70">
          {Math.min(index, ids.length - 1) + 1} of {ids.length}
        </div>
        <div className="w-10" />
      </header>
      <div
        ref={strip}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {ids.map((id) => (
          <ViewerSlide key={id} id={id} />
        ))}
      </div>
      <div className="flex shrink-0 justify-center gap-2 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <button className="flex h-11 items-center gap-2 rounded bg-white/10 px-5 text-[15px]" onClick={() => setMarkup(current)}>
          <PenLine size={18} strokeWidth={1.75} />
          Mark up
        </button>
        {onDelete && (
          <button className="flex h-11 items-center gap-2 rounded bg-white/10 px-5 text-[15px]" onClick={() => onDelete(current)}>
            <Trash2 size={18} strokeWidth={1.75} />
            Remove
          </button>
        )}
      </div>
      {markup && <MarkupEditor photoId={markup} onClose={() => setMarkup(null)} />}
    </div>
  );
}
