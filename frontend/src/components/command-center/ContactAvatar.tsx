export default function ContactAvatar({ name }:{ name?:string|null }) {
  const initials = (name||"")
    .split(" ").filter(Boolean).slice(0,2).map(s=>s[0]!.toUpperCase()).join("") || "•";
  return (
    <div className="w-7 h-7 rounded-full bg-slate-100 border flex items-center justify-center text-[10px] font-semibold text-slate-600">
      {initials}
    </div>
  );
}
