import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
export function AdminPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const root = document.getElementById('admin-view-root');
  if (!root) return null;
  return createPortal(children, root);
}

