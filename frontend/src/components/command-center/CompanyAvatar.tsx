export default function CompanyAvatar({ name, domain }:{ name?:string; domain?:string|null }) {
  const logo = domain ? `https://logo.clearbit.com/${domain}` : null; // falls back if 404
  const letter = (name?.trim()?.[0] || "?").toUpperCase();
  return (
    <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center border">
      {logo
        ? <img src={logo} alt={name||"logo"} className="w-full h-full object-cover" onError={(e)=>((e.target as HTMLImageElement).style.display="none")} />
        : <span className="text-sm font-semibold text-slate-600">{letter}</span>
      }
    </div>
  );
}
