/**
 * Regression test for the entitlements domain module.
 *
 * Locks in three properties of the post-2026-05-28 entitlements layer:
 *   1. We only ever call `get-entitlements` (the JWT-verified function).
 *      The deprecated `check-entitlements` must never be re-introduced.
 *   2. A successful response unwraps to the `entitlements` payload.
 *   3. An `ok: false` response from the edge function throws a typed
 *      `EdgeFunctionError`, not a silent null.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import { fetchEntitlementsSnapshot } from "./entitlements";
import { EdgeFunctionError } from "./_client";

describe("entitlements domain", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("calls get-entitlements, not the deprecated check-entitlements", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        entitlements: {
          plan: "free_trial",
          features: { search: true },
          limits: { command_center_saves_per_month: 10 },
          used: { command_center_saves_per_month: 3 },
        },
        org_id: null,
        user_id: "u-1",
      },
      error: null,
    });

    await fetchEntitlementsSnapshot();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fnName] = invokeMock.mock.calls[0]!;
    expect(fnName).toBe("get-entitlements");
    expect(fnName).not.toBe("check-entitlements");
  });

  it("unwraps the entitlements payload on success", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        entitlements: {
          plan: "growth",
          features: { search: true, command_center: true },
          limits: { command_center_saves_per_month: null },
          used: { command_center_saves_per_month: 12 },
        },
        org_id: "org-1",
        user_id: "u-1",
      },
      error: null,
    });

    const snap = await fetchEntitlementsSnapshot();
    expect(snap?.plan).toBe("growth");
    expect(snap?.features.search).toBe(true);
    expect(snap?.limits.command_center_saves_per_month).toBeNull();
  });

  it("throws EdgeFunctionError on ok=false", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      error: null,
    });

    await expect(fetchEntitlementsSnapshot()).rejects.toBeInstanceOf(
      EdgeFunctionError,
    );
  });

  it("throws EdgeFunctionError on transport error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error("network down"),
    });

    await expect(fetchEntitlementsSnapshot()).rejects.toBeInstanceOf(
      EdgeFunctionError,
    );
  });
});
