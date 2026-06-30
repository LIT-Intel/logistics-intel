"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { Play, X } from "lucide-react";

const PULSE_EXPLORER_EMBED_URL = "https://www.youtube.com/embed/a9FhnCW89wY";

type PulseVideoButtonProps = {
  children?: ReactNode;
  className?: string;
  label?: string;
  style?: CSSProperties;
};

export function PulseVideoButton({
  children,
  className,
  label = "Watch the Demo",
  style,
}: PulseVideoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        aria-label="Watch Pulse Explorer tutorial video"
        className={className}
        onClick={() => setIsOpen(true)}
        style={style}
      >
        {children ?? (
          <>
            <Play size={16} fill="currentColor" />
            {label}
          </>
        )}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(2, 6, 23, 0.82)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              borderRadius: 18,
              overflow: "hidden",
              background: "#020617",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 36px 100px rgba(0,0,0,0.38)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                justifyContent: "space-between",
                padding: "14px 16px",
                color: "#fff",
              }}
            >
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                Pulse Explorer Tutorial
              </h2>
              <button
                type="button"
                aria-label="Close video"
                onClick={() => setIsOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  background: "rgba(255,255,255,0.08)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ aspectRatio: "16 / 9", background: "#000" }}>
              <iframe
                title="Pulse Explorer Tutorial"
                src={`${PULSE_EXPLORER_EMBED_URL}?rel=0&modestbranding=1`}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
