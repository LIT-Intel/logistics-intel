// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useEntitlements", () => ({
  useEntitlements: useEntitlementsMock,
}));

import { useAdminScope } from "../useAdminScope";

describe("useAdminScope", () => {
  beforeEach(() => {
    localStorage.clear();
    useEntitlementsMock.mockReset();
  });

  it("defaults to 'org' for a regular user", () => {
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("defaults to 'org' for a platform admin who never toggled", () => {
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("respects 'all' for a platform admin who toggled", () => {
    localStorage.setItem("lit.adminScope", "all");
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("all");
  });

  it("ignores 'all' from localStorage for a non-admin (defensive)", () => {
    localStorage.setItem("lit.adminScope", "all");
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    expect(result.current.scope).toBe("org");
  });

  it("setScope persists to localStorage", () => {
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: true });
    const { result } = renderHook(() => useAdminScope());
    act(() => result.current.setScope("all"));
    expect(localStorage.getItem("lit.adminScope")).toBe("all");
    expect(result.current.scope).toBe("all");
  });

  it("setScope to 'all' for non-admin is no-op", () => {
    useEntitlementsMock.mockReturnValue({ isPlatformAdmin: false });
    const { result } = renderHook(() => useAdminScope());
    act(() => result.current.setScope("all"));
    expect(localStorage.getItem("lit.adminScope")).toBe(null);
    expect(result.current.scope).toBe("org");
  });
});
