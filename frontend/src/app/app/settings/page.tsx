'use client';

import React, { useEffect, useMemo, useState } from "react";
import { accountApi } from "@/lib/account";
import { useToast } from "@/components/ui/use-toast";

// UI helpers
const cx = (...xs: Array<string | false | undefined | null>) => xs.filter(Boolean).join(" ");

function Button({ children, variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; }) {
  const sizes: Record<"sm" | "md" | "lg", string> = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2", lg: "px-5 py-3 text-base" };
  const variants: Record<"primary" | "outline" | "ghost" | "danger", string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700"
  };
  return (
    <button {...rest} className={cx("rounded-xl transition focus:outline-none focus:ring-2 focus:ring-indigo-500", sizes[size], variants[variant], rest.disabled && "opacity-60 cursor-not-allowed", className)}>
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}

function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("p-4", className)}>{children}</div>;
}
function Input({ label, hint, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>}
      <input {...rest} className={cx("w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none", rest.className)} />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}
function TextArea({ label, hint, rows = 5, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>}
      <textarea rows={rows} {...rest} className={cx("w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none", rest.className)} />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 rounded-full transition", checked ? "bg-indigo-600" : "bg-slate-300")}
        aria-pressed={checked}
      >
        <span className={cx("absolute left-0.5 top-0.5 inline-block h-5 w-5 rounded-full bg-white transition", checked ? "translate-x-5" : "translate-x-0")}/>
      </button>
    </div>
  );
}

// Upload preview helper
function useFilePreview() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const onFile = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    const u = URL.createObjectURL(f);
    setUrl(u);
  };
  return { file, url, onFile };
}

const USER_ID = "vraymond@sparkfusiondigital.com";

type AuthStatus = {
  providers?: Array<"google" | "microsoft" | string>;
};

