/* ------------------------------------------------------------------ */
/*  CellStyleBar — compact in-cell formatting toolbar                  */
/*                                                                     */
/*  Appears above a cell while it is being edited (and in the full-    */
/*  cell viewer). Operates on a CellStyle object via onChange patches; */
/*  onClear resets the cell to default. Compact, themed via CSS vars,  */
/*  keyboard-safe (stopPropagation so it never ends inline editing).   */
/* ------------------------------------------------------------------ */

import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, Baseline, PaintBucket, Type, Eraser, ChevronDown } from "lucide-react";
import type { CellStyle } from "./sheetModel";
import { FONT_SIZES, FONT_FAMILIES } from "./sheetModel";

/** Restrained swatch palette aligned with the visual system. */
const COLOR_SWATCHES = [
  "#cc0000", "#e67700", "#1c7430", "#2f6d7a",
  "#1864ab", "#6f42c1", "#868e96", "#212529",
];

const BG_SWATCHES = [
  "#ffe066", "#ff8787", "#8ce99a", "#74c0fc",
  "#a5d8ff", "#d0bfff", "#ced4da", "#ffffff",
];

const SIZE_LABELS: Record<NonNullable<CellStyle["fontSize"]>, string> = {
  sm: "Small",
  md: "Normal",
  lg: "Large",
  xl: "Heading",
};

const FONT_LABELS: Record<string, string> = {
  sans: "System",
  arial: "Arial",
  helvetica: "Helvetica",
  verdana: "Verdana",
  trebuchet: "Trebuchet MS",
  calibri: "Calibri",
  optima: "Optima",
  century: "Century Gothic",
  serif: "Georgia",
  palatino: "Palatino",
  garamond: "Garamond",
  bookman: "Bookman",
  goudy: "Goudy Old Style",
  times: "Times New Roman",
  mono: "Monospace",
};

