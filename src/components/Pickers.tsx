import { useState } from "react";
import { Check } from "lucide-react";
import { PRIORITIES, type Priority } from "../lib/db";
import { OUTSIDE, WHOLE_HOUSE, placeLabel, usePlaces } from "../lib/places";
import { MenuLabel, Pop } from "../lib/ui";

export const PRIORITY_DOT: Record<Priority, string> = { 1: "bg-high", 2: "bg-med", 3: "bg-low" };

type Anchor = React.RefObject<HTMLElement | null>;

export function LocationMenu({
  anchor,
  open,
  onClose,
  value,
  onPick,
}: {
  anchor: Anchor;
  open: boolean;
  onClose: () => void;
  value: string;
  onPick: (place: string) => void;
}) {
  const { places, addPlace } = usePlaces();
  const [adding, setAdding] = useState("");
  const pick = (p: string) => {
    onPick(p);
    onClose();
  };
  return (
    <Pop anchor={anchor} open={open} onClose={onClose} width={240}>
      {[WHOLE_HOUSE, OUTSIDE, ...places].map((p) => (
        <button key={p || "whole"} className="flex h-10 w-full items-center gap-2 rounded px-2 text-left text-[14px] active:bg-soft" onClick={() => pick(p)}>
          <span className="flex w-4 justify-center text-navy">{value === p && <Check size={15} strokeWidth={2.5} />}</span>
          {placeLabel(p)}
        </button>
      ))}
      <form
        className="mt-1 flex gap-1.5 border-t border-line pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = addPlace(adding);
          if (n) {
            setAdding("");
            pick(n);
          }
        }}
      >
        <input
          className="h-9 min-w-0 flex-1 rounded border border-line px-2 text-[16px] outline-none focus:border-navy"
          placeholder="Add location"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <button className="h-9 shrink-0 rounded bg-navy px-3 text-[13px] font-medium text-white disabled:opacity-40" disabled={!adding.trim()}>
          Add
        </button>
      </form>
    </Pop>
  );
}

export function PriorityMenu({
  anchor,
  open,
  onClose,
  value,
  onPick,
}: {
  anchor: Anchor;
  open: boolean;
  onClose: () => void;
  value: Priority;
  onPick: (p: Priority) => void;
}) {
  return (
    <Pop anchor={anchor} open={open} onClose={onClose} width={200}>
      <MenuLabel>Priority</MenuLabel>
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            onPick(p.value);
            onClose();
          }}
          className={`mt-1 flex h-10 w-full items-center gap-2.5 rounded px-3 text-[14px] font-medium ${value === p.value ? "bg-navy text-white" : "active:bg-soft"}`}
        >
          <span className={`h-2 w-2 rounded-[2px] ${PRIORITY_DOT[p.value]}`} />
          {p.label}
        </button>
      ))}
    </Pop>
  );
}
