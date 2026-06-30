import { FileText, Bookmark, Smartphone, Download, Mail } from "lucide-react";

export function CapabilityBand() {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="mx-auto px-8" style={{ maxWidth: 1240 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {/* PDF */}
          <div
            className="card-glossy"
            style={{
              padding: 28,
              background: "linear-gradient(180deg,#fff,var(--amber-tint))",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "#fff",
                border: "1px solid rgba(15,23,42,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} color="#b45309" />
            </div>
            <h3 className="display-sm" style={{ fontSize: 19, marginTop: 16 }}>
              Branded PDF reports
            </h3>
            <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}>
              Turn any view into a client-ready report — download instantly or
              email via Resend.
            </p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  background: "var(--ink-900, #0b1220)",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: 10,
                }}
              >
                <Download size={13} />
                Download
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  background: "#fff",
                  color: "var(--ink-700, #1e293b)",
                  border: "1px solid rgba(15,23,42,0.08)",
                  padding: "8px 14px",
                  borderRadius: 10,
                }}
              >
                <Mail size={13} />
                Email report
              </span>
            </div>
          </div>

          {/* Saved views */}
          <div
            className="card-glossy"
            style={{
              padding: 28,
              background: "linear-gradient(180deg,#fff,var(--emerald-tint))",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "#fff",
                border: "1px solid rgba(15,23,42,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bookmark size={20} color="#15803d" />
            </div>
            <h3 className="display-sm" style={{ fontSize: 19, marginTop: 16 }}>
              Saved views
            </h3>
            <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}>
              Saves filters + selection + map zoom — not the companies. Reload
              any time from the sidebar.
            </p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              {[
                "Southeast manufacturers > 5k TEU",
                "Vulnerable automotive · West Coast",
              ].map((v) => (
                <div
                  key={v}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 8,
                    padding: "8px 11px",
                    fontSize: 12.5,
                    color: "var(--ink-700, #1e293b)",
                  }}
                >
                  <Bookmark size={13} color="#15803d" />
                  {v}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile */}
          <div
            className="card-glossy"
            style={{
              padding: 28,
              background: "linear-gradient(180deg,#fff,var(--blue-tint))",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "#fff",
                border: "1px solid rgba(15,23,42,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Smartphone size={20} color="#6366f1" />
            </div>
            <h3 className="display-sm" style={{ fontSize: 19, marginTop: 16 }}>
              Mobile-first
            </h3>
            <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6 }}>
              Bottom-sheet panels and the full map travel with your reps — no
              desktop required.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
