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

describe("CampaignKpiHero — brand tones", () => {
  afterEach(() => cleanup());

  it("Open Rate tile uses blue tone", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, opened: 40, openRate: 50 })} sparkData={[]} />);
    expect(screen.getByText(/OPEN RATE/i).closest("div")?.className).toMatch(/blue/);
  });
  it("Click Rate tile uses indigo tone", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, clicked: 8, clickRate: 10 })} sparkData={[]} />);
    expect(screen.getByText(/CLICK RATE/i).closest("div")?.className).toMatch(/indigo/);
  });
  it("Reply Rate tile uses emerald tone", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, replied: 4, replyRate: 5 })} sparkData={[]} />);
    expect(screen.getByText(/REPLY RATE/i).closest("div")?.className).toMatch(/emerald/);
  });
  it("Bounce Rate tile uses neutral when rate <= 5%", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, bounced: 2, bounceRate: 2.5 })} sparkData={[]} />);
    expect(screen.getByText(/BOUNCE RATE/i).closest("div")?.className).not.toMatch(/amber|rose/);
  });
  it("Bounce Rate flips amber when > 5%", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, bounced: 5, bounceRate: 6.25 })} sparkData={[]} />);
    expect(screen.getByText(/BOUNCE RATE/i).closest("div")?.className).toMatch(/amber/);
  });
  it("Bounce Rate flips rose when > 10%", () => {
    render(<CampaignKpiHero status="active" audienceCount={100} funnel={f({ sent: 80, bounced: 10, bounceRate: 12.5 })} sparkData={[]} />);
    expect(screen.getByText(/BOUNCE RATE/i).closest("div")?.className).toMatch(/rose/);
  });
});
