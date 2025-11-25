import React from "react";

type CommandCenterLayoutProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function CommandCenterLayout({
  title,
  subtitle,
  actions,
  children,
}: CommandCenterLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-600">
              Workspace
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
              {actions}
            </div>
          )}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
