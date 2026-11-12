import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DialogProvider } from "./components/DialogProvider";
import "./styles.css";
import "./visual-refresh.css";
import "./documents-refresh.css";
import "./about-refresh.css";
import "./about-page.css";
import "./sheet-table-polish.css";
import "./cell-formatting.css";
import "./responsive.css";
import "./app-brand.css";
import "./tools-polish.css";
import "./projects-polish.css";
import "./dashboard-polish.css";
import "./notes-docs-polish.css";
import "./profile-polish.css";
import "./games-polish.css";
import "./admin-polish.css";
import "./header-actions-polish.css";
import { migrateLegacyStorageKeys } from "./lib/migrateStorageKeys";
import { installPageViewTracking } from "./lib/analytics";

import { AuthProvider } from "./contexts/AuthContext";
import { UsageProvider } from "./contexts/UsageContext";
import { TokenEconomyProvider } from "./contexts/TokenEconomyContext";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { AuthCompletePage } from "./components/AuthCompletePage";
import { LandingPage } from "./components/LandingPage";
import { FullScreenSheet } from "./components/FullScreenSheet";

import { ErrorBoundary } from "./components/ErrorBoundary";

migrateLegacyStorageKeys();
// Google Analytics via GTM (SCHOLARDOCX-0257): production only, and never on
// a URL carrying a login token or ids (see lib/analytics.ts).
installPageViewTracking();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <TokenEconomyProvider>
        <UsageProvider>
        <DialogProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth-complete" element={<AuthCompletePage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/sheet/fullscreen" element={<FullScreenSheet />} />
                <Route path="/*" element={<App />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DialogProvider>
        </UsageProvider>
        </TokenEconomyProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
