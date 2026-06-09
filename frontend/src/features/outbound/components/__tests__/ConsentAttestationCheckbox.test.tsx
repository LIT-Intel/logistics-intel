// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ConsentAttestationCheckbox } from "../ConsentAttestationCheckbox";

describe("ConsentAttestationCheckbox", () => {
  afterEach(() => cleanup());

  it("renders the attestation text + sender-guidelines link", () => {
    render(<ConsentAttestationCheckbox checked={false} onChange={() => {}} />);
    expect(screen.getByText(/consented to receive/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sender guidelines/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("google.com"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("calls onChange(true) when checkbox toggled on", () => {
    const onChange = vi.fn();
    render(<ConsentAttestationCheckbox checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange(false) when checkbox toggled off", () => {
    const onChange = vi.fn();
    render(<ConsentAttestationCheckbox checked={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("renders as checked when checked prop is true", () => {
    render(<ConsentAttestationCheckbox checked={true} onChange={() => {}} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
