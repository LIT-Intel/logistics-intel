// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CampaignKpiHero } from "../CampaignKpiHero";
import type { CampaignFunnel } from "../../types";

function f(over: Partial<CampaignFunnel> = {}): CampaignFunnel {
  return {
    enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, suppressed: 0,
    openRate: null, clickRate: null, replyRate: null, bounceRate: null, lastEventAt: null,
    ...over,
  };
}

describe("CampaignKpiHero", () => {
  afterEach(() => cleanup());

  it("renders 6 tile labels for a draft campaign", () => {
    render(<CampaignKpiHero status="draft" audienceCount={120} funnel={null} sparkData={[]} />);
    expect(screen.getByText(/AUDIENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SCHEDULED/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. OPEN RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. CLICK RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/EST. REPLY RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/ESTIMATED REACH/i)).toBeInTheDocument();
  });

  it("renders 6 real-metric labels for an active campaign with funnel data", () => {
    const funnel = f({ sent: 80, opened: 40, clicked: 8, replied: 4, bounced: 1, openRate: 50, clickRate: 10, replyRate: 5, bounceRate: 1.25 });
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={funnel} sparkData={[]} />);
    expect(screen.getByText(/AUDIENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/SENT/i)).toBeInTheDocument();
    expect(screen.getByText(/OPEN RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/CLICK RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/REPLY RATE/i)).toBeInTheDocument();
    expect(screen.getByText(/BOUNCE RATE/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("renders the Paused badge for paused status", () => {
    const funnel = f({ sent: 5 });
    render(<CampaignKpiHero status="paused" audienceCount={50} funnel={funnel} sparkData={[]} />);
    expect(screen.getByText(/Paused/i)).toBeInTheDocument();
  });

  it("shows audience em-dash when count is 0", () => {
    render(<CampaignKpiHero status="draft" audienceCount={0} funnel={null} sparkData={[]} />);
    const audienceLabel = screen.getByText(/AUDIENCE/i);
    const audienceTile = audienceLabel.closest("div");
    expect(audienceTile?.textContent).toContain("—");
  });
});
