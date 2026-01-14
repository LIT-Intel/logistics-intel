import React from "react";

type CommandCenterLayoutProps = {
  title?: string;
  subtitle?: string;
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
    <>
      {(title || subtitle || actions) && (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            {title && (
              <h1 className="text-2xl font-semibold text-slate-900">
                {title}
              </h1>
            )}
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      <div>{children}</div>
    </>
  );
}
