// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PersonaPanel } from "../PersonaPanel";

// baseProps must include EVERY required prop from PersonaPanelProps.
const baseProps: any = {
  audienceCount: 0,
  selectedCompanies: [],
  manualEmails: [],
  totalSavedCompanies: 290,
  personasResult: { state: "ok", rows: [] },
  selectedPersonaId: null,
  onSelectPersona: () => {},
  onOpenAudiencePicker: () => {},
  onOpenTemplates: () => {},
  onCreatePersona: () => {},
};

describe("PersonaPanel - manualEmails rendering", () => {
  afterEach(() => cleanup());

  it("renders manual-email chips in Sample box when no companies selected", () => {
    render(
      <PersonaPanel
        {...baseProps}
        audienceCount={2}
        manualEmails={[
          { email: "alice@example.com" },
          { email: "bob@example.com" },
        ]}
      />
    );
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("denominator tile reads 'N manual recipients' when manual-only", () => {
    render(
      <PersonaPanel
        {...baseProps}
        audienceCount={3}
        manualEmails={[
          { email: "a@b.com" },
          { email: "c@d.com" },
          { email: "e@f.com" },
        ]}
      />
    );
    expect(screen.getByText(/3 manual recipients/i)).toBeInTheDocument();
  });

  it("denominator tile reads 'N of M saved companies' when companies present", () => {
    render(
      <PersonaPanel
        {...baseProps}
        audienceCount={2}
        selectedCompanies={[
          { company_id: "c1", name: "Alpha" },
          { company_id: "c2", name: "Beta" },
        ]}
      />
    );
    expect(screen.getByText(/2 of 290/i)).toBeInTheDocument();
  });

  it("shows 'Pick recipients' label when empty", () => {
    render(<PersonaPanel {...baseProps} />);
    // 'Pick recipients' appears in the dark-tile denominator AND the button
    expect(screen.getAllByText(/Pick recipients/i).length).toBeGreaterThan(0);
  });
});
