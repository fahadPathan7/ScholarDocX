import re

with open("frontend/src/components/WhiteboardView.tsx", "r") as f:
    content = f.read()

# 1. Imports
content = content.replace(
"""  Maximize,
  BoxSelect
} from "lucide-react";""", 
"""  Maximize,
  BoxSelect,
  Undo2,
  Redo2,
  Save
} from "lucide-react";"""
)

# 2. Props
content = content.replace(
"""export function WhiteboardView() {""",
"""export function WhiteboardView({ onToast }: { onToast?: (msg: string) => void }) {"""
)

# 3. State hooks & commitHistory
state_search = """  const [shapes, setShapes] = useState<Shape[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });"""
state_replace = """  const [shapes, setShapes] = useState<Shape[]>([]);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });"""
content = content.replace(state_search, state_replace)

refs_search = """  const activeBoardIdRef = useRef(activeBoardId);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    shapesRef.current = shapes;
    cameraRef.current = camera;
    activeBoardIdRef.current = activeBoardId;
  }, [shapes, camera, activeBoardId]);"""
refs_replace = """  const activeBoardIdRef = useRef(activeBoardId);
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
  };"""
content = content.replace(refs_search, refs_replace)

# 4. switchBoard history reset
switch_board_search = """    try {
      setShapes(JSON.parse(board.shapes_json));
    } catch { setShapes([]); }"""
switch_board_replace = """    try {
      const parsedShapes = JSON.parse(board.shapes_json);
      setShapes(parsedShapes);
      setHistory([parsedShapes]);
      setHistoryIndex(0);
    } catch { 
      setShapes([]); 
      setHistory([[]]);
      setHistoryIndex(0);
    }"""
content = content.replace(switch_board_search, switch_board_replace)

# 5. createNewBoard history reset
create_board_search = """      const newBoards = [newBoard, ...boards];
      newBoards.sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime());
      setBoards(newBoards);
      switchBoard(newBoard);"""
# nothing to change here actually, switchBoard will be called and handle it!

# 6. handlePointerUp
pointer_up_search = """    if (draftShape) {
      let finalShape = { ...draftShape };
      // Normalize dimensions for boxy shapes so w and h are positive
      if (finalShape.type !== "pen" && finalShape.type !== "arrow") {
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
      if (finalShape.type === "pen" || finalShape.type === "arrow" || finalShape.w > 2 || finalShape.h > 2) {
        setShapes([...shapes, finalShape]);
        setSelectedId(finalShape.id);
      }
      setDraftShape(null);
      if (activeTool !== "pen") {
        setActiveTool("pointer");
      }
    }
  };"""
pointer_up_replace = """    if (isDragging) {
      commitHistory(shapes);
    }
    
    if (draftShape) {
      let finalShape = { ...draftShape };
      // Normalize dimensions for boxy shapes so w and h are positive
      if (finalShape.type !== "pen" && finalShape.type !== "arrow") {
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
      if (finalShape.type === "pen" || finalShape.type === "arrow" || finalShape.w > 2 || finalShape.h > 2) {
        const newShapes = [...shapes, finalShape];
        setShapes(newShapes);
        commitHistory(newShapes);
        setSelectedId(finalShape.id);
      }
      setDraftShape(null);
      if (activeTool !== "pen") {
        setActiveTool("pointer");
      }
    }
  };"""
content = content.replace(pointer_up_search, pointer_up_replace)

# 7. Eraser handleShapePointerDown
eraser_search = """  const handleShapePointerDown = (e: React.PointerEvent, id: string) => {
    if (activeTool === "eraser") {
      e.stopPropagation();
      setShapes(shapes.filter(s => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      return;
    }"""
eraser_replace = """  const handleShapePointerDown = (e: React.PointerEvent, id: string) => {
    if (activeTool === "eraser") {
      e.stopPropagation();
      const newShapes = shapes.filter(s => s.id !== id);
      setShapes(newShapes);
      commitHistory(newShapes);
      if (selectedId === id) setSelectedId(null);
      return;
    }"""
content = content.replace(eraser_search, eraser_replace)

# 8. Keyboard delete
delete_search = """        // Only if not editing text
        if (document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
          setShapes(prev => prev.filter(s => s.id !== selectedId));
          setSelectedId(null);
        }"""
delete_replace = """        // Only if not editing text
        if (document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
          setShapes(prev => {
            const newShapes = prev.filter(s => s.id !== selectedId);
            commitHistory(newShapes);
            return newShapes;
          });
          setSelectedId(null);
        }"""
content = content.replace(delete_search, delete_replace)

# 9. Text update
text_search = """              onChange={(e) => {
                setShapes(shapes.map(sh => sh.id === s.id ? { ...sh, text: e.target.value } : sh));
              }}"""
text_replace = """              onChange={(e) => {
                setShapes(shapes.map(sh => sh.id === s.id ? { ...sh, text: e.target.value } : sh));
              }}
              onBlur={() => {
                commitHistory(shapes);
              }}"""
content = content.replace(text_search, text_replace)

# 10. updateProp
prop_search = """  const updateProp = (key: keyof Shape, value: any) => {
    if (selShape) {
      setShapes(shapes.map(s => s.id === selectedId ? { ...s, [key]: value } : s));
    } else {
      setDefaultProps({ ...defaultProps, [key]: value });
    }
  };"""
prop_replace = """  const updateProp = (key: keyof Shape, value: any) => {
    if (selShape) {
      const newShapes = shapes.map(s => s.id === selectedId ? { ...s, [key]: value } : s);
      setShapes(newShapes);
      commitHistory(newShapes);
    } else {
      setDefaultProps({ ...defaultProps, [key]: value });
    }
  };"""
content = content.replace(prop_search, prop_replace)


# 11. New functions & Toolbar HTML
html_search = """      {/* Top Toolbar */}
      <div className="wb-toolbar">
        {tools.map((t) => ("""
html_replace = """  const handleSave = () => {
    if (activeBoardId) {
      saveBoard(activeBoardId, shapes, camera);
      if (onToast) onToast("Board saved");
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
        {tools.map((t) => ("""
content = content.replace(html_search, html_replace)

with open("frontend/src/components/WhiteboardView.tsx", "w") as f:
    f.write(content)

print("Patched successfully")
