const MODES = [
  { id: 'industry', label: 'Industry' },
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'workflow', label: 'Workflow' },
];

export default function ColorModeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-2.5 py-1.5 rounded-md transition ${
            value === m.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
