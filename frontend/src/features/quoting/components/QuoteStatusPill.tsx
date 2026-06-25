import { Chip } from "@/components/ui/Chip";
import type { QuoteStatus } from "@/api/quoting";

// Chip variants: neutral | info | success | warning | danger (see components/ui/Chip.tsx).
const MAP: Record<QuoteStatus, { variant: "neutral" | "info" | "success" | "warning" | "danger"; label: string }> = {
  draft: { variant: "neutral", label: "Draft" },
  sent: { variant: "info", label: "Sent" },
  viewed: { variant: "info", label: "Viewed" },
  approved: { variant: "info", label: "Approved" },
  closed_won: { variant: "success", label: "Won" },
  closed_lost: { variant: "danger", label: "Lost" },
  expired: { variant: "warning", label: "Expired" },
};

export function QuoteStatusPill({ status }: { status: QuoteStatus }) {
  const m = MAP[status] ?? MAP.draft;
  return (
    <Chip variant={m.variant} size="sm" tone="outline">
      {m.label}
    </Chip>
  );
}

export default QuoteStatusPill;
