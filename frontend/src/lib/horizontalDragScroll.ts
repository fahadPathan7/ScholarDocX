const DRAG_THRESHOLD = 5;
const HORIZONTAL_OVERFLOW = new Set(["auto", "scroll", "overlay"]);
const VERTICAL_OVERFLOW = new Set(["auto", "scroll", "overlay"]);
const CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[contenteditable='true']",
  "[role='button']",
  "[role='switch']",
  ".file-picker",
  ".file-picker-panel",
  ".modal-panel",
  ".sheet-cell-viewer",
  ".row-resize-handle",
  ".col-resize-handle",
  ".drag-handle-reorder",
  ".group-control-cell",
  ".chat-messages",
  ".message-content",
  ".markdown-body",
  ".assistant-dock",
  ".chat-dock"
].join(",");

declare global {
  interface Window {
    __scholarDocXHorizontalDragScrollInstalled?: boolean;
  }
}

type DragState = {
  scroller: HTMLElement;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  dragging: boolean;
};

let dragState: DragState | null = null;
let suppressClickUntil = 0;

function isPrimaryPointer(event: PointerEvent) {
  return event.button === 0 && event.pointerType !== "touch";
}

function isControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(CONTROL_SELECTOR));
}

function isScroller(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  const isHoriz = element.scrollWidth > element.clientWidth + 2 && HORIZONTAL_OVERFLOW.has(styles.overflowX);
  const isVert = element.scrollHeight > element.clientHeight + 2 && VERTICAL_OVERFLOW.has(styles.overflowY);
  return isHoriz || isVert;
}

function findScroller(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  let current: Element | null = target;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement && isScroller(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function endDrag() {
  if (!dragState) return;
  dragState.scroller.classList.remove("drag-scroll-active");
  document.body.classList.remove("is-horizontal-dragging");
  dragState = null;
}

export function installHorizontalDragScroll() {
  if (typeof window === "undefined" || window.__scholarDocXHorizontalDragScrollInstalled) return;
  window.__scholarDocXHorizontalDragScrollInstalled = true;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!isPrimaryPointer(event) || isControlTarget(event.target)) return;
      const scroller = findScroller(event.target);
      if (!scroller) return;
      dragState = {
        scroller,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: scroller.scrollLeft,
        startScrollTop: scroller.scrollTop,
        dragging: false
      };
    },
    { capture: true }
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!dragState) return;
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.dragging) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD && Math.abs(deltaY) < DRAG_THRESHOLD) return;
        dragState.dragging = true;
        dragState.scroller.classList.add("drag-scroll-active");
        document.body.classList.add("is-horizontal-dragging");
      }

      event.preventDefault();
      dragState.scroller.scrollLeft = dragState.startScrollLeft - deltaX;
      dragState.scroller.scrollTop = dragState.startScrollTop - deltaY;
    },
    { capture: true }
  );

  document.addEventListener(
    "pointerup",
    () => {
      if (dragState?.dragging) {
        suppressClickUntil = Date.now() + 250;
      }
      endDrag();
    },
    { capture: true }
  );

  document.addEventListener(
    "pointercancel",
    () => {
      endDrag();
    },
    { capture: true }
  );

  window.addEventListener("blur", endDrag);

  document.addEventListener(
    "click",
    (event) => {
      if (Date.now() > suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true }
  );
}