// Main Settings UI
export default function SettingsSuite() {
  const tabs = ["Profile", "Team", "Billing", "Preferences", "Integrations"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Profile");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile state
  const [profile, setProfile] = useState({
    first: "Valesco",
    last: "Raymond",
    title: "Sales Manager",
    phone: "",
    timezone: "America/New_York",
    domain: "sparkfusiondigital.com",
    fromName: "Valesco Raymond",
    fromEmail: "valesco@sparkfusiondigital.com",
    replyTo: "",
    signature: "Best,\nValesco Raymond\nSpark Fusion Digital",
    brandColor: "#4338CA"
  });
  const avatar = useFilePreview();
  const companyLogo = useFilePreview();
  const signatureLogo = useFilePreview();

  // Team state
  const [team, setTeam] = useState({ orgName: "Spark Fusion Digital", defaultFromDomain: "sparkfusiondigital.com", seats: 5, inviteEmail: "" });

  // Billing state (UI-only)
  const [billing, setBilling] = useState({ plan: "Pro", seats: 5, cardLast4: "4242", cycle: "Monthly" });

  // Preferences
  const [prefs, setPrefs] = useState({
    emailTracking: true,
    openTracking: true,
    linkTracking: true,
    sendWindow: "09:00-17:00",
    dailyCap: 200,
    defaultCampaignStyle: "Warm Intro + B2B 4-touch",
    searchDefaults: { countries: ["US"], modes: ["air", "ocean"], hs: [] as string[] },
    personas: ["Logistics Manager", "Procurement", "Warehouse Ops"],
    aiTuning: true
  });

  // Integrations
  const [integrations, setIntegrations] = useState({ gmail: false, outlook: false });

  const hydrateFromApi = (data: any) => {
    if (!data) return;
    setProfile((prev) => ({
      ...prev,
      first: data.first_name ?? data.first ?? prev.first,
      last: data.last_name ?? data.last ?? prev.last,
      title: data.title ?? prev.title,
      phone: data.phone ?? prev.phone,
      timezone: data.timezone ?? prev.timezone,
      domain: data.domain ?? prev.domain,
      fromName: data.from_name ?? prev.fromName,
      fromEmail: data.from_email ?? prev.fromEmail,
      replyTo: data.reply_to ?? prev.replyTo,
      signature: data.signature ?? prev.signature,
      brandColor: data.brand_color ?? prev.brandColor
    }));

    if (data.preferences) {
      setPrefs((prev) => ({
        ...prev,
        emailTracking: data.preferences.emailTracking ?? prev.emailTracking,
        openTracking: data.preferences.openTracking ?? prev.openTracking,
        linkTracking: data.preferences.linkTracking ?? prev.linkTracking,
        sendWindow: data.preferences.sendWindow ?? prev.sendWindow,
        dailyCap: data.preferences.dailyCap ?? prev.dailyCap,
        defaultCampaignStyle: data.preferences.defaultCampaignStyle ?? prev.defaultCampaignStyle,
        searchDefaults: {
          countries: data.preferences.searchDefaults?.countries ?? prev.searchDefaults.countries,
          modes: data.preferences.searchDefaults?.modes ?? prev.searchDefaults.modes,
          hs: data.preferences.searchDefaults?.hs ?? prev.searchDefaults.hs,
        },
        personas: data.preferences.personas ?? prev.personas,
        aiTuning: data.preferences.aiTuning ?? prev.aiTuning,
      }));
    }

    if (data.team) {
      setTeam((prev) => ({
        ...prev,
        orgName: data.team.orgName ?? prev.orgName,
        defaultFromDomain: data.team.defaultFromDomain ?? prev.defaultFromDomain,
        seats: data.team.seats ?? prev.seats,
      }));
    }

    if (data.billing) {
      setBilling((prev) => ({
        ...prev,
        plan: data.billing.plan ?? prev.plan,
        seats: data.billing.seats ?? prev.seats,
        cardLast4: data.billing.cardLast4 ?? prev.cardLast4,
        cycle: data.billing.cycle ?? prev.cycle,
      }));
    }
  };

  const hydrateAuth = (status: AuthStatus | null) => {
    if (!status) return;
    const providers = status.providers ?? [];
    setIntegrations({
      gmail: providers.includes("google"),
      outlook: providers.includes("microsoft"),
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const me = await accountApi.getMe(USER_ID).catch((error) => {
          console.warn("[settings] getMe failed", error);
          return null;
        });
        if (!cancelled) {
          hydrateFromApi(me);
        }
        const status = await accountApi.authStatus(USER_ID).catch((error) => {
          console.warn("[settings] authStatus failed", error);
          return null;
        });
        if (!cancelled) {
          hydrateAuth(status);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        profile: {
          first_name: profile.first,
          last_name: profile.last,
          title: profile.title,
          phone: profile.phone,
          timezone: profile.timezone,
          domain: profile.domain,
          from_name: profile.fromName,
          from_email: profile.fromEmail,
          reply_to: profile.replyTo,
          signature: profile.signature,
          brand_color: profile.brandColor,
        },
        preferences: {
          emailTracking: prefs.emailTracking,
          openTracking: prefs.openTracking,
          linkTracking: prefs.linkTracking,
          sendWindow: prefs.sendWindow,
          dailyCap: prefs.dailyCap,
          defaultCampaignStyle: prefs.defaultCampaignStyle,
          searchDefaults: prefs.searchDefaults,
          personas: prefs.personas,
          aiTuning: prefs.aiTuning,
        },
        integrations,
      };
      await accountApi.updateMe(USER_ID, payload);
      toast({ title: "Settings saved", description: "Your preferences were synced to Command Center." });
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message ?? "Unable to save settings right now." });
    } finally {
      setSaving(false);
    }
  };

  const refreshAuthStatus = async () => {
    const status = await accountApi.authStatus(USER_ID).catch((error) => {
      console.warn("[settings] authStatus refresh failed", error);
      return null;
    });
    hydrateAuth(status);
  };

  const handleConnect = async (provider: "google" | "microsoft") => {
    try {
      await accountApi.mockConnect(USER_ID, provider);
      await refreshAuthStatus();
      toast({
        title: provider === "google" ? "Gmail connected" : "Outlook connected",
        description: "Demo connection established successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error?.message ?? "Unable to connect provider in demo mode.",
      });
    }
  };

  const handleBillingPortal = async () => {
    try {
      const response = await accountApi.billingPortal(USER_ID);
      if (response?.url) {
        window.location.href = response.url;
      } else {
        toast({ title: "No portal URL", description: "Billing portal URL missing in response." });
      }
    } catch (error: any) {
      toast({ title: "Billing portal unavailable", description: error?.message ?? "Couldn't open billing portal." });
    }
  };

  // Derived: auto-detect company from email domain (mock)
  const autodetect = useMemo(() => {
    const d = profile.domain || "";
    if (!d) return null;
    const name = d.split(".")[0].replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    return { company: name, logoLetters: name.slice(0, 2).toUpperCase() };
  }, [profile.domain]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500">Manage your profile, team, billing, preferences, and integrations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()} disabled={loading || saving}>Reset</Button>
          <Button onClick={saveAll} disabled={loading || saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} className={cx("rounded-full px-4 py-1.5 text-sm", tab === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700")} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mb-6 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-500 shadow-sm">
          Loading settings from the logistics gateway…
        </div>
      )}

      {/* PROFILE */}
      {tab === "Profile" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="User Profile" subtitle="Used for your outbound emails and shared assets." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Input label="First name" value={profile.first} onChange={(e) => setProfile({ ...profile, first: e.target.value })} />
              <Input label="Last name" value={profile.last} onChange={(e) => setProfile({ ...profile, last: e.target.value })} />
              <Input label="Title" value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
              <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Input label="Time zone" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
              <Input label="Email domain" hint="Used to auto-recognize company branding" value={profile.domain} onChange={(e) => setProfile({ ...profile, domain: e.target.value })} />
              <Input label="From name" value={profile.fromName} onChange={(e) => setProfile({ ...profile, fromName: e.target.value })} />
              <Input label="From email" value={profile.fromEmail} onChange={(e) => setProfile({ ...profile, fromEmail: e.target.value })} />
              <Input label="Reply-to (optional)" value={profile.replyTo} onChange={(e) => setProfile({ ...profile, replyTo: e.target.value })} />
              <div className="md:col-span-2">
                <TextArea label="Email signature" rows={6} value={profile.signature} onChange={(e) => setProfile({ ...profile, signature: e.target.value })} />
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-slate-700">Profile image</div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                        {avatar.url ? <img src={avatar.url} className="h-16 w-16 object-cover" alt="avatar"/> : <span className="text-xs">Preview</span>}
                      </div>
                      <input type="file" accept="image/*" onChange={(e) => avatar.onFile(e.target.files?.[0] ?? null)} />
                    </div>
                  </label>
                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-slate-700">Company logo</div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
                        {companyLogo.url ? <img src={companyLogo.url} className="h-16 w-16 object-contain" alt="logo"/> : <span className="text-xs">Preview</span>}
                      </div>
                      <input type="file" accept="image/*" onChange={(e) => companyLogo.onFile(e.target.files?.[0] ?? null)} />
                    </div>
                  </label>
                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-slate-700">Signature logo (optional)</div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
                        {signatureLogo.url ? <img src={signatureLogo.url} className="h-16 w-16 object-contain" alt="sig"/> : <span className="text-xs">Preview</span>}
                      </div>
                      <input type="file" accept="image/*" onChange={(e) => signatureLogo.onFile(e.target.files?.[0] ?? null)} />
                    </div>
                  </label>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Brand & Detection" subtitle="Auto-filled from your email domain after Gmail/Outlook connect." />
            <CardBody>
              <div className="grid gap-3">
                <div className="text-sm text-slate-600">Detected company</div>
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600">{autodetect?.logoLetters || "?"}</div>
                  <div>
                    <div className="font-medium">{autodetect?.company || "—"}</div>
                    <div className="text-xs text-slate-500">{profile.domain || "domain not set"}</div>
                  </div>
                </div>
                <label className="block">
                  <div className="mb-1 text-sm font-medium text-slate-700">Brand color</div>
                  <input type="color" value={profile.brandColor} onChange={(e) => setProfile({ ...profile, brandColor: e.target.value })} />
                </label>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TEAM */}
      {tab === "Team" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Organization" subtitle="Configure org-wide defaults and invite teammates." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Input label="Organization name" value={team.orgName} onChange={(e) => setTeam({ ...team, orgName: e.target.value })} />
              <Input label="Default sending domain" value={team.defaultFromDomain} onChange={(e) => setTeam({ ...team, defaultFromDomain: e.target.value })} />
              <Input label="Seats" type="number" value={team.seats} onChange={(e) => setTeam({ ...team, seats: Number(e.target.value || 0) })} />
              <label className="block md:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">Invite teammate</div>
                <div className="flex gap-2">
                  <input placeholder="teammate@company.com" value={team.inviteEmail} onChange={(e) => setTeam({ ...team, inviteEmail: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none" />
                  <Button onClick={() => toast({ title: "Invite sent", description: `Invite drafted for ${team.inviteEmail || "(empty)"}.` })} disabled={!team.inviteEmail?.includes("@")}>Send Invite</Button>
                </div>
              </label>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Seat Roles" subtitle="Define roles for multi-user accounts." />
            <CardBody className="grid gap-3">
              <div className="text-sm">Default roles</div>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between"><span>Admin</span><span className="text-slate-500">Full access</span></div>
                <div className="flex items-center justify-between"><span>Manager</span><span className="text-slate-500">Campaign + Teams</span></div>
                <div className="flex items-center justify-between"><span>Rep</span><span className="text-slate-500">Own leads/campaigns</span></div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* BILLING */}
      {tab === "Billing" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Plan & Usage" subtitle="Upgrade, add seats, and view invoices." right={<Button variant="outline">Download latest invoice</Button>} />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Input label="Plan" value={billing.plan} onChange={(e) => setBilling({ ...billing, plan: e.target.value })} />
              <Input label="Billing cycle" value={billing.cycle} onChange={(e) => setBilling({ ...billing, cycle: e.target.value })} />
              <Input label="Seats" type="number" value={billing.seats} onChange={(e) => setBilling({ ...billing, seats: Number(e.target.value || 0) })} />
              <Input label="Card (last 4)" value={billing.cardLast4} onChange={(e) => setBilling({ ...billing, cardLast4: e.target.value })} />
              <div className="md:col-span-2 flex gap-2">
                <Button className="mr-2">Add seats</Button>
                <Button variant="outline" onClick={handleBillingPortal}>Open billing portal</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Invoices" />
            <CardBody>
              <div className="text-sm text-slate-600">Oct 2025 – Paid • $249</div>
              <div className="text-sm text-slate-600">Sep 2025 – Paid • $249</div>
              <div className="text-sm text-slate-600">Aug 2025 – Paid • $249</div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* PREFERENCES */}
      {tab === "Preferences" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Email" subtitle="Defaults applied to new campaigns." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Toggle label="Track opens" checked={prefs.openTracking} onChange={(v) => setPrefs({ ...prefs, openTracking: v })} hint="Adds tracking pixel" />
              <Toggle label="Track link clicks" checked={prefs.linkTracking} onChange={(v) => setPrefs({ ...prefs, linkTracking: v })} />
              <Input label="Send window" value={prefs.sendWindow} onChange={(e) => setPrefs({ ...prefs, sendWindow: e.target.value })} />
              <Input label="Daily cap" type="number" value={prefs.dailyCap} onChange={(e) => setPrefs({ ...prefs, dailyCap: Number(e.target.value || 0) })} />
              <Input label="Default campaign style" value={prefs.defaultCampaignStyle} onChange={(e) => setPrefs({ ...prefs, defaultCampaignStyle: e.target.value })} className="md:col-span-2" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Search defaults" />
            <CardBody className="grid gap-3">
              <div className="text-sm">Countries: {prefs.searchDefaults.countries.join(", ")}</div>
              <div className="text-sm">Modes: {prefs.searchDefaults.modes.join(", ")}</div>
              <div className="text-sm">HS filters: {(prefs.searchDefaults.hs || []).join(", ") || "—"}</div>
              <Toggle label="AI auto-tune preferences" checked={prefs.aiTuning} onChange={(v) => setPrefs({ ...prefs, aiTuning: v })} hint="Learns from usage and suggests filters & sequences." />
            </CardBody>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="Persona library" subtitle="Target profiles used for search and campaign personalization." right={<Button variant="outline">Manage personas</Button>} />
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {prefs.personas.map((p, i) => (
                  <span key={i} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{p}</span>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* INTEGRATIONS */}
      {tab === "Integrations" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Email providers" subtitle="Connect to send and track email from your domain." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-medium">Gmail</div>
                <p className="mb-3 text-xs text-slate-500">Connect Google Workspace to auto-detect your brand and signature.</p>
                {integrations.gmail ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-600">Connected</span>
                    <Button variant="outline" onClick={() => setIntegrations({ ...integrations, gmail: false })}>Disconnect</Button>
                  </div>
                ) : (
                  <Button onClick={() => handleConnect("google")}>Connect Gmail</Button>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-medium">Outlook (Microsoft 365)</div>
                <p className="mb-3 text-xs text-slate-500">Use Microsoft Graph to send and sync replies.</p>
                {integrations.outlook ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-600">Connected</span>
                    <Button variant="outline" onClick={() => setIntegrations({ ...integrations, outlook: false })}>Disconnect</Button>
                  </div>
                ) : (
                  <Button onClick={() => handleConnect("microsoft")}>Connect Outlook</Button>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Brand preview" subtitle="How your email footer will look." />
            <CardBody>
              <div className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="mb-2 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: profile.brandColor }}>
                    <span className="text-white text-xs font-semibold">{(autodetect?.logoLetters || "").slice(0,2) || "SF"}</span>
                  </div>
                  <div className="font-medium">{autodetect?.company || team.orgName}</div>
                </div>
                <pre className="whitespace-pre-wrap text-slate-700">{profile.signature}</pre>
                {signatureLogo.url && <img src={signatureLogo.url} alt="sig" className="mt-2 h-6 object-contain" />}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
