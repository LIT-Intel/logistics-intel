import React from "react";

type CommandCenterLayoutProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  headerContext?: React.ReactNode;
  children: React.ReactNode;
};

export default function CommandCenterLayout({
  title,
  subtitle,
  actions,
  headerContext,
  children,
}: CommandCenterLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-transparent bg-gradient-to-r from-white to-slate-50 px-6 py-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-indigo-500">
              Workspace
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            {headerContext}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
              {actions}
            </div>
          )}
        </header>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
