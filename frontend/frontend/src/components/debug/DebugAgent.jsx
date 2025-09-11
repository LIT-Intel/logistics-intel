import React, { useState } from "react";
import { Button } from "../ui/button";

export default function DebugAgent() {
  const [logs, setLogs] = useState([]);
  function addLog(msg){ setLogs(l => [...l, new Date().toISOString()+" — "+msg]); }
  return (
    <aside className="p-3 border rounded bg-white">
      <div className="font-semibold mb-2">Debug Agent</div>
      <Button onClick={()=>addLog("ping")}>Ping</Button>
      <div className="mt-2 text-xs max-h-32 overflow-auto space-y-1">
        {logs.length ? logs.map((l,i)=><div key={i}>{l}</div>) : <div className="text-neutral-400">No logs yet.</div>}
      </div>
    </aside>
  );
}
