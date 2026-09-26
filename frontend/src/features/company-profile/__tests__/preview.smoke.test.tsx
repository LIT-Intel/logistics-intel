// @vitest-environment happy-dom
/**
 * Smoke-render of the PUBLIC /preview/company-profile-v2 page — catches
 * runtime crashes (not just type errors) before the link ships. Leaflet is
 * stubbed (jsdom has no real layout engine); everything else renders real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Infinite chainable stub: any property access / call returns the chain again.
// Defined inside the factory — vi.mock() is hoisted above imports.
vi.mock("leaflet", () => {
  const chain: any = new Proxy(function () {} as any, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => "" : chain),
    apply: () => chain,
    set: () => true,
  });
  return { __esModule: true, default: chain };
});
vi.mock("leaflet/dist/leaflet.css", () => ({ default: {} }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompanyProfileV2Preview from "@/pages/CompanyProfileV2Preview";

// jsdom lacks ResizeObserver (LaneMap uses it for refits)
(globalThis as any).ResizeObserver =
  (globalThis as any).ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

const renderPage = () => {
  // mirrors main.jsx: QueryClientProvider wraps the whole app incl. /preview
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/preview/company-profile-v2"]}>
        <CompanyProfileV2Preview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("CompanyProfileV2Preview (public demo)", () => {
  // globals:false in vitest.config disables testing-library auto-cleanup
  afterEach(cleanup);

  it("renders the Overview with data-derived widgets and no crash", async () => {
    renderPage();
    expect(screen.getByText(/Design preview/i)).toBeTruthy();
    // waits for useProfileState init (ready flips after dataset adoption)
    expect(await screen.findByText(/Key metrics/i)).toBeTruthy();
    expect(await screen.findByText(/Shipment history/i)).toBeTruthy();
    expect((await screen.findAllByText(/bills of lading/i)).length).toBeGreaterThan(0);
  });

  it("switches to Trade Lanes and Lane History without crashing", async () => {
    renderPage();
    await screen.findByText(/Key metrics/i);
    fireEvent.click(screen.getByRole("tab", { name: /Trade Lanes/i }));
    expect(await screen.findByText(/active lanes/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Lane History/i }));
    expect(await screen.findByText(/Month-by-month volume/i)).toBeTruthy();
  });
});
