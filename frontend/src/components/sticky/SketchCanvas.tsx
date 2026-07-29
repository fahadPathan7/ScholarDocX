import { useState } from "react";

/**
 * Freehand sketch surface (SCHOLARDOCX-0201, extracted from StickyNotesView).
 *
 * Strokes are stored as SVG path strings so a sketch is plain text in the note
 * body — no binary, no separate upload, and a note round-trips through the
 * same API as any other. Read-only mode is what the card and viewer render.
 */
export function SketchCanvas({
  paths,
  onChange,
  readOnly = false,
  width = "100%",
  height = "180px",
}: {
  paths: string[];
  onChange?: (paths: string[]) => void;
  readOnly?: boolean;
  width?: string | number;
  height?: string | number;
}) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  const pointIn = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    // Capture, so a stroke that leaves the canvas mid-drag still ends cleanly
    // on this element rather than being lost to whatever is underneath.
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = pointIn(event);
    setCurrentPath(`M ${x} ${y}`);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || currentPath === null) return;
    const { x, y } = pointIn(event);
    setCurrentPath((previous) => `${previous} L ${x} ${y}`);
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || currentPath === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange?.([...paths, currentPath]);
    setCurrentPath(null);
  };

  return (
    <svg
      className={readOnly ? "sticky-sketch readonly" : "sticky-sketch"}
      style={{ width, height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="img"
      aria-label={readOnly ? "Sketch" : "Sketch area — draw with the mouse or a finger"}
    >
      {[...paths, ...(currentPath ? [currentPath] : [])].map((path, index) => (
        <path
          key={index}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
