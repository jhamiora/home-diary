import Dexie, { type Table } from "dexie";

// Everything lives in this one IndexedDB database on the phone. No server.

export type Priority = 1 | 2 | 3;

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
];

export type JobStatus = "open" | "in_progress" | "done";

export const isOpen = (j: { status: JobStatus }) => j.status !== "done";

export const byPriority = (a: Job, b: Job) => a.priority - b.priority || a.createdAt - b.createdAt;

export interface Material {
  id: string;
  name: string;
  qty: string;
  unit: string;
  have: boolean;
}

export interface Job {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  area: string;
  status: JobStatus;
  // People doing it (the site diary's subbies).
  who?: string[];
  createdAt: number;
  updatedAt: number;
  doneAt?: number;
  photoIds: string[];
  materials: Material[];
  // Day key (YYYY-MM-DD) the job was put on the Today list.
  todayDate?: string;
}

export interface Note {
  id: string;
  createdAt: number;
  text: string;
  photoIds: string[];
  jobId?: string;
}

export type Shape =
  | { kind: "pen"; color: string; width: number; points: number[] }
  | { kind: "line" | "arrow" | "box"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { kind: "text"; color: string; size: number; x: number; y: number; text: string };

export interface Photo {
  id: string;
  createdAt: number;
  blob: Blob; // what you see (marked up if markup exists)
  thumb: Blob;
  original?: Blob; // untouched photo, kept once markup is added
  markup?: Shape[];
  width: number;
  height: number;
}

class HomeDiaryDB extends Dexie {
  jobs!: Table<Job, string>;
  notes!: Table<Note, string>;
  photos!: Table<Photo, string>;

  constructor() {
    super("home-diary");
    this.version(1).stores({
      jobs: "id, status, priority, area, todayDate, createdAt",
      notes: "id, createdAt, jobId",
      photos: "id, createdAt",
    });
  }
}

export const db = new HomeDiaryDB();

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 16);

export const dayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Ask the browser not to clear our storage when the phone runs low.
export async function askPersistentStorage() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
}

export async function deletePhotos(ids: string[]) {
  if (ids.length) await db.photos.bulkDelete(ids);
}

export async function deleteJob(job: Job) {
  await db.transaction("rw", db.jobs, db.notes, db.photos, async () => {
    const notes = await db.notes.where("jobId").equals(job.id).toArray();
    // Diary notes stay in the diary, just unlinked from the job.
    await Promise.all(notes.map((n) => db.notes.update(n.id, { jobId: undefined })));
    await deletePhotos(job.photoIds);
    await db.jobs.delete(job.id);
  });
}

export async function deleteNote(note: Note) {
  await db.transaction("rw", db.notes, db.photos, async () => {
    await deletePhotos(note.photoIds);
    await db.notes.delete(note.id);
  });
}
