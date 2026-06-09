// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LaunchButton } from "../LaunchButton";

describe("LaunchButton", () => {
  afterEach(() => cleanup());

  it("calls onLaunch when enabled and clicked", () => {
    const onLaunch = vi.fn();
    render(<LaunchButton onLaunch={onLaunch} canLaunch hasTestSendOccurred />);
    fireEvent.click(screen.getByRole("button", { name: /Launch/i }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it("does not call onLaunch when disabled", () => {
    const onLaunch = vi.fn();
    render(
      <LaunchButton
        onLaunch={onLaunch}
        canLaunch={false}
        disabledReason="Save the campaign first."
        hasTestSendOccurred
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Launch/i }));
    expect(onLaunch).not.toHaveBeenCalled();
  });

  it("renders 'Launching…' when launching is true", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch launching hasTestSendOccurred />);
    expect(screen.getByText(/Launching…/i)).toBeInTheDocument();
  });

  it("renders the pre-launch nudge when no test send has occurred", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch hasTestSendOccurred={false} />);
    expect(screen.getByText(/haven.t tested/i)).toBeInTheDocument();
  });

  it("does NOT render the pre-launch nudge once a test send has occurred", () => {
    render(<LaunchButton onLaunch={() => {}} canLaunch hasTestSendOccurred />);
    expect(screen.queryByText(/haven.t tested/i)).not.toBeInTheDocument();
  });
});
