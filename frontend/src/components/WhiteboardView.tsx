import { useState, useEffect, useRef } from "react";
import { 
  MousePointer2, 
  Hand, 
  Square, 
  Diamond, 
  Circle, 
  Triangle,
  MoveRight, 
  Type, 
  PenTool, 
  Eraser, 
  Minus, 
  Plus, 
  Maximize,
  BoxSelect,
  Undo2,
  Redo2,
  Save,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Edit2
} from "lucide-react";
import { api, listRecords, createRecord, updateRecord, deleteRecord, notify } from "../lib/api";
import { useDialog } from "./DialogProvider";
import "./whiteboard.css";

type ShapeType = "square" | "diamond" | "circle" | "triangle" | "arrow" | "line" | "text" | "pen";

interface Point {
  x: number;
  y: number;
}

interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  fill: string;
  thickness: number;
  opacity: number;
  style: string;
  text?: string;
  points?: Point[];
}

interface WhiteboardRecord {
  id: number;
  name: string;
  shapes_json: string;
  camera_json: string;
  last_used_at: string;
}

export function WhiteboardView({ onToast }: { onToast?: (msg: string) => void }) {
  const ERASER_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="%23000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m13.3 4.7 5.6 5.6"/></svg>') 4 20, crosshair`;
  const PEN_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="%23000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>') 2 22, crosshair`;

  const { showAlert, showConfirm, showPrompt } = useDialog();
  const [boards, setBoards] = useState<WhiteboardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [activeTool, setActiveTool] = useState<string>("pointer");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [draftShape, setDraftShape] = useState<Shape | null>(null);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  
  const [defaultProps, setDefaultProps] = useState({
    stroke: "#378add",
    fill: "transparent",
    thickness: 3,
    opacity: 100,
    style: "Solid"
  });

  // State refs for safe unmount saving
  const shapesRef = useRef(shapes);
  const cameraRef = useRef(camera);
  const activeBoardIdRef = useRef(activeBoardId);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    shapesRef.current = shapes;
    cameraRef.current = camera;
    activeBoardIdRef.current = activeBoardId;
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [shapes, camera, activeBoardId, history, historyIndex]);

  const commitHistory = (newShapes: Shape[]) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(newShapes);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const saveBoard = async (id: number, s: Shape[], c: any) => {
    try {
      await updateRecord("whiteboards", id, {
        shapes_json: JSON.stringify(s),
        camera_json: JSON.stringify(c),
        last_used_at: new Date().toISOString()
      });
      setBoards(prev => prev.map(b => b.id === id ? {
        ...b,
        shapes_json: JSON.stringify(s),
        camera_json: JSON.stringify(c)
      } : b));
    } catch (e) {
      console.error("Failed to save board", e);
    }
  };

  // Fetch initial boards
  const loadBoards = async () => {
    try {
      let b = await listRecords<WhiteboardRecord>("whiteboards");
      if (b.length > 0) {
        b.sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime());
        setBoards(b);
        switchBoard(b[0], false);
      } else {
        setBoards([]);
      }
    } catch (e) {
      console.error("Failed to load boards", e);
      // Fallback for when backend might not be ready
      setTimeout(loadBoards, 2000);
    } finally {
      setIsLoadingBoards(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, []);

  const switchBoard = (board: WhiteboardRecord, flushCurrent = true) => {
    if (flushCurrent && isLoadedRef.current && activeBoardIdRef.current && activeBoardIdRef.current !== board.id) {
      saveBoard(activeBoardIdRef.current, shapesRef.current, cameraRef.current);
    }
    
    isLoadedRef.current = false; // suspend saves
    setActiveBoardId(board.id);
    setSelectedId(null);
    setDraftShape(null);
    
    try {
      const parsedShapes = JSON.parse(board.shapes_json);
      setShapes(parsedShapes);
      setHistory([parsedShapes]);
      setHistoryIndex(0);
    } catch { 
      setShapes([]); 
      setHistory([[]]);
      setHistoryIndex(0);
    }
    
    try {
      setCamera(JSON.parse(board.camera_json));
    } catch { setCamera({ x: 0, y: 0, zoom: 1 }); }
    
    // Update last used time
    updateRecord("whiteboards", board.id, { last_used_at: new Date().toISOString() }).catch(console.error);
    
    setTimeout(() => {
      isLoadedRef.current = true;
    }, 100);
  };

  const createNewBoard = async () => {
    if (boards.length >= 10) return;
    const name = await showPrompt("Enter new board name:", `Board ${boards.length + 1}`, "Create Board");
    if (!name) return;
    try {
      const newBoard = await createRecord<WhiteboardRecord>("whiteboards", {
        name,
        shapes_json: "[]",
        camera_json: JSON.stringify({ x: 0, y: 0, zoom: 1 }),
        last_used_at: new Date().toISOString()
      });
      await notify("whiteboard_create", { whiteboardName: name });
      const newBoards = [newBoard, ...boards];
      newBoards.sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime());
      setBoards(newBoards);
      switchBoard(newBoard);
    } catch (e) {
      console.error("Failed to create board", e);
    }
  };

  const renameBoard = async (e: React.MouseEvent, b: WhiteboardRecord) => {
    e.stopPropagation();
    const newName = await showPrompt("Rename board:", b.name, "Rename Board");
    if (!newName || newName === b.name) return;
    try {
      await updateRecord("whiteboards", b.id, { name: newName });
      setBoards(boards.map(board => board.id === b.id ? { ...board, name: newName } : board));
      if (onToast) onToast("Board renamed");
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBoard = async (e: React.MouseEvent, b: WhiteboardRecord) => {
    e.stopPropagation();
    if (boards.length <= 1) {
       await showAlert("Cannot delete the last board.", "Error");
       return;
    }
    const confirmed = await showConfirm(`Delete board "${b.name}"?`, "Delete Board");
    if (!confirmed) return;
    try {
      await deleteRecord("whiteboards", b.id);
      await notify("whiteboard_delete", { whiteboardName: b.name });
      const newBoards = boards.filter(board => board.id !== b.id);
      setBoards(newBoards);
      if (activeBoardId === b.id) {
         switchBoard(newBoards[0], false);
      }
      if (onToast) onToast("Board deleted");
    } catch (e) {
      console.error(e);
    }
  };

  // Debounced save
  useEffect(() => {
    if (!isLoadedRef.current || !activeBoardId) return;
    const timeoutId = setTimeout(() => {
      saveBoard(activeBoardId, shapes, camera);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [shapes, camera, activeBoardId]);

  // Save on unmount (tab switch)
  useEffect(() => {
    return () => {
      if (isLoadedRef.current && activeBoardIdRef.current) {
        saveBoard(activeBoardIdRef.current, shapesRef.current, cameraRef.current);
      }
    };
  }, []);

  const tools = [
    { id: "pointer", icon: MousePointer2, label: "Select" },
    { id: "hand", icon: Hand, label: "Pan" },
    { id: "square", icon: Square, label: "Rectangle" },
    { id: "diamond", icon: Diamond, label: "Diamond" },
    { id: "circle", icon: Circle, label: "Circle" },
    { id: "triangle", icon: Triangle, label: "Triangle" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "arrow", icon: MoveRight, label: "Arrow" },
    { id: "text", icon: Type, label: "Text" },
    { id: "pen", icon: PenTool, label: "Draw" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
  ];

  const getCanvasCoords = (e: React.PointerEvent<SVGSVGElement> | React.WheelEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    // Space bar + click OR middle click OR hand tool = Pan
    if (activeTool === "hand" || e.button === 1 || e.shiftKey) { 
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    const coords = getCanvasCoords(e);

    const target = e.target as SVGElement;
    const handle = target.getAttribute("data-handle");
    if (handle && selectedId) {
      setResizingHandle(handle);
      setDragStart(coords);
      return;
    }
    
    if (activeTool === "pointer") {
      setSelectedId(null);
      return;
    }

    if (activeTool === "eraser") {
      setIsDragging(true);
      return;
    }

    const newId = Date.now().toString();
    const newShape: Shape = {
      id: newId,
      type: activeTool as ShapeType,
      x: coords.x,
      y: coords.y,
      w: 0,
      h: 0,
      stroke: defaultProps.stroke,
      fill: defaultProps.fill,
      thickness: defaultProps.thickness,
      opacity: defaultProps.opacity,
      style: defaultProps.style,
      points: activeTool === "pen" || activeTool === "arrow" || activeTool === "line" ? [{x: 0, y: 0}] : undefined,
      text: activeTool === "text" ? "" : undefined
    };
    
    setDraftShape(newShape);
    setDragStart({ x: coords.x, y: coords.y });
  };

const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
};

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool === "eraser" && isDragging) {
      const coords = getCanvasCoords(e);
      const ex = coords.x;
      const ey = coords.y;
      const radius = 10 / camera.zoom;

      setShapes(prev => prev.filter(s => {
        let hit = false;
        
        if (s.type === "pen") {
          if (s.points && s.points.length > 0) {
            if (s.points.length === 1) {
               hit = Math.hypot(ex - (s.x + s.points[0].x), ey - (s.y + s.points[0].y)) <= radius;
            } else {
              for (let i = 0; i < s.points.length - 1; i++) {
                if (distToSegment(ex, ey, s.x + s.points[i].x, s.y + s.points[i].y, s.x + s.points[i+1].x, s.y + s.points[i+1].y) <= radius) {
                  hit = true; break;
                }
              }
            }
          }
        } else if (s.type === "line" || s.type === "arrow") {
          hit = distToSegment(ex, ey, s.x, s.y, s.x + s.w, s.y + s.h) <= radius;
        } else {
          const minX = Math.min(s.x, s.x + s.w);
          const maxX = Math.max(s.x, s.x + s.w);
          const minY = Math.min(s.y, s.y + s.h);
          const maxY = Math.max(s.y, s.y + s.h);
          
          let w = maxX - minX;
          let h = maxY - minY;
          if (s.type === "text") {
            w = Math.max(w, 150);
            h = Math.max(h, 40);
          }
          
          hit = ex >= minX - radius && ex <= minX + w + radius &&
                ey >= minY - radius && ey <= minY + h + radius;
        }

        if (hit) {
          if (selectedId === s.id) setSelectedId(null);
          return false;
        }
        return true;
      }));
      return;
    }

    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const newX = Math.max(-3000, Math.min(3000, camera.x + dx));
      const newY = Math.max(-3000, Math.min(3000, camera.y + dy));
      setCamera({ ...camera, x: newX, y: newY });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    const coords = getCanvasCoords(e);
    
    if (resizingHandle && selectedId) {
      const dx = coords.x - dragStart.x;
      const dy = coords.y - dragStart.y;
      setShapes(shapes.map(s => {
        if (s.id === selectedId) {
          let bx = s.x, by = s.y, bw = s.w, bh = s.h;
          
          if (s.type === "line" || s.type === "arrow") {
             bx = Math.min(s.x, s.x + s.w);
             by = Math.min(s.y, s.y + s.h);
             bw = Math.abs(s.w);
             bh = Math.abs(s.h);
          } else if (s.type === "pen") {
             let minX = 0, minY = 0, maxX = 0, maxY = 0;
             if (s.points && s.points.length > 0) {
               s.points.forEach(p => {
                 if (p.x < minX) minX = p.x;
                 if (p.x > maxX) maxX = p.x;
                 if (p.y < minY) minY = p.y;
                 if (p.y > maxY) maxY = p.y;
               });
             }
             bx = s.x + minX;
             by = s.y + minY;
             bw = maxX - minX;
             bh = maxY - minY;
          }

          let newBx = bx;
          let newBy = by;
          let newBw = bw;
          let newBh = bh;

          if (resizingHandle.includes("r")) newBw += dx;
          if (resizingHandle.includes("b")) newBh += dy;
          if (resizingHandle.includes("l")) { newBw -= dx; newBx += dx; }
          if (resizingHandle.includes("t")) { newBh -= dy; newBy += dy; }
          
          if (newBw < 5) { newBx -= (5 - newBw) * (resizingHandle.includes("l") ? 1 : 0); newBw = 5; }
          if (newBh < 5) { newBy -= (5 - newBh) * (resizingHandle.includes("t") ? 1 : 0); newBh = 5; }

          if (s.type === "pen") {
            const newPoints = (s.points || []).map(p => {
               const fx = bw === 0 ? 0 : (s.x + p.x - bx) / bw;
               const fy = bh === 0 ? 0 : (s.y + p.y - by) / bh;
               return { x: fx * newBw, y: fy * newBh };
            });
            return { ...s, x: newBx, y: newBy, w: newBw, h: newBh, points: newPoints };
          } else if (s.type === "line" || s.type === "arrow") {
             const startFx = bw === 0 ? 0 : (s.x - bx) / bw;
             const startFy = bh === 0 ? 0 : (s.y - by) / bh;
             const endFx = bw === 0 ? 0 : ((s.x + s.w) - bx) / bw;
             const endFy = bh === 0 ? 0 : ((s.y + s.h) - by) / bh;
             
             return { ...s, x: newBx + startFx * newBw, y: newBy + startFy * newBh, w: (endFx - startFx) * newBw, h: (endFy - startFy) * newBh };
          } else {
             return { ...s, x: newBx, y: newBy, w: newBw, h: newBh };
          }
        }
        return s;
      }));
      setDragStart(coords);
      return;
    }
    
    if (isDragging && selectedId) {
      const dx = coords.x - dragStart.x;
      const dy = coords.y - dragStart.y;
      setShapes(shapes.map(s => s.id === selectedId ? { ...s, x: s.x + dx, y: s.y + dy } : s));
      setDragStart({ x: coords.x, y: coords.y });
      return;
    }
    
    if (draftShape) {
      const w = coords.x - dragStart.x;
      const h = coords.y - dragStart.y;
      
      if (draftShape.type === "pen") {
        setDraftShape({
          ...draftShape,
          points: [...(draftShape.points || []), { x: w, y: h }]
        });
      } else {
        setDraftShape({
          ...draftShape,
          w,
          h
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsPanning(false);
    
    if (activeTool === "eraser" && isDragging) {
      setIsDragging(false);
      setTimeout(() => commitHistory(shapesRef.current), 0);
      return;
    }
    
    setIsDragging(false);
    
    if (resizingHandle) {
      setResizingHandle(null);
      commitHistory(shapes);
      return;
    }

    
    if (isDragging) {
      commitHistory(shapes);
    }
    
    if (draftShape) {
      let finalShape = { ...draftShape };
      // Normalize dimensions for boxy shapes so w and h are positive
      if (finalShape.type !== "pen" && finalShape.type !== "arrow" && finalShape.type !== "line") {
        if (finalShape.w < 0) {
          finalShape.x += finalShape.w;
          finalShape.w = Math.abs(finalShape.w);
        }
        if (finalShape.h < 0) {
          finalShape.y += finalShape.h;
          finalShape.h = Math.abs(finalShape.h);
        }
      }
      
      // Ignore tiny artifacts
      if (finalShape.type === "pen" || finalShape.type === "arrow" || finalShape.type === "line" || finalShape.type === "text" || finalShape.w > 2 || finalShape.h > 2) {
        if (finalShape.type === "text") {
          finalShape.w = Math.max(finalShape.w, 150);
          finalShape.h = Math.max(finalShape.h, 40);
        }
        const newShapes = [...shapes, finalShape];
        setShapes(newShapes);
        commitHistory(newShapes);
        
        if (finalShape.type === "text") {
          setActiveTool("pointer");
          setSelectedId(finalShape.id);
        }
      }
      setDraftShape(null);
    }
  };

  const handleShapePointerDown = (e: React.PointerEvent, id: string) => {
    if (activeTool === "eraser") {
      e.stopPropagation();
      setShapes(prev => prev.filter(s => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      setIsDragging(true);
      const svg = e.currentTarget.closest("svg");
      if (svg) svg.setPointerCapture(e.pointerId);
      return;
    }
    
    if (activeTool !== "pointer") {
      setActiveTool("pointer");
    }

    const target = e.target as Element;
    if (target.tagName.toLowerCase() === "textarea") {
      e.stopPropagation();
      setSelectedId(id);
      return; 
    }
    
    e.stopPropagation();
    setSelectedId(id);
    setIsDragging(true);
    const rect = e.currentTarget.closest("svg")!.getBoundingClientRect();
    const coords = {
      x: (e.clientX - rect.left - camera.x) / camera.zoom,
      y: (e.clientY - rect.top - camera.y) / camera.zoom
    };
    setDragStart({ x: coords.x, y: coords.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const zoomAmount = e.deltaY * -0.01;
      const newZoom = Math.min(Math.max(0.1, camera.zoom + zoomAmount), 5);
      
      // Zoom towards mouse
      const coords = getCanvasCoords(e);
      const dx = (coords.x * camera.zoom) - (coords.x * newZoom);
      const dy = (coords.y * camera.zoom) - (coords.y * newZoom);
      const newX = Math.max(-3000, Math.min(3000, camera.x + dx));
      const newY = Math.max(-3000, Math.min(3000, camera.y + dy));
      setCamera({ x: newX, y: newY, zoom: newZoom });
    } else {
      // Pan
      const newX = Math.max(-3000, Math.min(3000, camera.x - e.deltaX));
      const newY = Math.max(-3000, Math.min(3000, camera.y - e.deltaY));
      setCamera({ x: newX, y: newY, zoom: camera.zoom });
    }
  };

  // Keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        // Only if not editing text
        if (document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
          setShapes(prev => {
            const newShapes = prev.filter(s => s.id !== selectedId);
            commitHistory(newShapes);
            return newShapes;
          });
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  const selShape = shapes.find(s => s.id === selectedId);
  const currentProps = selShape || (draftShape ? draftShape : (defaultProps as unknown as Shape));

  const updateProp = (key: keyof Shape, value: any) => {
    setDefaultProps(prev => ({ ...prev, [key]: value }));
    if (selShape) {
      const newShapes = shapes.map(s => s.id === selectedId ? { ...s, [key]: value } : s);
      setShapes(newShapes);
      commitHistory(newShapes);
    }
  };

  const renderShape = (s: Shape) => {
    const strokeDasharray = s.style === "Dashed" ? "10,10" : s.style === "Dotted" ? "2,6" : undefined;
    const strokeLinecap = s.style === "Dotted" ? "round" : undefined;
    
    const commonProps = {
      "data-shape-id": s.id,
      stroke: s.stroke,
      fill: s.fill === "transparent" ? "none" : s.fill,
      strokeWidth: s.thickness,
      opacity: s.opacity / 100,
      strokeDasharray,
      strokeLinecap: strokeLinecap as any,
      strokeLinejoin: "round" as any,
      onPointerDown: (e: any) => handleShapePointerDown(e, s.id),
      style: { 
        cursor: activeTool === "pointer" ? "move" : activeTool === "eraser" ? ERASER_CURSOR : activeTool === "pen" ? PEN_CURSOR : "crosshair",
        pointerEvents: (activeTool === "pointer" || activeTool === "eraser" || s.type === "text") ? "all" as any : "none" as any
      }
    };
    
    switch (s.type) {
      case "square":
        return <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} {...commonProps} />;
      case "circle":
        return <ellipse key={s.id} cx={s.x + s.w/2} cy={s.y + s.h/2} rx={Math.abs(s.w/2)} ry={Math.abs(s.h/2)} {...commonProps} />;
      case "diamond":
        return <polygon key={s.id} points={`${s.x + s.w/2},${s.y} ${s.x + s.w},${s.y + s.h/2} ${s.x + s.w/2},${s.y + s.h} ${s.x},${s.y + s.h/2}`} {...commonProps} />;
      case "triangle":
        return <polygon key={s.id} points={`${s.x + s.w/2},${s.y} ${s.x + s.w},${s.y + s.h} ${s.x},${s.y + s.h}`} {...commonProps} />;
      case "line":
        return <line key={s.id} x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} {...commonProps} fill="none" />;
      case "arrow":
        return (
          <g key={s.id}>
            <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} {...commonProps} markerEnd={`url(#arrowhead-${s.id})`} fill="none" />
            <defs>
              <marker id={`arrowhead-${s.id}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={s.stroke} opacity={s.opacity / 100} />
              </marker>
            </defs>
          </g>
        );
      case "pen": {
        if (!s.points || s.points.length === 0) return null;
        const pathData = `M ${s.x + s.points[0].x} ${s.y + s.points[0].y} ` + s.points.slice(1).map(p => `L ${s.x + p.x} ${s.y + p.y}`).join(" ");
        return <path key={s.id} d={pathData} {...commonProps} fill="none" />;
      }
      case "text":
        return (
          <foreignObject key={s.id} x={s.x} y={s.y} width={Math.max(s.w, 150)} height={Math.max(s.h, 40)} onPointerDown={(e) => handleShapePointerDown(e, s.id)}>
            <textarea 
              data-shape-id={s.id}
              value={s.text}
              onChange={(e) => {
                setShapes(shapes.map(sh => sh.id === s.id ? { ...sh, text: e.target.value } : sh));
              }}
              onBlur={() => {
                commitHistory(shapes);
              }}
              style={{
                width: "100%", height: "100%", 
                background: `${s.stroke}0A`, 
                border: (selectedId === s.id || s.id === draftShape?.id) ? `1px dashed ${s.stroke}` : `1px solid ${s.stroke}40`,
                borderRadius: 4,
                color: s.stroke, fontSize: `${Math.max(14, s.thickness * 4)}px`, 
                outline: "none", resize: "none", padding: 8, fontFamily: "inherit",
                opacity: s.opacity / 100,
                overflowY: "auto", overflowX: "hidden",
                pointerEvents: (selectedId === s.id || s.id === draftShape?.id) ? "auto" : "none"
              }}
            />
          </foreignObject>
        );
      default:
        return null;
    }
  };

  const renderSelectionBox = () => {
    if (!selectedId) return null;
    const s = shapes.find(sh => sh.id === selectedId);
    if (!s) return null;
    
    let bx = s.x;
    let by = s.y;
    let bw = s.w;
    let bh = s.h;
  
    if (s.type === "arrow" || s.type === "line") {
      bx = Math.min(s.x, s.x + s.w);
      by = Math.min(s.y, s.y + s.h);
      bw = Math.abs(s.w);
      bh = Math.abs(s.h);
    } else if (s.type === "pen") {
      let minX = 0, minY = 0, maxX = 0, maxY = 0;
      if (s.points && s.points.length > 0) {
        s.points.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
      }
      bx = s.x + minX;
      by = s.y + minY;
      bw = maxX - minX;
      bh = maxY - minY;
    }
  
    bx -= 6; by -= 6; bw += 12; bh += 12;
  
    return (
      <g>
        <rect x={bx} y={by} width={bw} height={bh} fill="none" stroke="#5c85ff" strokeWidth="1.5" strokeDasharray="4,4" pointerEvents="none" />
        
        {/* Resize Handles */}
        <>
          <line data-handle="l" x1={bx} y1={by} x2={bx} y2={by+bh} stroke="transparent" strokeWidth={10} style={{cursor: "ew-resize"}} />
          <line data-handle="r" x1={bx+bw} y1={by} x2={bx+bw} y2={by+bh} stroke="transparent" strokeWidth={10} style={{cursor: "ew-resize"}} />
          <line data-handle="t" x1={bx} y1={by} x2={bx+bw} y2={by} stroke="transparent" strokeWidth={10} style={{cursor: "ns-resize"}} />
          <line data-handle="b" x1={bx} y1={by+bh} x2={bx+bw} y2={by+bh} stroke="transparent" strokeWidth={10} style={{cursor: "ns-resize"}} />
          <rect data-handle="tl" x={bx-4} y={by-4} width={8} height={8} fill="white" stroke="#5c85ff" style={{cursor: "nwse-resize"}} />
          <rect data-handle="tr" x={bx+bw-4} y={by-4} width={8} height={8} fill="white" stroke="#5c85ff" style={{cursor: "nesw-resize"}} />
          <rect data-handle="bl" x={bx-4} y={by+bh-4} width={8} height={8} fill="white" stroke="#5c85ff" style={{cursor: "nesw-resize"}} />
          <rect data-handle="br" x={bx+bw-4} y={by+bh-4} width={8} height={8} fill="white" stroke="#5c85ff" style={{cursor: "nwse-resize"}} />
        </>
      </g>
    );
  };

  const handleSave = () => {
    if (activeBoardId) {
      saveBoard(activeBoardId, shapes, camera);
      if (onToast) onToast("Board saved");
    }
  };

  const handleClearBoard = async () => {
    if (shapes.length === 0) return;
    const confirmed = await showConfirm("Are you sure you want to clear the entire board?", "Clear Board");
    if (confirmed) {
      const newShapes: Shape[] = [];
      setShapes(newShapes);
      commitHistory(newShapes);
      setSelectedId(null);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setShapes(history[newIndex]);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setShapes(history[newIndex]);
      setSelectedId(null);
    }
  };

  if (activeBoardId === null) {
    if (isLoadingBoards) {
      return (
        <div className="whiteboard-view" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ color: 'var(--wb-text-dim)' }}>Loading boards...</div>
        </div>
      );
    }
    return (
      <div className="whiteboard-view" style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: 'var(--wb-text-dim)', fontSize: 16 }}>No whiteboards yet</div>
        <button className="wb-btn" onClick={handleCreateBoard} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Create Whiteboard
        </button>
      </div>
    );
  }

  return (
    <div className="whiteboard-view" style={{ 
      backgroundPosition: `${camera.x}px ${camera.y}px`,
      backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`
    }}>
      {/* Top Toolbar */}
      <div className="wb-toolbar">
        <button className="wb-tool-btn" onClick={handleSave} title="Save">
          <Save size={18} />
        </button>
        <div className="wb-tool-divider" />
        <button className="wb-tool-btn" onClick={handleUndo} title="Undo" disabled={historyIndex <= 0} style={{ opacity: historyIndex <= 0 ? 0.3 : 1 }}>
          <Undo2 size={18} />
        </button>
        <button className="wb-tool-btn" onClick={handleRedo} title="Redo" disabled={historyIndex >= history.length - 1} style={{ opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>
          <Redo2 size={18} />
        </button>
        <div className="wb-tool-divider" />
        <button className="wb-tool-btn" onClick={handleClearBoard} title="Clear Board" style={{ color: '#e74c3c' }}>
          <Trash2 size={18} />
        </button>
        <div className="wb-tool-divider" />
        {tools.map((t) => (
          <button
            key={t.id}
            className={`wb-tool-btn ${activeTool === t.id ? "active" : ""}`}
            onClick={() => {
              setActiveTool(t.id);
              if (t.id !== "pointer") setSelectedId(null);
            }}
            title={t.label}
          >
            <t.icon size={18} />
          </button>
        ))}
      </div>

      {/* Canvas Area */}
      <div className={`wb-canvas-dummy ${!isPanelOpen ? 'expanded' : ''}`}>
        <svg 
          className="wb-svg-layer" 
          style={{ 
            cursor: isPanning ? 'grabbing' 
                    : activeTool === 'hand' ? 'grab' 
                    : activeTool === 'eraser' ? ERASER_CURSOR 
                    : activeTool === 'pen' ? PEN_CURSOR 
                    : activeTool === 'pointer' ? 'default' 
                    : 'crosshair'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
            {shapes.map(renderShape)}
            {draftShape && renderShape(draftShape)}
            {renderSelectionBox()}
          </g>
        </svg>
      </div>

      {/* Panel Toggle */}
      <button 
        className="wb-panel-toggle" 
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        style={{ right: isPanelOpen ? 260 : 0 }}
      >
        {isPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Right Properties Panel */}
      <div className={`wb-properties-panel ${!isPanelOpen ? 'collapsed' : ''}`}>
        <div className="wb-panel-section">
          <div className="wb-panel-section-title">Properties</div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">Stroke</span>
            <input type="color" value={currentProps.stroke} onChange={e => updateProp("stroke", e.target.value)} style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent' }} />
            <input type="text" className="wb-input-prop" value={currentProps.stroke} onChange={e => updateProp("stroke", e.target.value)} />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">Fill</span>
            <input type="color" value={currentProps.fill === "transparent" ? "#ffffff" : currentProps.fill} onChange={e => updateProp("fill", e.target.value)} style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent' }} />
            <input type="text" className="wb-input-prop" value={currentProps.fill} onChange={e => updateProp("fill", e.target.value)} placeholder="transparent" />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">Thickness</span>
            <input type="number" className="wb-input-prop" value={currentProps.thickness} onChange={e => updateProp("thickness", Number(e.target.value))} min={1} max={50} />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">Opacity</span>
            <div style={{ flex: 1, marginLeft: 16 }}>
              <input type="range" className="wb-slider" min="0" max="100" value={currentProps.opacity} onChange={e => updateProp("opacity", Number(e.target.value))} />
            </div>
            <span className="wb-prop-value" style={{ marginLeft: 12, minWidth: '35px', textAlign: 'right' }}>{currentProps.opacity}%</span>
          </div>
          <div className="wb-prop-row" style={{ marginTop: 16 }}>
            <span className="wb-prop-label">Style</span>
          </div>
          <div>
            <select className="wb-select" value={currentProps.style} onChange={e => updateProp("style", e.target.value)}>
              <option value="Solid">Solid</option>
              <option value="Dashed">Dashed</option>
              <option value="Dotted">Dotted</option>
            </select>
          </div>
        </div>

        <div className="wb-panel-section">
          <div className="wb-panel-section-title">Position</div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">X</span>
            <input type="number" className="wb-input-prop" value={selShape ? Math.round(selShape.x) : 0} onChange={e => updateProp("x", Number(e.target.value))} disabled={!selShape} />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">Y</span>
            <input type="number" className="wb-input-prop" value={selShape ? Math.round(selShape.y) : 0} onChange={e => updateProp("y", Number(e.target.value))} disabled={!selShape} />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">W</span>
            <input type="number" className="wb-input-prop" value={selShape ? Math.round(selShape.w) : 0} onChange={e => updateProp("w", Number(e.target.value))} disabled={!selShape || selShape.type === "pen"} />
          </div>
          <div className="wb-prop-row">
            <span className="wb-prop-label">H</span>
            <input type="number" className="wb-input-prop" value={selShape ? Math.round(selShape.h) : 0} onChange={e => updateProp("h", Number(e.target.value))} disabled={!selShape || selShape.type === "pen"} />
          </div>
        </div>

        <div className="wb-panel-section" style={{ flex: 1, borderBottom: 'none' }}>
          <div className="wb-panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Boards
            {boards.length < 10 && (
              <button 
                className="wb-icon-btn" 
                onClick={createNewBoard} 
                title="New Board"
                style={{ padding: 4, background: 'var(--wb-panel-border)', borderRadius: 4 }}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {boards.map(b => (
              <div 
                key={b.id} 
                onClick={() => switchBoard(b)}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: 6, 
                  cursor: 'pointer',
                  fontSize: 13,
                  background: b.id === activeBoardId ? 'var(--wb-input-bg)' : 'transparent',
                  color: b.id === activeBoardId ? 'var(--wb-text-main)' : 'var(--wb-text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.id === activeBoardId ? '#378add' : 'transparent', flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {b.name}
                </div>
                {b.id === activeBoardId && (
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button className="wb-icon-btn" style={{ width: 20, height: 20, border: 'none' }} onClick={(e) => renameBoard(e, b)}>
                      <Edit2 size={12} />
                    </button>
                    <button className="wb-icon-btn" style={{ width: 20, height: 20, border: 'none' }} onClick={(e) => handleDeleteBoard(e, b)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className={`wb-bottom-bar ${!isPanelOpen ? 'expanded' : ''}`}>
        <div className="wb-status-left">
          <div className="wb-status-item">
            <BoxSelect size={14} color="#a0a0a0" />
            <span style={{ color: '#a0a0a0' }}>{activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} • {currentProps.thickness}px</span>
          </div>
          <div className="wb-status-item">
            <span style={{ color: '#a0a0a0' }}>{shapes.length} objects</span>
          </div>
        </div>
        <div className="wb-status-right">
          <div className="wb-zoom-controls">
            <button className="wb-icon-btn" onClick={() => setCamera({ ...camera, zoom: Math.max(0.1, camera.zoom - 0.2) })}><Minus size={14} /></button>
            <span style={{ minWidth: '40px', textAlign: 'center' }}>{Math.round(camera.zoom * 100)}%</span>
            <button className="wb-icon-btn" onClick={() => setCamera({ ...camera, zoom: Math.min(5, camera.zoom + 0.2) })}><Plus size={14} /></button>
          </div>
          <button className="wb-icon-btn" onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}><Maximize size={14} /></button>
        </div>
      </div>
    </div>
  );
}
