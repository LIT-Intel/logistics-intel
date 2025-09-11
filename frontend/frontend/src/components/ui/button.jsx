import React from "react";
export function Button({ children, className="", ...props }) {
  return (
    <button
      className={`px-3 py-1 rounded-lg border text-sm font-medium hover:bg-neutral-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export default Button;
