import React from "react";

export function HealthDots({ score }: { score: number | null }) {
  const safeScore = Math.max(0, Math.min(100, Number(score ?? 0)));
  const filled = Math.round((safeScore / 100) * 5);
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="block h-2 w-2 rounded-full"
          style={{ background: i < filled ? "#10B981" : "#E2E8F0" }}
        />
      ))}
    </div>
  );
}