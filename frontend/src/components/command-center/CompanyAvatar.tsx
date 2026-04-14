import React, { useEffect, useMemo, useState } from "react";

type CompanyAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  logoUrl?: string | null;
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
}) => {
  const initials = getInitials(name || "LIT");
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [logoUrl]);

  const hasLogoUrl = Boolean(logoUrl);
  const showImage = hasLogoUrl && !imageError;
  const showFallback = !hasLogoUrl || imageError || !imageLoaded;

  const sizeClasses =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
      ? "h-14 w-14 text-lg"
      : "h-10 w-10 text-sm";

  return (
    <div
      className={[
        "relative inline-flex items-center justify-center overflow-hidden rounded-2xl",
        "border border-slate-200 shadow-sm",
        "bg-gradient-to-br from-slate-50 via-white to-slate-100",
        sizeClasses,
        className,
      ].join(" ")}
    >
      <div
        className={[
          "absolute inset-0 flex items-center justify-center",
          "bg-gradient-to-br from-indigo-500 to-purple-600",
          "text-white font-semibold transition-opacity duration-200",
          showFallback ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden={!showFallback}
      >
        {initials}
      </div>

      {showImage ? (
        <div className="absolute inset-[3px] flex items-center justify-center rounded-[14px] bg-white/95">
          <img
            src={logoUrl!}
            alt={`${name} logo`}
            className={[
              "max-h-full max-w-full object-contain p-1 transition-opacity duration-200",
              imageLoaded ? "opacity-100" : "opacity-0",
            ].join(" ")}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