export function CellStyleBar({
  style,
  onChange,
  onClear,
  compact = false,
}: {
  style: CellStyle;
  onChange: (patch: CellStyle) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  // Swallow keydown so toolbar buttons / color pickers don't end inline
  // editing or trigger grid shortcuts while the format bar is focused.
  const stop = (e: KeyboardEvent) => e.stopPropagation();

  return (
    <div
      className={`cell-style-bar${compact ? " cell-style-bar--compact" : ""}`}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "4px",
        flexWrap: "nowrap",
        flexShrink: 0,
        width: "max-content",
        maxWidth: "100%",
        overflowX: "auto",
        boxSizing: "border-box",
      }}
      role="toolbar"
      aria-label="Cell formatting"
      onKeyDown={stop}
      // Prevent the inline editor's blur-commit from firing when the user
      // clicks into a color input or dropdown inside the bar.
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-keep-editor-open]")) {
          // Allow native color inputs and their custom labels to focus/trigger naturally
          const isColorInput = target.tagName.toLowerCase() === "input" && (target as HTMLInputElement).type === "color";
          const isColorLabel = target.closest(".csb-custom-color");
          if (isColorInput || isColorLabel) return;
          e.preventDefault();
        }
      }}
    >
      <div className="csb-group" data-keep-editor-open style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "2px", flexWrap: "nowrap", flexShrink: 0 }}>
        <FormatToggle active={!!style.bold} title="Bold" onClick={() => onChange({ bold: !style.bold })}>
          <Bold size={13} />
        </FormatToggle>
        <FormatToggle active={!!style.italic} title="Italic" onClick={() => onChange({ italic: !style.italic })}>
          <Italic size={13} />
        </FormatToggle>
        <FormatToggle active={!!style.underline} title="Underline" onClick={() => onChange({ underline: !style.underline })}>
          <Underline size={13} />
        </FormatToggle>
        <FormatToggle active={!!style.strike} title="Strikethrough" onClick={() => onChange({ strike: !style.strike })}>
          <Strikethrough size={13} />
        </FormatToggle>
      </div>

      <Divider />

      <div className="csb-group" data-keep-editor-open style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "2px", flexWrap: "nowrap", flexShrink: 0 }}>
        <ColorButton
          title="Text color"
          active={!!style.color}
          icon={<Baseline size={14} />}
          swatch={style.color}
          swatches={COLOR_SWATCHES}
          value={style.color || "#212529"}
          onPick={(color) => onChange({ color })}
        />
        <ColorButton
          title="Cell background"
          active={!!style.bg}
          icon={<PaintBucket size={14} />}
          swatch={style.bg}
          swatches={BG_SWATCHES}
          value={style.bg || "#ffffff"}
          onPick={(bg) => onChange({ bg })}
          clearValue="#ffffff"
          variant="bg"
        />
      </div>

      <Divider />

      <div className="csb-group" data-keep-editor-open style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "2px", flexWrap: "nowrap", flexShrink: 0 }}>
        <FormatToggle active={style.align === "left"} title="Align left" onClick={() => onChange({ align: style.align === "left" ? undefined : "left" })}>
          <AlignLeft size={13} />
        </FormatToggle>
        <FormatToggle active={style.align === "center"} title="Align center" onClick={() => onChange({ align: style.align === "center" ? undefined : "center" })}>
          <AlignCenter size={13} />
        </FormatToggle>
        <FormatToggle active={style.align === "right"} title="Align right" onClick={() => onChange({ align: style.align === "right" ? undefined : "right" })}>
          <AlignRight size={13} />
        </FormatToggle>
      </div>

      <Divider />

      <div className="csb-group" data-keep-editor-open style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "2px", flexWrap: "nowrap", flexShrink: 0 }}>
        <DropdownButton
          title="Font size"
          label={style.fontSize ? SIZE_LABELS[style.fontSize] : "Size"}
          active={!!style.fontSize}
          icon={<Type size={13} />}
        >
          {(close) => (
            <div className="csb-menu">
              {(Object.keys(FONT_SIZES) as NonNullable<CellStyle["fontSize"]>[]).map((key) => (
                <button
                  key={key}
                  className={`csb-menu-item${style.fontSize === key ? " active" : ""}`}
                  style={{ fontSize: `${FONT_SIZES[key]}px` }}
                  onClick={() => { onChange({ fontSize: style.fontSize === key ? undefined : key }); close(); }}
                >
                  {SIZE_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </DropdownButton>

        <DropdownButton
          title="Font family"
          label={style.fontFamily ? (FONT_LABELS[style.fontFamily] || style.fontFamily) : "Font"}
          active={!!style.fontFamily}
          icon={<span style={{ fontFamily: "serif", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", lineHeight: 1 }}>Aa</span>}
        >
          {(close) => (
            <div className="csb-menu">
              {(Object.keys(FONT_FAMILIES) as string[]).map((key) => (
                <button
                  key={key}
                  className={`csb-menu-item${style.fontFamily === key ? " active" : ""}`}
                  style={{ fontFamily: FONT_FAMILIES[key] }}
                  onClick={() => { onChange({ fontFamily: style.fontFamily === key ? undefined : key }); close(); }}
                >
                  {FONT_LABELS[key] || key}
                </button>
              ))}
            </div>
          )}
        </DropdownButton>
      </div>

      <Divider />

      <div className="csb-group" data-keep-editor-open style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "2px", flexWrap: "nowrap", flexShrink: 0 }}>
        <button className="csb-btn csb-clear" title="Clear formatting" onClick={onClear}>
          <Eraser size={13} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small internal helpers                                            */
/* ------------------------------------------------------------------ */

function FormatToggle({ active, title, onClick, children }: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`csb-btn${active ? " active" : ""}`}
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="csb-divider" aria-hidden="true" />;
}

/** Native color picker with a preset-swatch popover. */
function ColorButton({ title, active, icon, swatch, swatches, value, onPick, clearValue, variant = "text" }: {
  title: string;
  active: boolean;
  icon: React.ReactNode;
  swatch?: string;
  swatches: string[];
  value: string;
  onPick: (color: string) => void;
  /** When the native picker returns this value, clear the key instead. */
  clearValue?: string;
  /** "text" shows underline indicator; "bg" shows filled square behind icon */
  variant?: "text" | "bg";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="csb-color-wrap" ref={ref}>
      <button
        type="button"
        className={`csb-btn csb-color-btn${active ? " active" : ""}`}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: "16px", height: "18px" }}>
          {icon}
          <span
            className="csb-color-underline"
            style={{
              background: swatch || "transparent",
              width: (variant === "bg" && swatch) ? "16px" : "14px",
              height: (variant === "bg" && swatch) ? "5px" : "3px",
              marginTop: "1.5px",
              borderRadius: "2px",
              border: swatch ? (variant === "bg" ? "1px solid rgba(0,0,0,0.18)" : "none") : "1px dashed rgba(35, 58, 55, 0.3)",
              boxShadow: (variant === "bg" && swatch) ? "0 1px 2px rgba(0,0,0,0.15)" : "none",
            }}
          />
        </div>
      </button>
      {open ? (
        <div className="csb-popover" data-keep-editor-open onMouseDown={(e) => e.stopPropagation()}>
          <div className="csb-swatches">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                className="csb-swatch"
                style={{ background: c }}
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(c === clearValue ? "" : c); setOpen(false); }}
              />
            ))}
          </div>
          <label className="csb-custom-color" data-keep-editor-open onMouseDown={(e) => e.stopPropagation()}>
            <span>Custom</span>
            <input
              type="color"
              value={value}
              onChange={(e) => {
                const c = e.target.value;
                onPick(c === clearValue ? "" : c);
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Generic dropdown with an external close trigger. */
function DropdownButton({ title, label, active, icon, children }: {
  title: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="csb-dropdown" ref={ref}>
      <button
        type="button"
        className={`csb-btn csb-dropdown-btn${active ? " active" : ""}`}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="csb-dropdown-label">{label}</span>
        <ChevronDown size={11} />
      </button>
      {open ? (
        <div className="csb-popover" data-keep-editor-open>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
