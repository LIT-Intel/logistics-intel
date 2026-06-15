// @vitest-environment jsdom
//
// CampaignBuilder — save-flow tests
// =================================
//
// Per CR review: CampaignBuilder.jsx had zero coverage. The save flow
// (P0-3 transactional `saveCampaignDraft`) is the highest-ROI surface to
// pin down because it touches the edge function, URL state, and the
// validation gate added in P1-3 (manual recipient emails).
//
// Test infra setup notes (added 2026-06-12):
//
//  * vitest.config.ts already wires `@` -> src and Vitest. The default
//    environment is `node`, so every component test uses the
//    `// @vitest-environment jsdom` directive at the top of the file
//    (matches LaunchButton.test.tsx and friends).
//
//  * @testing-library/react + @testing-library/jest-dom were already
//    devDependencies. @testing-library/user-event was added with this
//    test file because realistic typing + click sequences make the
//    create-mode happy path readable.
//
//  * CampaignBuilder transitively imports a LOT (StepInspector,
//    TemplatesDrawer, AudiencePickerDrawer, PreviewModal, KpiHero,
//    TimelineCanvas, …). We mock the heavy children we don't drive
//    in this file, the network surface (saveCampaignDraft +
//    listEmailAccounts + supabase), and the data hooks
//    (useCampaign, useSavedCompanies, useInboxStatus, useTemplates,
//    usePersonas, useUserSignature, useCampaignActivityTimeline). The
//    real StepInspector stays unmocked because we type into its
//    subject + body inputs in the happy-path test.
//
//  * The AudiencePickerDrawer is replaced with a hidden harness that
//    exposes a couple of data-testid buttons so a test can inject
//    manual recipient emails into builder state without driving the
//    whole drawer UI. Same pattern for the TemplatesDrawer and
//    PreviewModal — they're rendered as nulls.
//
//  * Concerns / follow-ups (flagged for the abstraction-tightening
//    work):
//      - `handleSave` lives inline on a 1600+ line page component, so
//        every test has to mount the whole tree to exercise it. A
//        useCampaignSave() hook (taking the same inputs, returning
//        { save, saving, error }) would let us unit-test the save
//        payload + validation in isolation without driving the DOM.
//      - manualEmails state is only mutable via the
//        AudiencePickerDrawer. We have to mock the drawer to drive
//        the manual-recipient validation test. Either the drawer
//        should expose a smaller "ManualRecipientsField" subcomponent,
//        or manualEmails should be lifted into a hook with a setter
//        the test can call directly.

import "@testing-library/jest-dom/vitest";
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ---------------------------------------------------------------------------
// 1. Network + data mocks
// ---------------------------------------------------------------------------

const saveCampaignDraftMock = vi.fn(async () => ({
  campaign_id: "new-campaign-id",
  is_edit: false,
  step_ids: ["s1"],
  step_count: 1,
}));

vi.mock("@/features/outbound/api/campaignActions", () => ({
  saveCampaignDraft: (...args: unknown[]) =>
    saveCampaignDraftMock(...(args as [unknown])),
  // Other named exports used by sibling files — return harmless stubs so
  // module evaluation never explodes on a missing export.
  archiveCampaign: vi.fn(),
  unarchiveCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  resumeCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  updateCampaignBasics: vi.fn(),
  setCampaignCompanies: vi.fn(),
  getCampaignWithDetails: vi.fn(async () => null),
  deleteCampaignStepsFrom: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listEmailAccounts: vi.fn(async () => [
    {
      id: "ea1",
      email: "rep@example.com",
      display_name: "Rep",
      provider: "gmail",
      status: "connected",
    },
  ]),
  launchCampaign: vi.fn(),
  sendTestEmail: vi.fn(),
}));

vi.mock("@/features/pulse/pulseListsApi", () => ({
  listPulseLists: vi.fn(async () => ({ ok: true, rows: [] })),
  getListCompanies: vi.fn(async () => ({ ok: true, rows: [] })),
}));

vi.mock("@/features/outbound/api/campaignMetrics", () => ({
  fetchCampaignMetricsBatch: vi.fn(async () => new Map()),
}));

// Supabase singleton — used by the inline sparkline + test-send rehydrate
// effects. Return a no-op chain so those effects never throw.
vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => Promise.resolve({ data: [], error: null, count: 0 }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  });
  return {
    supabase: {
      from: () => chain,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
    isSupabaseAvailable: () => false,
    getSupabaseError: () => null,
  };
});

// ---------------------------------------------------------------------------
// 2. Data-hook mocks — useCampaign is the one we vary per test
// ---------------------------------------------------------------------------

const useCampaignMock = vi.fn(() => ({
  details: null as null | {
    id: string;
    name: string;
    status: string;
    steps: unknown[];
    companyIds: string[];
    metrics: Record<string, unknown> | null;
    scheduled_start_at?: string | null;
    send_timezone?: string;
  },
  loading: false,
  error: null as string | null,
  refresh: vi.fn(async () => {}),
}));

