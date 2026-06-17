import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export function PulseFinalCta() {
  return (
    <section className="section">
      <div className="mx-auto px-8" style={{ maxWidth: 1240 }}>
        <div
          style={{
            position: "relative",
            borderRadius: 24,
            overflow: "hidden",
            background: "linear-gradient(135deg,#020617,#0b1f3a)",
            padding: "72px 48px",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(800px 360px at 50% 0%, rgba(0,240,255,0.16), transparent 60%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <h2
              className="display-lg"
              style={{
                color: "#f8fafc",
                maxWidth: 720,
                margin: "0 auto",
              }}
            >
              See your market on the map.
            </h2>
            <p
              className="lead"
              style={{
                color: "#cbd5e1",
                maxWidth: 560,
                margin: "16px auto 0",
              }}
            >
              Book a demo and we&apos;ll plot your target accounts live — or
              start free and explore 78K+ shippers today.
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                marginTop: 30,
                flexWrap: "wrap",
              }}
            >
              <Button variant="primary" size="lg" href="/book-a-demo">
                <Calendar size={16} />
                Book a Demo
              </Button>
              <Button
                variant="ghost"
                size="lg"
                href={APP_SIGNUP_URL}
                className="!text-white !bg-white/10 hover:!bg-white/20 border border-white/20"
              >
                Start Free
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
