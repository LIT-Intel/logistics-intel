import React from "react";

type CompanyAvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
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
}) => {
  const initials = getInitials(name || "LIT");

  const sizeClasses =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
      ? "h-14 w-14 text-lg"
      : "h-10 w-10 text-sm";

  return (
    <div
      className={[
        "inline-flex items-center justify-center rounded-2xl",
        "bg-gradient-to-br from-indigo-500 to-purple-600",
        "text-white font-semibold",
        sizeClasses,
        className,
      ].join(" ")}
    >
      {initials}
    </div>
  );
};
