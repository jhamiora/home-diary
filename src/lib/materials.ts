import { db, type Job } from "./db";

export interface ShopLine {
  key: string;
  name: string;
  unit: string;
  qty: string;
  have: boolean;
  refs: { jobId: string; jobTitle: string; materialId: string }[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function addQty(qtys: string[]) {
  const filled = qtys.map((q) => q.trim()).filter(Boolean);
  if (!filled.length) return "";
  const nums = filled.map((q) => Number(q.replace(",", ".")));
  if (nums.every((n) => Number.isFinite(n))) {
    const total = nums.reduce((a, b) => a + b, 0);
    return String(Math.round(total * 100) / 100);
  }
  return filled.join(" + ");
}

// One line per material across the chosen jobs, same name and unit merged.
export function buildShoppingList(jobs: Job[]): ShopLine[] {
  const map = new Map<string, ShopLine & { qtys: string[] }>();
  for (const job of jobs) {
    for (const m of job.materials) {
      if (!m.name.trim()) continue;
      const key = `${norm(m.name)}|${norm(m.unit)}`;
      let line = map.get(key);
      if (!line) {
        line = { key, name: m.name.trim(), unit: m.unit.trim(), qty: "", have: true, refs: [], qtys: [] };
        map.set(key, line);
      }
      line.qtys.push(m.qty);
      line.have = line.have && m.have;
      line.refs.push({ jobId: job.id, jobTitle: job.title, materialId: m.id });
    }
  }
  return [...map.values()]
    .map(({ qtys, ...line }) => ({ ...line, qty: addQty(qtys) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setLineHave(line: ShopLine, have: boolean) {
  const jobIds = [...new Set(line.refs.map((r) => r.jobId))];
  const ids = new Set(line.refs.map((r) => r.materialId));
  await db.transaction("rw", db.jobs, async () => {
    for (const id of jobIds) {
      const job = await db.jobs.get(id);
      if (!job) continue;
      await db.jobs.update(id, {
        materials: job.materials.map((m) => (ids.has(m.id) ? { ...m, have } : m)),
        updatedAt: Date.now(),
      });
    }
  });
}

export const lineLabel = (l: { name: string; qty: string; unit: string }) =>
  [l.qty, l.unit, l.name].filter(Boolean).join(" ");

export function shoppingText(lines: ShopLine[]) {
  return ["Materials to get", "", ...lines.map((l) => `- ${lineLabel(l)}`)].join("\n");
}
