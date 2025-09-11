import React, { useState } from "react";
export function Tooltip({ children, label }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative"
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-1 text-xs rounded bg-black text-white">
          {label}
        </span>
      )}
    </span>
  );
}
