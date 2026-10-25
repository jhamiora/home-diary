import { useLiveQuery } from "dexie-react-hooks";
import { db, uid, type Material } from "./db";
import { useStoredState } from "./ui";

// Parts of the house stand in for the site diary's units. "Whole house" and
// "Outside" play the parts of All Units and External.
export const WHOLE_HOUSE = "";
export const OUTSIDE = "Outside";
export const placeLabel = (p: string) => (p === WHOLE_HOUSE ? "Whole house" : p);

const uniqSorted = (list: string[]) =>
  [...new Set(list.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function usePlaces() {
  const [saved, setSaved] = useStoredState<string[]>("places", []);
  const used = useLiveQuery(async () => (await db.jobs.toArray()).map((j) => j.area), []) ?? [];
  const places = uniqSorted([...saved, ...used]).filter((p) => p !== OUTSIDE);
  const addPlace = (name: string) => {
    const n = name.trim();
    if (n) setSaved((s) => uniqSorted([...s, n]));
    return n;
  };
  const removePlace = (name: string) => setSaved((s) => s.filter((p) => p !== name));
  return { places, savedPlaces: saved, addPlace, removePlace };
}

export function usePeople() {
  const [saved, setSaved] = useStoredState<string[]>("people", []);
  const used = useLiveQuery(async () => (await db.jobs.toArray()).flatMap((j) => j.who ?? []), []) ?? [];
  const people = uniqSorted([...saved, ...used]);
  const addPerson = (name: string) => {
    const n = name.trim();
    if (n) setSaved((s) => uniqSorted([...s, n]));
    return n;
  };
  return { people, addPerson };
}

const UNITS = [
  "lengths", "length", "lgths", "m", "mm", "lm", "m2", "sheets", "sheet", "box", "boxes", "bag", "bags",
  "l", "litre", "litres", "liter", "liters", "tube", "tubes", "pack", "packs", "pkt", "pcs", "pieces",
  "roll", "rolls", "tin", "tins", "pair", "pairs", "kg", "bucket", "buckets", "can", "cans", "bottle", "bottles",
];

// "6 lengths 140x32 decking" -> qty 6, unit lengths, name "140x32 decking".
export function parseMaterial(text: string): Omit<Material, "have"> {
  const t = text.trim().replace(/\s+/g, " ");
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s+)?(.*)$/i);
  if (!m || !m[2]) return { id: uid(), name: t, qty: "", unit: "" };
  const rest = m[2];
  const [first, ...others] = rest.split(" ");
  if (others.length && UNITS.includes(first.toLowerCase())) {
    return { id: uid(), qty: m[1], unit: first, name: others.join(" ") };
  }
  return { id: uid(), qty: m[1], unit: "", name: rest };
}
