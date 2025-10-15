import { useEffect, useRef } from 'react';

export default function LandingPage() {
  const dotContainerRef = useRef(null);

  useEffect(() => {
    const container = dotContainerRef.current;
    if (!container) return;

    const DOT_COUNT = 120;
    const dots = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function init() {
      const rect = container.getBoundingClientRect();
      for (let i = 0; i < DOT_COUNT; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        const x = Math.random();
        const y = Math.random();
        dot.dataset.x = String(x);
        dot.dataset.y = String(y);
        dot.style.left = `${x * 100}%`;
        dot.style.top = `${y * 100}%`;
        container.appendChild(dot);
        dots.push(dot);
      }
      return rect;
    }

    let rect = init();

    function animate(e) {
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      dots.forEach(dot => {
        const dx = cx - (Number(dot.dataset.x) * rect.width);
        const dy = cy - (Number(dot.dataset.y) * rect.height);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const norm = Math.max(0, 1 - dist / 400);
        const scale = 1 + norm * 0.6;
        const opacity = 0.15 + norm * 0.5;
        dot.style.transform = `scale(${scale})`;
        dot.style.opacity = `${opacity}`;
      });
    }
    function reset() {
      dots.forEach(dot => {
        dot.style.transform = 'scale(1)';
        dot.style.opacity = '0.15';
      });
    }

    function handleResize() {
      rect = container.getBoundingClientRect();
    }

    if (!reduced) {
      container.addEventListener('mousemove', animate);
      container.addEventListener('mouseleave', reset);
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (!reduced) {
        container.removeEventListener('mousemove', animate);
        container.removeEventListener('mouseleave', reset);
        window.removeEventListener('resize', handleResize);
      }
      dots.forEach(dot => { if (dot.parentNode === container) container.removeChild(dot); });
    };
  }, []);

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    const emailInput = e.currentTarget.elements['email'];
    const val = emailInput.value.trim();
    if (!val.includes('@')) {
      emailInput.setCustomValidity('Please enter a valid business email');
      emailInput.reportValidity();
    } else {
      emailInput.setCustomValidity('');
      console.log('Submitted email:', val);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only p-4">Skip to content</a>
      {/* Header */}
      <header className="sticky top-0 bg-white dark:bg-gray-800 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center space-x-10">
            <div className="flex-shrink-0 text-intel font-bold text-xl">LIT</div>
            <nav className="hidden md:flex space-x-6 text-sm">
              <a href="#intelligence" className="hover:text-intel-dark">Intelligence</a>
              <a href="#trade-data" className="hover:text-intel-dark">Trade Data</a>
              <a href="#pricing" className="hover:text-intel-dark">Pricing</a>
              <a href="#resources" className="hover:text-intel-dark">Resources</a>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/app/login" className="text-sm text-gray-600 dark:text-gray-300 hover:text-intel-dark">Log In</a>
            <a href="/request-demo" className="px-4 py-2 text-sm bg-intel text-white rounded hover:bg-intel-dark transition">Request Demo</a>
            <button
              id="mobile-menu-button"
              className="md:hidden focus:outline-none"
              onClick={() => {
                const menu = document.getElementById('mobile-menu');
                if (menu) menu.classList.toggle('hidden');
              }}
            >
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        <div id="mobile-menu" className="hidden md:hidden bg-white dark:bg-gray-800 px-4 py-4 border-t border-gray-100 dark:border-gray-700">
          <a href="/app/dashboard" className="block py-2">Platform</a>
          <a href="/solutions" className="block py-2">Solutions</a>
          <a href="/pricing" className="block py-2">Pricing</a>
          <a href="/resources" className="block py-2">Resources</a>
          <a href="/app/login" className="block py-2">Log In</a>
          <a href="/request-demo" className="block mt-2 text-white bg-intel px-4 py-2 rounded hover:bg-intel-dark">Request Demo</a>
        </div>
      </header>

      <main id="main-content" className="relative">
        {/* Hero */}
        <section className="relative pt-24 pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div ref={dotContainerRef} className="dot-matrix" aria-hidden="true"></div>
          <div className="relative z-10 text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Global Commerce Intelligence Meets Contact Insight</h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              Discover who ships what and connect with decision-makers—one platform for sales, sourcing, and market analysis.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <a href="/app/search" data-cta="start-free-search" className="px-6 py-3 bg-intel text-white rounded-lg hover:bg-intel-dark transition">
                Start Free Search
              </a>
              <a href="/request-demo" className="px-6 py-3 border border-intel text-intel rounded-lg hover:bg-intel-light transition">
                Request Demo
              </a>
            </div>
            <form
              id="hero-email-form"
              className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full max-w-md mx-auto"
              onSubmit={handleEmailSubmit}
              noValidate
            >
              <label htmlFor="hero-email" className="sr-only">Business email</label>
              <input
                id="hero-email"
                name="email"
                type="email"
                required
                placeholder="Your business email"
                className="flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-intel focus:border-intel"
              />
              <button type="submit" className="px-6 py-2 bg-intel text-white rounded-lg hover:bg-intel-dark transition">Get Started</button>
            </form>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              We accept business emails only. <a href="#privacy" className="underline">Privacy Policy</a>
            </p>
          </div>
        </section>

        {/* Value Props */}
        <section id="value-props" className="bg-white dark:bg-gray-800 py-16">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 px-4">
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded shadow hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">Targeted Lead Generation</h3>
              <p className="text-gray-600 dark:text-gray-300">Enriched contacts with verified emails, direct dials, and intent data.</p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded shadow hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">Global Trade Sourcing</h3>
              <p className="text-gray-600 dark:text-gray-300">Search global shipment data and map verified supplier relationships.</p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded shadow hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">Precise Market Sizing</h3>
              <p className="text-gray-600 dark:text-gray-300">Break down trade flows by HS code, region, or shipping lane.</p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded shadow hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">Risk & Competitor Monitoring</h3>
              <p className="text-gray-600 dark:text-gray-300">Track competitor shipment activity and assess supplier risks in real time.</p>
            </div>
          </div>
        </section>

        {/* CTA Band */}
        <section className="py-20 bg-intel text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to unlock global supply visibility?</h2>
          <p className="mb-6">Start searching today — connect your sales and sourcing data with real shipping intelligence.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="/app/search" className="px-6 py-3 bg-white text-intel rounded hover:bg-gray-100 transition">Start Free Search</a>
            <a href="/request-demo" className="px-6 py-3 border border-white text-white rounded hover:bg-white hover:text-intel transition">Request Demo</a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
        <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Company</h4>
            <ul>
              <li><a href="#" className="hover:underline">About</a></li>
              <li><a href="#" className="hover:underline">Careers</a></li>
              <li><a href="#" className="hover:underline">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Solutions</h4>
            <ul>
              <li><a href="#" className="hover:underline">Trade Intelligence</a></li>
              <li><a href="#" className="hover:underline">Lead Gen</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Resources</h4>
            <ul>
              <li><a href="#" className="hover:underline">Blog</a></li>
              <li><a href="#" className="hover:underline">Case Studies</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Legal</h4>
            <ul>
              <li><a href="#privacy" className="hover:underline">Privacy</a></li>
              <li><a href="#" className="hover:underline">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 text-center py-4 text-sm">
          &copy; 2025 Logistics Intel (LIT). All rights reserved.
        </div>
      </footer>
    </div>
  );
}
