import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookMarked, FileText, Minus, Plus, RefreshCw, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, PaperAnalysisResult } from "../lib/api";
import { Modal } from "./Modal";
import "./research-pdf-viewer.css";

// Point PDF.js at its bundled worker (offline, no CDN — matches local-first product).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type ResearchSource = PaperAnalysisResult["sources"][number];

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 0.2;

// Common words we never treat as a meaningful match signal, so the highlight
// tracks the actual cited passage instead of lighting up every "the"/"and".
const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "this", "that", "with", "from",
  "have", "has", "had", "not", "but", "they", "their", "them", "then", "than",
  "which", "when", "where", "what", "who", "whom", "will", "would", "could",
  "should", "been", "being", "into", "onto", "over", "under", "such", "these",
  "those", "there", "here", "also", "more", "most", "some", "any", "each",
  "our", "your", "its", "his", "her", "out", "off", "per", "via", "use",
  "used", "using", "based", "both", "can", "may", "one", "two", "three",
  "however", "therefore", "thus", "hence", "while", "about", "above", "below",
]);

function formatPageLabel(pages?: number[]): string {
  if (!pages || pages.length === 0) return "Page location unavailable";
  if (pages.length === 1) return `Page ${pages[0]}`;
  return `Pages ${pages[0]}-${pages[pages.length - 1]}`;
}

/** Build the set of meaningful lowercase tokens present in the cited section. */
function buildHighlightTokens(source: ResearchSource): Set<string> {
  const raw = (source.full_text || source.snippet || "").replace(/---\s*Page\s+\d+\s*---/gi, " ");
  const words = raw.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) || [];
  const set = new Set<string>();
  for (const w of words) {
    const cleaned = w.replace(/^-+|-+$/g, "");
    if (cleaned.length >= 4 && !STOPWORDS.has(cleaned)) set.add(cleaned);
  }
  return set;
}

function normalizeSpanWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) || []).map((w) => w.replace(/^-+|-+$/g, ""));
}

/**
 * Highlight the text-layer spans that belong to the cited passage.
 *
 * The PDF text layer sits transparently on top of the rendered page, so giving a
 * span a background makes it look exactly like selected text on the real PDF.
 * We highlight contiguous runs of spans that contain the section's meaningful
 * tokens, bridging tiny gaps and dropping stray single-word matches, so the user
 * sees the passage highlighted as a block rather than scattered words.
 */
function applyHighlights(
  spans: HTMLElement[],
  tokenSet: Set<string>,
): { firstEl: HTMLElement | null; count: number } {
  if (spans.length === 0 || tokenSet.size === 0) return { firstEl: null, count: 0 };

  const matchCounts = spans.map((span) => {
    const words = normalizeSpanWords(span.textContent || "");
    let n = 0;
    for (const w of words) {
      if (w.length >= 4 && tokenSet.has(w)) n += 1;
    }
    return n;
  });

  const inRun = matchCounts.map((c) => c > 0);

  // Bridge short gaps (<= 2 non-matching spans) between matching spans so the
  // highlight reads as one continuous block.
  for (let i = 0; i < inRun.length; i++) {
    if (inRun[i]) continue;
    let prev = -1;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (inRun[j]) { prev = j; break; }
    }
    let next = -1;
    for (let j = i + 1; j < inRun.length && j <= i + 3; j++) {
      if (matchCounts[j] > 0) { next = j; break; }
    }
    if (prev !== -1 && next !== -1 && next - prev <= 4) inRun[i] = true;
  }

  // Keep only runs whose total match strength is meaningful (>= 3 token hits),
  // which filters out isolated common-word coincidences on the page.
  let firstEl: HTMLElement | null = null;
  let count = 0;
  let i = 0;
  while (i < inRun.length) {
    if (!inRun[i]) { i += 1; continue; }
    let j = i;
    let strength = 0;
    while (j < inRun.length && inRun[j]) {
      strength += matchCounts[j];
      j += 1;
    }
    if (strength >= 3) {
      for (let k = i; k < j; k++) {
        spans[k].classList.add("rr-hl");
        if (!firstEl) {
          firstEl = spans[k];
          spans[k].classList.add("rr-hl-focus");
        }
        count += 1;
      }
    }
    i = j;
  }

  return { firstEl, count };
}

