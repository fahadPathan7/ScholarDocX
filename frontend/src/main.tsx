import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DialogProvider } from "./components/DialogProvider";
import "./styles.css";
import "./visual-refresh.css";
import "./documents-refresh.css";
import "./about-refresh.css";
import "./sheet-table-polish.css";
import { installHorizontalDragScroll } from "./lib/horizontalDragScroll";

import { AuthProvider } from "./contexts/AuthContext";
import { UsageProvider } from "./contexts/UsageContext";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { FullScreenSheet } from "./components/FullScreenSheet";

installHorizontalDragScroll();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <UsageProvider>
        <DialogProvider>
          <BrowserRouter>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/sheet/fullscreen" element={<FullScreenSheet />} />
              <Route path="/*" element={<App />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DialogProvider>
      </UsageProvider>
    </AuthProvider>
  </React.StrictMode>
);
