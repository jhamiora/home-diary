import { db, type Job, type Note, type Photo } from "./db";

// A backup is one JSON file with the photos embedded, so it can be saved
// to Drive, emailed, or opened on a new phone.

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

const dataUrlToBlob = async (s: string) => (await fetch(s)).blob();

type PhotoOut = Omit<Photo, "blob" | "thumb" | "original"> & { blob: string; thumb: string; original?: string };

interface BackupFile {
  app: "home-diary";
  version: 1;
  exportedAt: number;
  jobs: Job[];
  notes: Note[];
  photos: PhotoOut[];
}

export async function exportBackup(): Promise<File> {
  const [jobs, notes, photos] = await Promise.all([db.jobs.toArray(), db.notes.toArray(), db.photos.toArray()]);
  const photosOut: PhotoOut[] = [];
  for (const p of photos) {
    photosOut.push({
      ...p,
      blob: await blobToDataUrl(p.blob),
      thumb: await blobToDataUrl(p.thumb),
      original: p.original ? await blobToDataUrl(p.original) : undefined,
    });
  }
  const data: BackupFile = { app: "home-diary", version: 1, exportedAt: Date.now(), jobs, notes, photos: photosOut };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return new File([JSON.stringify(data)], `home-diary-backup-${stamp}.json`, { type: "application/json" });
}

export async function shareOrDownload(file: File) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}

export async function importBackup(file: File, mode: "merge" | "replace") {
  const data = JSON.parse(await file.text()) as BackupFile;
  if (data.app !== "home-diary" || !Array.isArray(data.jobs)) throw new Error("That file isn't a Home Diary backup");
  const photos: Photo[] = [];
  for (const p of data.photos ?? []) {
    photos.push({
      ...p,
      blob: await dataUrlToBlob(p.blob),
      thumb: await dataUrlToBlob(p.thumb),
      original: p.original ? await dataUrlToBlob(p.original) : undefined,
    });
  }
  await db.transaction("rw", db.jobs, db.notes, db.photos, async () => {
    if (mode === "replace") await Promise.all([db.jobs.clear(), db.notes.clear(), db.photos.clear()]);
    await db.jobs.bulkPut(data.jobs);
    await db.notes.bulkPut(data.notes ?? []);
    await db.photos.bulkPut(photos);
  });
  return { jobs: data.jobs.length, notes: data.notes?.length ?? 0, photos: photos.length };
}
