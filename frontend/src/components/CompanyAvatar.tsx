import React, { useState } from "react";

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
  const showLogo = Boolean(logoUrl) && !imageError;

  const sizeClasses =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
      ? "h-14 w-14 text-lg"
      : "h-10 w-10 text-sm";

  return (
    <div
      className={[
        "inline-flex items-center justify-center rounded-2xl overflow-hidden",
        showLogo ? "bg-white" : "bg-gradient-to-br from-indigo-500 to-purple-600",
        "text-white font-semibold",
        sizeClasses,
        className,
      ].join(" ")}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-1"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
};
