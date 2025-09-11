import React, { useState } from "react";
export function DropdownMenu({ trigger, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <span onClick={()=>setOpen(v=>!v)}>{trigger}</span>
      {open && (
        <div className="absolute right-0 mt-2 min-w-[10rem] rounded border bg-white shadow p-1">
          {children}
        </div>
      )}
    </div>
  );
}
export function DropdownMenuItem({ children, ...props }) {
  return <div className="px-3 py-2 text-sm hover:bg-neutral-100 rounded cursor-pointer" {...props}>{children}</div>;
}
