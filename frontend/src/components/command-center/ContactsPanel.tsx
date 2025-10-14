import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { hasFeature, isAdmin } from "@/lib/access";
import ContactAvatar from "@/components/command-center/ContactAvatar";

type Contact = {
  id?: string | number;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  seniority?: string | null;
  location?: string | null;
};

function qstr(params: Record<string, string | number | null | undefined>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) u.set(k, String(v));
  });
  return u.toString();
}

export default function ContactsPanel() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("lit:selectedCompany") || "null"); } catch { return null; }
  }, []);

  const gated = !isAdmin() && !hasFeature("contacts");
  if (gated) {
    return (
      <div className="rounded-2xl border p-4">
        <div className="text-sm font-semibold mb-1">Contacts</div>
        <div className="text-sm text-slate-600">
          Upgrade to <span className="font-medium">Pro</span> to unlock verified decision-makers.
        </div>
        <div className="mt-3">
          <a href="/app/billing" className="inline-block px-3 py-1.5 text-sm rounded-lg border hover:bg-slate-50">
            Upgrade to Pro
          </a>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const company_id = selected?.company_id ?? null;
    const name = selected?.name ?? null;
    if (!company_id && !name) { setRows([]); return; }

    (async () => {
      setLoading(true); setErr(null);
      try {
        const qs = qstr({
          company_id: company_id || undefined,
          q: company_id ? undefined : name, // fallback by name if id missing
          limit: 25,
          offset: 0,
        });
        const r = await fetch(`/api/lit/public/contacts?${qs}`);
        if (!r.ok) throw new Error(String(r.status));
        const data = await r.json();
        setRows(data?.rows || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load contacts");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Contacts</div>
        <button
          className="px-2.5 py-1.5 text-xs rounded-lg border hover:bg-slate-50"
          onClick={() => exportCsv(rows || [])}
          disabled={!rows?.length}
        >
          Export CSV
        </button>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading contacts…</div>}
      {err && <div className="text-sm text-red-600">Error: {err}</div>}
      {!loading && !err && (!rows || rows.length === 0) && (
        <div className="text-sm text-slate-500">No contacts found.</div>
      )}

      {!!rows?.length && (
        <div className="overflow-auto -mx-2">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <Th>Name</Th><Th>Title</Th><Th>Dept</Th><Th>Seniority</Th><Th>Email</Th><Th>Phone</Th><Th>Location</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c, i) => (
                <tr key={c.id ?? i} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-2">
                      <ContactAvatar name={c.name} />
                      <span>{c.name ?? "—"}</span>
                    </div>
                  </Td>
                  <Td>{c.title ?? "—"}</Td>
                  <Td>{c.department ?? "—"}</Td>
                  <Td>{c.seniority ?? "—"}</Td>
                  <Td>{c.email ?? "—"}</Td>
                  <Td>{c.phone ?? "—"}</Td>
                  <Td>{c.location ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}

function exportCsv(rows: Contact[]) {
  if (!rows.length) return;
  const header = ["name","title","department","seniority","email","phone","location"];
  const csv = [header.join(",")].concat(
    rows.map(r => [
      r.name ?? "", r.title ?? "", r.department ?? "", r.seniority ?? "",
      r.email ?? "", r.phone ?? "", r.location ?? ""
    ].map(escapeCsv).join(","))
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "contacts.csv"; a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
