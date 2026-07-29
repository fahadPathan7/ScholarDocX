import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, AlertTriangle, CheckCircle2, HelpCircle, Trash2, AlertOctagon } from "lucide-react";
import "./dialog.css";

export type DialogKind = "info" | "warning" | "danger" | "success";
export type DialogType = "alert" | "confirm" | "prompt";

interface DialogState {
  isOpen: boolean;
  type: DialogType;
  message: string | ReactNode;
  title?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
  defaultValue?: string;
  kind?: DialogKind;
}

interface DialogContextProps {
  showAlert: (message: string | ReactNode, title?: string, kind?: DialogKind) => Promise<void>;
  showConfirm: (message: string | ReactNode, title?: string, kind?: DialogKind) => Promise<boolean>;
  showPrompt: (message: string | ReactNode, defaultValue?: string, title?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextProps | undefined>(undefined);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
};


/* ------------------------------------------------------------------ */
/*  Backdrop scoping (see AGENTS.md "Modal backdrop blur")             */
/*                                                                     */
/*  This dialog used a fixed, full-viewport backdrop, so its blur      */
/*  covered the TopBar and Sidebar as well as the work surface — the   */
/*  "over-blur" symptom AGENTS.md names. It now portals into           */
/*  `.main-content` and switches to an absolute backdrop, matching     */
/*  Modal.tsx. Where there is no `.main-content` — the login and       */
/*  splash screens — it falls back to the body and stays fixed, which  */
/*  is correct there because there is no chrome to keep sharp.         */
/* ------------------------------------------------------------------ */

function mainContent(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(".main-content");
}

const scopedToMain = () => Boolean(mainContent());

function renderDialogLayer(node: ReactNode) {
  const target = mainContent();
  return target ? createPortal(node, target) : node;
}

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: "alert",
    message: "",
  });

  // Automatically infer visual kind if not explicitly specified
  const inferKind = (type: DialogType, title?: string, message?: string | ReactNode): DialogKind => {
    if (type === "prompt") return "info";
    const searchStr = `${title || ""} ${typeof message === "string" ? message : ""}`.toLowerCase();
    
    if (
      searchStr.includes("delete") ||
      searchStr.includes("remove") ||
      searchStr.includes("revoke") ||
      searchStr.includes("clear") ||
      searchStr.includes("deactivate") ||
      searchStr.includes("reset") ||
      searchStr.includes("destroy") ||
      searchStr.includes("warning") ||
      searchStr.includes("danger") ||
      searchStr.includes("block")
    ) {
      return "danger";
    }

    if (
      searchStr.includes("invalid") ||
      searchStr.includes("duplicate") ||
      searchStr.includes("exist") ||
      searchStr.includes("failed") ||
      searchStr.includes("error") ||
      searchStr.includes("denied")
    ) {
      return "warning";
    }

    if (
      searchStr.includes("success") ||
      searchStr.includes("save") ||
      searchStr.includes("complete") ||
      searchStr.includes("create")
    ) {
      return "success";
    }

    return "info";
  };

  const showAlert = (message: string | ReactNode, title?: string, overrideKind?: DialogKind): Promise<void> => {
    return new Promise((resolve) => {
      const resolvedTitle = title || "Notice";
      const kind = overrideKind || inferKind("alert", resolvedTitle, message);
      setDialogState({
        isOpen: true,
        type: "alert",
        message,
        title: resolvedTitle,
        kind,
        onConfirm: () => {
          setDialogState((p) => ({ ...p, isOpen: false }));
          setTimeout(() => resolve(), 10);
        },
      });
    });
  };

  const showConfirm = (message: string | ReactNode, title?: string, overrideKind?: DialogKind): Promise<boolean> => {
    return new Promise((resolve) => {
      const resolvedTitle = title || "Confirm Action";
      const kind = overrideKind || inferKind("confirm", resolvedTitle, message);
      setDialogState({
        isOpen: true,
        type: "confirm",
        message,
        title: resolvedTitle,
        kind,
        onConfirm: () => {
          setDialogState((p) => ({ ...p, isOpen: false }));
          setTimeout(() => resolve(true), 10);
        },
        onCancel: () => {
          setDialogState((p) => ({ ...p, isOpen: false }));
          setTimeout(() => resolve(false), 10);
        },
      });
    });
  };

  const showPrompt = (message: string | ReactNode, defaultValue?: string, title?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const resolvedTitle = title || "Input Required";
      setDialogState({
        isOpen: true,
        type: "prompt",
        message,
        title: resolvedTitle,
        kind: "info",
        defaultValue: defaultValue || "",
        onConfirm: (val?: string) => {
          setDialogState((p) => ({ ...p, isOpen: false }));
          setTimeout(() => resolve(val || ""), 10);
        },
        onCancel: () => {
          setDialogState((p) => ({ ...p, isOpen: false }));
          setTimeout(() => resolve(null), 10);
        },
      });
    });
  };

  // Global keyboard shortcuts (Escape to close/cancel, Enter to confirm)
  useEffect(() => {
    if (!dialogState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dialogState.type === "confirm" || dialogState.type === "prompt") {
          dialogState.onCancel?.();
        } else {
          dialogState.onConfirm?.();
        }
      } else if (e.key === "Enter") {
        // Do not trigger global confirm if typing in prompt input
        if (dialogState.type !== "prompt") {
          e.preventDefault();
          dialogState.onConfirm?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogState]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (dialogState.type === "confirm" || dialogState.type === "prompt") {
        dialogState.onCancel?.();
      } else {
        dialogState.onConfirm?.();
      }
    }
  };

  const getIcon = () => {
    const kind = dialogState.kind || "info";
    const title = (dialogState.title || "").toLowerCase();
    const isDelete = title.includes("delete") || title.includes("remove") || title.includes("clear") || title.includes("revoke");
    
    if (dialogState.type === "prompt") {
      return <HelpCircle className="dialog-icon" size={24} />;
    }

    switch (kind) {
      case "danger":
        return isDelete ? (
          <Trash2 className="dialog-icon" size={24} />
        ) : (
          <AlertOctagon className="dialog-icon" size={24} />
        );
      case "warning":
        return <AlertTriangle className="dialog-icon" size={24} />;
      case "success":
        return <CheckCircle2 className="dialog-icon" size={24} />;
      case "info":
      default:
        return <Info className="dialog-icon" size={24} />;
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {dialogState.isOpen && renderDialogLayer(
        <div
          className={`custom-dialog-backdrop${scopedToMain() ? " scoped-main" : ""}`}
          onClick={handleBackdropClick}
        >
          <div
            className={`custom-dialog-panel slide-up dialog-kind-${dialogState.kind || "info"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="custom-dialog-body">
              <div className={`custom-dialog-icon-container ${dialogState.kind || "info"}`}>
                {getIcon()}
              </div>
              <div className="custom-dialog-text-content">
                <h3 className="custom-dialog-title">{dialogState.title}</h3>
                <div className="custom-dialog-message">{dialogState.message}</div>
                {dialogState.type === "prompt" && (
                  <input
                    type="text"
                    className="custom-dialog-input"
                    defaultValue={dialogState.defaultValue}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        dialogState.onConfirm?.((e.target as HTMLInputElement).value);
                      }
                    }}
                    autoFocus
                  />
                )}
              </div>
            </div>
            <div className="custom-dialog-actions">
              {(dialogState.type === "confirm" || dialogState.type === "prompt") && (
                <button
                  className="custom-dialog-btn secondary custom-dialog-cancel"
                  onClick={dialogState.onCancel}
                >
                  Cancel
                </button>
              )}
              <button
                className={`custom-dialog-btn primary custom-dialog-ok ${
                  dialogState.kind === "danger" ? "danger" : ""
                } ${dialogState.kind === "success" ? "success" : ""}`}
                onClick={() => {
                  if (dialogState.type === "prompt") {
                    const input = document.querySelector(".custom-dialog-input") as HTMLInputElement;
                    dialogState.onConfirm?.(input?.value);
                  } else {
                    dialogState.onConfirm?.();
                  }
                }}
              >
                {dialogState.type === "confirm"
                  ? dialogState.kind === "danger"
                    ? "Delete"
                    : "Confirm"
                  : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
