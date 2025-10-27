import React from 'react';
import CompanyCard from './CompanyCard';

// Shim component to satisfy SearchResults.jsx expectations
// Wraps the existing TypeScript CompanyCard with a JS-friendly interface
export default function CompanyCardCompact({ company, onView, onSave }) {
  return (
    <CompanyCard row={company} onOpen={onView} onSave={onSave} />
  );
}
