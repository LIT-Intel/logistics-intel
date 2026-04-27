import React, { useEffect, useMemo, useState } from "react";
import { getLogoCandidates } from "@/lib/logo";

type CompanyAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  logoUrl?: string | null;
  domain?: string | null;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const CompanyAvatar: React.FC<CompanyAvatarProps> = ({
  name,
  size = "md",
  className = "",
  logoUrl,
  domain,
}: CompanyAvatarProps) => {
  const initials = getInitials(name || "LIT");

  const candidates = useMemo(() => {
    const list: string[] = [];
    if (logoUrl) list.push(logoUrl);
    list.push(...getLogoCandidates(domain ?? logoUrl ?? null));
    return Array.from(new Set(list.filter(Boolean)));
  }, [logoUrl, domain]);

  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(candidates.length === 0);

  useEffect(() => {
    setAttempt(0);
    setExhausted(candidates.length === 0);
  }, [candidates]);

  const sizeClasses =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
      ? "h-14 w-14 text-lg"
      : "h-10 w-10 text-sm";

  if (exhausted) {
    return (
      <div
        className={[
          "inline-flex items-center justify-center overflow-hidden rounded-2xl",
          "border border-slate-200 shadow-sm",
          "bg-gradient-to-br from-indigo-500 to-purple-600",
          "text-white font-semibold",
          sizeClasses,
          className,
        ].join(" ")}
      >
        {initials}
      </div>
    );
  }

  const currentUrl = candidates[attempt];

  return (
    <div
      className={[
        "inline-flex items-center justify-center overflow-hidden rounded-2xl",
        "border border-slate-200 shadow-sm bg-white",
        sizeClasses,
        className,
      ].join(" ")}
    >
      <img
        key={currentUrl}
        src={currentUrl}
        alt={`${name} logo`}
        className="h-full w-full object-contain p-1"
        loading="eager"
        decoding="sync"
        onError={() => {
          // Phase B.11 — debug-only console hint when a candidate fails.
          // Browser <img> fires `onerror` for any non-2xx (including 401
          // / 403 / 404), so this signals which provider rejected the
          // request. Especially useful when img.logo.dev returns 401
          // because the deploying Vercel domain is not in the Logo.dev
          // dashboard's allowed-origins list. The cascade behavior is
          // unchanged — we still walk to the next candidate immediately.
          if (typeof console !== "undefined" && typeof console.debug === "function") {
            console.debug("[CompanyAvatar] logo candidate failed:", currentUrl);
          }
          if (attempt + 1 < candidates.length) {
            setAttempt(attempt + 1);
          } else {
            setExhausted(true);
          }
        }}
      />
    </div>
  );
};
