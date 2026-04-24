import React from "react";
import { CompanyAvatar as SharedCompanyAvatar } from "@/components/CompanyAvatar";

type CompanyAvatarProps = {
  name: string;
  domain?: string;
  src?: string;
  size?: number;
  className?: string;
};

function mapSize(size?: number): "sm" | "md" | "lg" {
  if (!size) return "lg";
  if (size <= 36) return "sm";
  if (size <= 48) return "md";
  return "lg";
}

export default function CompanyAvatar({
  name = "",
  domain,
  src,
  size = 56,
  className = "",
}: CompanyAvatarProps) {
  return (
    <SharedCompanyAvatar
      name={name}
      size={mapSize(size)}
      className={className}
      logoUrl={src || undefined}
      domain={domain || undefined}
    />
  );
}
