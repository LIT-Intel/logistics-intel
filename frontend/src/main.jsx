// frontend/src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";
import "./styles/tokens.css";

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
            <App />
          </QueryClientProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
