import { useState, useEffect } from "react";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { api, RecordMap } from "../lib/api";
import "../styles.css";
import "../visual-refresh.css";
import "../sheet-table-polish.css";

export function FullScreenSheet() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("projectId");
  const pageId = urlParams.get("pageId");
  const [files, setFiles] = useState<RecordMap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles();
  }, [projectId]);

  const loadFiles = async () => {
    if (!projectId) return;
    try {
      const data = await api.get<RecordMap[]>(`/projects/${projectId}/files`);
      setFiles(data);
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!projectId || !pageId) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#d32f2f'
      }}>
        Missing projectId or pageId in URL
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      overflow: 'auto',
      position: 'fixed',
      top: 0,
      left: 0,
      background: '#f8f9fa'
    }}>
      <ProjectWorkspace
        files={files}
        onFilesChanged={loadFiles}
        navigationTarget={{
          token: Date.now(),
          projectId: Number(projectId),
          pageId: Number(pageId)
        }}
        fullScreenMode={true}
      />
    </div>
  );
}

