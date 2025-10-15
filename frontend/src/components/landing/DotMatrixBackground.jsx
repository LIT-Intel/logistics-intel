import React, { useEffect, useRef } from 'react';

export default function DotMatrixBackground({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const DOT_COUNT = 120;
    const dots = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function init() {
      const rect = container.getBoundingClientRect();
      for (let i = 0; i < DOT_COUNT; i++) {
        const dot = document.createElement('div');
        dot.className = 'absolute w-1.5 h-1.5 rounded-full bg-white/40 dark:bg-white/30 opacity-20';
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
        const scale = 1 + norm * 0.8;
        const opacity = 0.15 + norm * 0.5;
        dot.style.transform = `scale(${scale})`;
        dot.style.opacity = `${opacity}`;
      });
    }
    function reset() {
      dots.forEach(dot => {
        dot.style.transform = 'scale(1)';
        dot.style.opacity = '0.2';
      });
    }
    function handleResize() { rect = container.getBoundingClientRect(); }

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

  return (
    <div ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} />
  );
}
