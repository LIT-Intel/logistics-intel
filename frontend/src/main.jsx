// frontend/src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "./auth/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
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

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={clerkPubKey}
        signInUrl="/login"
        signUpUrl="/signup"
        afterSignInUrl="/app/dashboard"
        afterSignUpUrl="/app/dashboard"
      >
        <BrowserRouter>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </AuthProvider>
        </BrowserRouter>
      </ClerkProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
