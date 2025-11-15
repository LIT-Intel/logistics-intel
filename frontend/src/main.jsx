// frontend/src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./styles/tokens.css";

if (typeof window !== "undefined") {
  const { pathname, hash, search } = window.location;
  if (!pathname || pathname === "/") {
    const target = new URL(window.location.href);
    target.pathname = "/search";
    window.location.replace(`${target.pathname}${target.search}${hash}`);
  } else if (pathname.endsWith("/index.html")) {
    const target = new URL(window.location.href);
    target.pathname = "/search";
    window.location.replace(`${target.pathname}${search}${hash}`);
  }
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </BrowserRouter>
);
