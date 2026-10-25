import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, GripVertical, Minus, Pencil, Square, Type, Undo2 } from "lucide-react";
import { db, type Shape } from "../lib/db";
import { canvasToBlob, loadImage, makeThumb } from "../lib/photos";
import { useBackClose, useToast } from "../lib/ui";

// Fluoro green reads on timber, concrete and dark photos alike.
const COLORS = ["#e11d1d", "#39ff14", "#facc15", "#ff7a00", "#1e90ff", "#ffffff", "#111111"];
type Tool = "pen" | "line" | "arrow" | "box" | "text";
type TextShape = Extract<Shape, { kind: "text" }>;

const TOOLS: { tool: Tool; label: string; Icon: typeof Pencil }[] = [
  { tool: "pen", label: "Draw", Icon: Pencil },
  { tool: "line", label: "Line", Icon: Minus },
  { tool: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { tool: "box", label: "Box", Icon: Square },
  { tool: "text", label: "Text", Icon: Type },
];

const LINE_HEIGHT = 1.2;
const textFont = (size: number) => `600 ${size}px Inter, system-ui, sans-serif`;
const outlineFor = (color: string) => (color === "#111111" ? "#ffffff" : "rgba(0,0,0,0.55)");

let measureCtx: CanvasRenderingContext2D | null = null;
function textBox(s: Pick<TextShape, "text" | "size">) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx!.font = textFont(s.size);
  const lines = s.text.split("\n");
  const w = Math.max(...lines.map((l) => measureCtx!.measureText(l || " ").width));
  return { w, h: lines.length * s.size * LINE_HEIGHT };
}

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
    } else if (s.kind === "line") {
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
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
      // x, y is the top left of the first line; each new line sits below.
      ctx.font = textFont(s.size);
      ctx.textBaseline = "top";
      ctx.lineWidth = s.size / 6;
      ctx.strokeStyle = outlineFor(s.color);
      s.text.split("\n").forEach((line, i) => {
        const y = s.y + i * s.size * LINE_HEIGHT;
        ctx.strokeText(line, s.x, y);
        ctx.fillText(line, s.x, y);
      });
    }
  }
}

interface Editing {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export function MarkupEditor({ photoId, onClose }: { photoId: string; onClose: () => void }) {
  useBackClose(true, onClose);
  const toast = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typeRef = useRef<HTMLTextAreaElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const baseBlobRef = useRef<Blob | null>(null);
  const draftRef = useRef<Shape | null>(null);
  const dragRef = useRef<{ index: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const gripRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const cornerRef = useRef<{ ax: number; ay: number; d0: number; size0: number } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  // Last text size used, so the next label starts the same size.
  const [lastSize, setLastSize] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  // Screen size of the photo, and the part of the screen the keyboard leaves free.
  const [fit, setFit] = useState({ w: 0, h: 0, scale: 1 });
  const [view, setView] = useState({ h: window.innerHeight, top: 0 });

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

  // Keep the photo above the phone keyboard while typing.
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setView({ h: vv ? vv.height : window.innerHeight, top: vv ? vv.offsetTop : 0 });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const img = baseRef.current;
    if (!stage || !img) return;
    const measure = () => {
      const scale = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight);
      setFit({ w: Math.floor(img.naturalWidth * scale), h: Math.floor(img.naturalHeight * scale), scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ready]);

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

  const hitText = (x: number, y: number) => {
    const pad = scaleUnit() / 80;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.kind !== "text") continue;
      const b = textBox(s);
      if (x >= s.x - pad && x <= s.x + b.w + pad && y >= s.y - pad && y <= s.y + b.h + pad) return i;
    }
    return -1;
  };

  const commitText = () => {
    if (!editing) return;
    const text = editing.text.replace(/\s+$/, "");
    if (text.trim()) setShapes((s) => [...s, { kind: "text", color: editing.color, size: editing.size, x: editing.x, y: editing.y, text }]);
    setEditing(null);
    typeRef.current?.blur();
  };

