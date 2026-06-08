// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";

const getCrmCampaignsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  getCrmCampaigns: getCrmCampaignsMock,
}));

const fetchMetricsMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/outbound/api/campaignMetrics", () => ({
  fetchCampaignMetricsBatch: fetchMetricsMock,
}));

import { useCampaigns } from "../useCampaigns";

describe("useCampaigns — metrics merge", () => {
  beforeEach(() => {
    getCrmCampaignsMock.mockReset();
    fetchMetricsMock.mockReset();
  });
  afterEach(() => cleanup());

  it("populates funnel from metrics RPC for each campaign", async () => {
    getCrmCampaignsMock.mockResolvedValue([
      { id: "c1", name: "A", status: "active" },
      { id: "c2", name: "B", status: "draft" },
    ]);
    fetchMetricsMock.mockResolvedValue(new Map([
      ["c1", {
        enrolled: 10, sent: 8, opened: 4, clicked: 2, replied: 1, bounced: 0, suppressed: 0,
        openRate: 50, clickRate: 25, replyRate: 12.5, bounceRate: 0, lastEventAt: "2026-06-05T12:00:00Z",
      }],
    ]));

    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.campaigns).toHaveLength(2);
    expect(result.current.campaigns[0].funnel).toEqual(expect.objectContaining({
      sent: 8, opened: 4, openRate: 50,
    }));
    expect(result.current.campaigns[1].funnel).toBeNull();
  });

  it("derives health=good for a healthy campaign", async () => {
    getCrmCampaignsMock.mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    fetchMetricsMock.mockResolvedValue(new Map([
      ["c1", {
        enrolled: 100, sent: 80, opened: 40, clicked: 8, replied: 4, bounced: 1, suppressed: 0,
        openRate: 50, clickRate: 10, replyRate: 5, bounceRate: 1.25, lastEventAt: null,
      }],
    ]));
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns[0].health).toBe("good");
  });

  it("derives health=attention for high bounce rate", async () => {
    getCrmCampaignsMock.mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    fetchMetricsMock.mockResolvedValue(new Map([
      ["c1", {
        enrolled: 100, sent: 80, opened: 4, clicked: 0, replied: 0, bounced: 6, suppressed: 0,
        openRate: 5, clickRate: 0, replyRate: 0, bounceRate: 7.5, lastEventAt: null,
      }],
    ]));
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns[0].health).toBe("attention");
  });

  it("survives RPC failure — campaigns still render with null funnel", async () => {
    getCrmCampaignsMock.mockResolvedValue([{ id: "c1", name: "A", status: "active" }]);
    fetchMetricsMock.mockResolvedValue(new Map()); // empty on failure
    const { result } = renderHook(() => useCampaigns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.campaigns).toHaveLength(1);
    expect(result.current.campaigns[0].funnel).toBeNull();
  });
});
