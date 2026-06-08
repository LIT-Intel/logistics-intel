// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const useAdminScopeMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAdminScope", () => ({
  useAdminScope: useAdminScopeMock,
}));

import { AdminScopeToggle } from "../AdminScopeToggle";

describe("AdminScopeToggle", () => {
  beforeEach(() => useAdminScopeMock.mockReset());
  afterEach(() => cleanup());

  it("renders nothing when user is not a platform admin", () => {
    useAdminScopeMock.mockReturnValue({ scope: "org", setScope: vi.fn(), isPlatformAdmin: false });
    const { container } = render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the org name chip for platform admin in org scope", () => {
    useAdminScopeMock.mockReturnValue({ scope: "org", setScope: vi.fn(), isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    expect(screen.getByText(/Logistic Intel/)).toBeInTheDocument();
  });

  it("renders 'All Orgs (Admin)' chip in amber when scope=all", () => {
    useAdminScopeMock.mockReturnValue({ scope: "all", setScope: vi.fn(), isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    const chip = screen.getByText(/All Orgs/);
    expect(chip).toBeInTheDocument();
    expect(chip.closest("button")?.className).toMatch(/amber/);
  });

  it("calls setScope('all') when admin clicks the 'All Orgs' menu option", () => {
    const setScope = vi.fn();
    useAdminScopeMock.mockReturnValue({ scope: "org", setScope, isPlatformAdmin: true });
    render(<AdminScopeToggle currentOrgName="Logistic Intel" />);
    fireEvent.click(screen.getByRole("button", { name: /Logistic Intel/ }));
    fireEvent.click(screen.getByText(/All Orgs/));
    expect(setScope).toHaveBeenCalledWith("all");
  });
});
