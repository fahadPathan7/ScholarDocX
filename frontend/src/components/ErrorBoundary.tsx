import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: "24px",
          textAlign: "center",
          backgroundColor: "#f8fafc"
        }}>
          <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: "16px" }} />
          <h1 style={{ marginBottom: "8px", color: "#0f172a" }}>Something went wrong</h1>
          <p style={{ color: "#64748b", marginBottom: "24px", maxWidth: "400px" }}>
            An unexpected error occurred in this section of the application. The error has been logged.
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                backgroundColor: "#0ea5e9",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              <RefreshCcw size={16} />
              Reload Page
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                backgroundColor: "white",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500
              }}
            >
              Try Again
            </button>
          </div>
          {this.state.error && (
            <pre style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "#f1f5f9",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#334155",
              maxWidth: "600px",
              overflowX: "auto",
              textAlign: "left"
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