export function ResearchPdfViewer({
  paperId,
  paperTitle,
  source,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  source: ResearchSource;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTokenRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docReady, setDocReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [highlightCount, setHighlightCount] = useState(0);
  const [rendering, setRendering] = useState(false);

  const pageLabel = formatPageLabel(source.page_numbers);
  const tokenSet = useMemo(() => buildHighlightTokens(source), [source]);
  const targetPages = useMemo(() => {
    const raw = source.page_numbers || [];
    const unique = Array.from(new Set(raw.filter((p) => Number.isFinite(p) && p > 0)));
    unique.sort((a, b) => a - b);
    return unique;
  }, [source]);

  // ---- Load the PDF document once -----------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocReady(false);

    (async () => {
      try {
        const blob = await api.downloadBlob(`/research/papers/${paperId}/pdf`);
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setDocReady(true);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load Research Expert PDF:", err);
        if (!cancelled) {
          setError("Could not load this paper. Please try again.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTokenRef.current += 1;
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy().catch(() => {});
        loadingTaskRef.current = null;
      }
      pdfDocRef.current = null;
    };
  }, [paperId]);

  // ---- Render the WHOLE PDF, focus the cited section on open --------------
  // The full document is shown so the user can scroll anywhere; we lazily paint
  // pages as they scroll into view (cheap for large PDFs), eagerly render the
  // cited page(s), highlight the passage, and scroll to it on open.
  useEffect(() => {
    if (!docReady || error) return;
    const doc = pdfDocRef.current;
    const host = pagesHostRef.current;
    if (!doc || !host) return;

    const myToken = ++renderTokenRef.current;
    setRendering(true);

    let observer: IntersectionObserver | null = null;
    const renderedPages = new Set<number>();
    let totalHighlights = 0;

    (async () => {
      host.innerHTML = "";
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const availableWidth = (scrollRef.current?.clientWidth || 820) - 40;
      const targetSet = new Set(targetPages);

      // Determine a shared render scale from the first page.
      const firstPage = await doc.getPage(1);
      if (myToken !== renderTokenRef.current) return;
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const fitScale = availableWidth > 0 ? availableWidth / baseViewport.width : 1;
      const scale = Math.max(0.4, fitScale * zoom);

      // Build correctly-sized placeholders for every page so scroll offsets are
      // accurate before any page is painted.
      const pageEls: HTMLElement[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (myToken !== renderTokenRef.current) return;
        const viewport = page.getViewport({ scale });

        const pageEl = document.createElement("div");
        pageEl.className = "research-pdf-page";
        pageEl.style.width = `${Math.floor(viewport.width)}px`;
        pageEl.style.height = `${Math.floor(viewport.height)}px`;
        pageEl.dataset.page = String(n);

        const label = document.createElement("div");
        label.className = "research-pdf-page-label";
        label.textContent = `Page ${n}`;
        pageEl.appendChild(label);

        host.appendChild(pageEl);
        pageEls.push(pageEl);
      }

      // Paint a single page's canvas + text layer (idempotent), applying the
      // highlight on cited pages. Returns the first highlighted span, if any.
      const paintPage = async (n: number): Promise<HTMLElement | null> => {
        if (n < 1 || n > doc.numPages || renderedPages.has(n)) return null;
        renderedPages.add(n);
        const pageEl = pageEls[n - 1];
        if (!pageEl) return null;

        const page = await doc.getPage(n);
        if (myToken !== renderTokenRef.current) return null;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        pageEl.insertBefore(canvas, pageEl.firstChild);

        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        textLayerDiv.style.setProperty("--scale-factor", String(scale));
        pageEl.appendChild(textLayerDiv);

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
        if (myToken !== renderTokenRef.current) return null;

        const textContent = await page.getTextContent();
        if (myToken !== renderTokenRef.current) return null;

        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();
        if (myToken !== renderTokenRef.current) return null;

        if (!targetSet.has(n)) return null;
        const spans = textLayer.textDivs as HTMLElement[];
        const { firstEl, count } = applyHighlights(spans, tokenSet);
        totalHighlights += count;
        return firstEl;
      };

      // Lazily paint pages as they approach the viewport.
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const n = Number((entry.target as HTMLElement).dataset.page);
              if (n) void paintPage(n);
            }
          }
        },
        { root: scrollRef.current, rootMargin: "800px 0px" },
      );
      pageEls.forEach((el) => observer!.observe(el));

      // Eagerly render the cited page(s) so the highlight exists, then focus it.
      const eagerPages = targetPages.length ? targetPages : [1];
      let firstHighlight: HTMLElement | null = null;
      for (const n of eagerPages) {
        const el = await paintPage(n);
        if (myToken !== renderTokenRef.current) return;
        if (!firstHighlight && el) firstHighlight = el;
      }

      if (myToken !== renderTokenRef.current) return;
      setHighlightCount(totalHighlights);
      setRendering(false);

      // Focus the highlighted passage; fall back to the top of the cited page.
      if (firstHighlight) {
        firstHighlight.scrollIntoView({ block: "center", behavior: "auto" });
      } else if (eagerPages[0]) {
        pageEls[eagerPages[0] - 1]?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    })().catch((err) => {
      if (myToken === renderTokenRef.current) {
        console.error("Failed to render Research Expert PDF pages:", err);
        setError("Could not render this paper. Please try again.");
        setRendering(false);
      }
    });

    return () => {
      observer?.disconnect();
    };
  }, [docReady, error, zoom, targetPages, tokenSet]);

  const changeZoom = (delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  };

  return (
    <Modal onClose={onClose} zIndex={1060} compact>
      <section className="modal-panel research-pdf-modal" onClick={(event) => event.stopPropagation()}>
        <header className="research-pdf-toolbar">
          <div className="research-pdf-title">
            <span className="research-pdf-title-icon">
              <BookMarked size={18} />
            </span>
            <div>
              <h3>{paperTitle}</h3>
              <p>
                <FileText size={13} />
                <span>{pageLabel}</span>
              </p>
            </div>
          </div>

          <div className="research-pdf-toolbar-actions">
            <div className="research-pdf-zoom">
              <button
                type="button"
                onClick={() => changeZoom(-ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN || loading || !!error}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus size={16} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => changeZoom(ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX || loading || !!error}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus size={16} />
              </button>
            </div>
            <button className="research-pdf-close" type="button" onClick={onClose} aria-label="Close PDF viewer">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="research-pdf-legend">
          <span className="legend-swatch" />
          {loading || rendering ? (
            <span className="legend-muted">Locating the cited passage in the PDF…</span>
          ) : highlightCount > 0 ? (
            <span>
              <strong>Section #{source.chunk_index + 1}</strong> highlighted directly on the page, like a text selection.
            </span>
          ) : (
            <span className="legend-muted">
              <strong>Section #{source.chunk_index + 1}</strong> — showing {pageLabel.toLowerCase()}. The exact passage
              could not be auto-located to highlight.
            </span>
          )}
        </div>

        <div className="research-pdf-scroll" ref={scrollRef}>
          {loading && (
            <div className="research-pdf-state">
              <RefreshCw size={28} className="spin" />
              <span>Loading paper…</span>
            </div>
          )}

          {error && !loading && (
            <div className="research-pdf-state error">
              <AlertTriangle size={28} />
              <span>{error}</span>
            </div>
          )}

          <div ref={pagesHostRef} style={{ display: loading || error ? "none" : "contents" }} />
        </div>
      </section>
    </Modal>
  );
}
