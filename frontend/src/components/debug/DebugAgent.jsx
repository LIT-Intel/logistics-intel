import { useState } from "react";

export default function DebugAgent() {
  const [status, setStatus] = useState("idle");

  return (
    <aside className="p-3 border rounded-xl bg-white/50">
      <div className="text-sm font-semibold">Debug Agent</div>
      <div className="text-xs text-gray-600">Status: {status}</div>
      <div className="mt-2 text-xs text-gray-500">
        Minimal stub for build-time; wire real actions later.
      </div>
    </aside>
  );
}
