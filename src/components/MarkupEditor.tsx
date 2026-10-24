import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pencil, Square, Type, Undo2 } from "lucide-react";
import { db, type Shape } from "../lib/db";
import { canvasToBlob, loadImage, makeThumb } from "../lib/photos";
import { useBackClose, useToast } from "../lib/ui";

const COLORS = ["#e11d1d", "#facc15", "#ffffff", "#111111"];
type Tool = "pen" | "arrow" | "box" | "text";

const TOOLS: { tool: Tool; label: string; Icon: typeof Pencil }[] = [
  { tool: "pen", label: "Draw", Icon: Pencil },
  { tool: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { tool: "box", label: "Box", Icon: Square },
  { tool: "text", label: "Text", Icon: Type },
];

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (s.kind === "pen") {
      ctx.lineWidth = s.width;
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) {
        if (i === 0) ctx.moveTo(s.points[0], s.points[1]);
        else ctx.lineTo(s.points[i], s.points[i + 1]);
      }
      if (s.points.length === 2) ctx.lineTo(s.points[0] + 0.1, s.points[1]);
      ctx.stroke();
    } else if (s.kind === "box") {
      ctx.lineWidth = s.width;
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.kind === "arrow") {
      ctx.lineWidth = s.width;
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = s.width * 4;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(angle - Math.PI / 7), s.y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(s.x2 - head * Math.cos(angle + Math.PI / 7), s.y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === "text") {
      ctx.font = `600 ${s.size}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      // Dark or light outline so text reads on any photo.
      ctx.lineWidth = s.size / 6;
      ctx.strokeStyle = s.color === "#111111" ? "#ffffff" : "rgba(0,0,0,0.55)";
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillText(s.text, s.x, s.y);
    }
  }
}

export function MarkupEditor({ photoId, onClose }: { photoId: string; onClose: () => void }) {
  useBackClose(true, onClose);
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const baseBlobRef = useRef<Blob | null>(null);
  const draftRef = useRef<Shape | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [ready, setReady] = useState(false);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await db.photos.get(photoId);
      if (!p || !alive) return;
      const base = p.original ?? p.blob;
      baseBlobRef.current = base;
      baseRef.current = await loadImage(base);
      if (!alive) return;
      setShapes(p.markup ?? []);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [photoId]);

  const redraw = () => {
    const c = canvasRef.current;
    const img = baseRef.current;
    if (!c || !img) return;
    if (c.width !== img.naturalWidth) {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
    }
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    drawShapes(ctx, draftRef.current ? [...shapes, draftRef.current] : shapes);
  };

  useEffect(redraw, [ready, shapes]);

  const scaleUnit = () => {
    const img = baseRef.current!;
    return Math.max(img.naturalWidth, img.naturalHeight);
  };

  const toImage = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!ready || textAt) return;
    const { x, y } = toImage(e);
    if (tool === "text") {
      setTextAt({ x, y });
      setTextValue("");
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    const width = Math.max(4, scaleUnit() / 180);
    draftRef.current =
      tool === "pen" ? { kind: "pen", color, width, points: [x, y] } : { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y };
    redraw();
  };

  const onMove = (e: React.PointerEvent) => {
    const d = draftRef.current;
    if (!d) return;
    const { x, y } = toImage(e);
    if (d.kind === "pen") d.points.push(x, y);
    else if (d.kind === "arrow" || d.kind === "box") {
      d.x2 = x;
      d.y2 = y;
    }
    redraw();
  };

  const onUp = () => {
    const d = draftRef.current;
    draftRef.current = null;
    if (!d) return;
    const tooSmall =
      (d.kind === "arrow" || d.kind === "box") && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < scaleUnit() / 60;
    if (tooSmall) redraw();
    else setShapes((s) => [...s, d]);
  };

  const addText = () => {
    if (textAt && textValue.trim()) {
      setShapes((s) => [...s, { kind: "text", color, size: scaleUnit() / 22, x: textAt.x, y: textAt.y, text: textValue.trim() }]);
    }
    setTextAt(null);
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || !baseBlobRef.current) return;
    setSaving(true);
    try {
      draftRef.current = null;
      redraw();
      const p = await db.photos.get(photoId);
      if (!p) return;
      if (!shapes.length) {
        // All markup removed: go back to the untouched photo.
        const original = p.original ?? p.blob;
        const img = await loadImage(original);
        await db.photos.update(photoId, { blob: original, thumb: await makeThumb(img), original: undefined, markup: undefined });
      } else {
        const blob = await canvasToBlob(c, 0.88);
        await db.photos.update(photoId, {
          blob,
          thumb: await makeThumb(c),
          original: p.original ?? p.blob,
          markup: shapes,
        });
      }
      toast("Markup saved");
      onClose();
    } catch {
      toast("Couldn't save markup");
      setSaving(false);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <header className="flex h-[52px] shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button className="h-10 px-3 text-[15px] text-white/80" onClick={onClose}>
          Cancel
        </button>
        <div className="flex items-center gap-1">
          <button
            aria-label="Undo"
            className="flex h-10 w-10 items-center justify-center disabled:opacity-30"
            disabled={!shapes.length}
            onClick={() => setShapes((s) => s.slice(0, -1))}
          >
            <Undo2 size={20} strokeWidth={1.75} />
          </button>
          <button className="h-9 rounded bg-white px-4 text-[15px] font-semibold text-black disabled:opacity-50" disabled={!ready || saving} onClick={save}>
            {saving ? "Saving" : "Done"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      {textAt ? (
        <div className="flex gap-2 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2">
          <input
            autoFocus
            className="field flex-1 text-ink"
            placeholder="Type a label"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addText()}
          />
          <button className="btn btn-primary border-white/20" onClick={addText}>
            Add
          </button>
        </div>
      ) : (
        <div className="shrink-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2">
          <div className="mb-3 flex justify-center gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded border-2"
                style={{ background: c, borderColor: color === c ? "#fff" : "rgba(255,255,255,0.15)" }}
              />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {TOOLS.map(({ tool: t, label, Icon }) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded text-[12px] ${
                  tool === t ? "bg-white/15 text-white" : "text-white/60"
                }`}
              >
                <Icon size={20} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
