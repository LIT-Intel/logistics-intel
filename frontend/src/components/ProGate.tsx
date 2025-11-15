import { Shield, Lock, ArrowRight } from 'lucide-react';

type Props = {
  title?: string;
  description?: string;
  ctaText?: string;
  onUpgrade?: () => void;
  small?: boolean;
};

export default function ProGate({
  title = 'Upgrade to Pro',
  description = 'Detailed BOLs, HTS codes, routes, and charts unlock with Pro.',
  ctaText = 'Upgrade now',
  onUpgrade,
  small,
}: Props) {
  return (
    <div
      className={`w-full ${
        small ? 'p-6' : 'p-10'
      } rounded-2xl border bg-gradient-to-br from-slate-50 to-white shadow-sm`}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-slate-100">
          <Lock className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-slate-600 mt-1">{description}</p>
          <div className="mt-4">
            <button
              onClick={onUpgrade}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition shadow"
            >
              <Shield className="w-4 h-4" />
              {ctaText}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
