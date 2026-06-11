import re

with open("frontend/src/components/WhiteboardView.tsx", "r") as f:
    content = f.read()

# 1. Update Imports
content = content.replace(
"""  Undo2,
  Redo2,
  Save
} from "lucide-react";
import { api, listRecords, createRecord, updateRecord } from "../lib/api";""",
"""  Undo2,
  Redo2,
  Save,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Edit2
} from "lucide-react";
import { api, listRecords, createRecord, updateRecord, deleteRecord } from "../lib/api";"""
)

# 2. Add isPanelOpen state
content = content.replace(
"""  const [boards, setBoards] = useState<WhiteboardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);""",
"""  const [boards, setBoards] = useState<WhiteboardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);"""
)

# 3. Create, Rename, Delete Board
content = content.replace(
"""  const createNewBoard = async () => {
    if (boards.length >= 10) return;
    try {
      const newBoard = await createRecord<WhiteboardRecord>("whiteboards", {
        name: `Board ${boards.length + 1}`,
        shapes_json: "[]",
        camera_json: JSON.stringify({ x: 0, y: 0, zoom: 1 }),
        last_used_at: new Date().toISOString()
      });
      const newBoards = [newBoard, ...boards];
      newBoards.sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime());
      setBoards(newBoards);
      switchBoard(newBoard);
    } catch (e) {
      console.error("Failed to create board", e);
    }
  };""",
"""  const createNewBoard = async () => {
    if (boards.length >= 10) return;
    const name = prompt("Enter new board name:", `Board ${boards.length + 1}`);
    if (!name) return;
    try {
      const newBoard = await createRecord<WhiteboardRecord>("whiteboards", {
        name,
        shapes_json: "[]",
        camera_json: JSON.stringify({ x: 0, y: 0, zoom: 1 }),
        last_used_at: new Date().toISOString()
      });
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
    const newName = prompt("Rename board:", b.name);
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
       alert("Cannot delete the last board.");
       return;
    }
    if (!confirm(`Delete board "${b.name}"?`)) return;
    try {
      await deleteRecord("whiteboards", b.id);
      const newBoards = boards.filter(board => board.id !== b.id);
      setBoards(newBoards);
      if (activeBoardId === b.id) {
         switchBoard(newBoards[0], false);
      }
      if (onToast) onToast("Board deleted");
    } catch (e) {
      console.error(e);
    }
  };"""
)

# 4. Canvas boundaries on pan and zoom
content = content.replace(
"""    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }""",
"""    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const newX = Math.max(-3000, Math.min(3000, camera.x + dx));
      const newY = Math.max(-3000, Math.min(3000, camera.y + dy));
      setCamera({ ...camera, x: newX, y: newY });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }"""
)

content = content.replace(
"""      // Zoom towards mouse
      const coords = getCanvasCoords(e);
      const dx = (coords.x * camera.zoom) - (coords.x * newZoom);
      const dy = (coords.y * camera.zoom) - (coords.y * newZoom);
      
      setCamera({ x: camera.x + dx, y: camera.y + dy, zoom: newZoom });
    } else {
      // Pan
      setCamera({ x: camera.x - e.deltaX, y: camera.y - e.deltaY, zoom: camera.zoom });
    }""",
"""      // Zoom towards mouse
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
    }"""
)

# 5. Do not reset activeTool on pointerUp (Persistent Tools)
content = content.replace(
"""      setDraftShape(null);
      if (activeTool !== "pen") {
        setActiveTool("pointer");
      }
    }
  };""",
"""      setDraftShape(null);
    }
  };"""
)

# 6. Style Memory (updateProp should update defaultProps)
content = content.replace(
"""  const updateProp = (key: keyof Shape, value: any) => {
    if (selShape) {
      const newShapes = shapes.map(s => s.id === selectedId ? { ...s, [key]: value } : s);
      setShapes(newShapes);
      commitHistory(newShapes);
    } else {
      setDefaultProps({ ...defaultProps, [key]: value });
    }
  };""",
"""  const updateProp = (key: keyof Shape, value: any) => {
    setDefaultProps(prev => ({ ...prev, [key]: value }));
    if (selShape) {
      const newShapes = shapes.map(s => s.id === selectedId ? { ...s, [key]: value } : s);
      setShapes(newShapes);
      commitHistory(newShapes);
    }
  };"""
)

# 7. Render Hand cursor & Side Panel Collapsibility
content = content.replace(
"""      {/* Canvas Area */}
      <div className="wb-canvas-dummy">
        <svg 
          className="wb-svg-layer" 
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >""",
"""      {/* Canvas Area */}
      <div className={`wb-canvas-dummy ${!isPanelOpen ? 'expanded' : ''}`}>
        <svg 
          className="wb-svg-layer" 
          style={{ cursor: isPanning ? 'grabbing' : (activeTool === 'hand' ? 'grab' : undefined) }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >"""
)

# 8. Side Panel render logic (Add toggle and actions for boards)
content = content.replace(
"""      {/* Right Properties Panel */}
      <div className="wb-properties-panel">""",
"""      {/* Panel Toggle */}
      <button 
        className="wb-panel-toggle" 
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        style={{ right: isPanelOpen ? 260 : 0 }}
      >
        {isPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Right Properties Panel */}
      <div className={`wb-properties-panel ${!isPanelOpen ? 'collapsed' : ''}`}>"""
)

# 9. Board Actions in panel
content = content.replace(
"""                <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.id === activeBoardId ? '#378add' : 'transparent', flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name}
                </div>
              </div>""",
"""                <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.id === activeBoardId ? '#378add' : 'transparent', flexShrink: 0 }} />
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
              </div>"""
)

# 10. Bottom Bar expansion
content = content.replace(
"""      {/* Bottom Status Bar */}
      <div className="wb-bottom-bar">""",
"""      {/* Bottom Status Bar */}
      <div className={`wb-bottom-bar ${!isPanelOpen ? 'expanded' : ''}`}>"""
)

with open("frontend/src/components/WhiteboardView.tsx", "w") as f:
    f.write(content)
print("patching whiteboard done")
