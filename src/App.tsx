import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import SearchFilters from './pages/app/search/SearchFilters';

function Landing() {
  return (
    <div style={{padding: 24}}>
      <h1>Logistic Intel</h1>
      <p>Freight intelligence & CRM — Google Cloud stack.</p>
      <ul>
        <li><Link to="/app/search">Go to Search</Link></li>
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/search" element={<SearchFilters />} />
      </Routes>
    </BrowserRouter>
  );
}