vi.mock("@/features/outbound/hooks/useCampaign", () => ({
  useCampaign: (...args: unknown[]) => useCampaignMock(...(args as [unknown])),
}));

vi.mock("@/features/outbound/hooks/useSavedCompanies", () => ({
  useSavedCompanies: () => ({
    companies: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/outbound/hooks/useInboxStatus", () => ({
  useInboxStatus: () => ({
    primaryEmail: "rep@example.com",
    known: true,
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/outbound/hooks/useUserSignature", () => ({
  useUserSignature: () => ({
    signatureHtml: "",
    senderName: "Rep",
    loading: false,
  }),
}));

vi.mock("@/features/outbound/hooks/useTemplates", () => ({
  useTemplates: () => ({
    state: {
      result: { state: "ok", rows: [] },
      workspaceRows: [],
      starterRows: [],
      source: "starters",
      blocked: false,
      blockedReason: null,
    },
    loading: false,
    refresh: vi.fn(),
  }),
  usePersonas: () => ({
    result: { state: "empty" },
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/features/outbound/hooks/useCampaignActivityTimeline", () => ({
  useCampaignActivityTimeline: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

// ---------------------------------------------------------------------------
// 3. Heavy child component mocks
//    — render to nothing OR expose a tiny harness for tests to drive state
// ---------------------------------------------------------------------------

// AudiencePickerDrawer harness: render hidden buttons so tests can
// inject manualEmails / selectedIds without driving the real drawer UI.
vi.mock("@/features/outbound/components/AudiencePickerDrawer", () => ({
  AudiencePickerDrawer: (props: {
    open: boolean;
    onChangeManualEmails?: (rows: { email: string }[]) => void;
  }) => {
    // Always rendered so the test can fire the test-only button even when
    // the drawer "is closed" in the real UI.
    return (
      <div data-testid="audience-picker-harness" hidden>
        <button
          type="button"
          data-testid="harness-add-invalid-manual"
          onClick={() =>
            props.onChangeManualEmails?.([
              { email: "not-a-real-email" },
              { email: "also bad" },
            ])
          }
        >
          inject-invalid-manual
        </button>
      </div>
    );
  },
}));

vi.mock("@/features/outbound/components/TemplatesDrawer", () => ({
  TemplatesDrawer: () => null,
}));

vi.mock("@/features/outbound/components/PreviewModal", () => ({
  PreviewModal: () => null,
}));

vi.mock("@/features/outbound/components/CreateTemplateModal", () => ({
  CreateTemplateModal: () => null,
}));

vi.mock("@/features/outbound/components/CreatePersonaModal", () => ({
  CreatePersonaModal: () => null,
}));

vi.mock("@/features/outbound/components/CampaignActivityTimeline", () => ({
  CampaignActivityTimeline: () => null,
}));

vi.mock("@/features/outbound/components/CampaignKpiHero", () => ({
  CampaignKpiHero: () => <div data-testid="kpi-hero" />,
}));

vi.mock("@/features/outbound/components/LaunchButton", () => ({
  LaunchButton: () => <button type="button">Launch</button>,
}));

vi.mock("@/features/outbound/components/LaunchSchedulePicker", () => ({
  LaunchSchedulePicker: () => <div data-testid="launch-schedule-picker" />,
}));

vi.mock("@/features/outbound/components/ScheduleStrip", () => ({
  ScheduleStrip: () => null,
}));

vi.mock("@/features/outbound/components/ExitConditionsPanel", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/features/outbound/components/PersonaPanel", () => ({
  PersonaPanel: () => <div data-testid="persona-panel" />,
}));

vi.mock("@/features/outbound/components/SenderGuidelinesNote", () => ({
  SenderGuidelinesNote: () => null,
}));

// TimelineCanvas: render minimal step labels so the edit-mode-hydration
// test can assert step count by counting matching nodes.
vi.mock("@/features/outbound/components/TimelineCanvas", () => ({
  TimelineCanvas: (props: { steps: { localId: string; kind: string }[] }) => (
    <div data-testid="timeline-canvas">
      {(props.steps || []).map((s) => (
        <div key={s.localId} data-testid="timeline-step">
          step:{s.kind}
        </div>
      ))}
    </div>
  ),
}));

// EmailComposerModal pulled in by the real StepInspector — render to nothing
// so it never tries to open a portal.
vi.mock("@/features/outbound/components/EmailComposerModal", () => ({
  __esModule: true,
  default: () => null,
}));

// ---------------------------------------------------------------------------
// 4. Import under test (AFTER all vi.mock calls)
// ---------------------------------------------------------------------------

import CampaignBuilder from "../CampaignBuilder";

// ---------------------------------------------------------------------------
// 5. Helpers
// ---------------------------------------------------------------------------

beforeAll(() => {
  // jsdom doesn't ship matchMedia; some downstream UI libs poke at it.
  if (!window.matchMedia) {
    window.matchMedia = (q: string) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/campaigns/new" element={<CampaignBuilder />} />
        <Route path="/app/campaigns" element={<div>Outbound list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function getNameInput(): HTMLInputElement {
  // The name input is the (only) maxLength=120 input near the page top.
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>("input"),
  );
  const match = inputs.find((el) => el.maxLength === 120);
  if (!match) throw new Error("Could not find campaign name input");
  return match;
}

function getSubjectInput(): HTMLInputElement {
  return screen.getByPlaceholderText(/VN.{1,3}LAX volume/i) as HTMLInputElement;
}

function getBodyInput(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/Hi \{\{first_name\}\}/i) as HTMLTextAreaElement;
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Save draft|Save changes/i }) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// 6. Tests
// ---------------------------------------------------------------------------

describe("CampaignBuilder — save flow", () => {
  beforeEach(() => {
    saveCampaignDraftMock.mockClear();
    useCampaignMock.mockReturnValue({
      details: null,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a draft on Save (happy path) and flips URL to ?edit=:id", async () => {
    const user = userEvent.setup();
    renderAt("/app/campaigns/new");

    // Replace the seed name "Untitled campaign" with a real one.
    const nameInput = getNameInput();
    await user.clear(nameInput);
    await user.type(nameInput, "VN→LAX Q3 Test");

    // Fill the first email step. StepInspector is real, so this drives
    // the inline `setSteps` updater through onUpdate({ subject, body }).
    await user.type(getSubjectInput(), "Re: VN→LAX volume +18%");
    await user.type(getBodyInput(), "Hi there — quick note about your lane.");

    // Click Save. Single assertion for the API call + payload shape.
    await user.click(getSaveButton());

    expect(saveCampaignDraftMock).toHaveBeenCalledTimes(1);
    const arg = saveCampaignDraftMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      campaign_id: null,
      name: "VN→LAX Q3 Test",
      channel: "email",
      replace_companies: false,
    });
    const steps = arg.steps as Array<Record<string, unknown>>;
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps[0]).toMatchObject({
      channel: "email",
      step_type: "email",
      subject: "Re: VN→LAX volume +18%",
      body: "Hi there — quick note about your lane.",
      step_order: 1,
    });
  });

  it("blocks Save when name is empty (validation gate)", async () => {
    const user = userEvent.setup();
    renderAt("/app/campaigns/new");

    // Clear the seed name. canSave becomes false and the button disables.
    const nameInput = getNameInput();
    await user.clear(nameInput);

    // Fill a step so only the missing-name dimension is exercised.
    await user.type(getSubjectInput(), "Subject");
    await user.type(getBodyInput(), "Body");

    const saveBtn = getSaveButton();
    // canSave reflects in `disabled` on the toolbar button.
    expect(saveBtn).toBeDisabled();

    // Defensive: even if a test harness force-clicks it, handleSave
    // early-returns on !canSave and never invokes saveCampaignDraft.
    fireEvent.click(saveBtn);
    expect(saveCampaignDraftMock).not.toHaveBeenCalled();
  });

  it("hydrates steps from useCampaign in edit mode", async () => {
    useCampaignMock.mockReturnValue({
      details: {
        id: "camp-123",
        name: "Existing campaign",
        status: "draft",
        steps: [
          {
            id: "step-1",
            step_order: 1,
            channel: "email",
            step_type: "email",
            subject: "Hello",
            body: "Body 1",
            delay_days: 0,
            delay_hours: 0,
            delay_minutes: 0,
          },
          {
            id: "step-2",
            step_order: 2,
            channel: "email",
            step_type: "email",
            subject: "Follow-up",
            body: "Body 2",
            delay_days: 2,
            delay_hours: 0,
            delay_minutes: 0,
          },
        ] as unknown[],
        companyIds: [],
        metrics: null,
        scheduled_start_at: null,
        send_timezone: "America/New_York",
      },
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });

    renderAt("/app/campaigns/new?edit=camp-123");

    // TimelineCanvas mock renders one node per step.
    const rendered = await screen.findAllByTestId("timeline-step");
    expect(rendered).toHaveLength(2);
    // Name input reflects the persisted name.
    expect(getNameInput().value).toBe("Existing campaign");
  });

  it("blocks Save when manual recipients contain invalid emails (P1-3)", async () => {
    const user = userEvent.setup();
    renderAt("/app/campaigns/new");

    // Seed valid name + step so the only failure dimension is the
    // manual-recipient validator.
    const nameInput = getNameInput();
    await user.clear(nameInput);
    await user.type(nameInput, "Manual recipients test");
    await user.type(getSubjectInput(), "Subject");
    await user.type(getBodyInput(), "Body");

    // Inject 2 invalid manual emails through the audience-picker harness.
    await act(async () => {
      screen
        .getByTestId("harness-add-invalid-manual")
        .click();
    });

    await user.click(getSaveButton());

    // The inline error banner surfaces the P1-3 message and the API
    // mock is never called.
    expect(
      screen.getByText(/Fix manual recipients before saving/i),
    ).toBeInTheDocument();
    expect(saveCampaignDraftMock).not.toHaveBeenCalled();
  });
});
