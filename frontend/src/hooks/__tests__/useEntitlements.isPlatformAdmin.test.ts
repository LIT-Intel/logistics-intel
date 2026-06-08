// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1" }, plan: "scale", orgRole: "owner" }),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/api/entitlements", () => ({
  fetchEntitlementsSnapshot: fetchMock,
}));

import { useEntitlements } from "../useEntitlements";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useEntitlements.isPlatformAdmin", () => {
  beforeEach(() => fetchMock.mockReset());

  it("surfaces isPlatformAdmin=true when snapshot includes it", async () => {
    fetchMock.mockResolvedValue({
      plan: "scale", features: {}, limits: {}, used: {},
      is_platform_admin: true,
    });
    const { result } = renderHook(() => useEntitlements(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isPlatformAdmin).toBe(true));
  });

  it("defaults isPlatformAdmin=false when snapshot omits the field", async () => {
    fetchMock.mockResolvedValue({
      plan: "scale", features: {}, limits: {}, used: {},
    });
    const { result } = renderHook(() => useEntitlements(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.isPlatformAdmin).toBe(false);
  });
});
