import React, { useEffect, useRef } from "react";

export default function PlusField({
  className,
  gap = 28,
  length = 8,
  strokeWidth = 1.2,
  baseColor = "#d0d5ff",
  activeColor = "#4f46e5",
  hoverRadius = 160,
}) {
  const canvasRef = useRef(null);
  const mouseRef = useRef(null);
  const dimsRef = useRef({ w: 0, h: 0 });
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;

    function resize() {
      const rect = parent?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(rect?.width || window.innerWidth);
      const h = Math.floor(rect?.height || 320);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimsRef.current = { w, h };
    }

    function draw() {
      const { w, h } = dimsRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";

      const mouse = mouseRef.current;

      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          let color = baseColor;
          if (mouse) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < hoverRadius) {
              const t = 1 - dist / hoverRadius;
              color = lerpColor(baseColor, activeColor, easeOutQuad(t));
            }
          }

          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(x - length / 2, y);
          ctx.lineTo(x + length / 2, y);
          ctx.moveTo(x, y - length / 2);
          ctx.lineTo(x, y + length / 2);
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onLeave() {
      mouseRef.current = null;
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [gap, length, strokeWidth, baseColor, activeColor, hoverRadius]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function hexToRgb(hex) {
  const sanitized = hex.replace("#", "");
  const full = sanitized.length === 3 ? sanitized.split("").map((c) => c + c).join("") : sanitized;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function lerpColor(aHex, bHex, t) {
  const a = hexToRgb(resolveColor(aHex));
  const b = hexToRgb(resolveColor(bHex));
  const r = lerp(a.r, b.r, t);
  const g = lerp(a.g, b.g, t);
  const bl = lerp(a.b, b.b, t);
  return rgbToHex(r, g, bl);
}

function resolveColor(value) {
  if (value.startsWith("#")) return value;
  const map = {
    "slate-400": "#94a3b8",
    "slate-500": "#64748b",
    "brand-primary": "#3C4EF5",
  };
  return map[value] || value;
}
