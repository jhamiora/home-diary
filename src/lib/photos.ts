import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, uid, type Photo } from "./db";

const MAX_SIDE = 2048;
const THUMB_SIDE = 480;

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Decoded pixels stay on the element after the URL goes.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save image"))), "image/jpeg", quality),
  );
}

function drawScaled(img: CanvasImageSource, w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function makeThumb(source: HTMLImageElement | HTMLCanvasElement) {
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  return canvasToBlob(drawScaled(source, w, h, THUMB_SIDE), 0.78);
}

// Shrinks a camera photo to a sensible size so the phone doesn't fill up.
export async function savePhotoFile(file: Blob): Promise<string> {
  const img = await loadImage(file);
  const full = drawScaled(img, img.naturalWidth, img.naturalHeight, MAX_SIDE);
  const blob = await canvasToBlob(full);
  const thumb = await makeThumb(full);
  const photo: Photo = {
    id: uid(),
    createdAt: Date.now(),
    blob,
    thumb,
    width: full.width,
    height: full.height,
  };
  await db.photos.put(photo);
  return photo.id;
}

export async function savePhotoFiles(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of Array.from(files)) {
    if (!f.type.startsWith("image/")) continue;
    try {
      ids.push(await savePhotoFile(f));
    } catch (e) {
      console.warn("Photo skipped", e);
    }
  }
  return ids;
}

// Object URL for a stored photo that follows edits (markup) automatically.
export function usePhotoUrl(id: string | undefined, size: "thumb" | "full") {
  const blob = useLiveQuery(async () => {
    if (!id) return undefined;
    const p = await db.photos.get(id);
    return p ? (size === "thumb" ? p.thumb : p.blob) : null;
  }, [id, size]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
