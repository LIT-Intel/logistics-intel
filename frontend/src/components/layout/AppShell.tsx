import React from 'react';
import AppShellBase from './AppShell.jsx';

type AppShellProps = {
  currentPageName?: string;
  children: React.ReactNode;
};

export default function AppShell({ currentPageName, children }: AppShellProps) {
  return (
    <AppShellBase currentPageName={currentPageName}>
      {children}
    </AppShellBase>
  );
}
