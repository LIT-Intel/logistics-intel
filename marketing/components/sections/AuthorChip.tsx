import Image from "next/image";
import { cn } from "@/lib/utils";

type Variant = "default" | "compact" | "on-dark";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * `AuthorChip` — small byline element used in cards, article bodies, and
 * featured-post slots. Renders a 40×40 (32×32 in `compact`) avatar with
 * a double-ring frame plus name + optional role. Falls back to a blue-
 * tint initials circle when no avatar is provided (matches the existing
 * BlogCard fallback pattern, so visual consistency is preserved when
 * Sanity author docs lack avatars).
 */
export function AuthorChip({
  name,
  role,
  avatarUrl,
  variant = "default",
  className,
}: {
  name?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  variant?: Variant;
  className?: string;
}) {
  if (!name && !avatarUrl) return null;
  const size = variant === "compact" ? 32 : 40;
  return (
    <div
      className={cn(
        "author-chip",
        variant === "compact" && "compact",
        variant === "on-dark" && "on-dark",
        className,
      )}
    >
      <div className="ac-face" aria-hidden={!name}>
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name || ""}
            width={size}
            height={size}
            loading="lazy"
          />
        ) : (
          <div
            className="font-display flex h-full w-full items-center justify-center text-white"
            style={{
              background: "var(--brand-blue, #3b82f6)",
              fontSize: Math.round(size * 0.4),
              fontWeight: 600,
            }}
          >
            {initials(name)}
          </div>
        )}
      </div>
      <div className="ac-meta">
        {name && <span className="ac-name">{name}</span>}
        {role && <span className="ac-role">{role}</span>}
      </div>
    </div>
  );
}
