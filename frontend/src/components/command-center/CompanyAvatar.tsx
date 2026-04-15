import React from "react";
import { CompanyAvatar as SharedCompanyAvatar } from "@/components/CompanyAvatar";
import { getCompanyLogoUrl } from "@/lib/logo";

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
  const logoUrl = src || getCompanyLogoUrl(domain || undefined) || undefined;

  return (
    <SharedCompanyAvatar
      name={name}
      size={mapSize(size)}
      className={className}
      logoUrl={logoUrl}
    />
  );
}
