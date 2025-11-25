import React from "react";
import { AlertTriangle, Lightbulb, Sparkles } from "lucide-react";

type Insight = {
  title: string;
  body: string;
  tone?: "default" | "warning" | "highlight";
};

type CommandCenterInsightsProps = {
  insights: Insight[];
};

const toneMap: Record<
  NonNullable<Insight["tone"]>,
  { border: string; icon: React.ComponentType<any> }
> = {
  default: { border: "border-slate-200", icon: Sparkles },
  warning: { border: "border-amber-200", icon: AlertTriangle },
  highlight: { border: "border-indigo-200", icon: Lightbulb },
};

export default function CommandCenterInsights({
  insights,
}: CommandCenterInsightsProps) {
  if (!insights.length) return null;

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {insights.map((insight) => {
        const tone = insight.tone ?? "default";
        const ToneIcon = toneMap[tone].icon;
        return (
          <div
            key={insight.title}
            className={`rounded-2xl border ${toneMap[tone].border} bg-white p-4 shadow-sm`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ToneIcon className="h-4 w-4 text-indigo-600" />
              {insight.title}
            </div>
            <p className="mt-2 text-sm text-slate-600">{insight.body}</p>
          </div>
        );
      })}
    </div>
  );
}
