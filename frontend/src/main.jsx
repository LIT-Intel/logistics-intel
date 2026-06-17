// frontend/src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpgradeModalProvider } from "./components/billing/UpgradeModal";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";
import "./styles/tokens.css";

// Init Sentry before anything else renders so the first uncaught error gets
// captured. No-op when VITE_SENTRY_DSN is unset (dev / preview / local).
initSentry();

if (typeof window !== "undefined") {
  const { pathname, hash, search } = window.location;
  if (!pathname || pathname === "/") {
    window.location.replace(`/app/dashboard${search}${hash}`);
  } else if (pathname.endsWith("/index.html")) {
    window.location.replace(`/app/dashboard${search}${hash}`);
  }
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <UpgradeModalProvider>
              <App />
            </UpgradeModalProvider>
          </QueryClientProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