  // Focus inside the tap itself so the phone keyboard opens.
  const startTyping = (next: Editing) => {
    setEditing(next);
    const el = typeRef.current;
    if (el) {
      el.value = next.text;
      el.focus({ preventScroll: true });
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (!ready) return;
    const { x, y } = toImage(e);
    if (tool === "text") {
      e.preventDefault();
      const hit = hitText(x, y);
      if (hit !== -1) {
        const s = shapes[hit] as TextShape;
        (e.target as Element).setPointerCapture(e.pointerId);
        dragRef.current = { index: hit, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, moved: false };
      }
      return;
    }
    if (editing) commitText();
    (e.target as Element).setPointerCapture(e.pointerId);
    const width = Math.max(4, scaleUnit() / 180);
    draftRef.current =
      tool === "pen" ? { kind: "pen", color, width, points: [x, y] } : { kind: tool, color, width, x1: x, y1: y, x2: x, y2: y };
    redraw();
  };

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag) {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      setShapes((all) =>
        all.map((s, i) => (i === drag.index && s.kind === "text" ? { ...s, x: drag.ox + dx / fit.scale, y: drag.oy + dy / fit.scale } : s)),
      );
      return;
    }
    const d = draftRef.current;
    if (!d) return;
    const { x, y } = toImage(e);
    if (d.kind === "pen") d.points.push(x, y);
    else if (d.kind === "line" || d.kind === "arrow" || d.kind === "box") {
      d.x2 = x;
      d.y2 = y;
    }
    redraw();
  };

  const onUp = (e: React.PointerEvent) => {
    if (tool === "text" && ready) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved) return;
      if (editing) {
        commitText();
        return;
      }
      if (drag) {
        // Tap on existing text: lift it back into the typing box.
        const s = shapes[drag.index] as TextShape;
        setShapes((all) => all.filter((_, i) => i !== drag.index));
        setColor(s.color);
        startTyping({ x: s.x, y: s.y, text: s.text, color: s.color, size: s.size });
        return;
      }
      const { x, y } = toImage(e);
      const size = lastSize ?? scaleUnit() / 22;
      startTyping({ x, y: y - (size * LINE_HEIGHT) / 2, text: "", color, size });
      return;
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (!d) return;
    const tooSmall =
      (d.kind === "line" || d.kind === "arrow" || d.kind === "box") && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < scaleUnit() / 60;
    if (tooSmall) redraw();
    else setShapes((s) => [...s, d]);
  };

  const pickColor = (c: string) => {
    setColor(c);
    if (editing) {
      setEditing({ ...editing, color: c });
      typeRef.current?.focus({ preventScroll: true });
    }
  };

  const pickTool = (t: Tool) => {
    if (editing) commitText();
    setTool(t);
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || !baseBlobRef.current) return;
    setSaving(true);
    try {
      // Whatever is still being typed goes onto the photo too.
      let final = shapes;
      if (editing?.text.trim()) {
        final = [...shapes, { kind: "text", color: editing.color, size: editing.size, x: editing.x, y: editing.y, text: editing.text.replace(/\s+$/, "") }];
      }
      setEditing(null);
      draftRef.current = null;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(baseRef.current!, 0, 0);
      drawShapes(ctx, final);
      const p = await db.photos.get(photoId);
      if (!p) return;
      if (!final.length) {
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
          markup: final,
        });
      }
      toast("Markup saved");
      onClose();
    } catch {
      toast("Couldn't save markup");
      setSaving(false);
    }
  };

  // The typing box sits exactly where the text will land on the photo.
  const s = fit.scale;
  const box = editing ? textBox({ text: editing.text, size: editing.size }) : { w: 0, h: 0 };
  const fontPx = editing ? editing.size * s : 16;
  const outline = editing ? outlineFor(editing.color) : "transparent";
  const o = Math.max(1, fontPx / 12);
  const typeStyle: React.CSSProperties = editing
    ? {
        left: editing.x * s,
        top: editing.y * s,
        width: Math.max(box.w * s + fontPx, fontPx * 3),
        height: box.h * s + 2,
        font: textFont(fontPx),
        lineHeight: LINE_HEIGHT,
        color: editing.color,
        caretColor: editing.color,
        textShadow: `${o}px ${o}px 0 ${outline}, -${o}px ${o}px 0 ${outline}, ${o}px -${o}px 0 ${outline}, -${o}px -${o}px 0 ${outline}, 0 ${o}px 0 ${outline}, 0 -${o}px 0 ${outline}, ${o}px 0 0 ${outline}, -${o}px 0 0 ${outline}`,
      }
    : { left: -9999, top: 0, width: 10, height: 10, opacity: 0 };

  return (
    <div className="fade-in fixed inset-x-0 z-[70] flex flex-col bg-black text-white" style={{ top: view.top, height: view.h }}>
      <header className="flex h-[52px] shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button className="h-10 px-3 text-[15px] text-white/80" onClick={onClose}>
          Cancel
        </button>
        <div className="flex items-center gap-1">
          <button
            aria-label="Undo"
            className="flex h-10 w-10 items-center justify-center disabled:opacity-30"
            disabled={!shapes.length || !!editing}
            onClick={() => setShapes((all) => all.slice(0, -1))}
          >
            <Undo2 size={20} strokeWidth={1.75} />
          </button>
          <button className="h-9 rounded bg-white px-4 text-[15px] font-semibold text-black disabled:opacity-50" disabled={!ready || saving} onClick={save}>
            {saving ? "Saving" : "Done"}
          </button>
        </div>
      </header>

      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center p-2">
        <div className="relative shrink-0" style={{ width: fit.w, height: fit.h }}>
          <canvas
            ref={canvasRef}
            className="block touch-none select-none"
            style={{ width: fit.w, height: fit.h }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <textarea
            ref={typeRef}
            aria-label="Text on photo"
            wrap="off"
            spellCheck={false}
            autoCapitalize="sentences"
            className="absolute resize-none overflow-hidden whitespace-pre bg-transparent p-0 outline outline-1 outline-dashed outline-white/70"
            style={typeStyle}
            value={editing?.text ?? ""}
            onChange={(e) => editing && setEditing({ ...editing, text: e.target.value })}
          />
          {editing && (
            <button
              type="button"
              aria-label="Move text"
              className="absolute flex h-8 w-8 touch-none items-center justify-center rounded bg-white text-black shadow"
              style={{ left: editing.x * s - 36, top: editing.y * s + (box.h * s) / 2 - 16 }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as Element).setPointerCapture(e.pointerId);
                gripRef.current = { sx: e.clientX, sy: e.clientY, ox: editing.x, oy: editing.y };
              }}
              onPointerMove={(e) => {
                const g = gripRef.current;
                if (!g) return;
                setEditing((ed) => (ed ? { ...ed, x: g.ox + (e.clientX - g.sx) / s, y: g.oy + (e.clientY - g.sy) / s } : ed));
              }}
              onPointerUp={() => {
                gripRef.current = null;
                typeRef.current?.focus({ preventScroll: true });
              }}
            >
              <GripVertical size={16} />
            </button>
          )}
          {editing && (
            <button
              type="button"
              aria-label="Drag to resize text"
              className="absolute h-6 w-6 touch-none rounded-[3px] border-2 border-white bg-[#062932] shadow"
              style={{
                left: editing.x * s + Math.max(box.w * s + fontPx, fontPx * 3) - 12,
                top: editing.y * s + box.h * s - 10,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as Element).setPointerCapture(e.pointerId);
                const r = canvasRef.current!.getBoundingClientRect();
                const ax = r.left + editing.x * s;
                const ay = r.top + editing.y * s;
                cornerRef.current = { ax, ay, d0: Math.max(20, Math.hypot(e.clientX - ax, e.clientY - ay)), size0: editing.size };
              }}
              onPointerMove={(e) => {
                const c = cornerRef.current;
                if (!c) return;
                const unit = scaleUnit();
                const size = Math.min(unit / 4, Math.max(unit / 70, (c.size0 * Math.hypot(e.clientX - c.ax, e.clientY - c.ay)) / c.d0));
                setEditing((ed) => (ed ? { ...ed, size } : ed));
                setLastSize(size);
              }}
              onPointerUp={() => {
                cornerRef.current = null;
                typeRef.current?.focus({ preventScroll: true });
              }}
            />
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2">
        <div className="mb-3 flex items-center justify-center gap-2.5">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Colour ${c}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pickColor(c)}
              className="h-8 w-8 rounded border-2"
              style={{ background: c, borderColor: (editing?.color ?? color) === c ? "#fff" : "rgba(255,255,255,0.15)" }}
            />
          ))}
        </div>
        {editing ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-snug text-white/60">Drag the grip to move. Drag the corner square to resize.</p>
            <button
              className="flex h-10 shrink-0 items-center gap-1.5 rounded bg-white px-4 text-[14px] font-semibold text-black"
              onPointerDown={(e) => e.preventDefault()}
              onClick={commitText}
            >
              <Check size={16} /> Place
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1">
            {TOOLS.map(({ tool: t, label, Icon }) => (
              <button
                key={t}
                onClick={() => pickTool(t)}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded text-[12px] ${
                  tool === t ? "bg-white/15 text-white" : "text-white/60"
                }`}
              >
                <Icon size={20} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        )}
        {tool === "text" && !editing && (
          <p className="pt-2 text-center text-[12px] text-white/60">Tap the photo to type. Drag text to move it, tap it to edit or resize.</p>
        )}
      </div>
    </div>
  );
}
