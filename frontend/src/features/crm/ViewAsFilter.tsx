"use client";

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { isOrgManager, listOrgMembers } from "@/api/crm";

const FONT_HEAD = "'Space Grotesk', sans-serif";

/**
 * Owner/admin-only "View as [member]" filter for the CRM surfaces.
 *
 * Regular members are already RLS-scoped to their own deals/tasks, so the
 * dropdown would be a no-op for them — it renders NOTHING unless the caller is
 * an org owner/admin. When shown, picking a member sets `value` to that
 * member's user_id (empty string = "All members" = whole org, the default).
 *
 * The chosen user_id is threaded by the parent into the query layer's optional
 * `ownerUserId` param (and the RPC's `p_owner_user_id`), which narrows an
 * owner/admin's view to that one member's pipeline.
 */
export default function ViewAsFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (userId: string) => void;
}) {
  const [canView, setCanView] = useState(false);
  const [members, setMembers] = useState<Array<{ user_id: string; name: string }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const manager = await isOrgManager();
        if (!alive) return;
        setCanView(manager);
        if (manager) {
          const m = await listOrgMembers();
          if (alive) setMembers(m);
        }
      } catch {
        /* filter is an owner/admin convenience — fail closed (hidden) */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Members (and solo users) never see the control.
  if (!canView) return null;

  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
      title="Filter the pipeline to a single member (owner/admin only)"
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontFamily: FONT_HEAD,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
        }}
      >
        <Users style={{ width: 13, height: 13 }} />
        View
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 10px",
          borderRadius: 9,
          border: "1.5px solid #CBD5E1",
          background: "#FFFFFF",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12.5,
          color: "#0F172A",
          outline: "none",
          cursor: "pointer",
          maxWidth: 200,
        }}
      >
        <option value="">All members</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
