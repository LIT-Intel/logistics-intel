import React from "react";
export function Badge({ children, className="", ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-neutral-200 text-neutral-800 ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
export default Badge;
