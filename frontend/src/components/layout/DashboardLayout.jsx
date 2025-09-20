import React from 'react';

export default function DashboardLayout({ children }) {
  return (
    <div className="max-w-[1440px] mx-auto px-5 py-6">
      {children}
    </div>
  );
}

