// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const useEngagementRecipientsMock = vi.hoisted(() => vi.fn());
const useRecipientLinkClicksMock = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useEngagementRecipients", () => ({
  useEngagementRecipients: useEngagementRecipientsMock,
  useRecipientLinkClicks: useRecipientLinkClicksMock,
}));

import { EngagementDrillIn } from "../EngagementDrillIn";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("EngagementDrillIn", () => {
  beforeEach(() => {
    useEngagementRecipientsMock.mockReset();
    useRecipientLinkClicksMock.mockReset();
    useRecipientLinkClicksMock.mockReturnValue({ data: [], isLoading: false });
  });
  afterEach(() => cleanup());

  it("renders nothing when open=false", () => {
    useEngagementRecipientsMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(
      wrap(
        <EngagementDrillIn
          open={false}
          onClose={() => {}}
          campaignId="c1"
          eventType="clicked"
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders loading state when the recipients query is pending", () => {
    useEngagementRecipientsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(
      wrap(
        <EngagementDrillIn
          open={true}
          onClose={() => {}}
          campaignId="c1"
          eventType="clicked"
        />,
      ),
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders empty state when no recipients", () => {
    useEngagementRecipientsMock.mockReturnValue({ data: [], isLoading: false });
    render(
      wrap(
        <EngagementDrillIn
          open={true}
          onClose={() => {}}
          campaignId="c1"
          eventType="clicked"
        />,
      ),
    );
    expect(screen.getByText(/no.*recipients/i)).toBeInTheDocument();
  });

  it("renders one row per recipient with email and event count", () => {
    useEngagementRecipientsMock.mockReturnValue({
      data: [
        {
          recipient_id: "r1",
          recipient_email: "anna@example.com",
          display_name: "anna@example.com",
          event_count: 3,
          first_event_at: "2026-06-01T12:00:00Z",
          last_event_at: "2026-06-05T15:30:00Z",
        },
        {
          recipient_id: "r2",
          recipient_email: "bob@example.com",
          display_name: "bob@example.com",
          event_count: 1,
          first_event_at: "2026-06-02T08:00:00Z",
          last_event_at: "2026-06-02T08:00:00Z",
        },
      ],
      isLoading: false,
    });
    render(
      wrap(
        <EngagementDrillIn
          open={true}
          onClose={() => {}}
          campaignId="c1"
          eventType="clicked"
        />,
      ),
    );
    expect(screen.getAllByText("anna@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bob@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    useEngagementRecipientsMock.mockReturnValue({ data: [], isLoading: false });
    const onClose = vi.fn();
    render(
      wrap(
        <EngagementDrillIn
          open={true}
          onClose={onClose}
          campaignId="c1"
          eventType="clicked"
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
