import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus, Search, Upload, X } from "lucide-react";
import { api, RecordMap } from "../lib/api";
import { mediaCategories } from "../data/options";
import "./file-picker.css";

/**
 * File picker for file-type sheet columns.
 * Shows a searchable list of uploaded documents with inline upload capability.
 */
export function FilePickerField({
  value,
  files,
  onChange,
  onFileUploaded
}: {
  value: string;
  files: RecordMap[];
  onChange: (value: string) => void;
  onFileUploaded: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [categories, setCategories] = useState<RecordMap[]>([]);

  useEffect(() => {
    if (!isPanelOpen) return;
    api
      .get<RecordMap[]>("/document_categories")
      .then(setCategories)
      .catch(() => setCategories(mediaCategories.map((slug) => ({ slug, display_name: slug }))));
  }, [isPanelOpen]);

  const filtered = files.filter((file) =>
    (file.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedFile = files.find(
    (file) => `${file.display_name} (${file.relative_path})` === value
  );
  const categoryOptions = categories.length ? categories : mediaCategories.map((slug) => ({ slug, display_name: slug }));

  const selectFile = (file: RecordMap) => {
    onChange(`${file.display_name} (${file.relative_path})`);
    setIsPanelOpen(false);
  };

  const clearSelection = () => {
    onChange("");
  };

  const uploadFile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file") as File | null;
    
    // Client-side validation: enforce 10MB maximum document size
    const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file && file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setUploadMessage(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed size of 10 MB.`);
      setTimeout(() => setUploadMessage(""), 4000);
      return;
    }
    
    const result = await api.upload<RecordMap>("/files/upload", form);
    setUploadMessage("Uploaded.");
    event.currentTarget.reset();
    await onFileUploaded();
    selectFile(result);
    setShowUpload(false);
    setTimeout(() => setUploadMessage(""), 2000);
  };

  return (
    <div className="file-picker">
      {selectedFile ? (
        <div className="file-picker-selected">
          <FileText size={16} />
          <div>
            <strong>{selectedFile.display_name}</strong>
            <span>{selectedFile.file_type} · {selectedFile.relative_path}</span>
          </div>
          <button className="icon-button compact" type="button" onClick={clearSelection} title="Clear selection">
            <X size={14} />
          </button>
        </div>
      ) : value ? (
        <div className="file-picker-selected">
          <FileText size={16} />
          <div>
            <strong>{value}</strong>
            <span>Previously linked file</span>
          </div>
          <button className="icon-button compact" type="button" onClick={clearSelection} title="Clear selection">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          className="secondary"
          type="button"
          onClick={() => setIsPanelOpen(true)}
          style={{ width: "fit-content" }}
        >
          <Search size={14} /> Search
        </button>
      )}

      {isPanelOpen && createPortal(
        <div className="file-picker-backdrop" onClick={() => setIsPanelOpen(false)}>
          <div className="file-picker-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#2c3e50' }}>Select Document</h3>
              <button className="icon-button compact" type="button" onClick={() => setIsPanelOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="file-picker-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search uploaded documents..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </div>

            <div className="file-picker-list">
              {filtered.length === 0 ? (
                <p className="file-picker-empty">
                  {files.length === 0 ? "No documents uploaded yet." : "No matches found."}
                </p>
              ) : (
                filtered.map((file) => (
                  <button
                    className={`file-picker-item${value === `${file.display_name} (${file.relative_path})` ? " selected" : ""}`}
                    key={file.id}
                    type="button"
                    onClick={() => selectFile(file)}
                  >
                    <FileText size={14} />
                    <div>
                      <strong>{file.display_name}</strong>
                      <span>{file.file_type || "other"}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {uploadMessage ? <p className="inline-note">{uploadMessage}</p> : null}

            <button
              className="file-picker-upload-toggle"
              type="button"
              onClick={() => setShowUpload((current) => !current)}
            >
              {showUpload ? <X size={14} /> : <Upload size={14} />}
              {showUpload ? "Cancel upload" : "Upload new document"}
            </button>

            {showUpload ? (
              <form className="file-picker-upload-form" onSubmit={uploadFile}>
                <label className="field">
                  <span>Category</span>
                  <select name="category">
                    {categoryOptions.map((item) => <option key={item.slug} value={item.slug}>{item.display_name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>File</span>
                  <input name="file" type="file" required />
                </label>
                <label className="field">
                  <span>Notes</span>
                  <textarea name="notes" rows={2} />
                </label>
                <button className="primary full" type="submit">
                  <Plus size={16} /> Upload & select
                </button>
              </form>
            ) : null}
          </div>
        </div>,
        document.querySelector(".main-content") || document.body
      )}
    </div>
  );
}
