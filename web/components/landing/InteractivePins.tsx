"use client";
import React, { useEffect, useRef } from "react";

interface InteractivePinsProps {
  className?: string;
  dotSpacing?: number; // px between pins
  dotRadius?: number; // px radius of each pin
  hoverRadius?: number; // px radius for color influence
  baseColor?: string; // css color
  activeColor?: string; // css color
  background?: string; // css background for canvas parent
}

// Canvas-based interactive background with a grid of pins that react to pointer proximity.
export default function InteractivePins({
  className,
  dotSpacing = 24,
  dotRadius = 2,
  hoverRadius = 120,
  baseColor = "#d1d5db", // gray-300
  activeColor = "#22d3ee", // cyan-400
  background = "transparent",
}: InteractivePinsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const dimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement as HTMLElement | null;
    function resize() {
      const rect = parent?.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor((rect?.width || window.innerWidth));
      const h = Math.floor((rect?.height || 320));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimsRef.current = { w, h };
      draw();
    }

    let raf: number | null = null;
    function draw() {
      const { w, h } = dimsRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = background;
      // background fill if wanted; transparent by default
      // ctx.fillRect(0, 0, w, h);

      const mouse = mouseRef.current;
      for (let y = dotSpacing / 2; y < h; y += dotSpacing) {
        for (let x = dotSpacing / 2; x < w; x += dotSpacing) {
          let color = baseColor;
          if (mouse) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < hoverRadius) {
              // interpolate color based on proximity
              const t = 1 - dist / hoverRadius; // 0..1
              color = lerpColor(baseColor, activeColor, easeOutQuad(t));
            }
          }
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
      animationRef.current = requestAnimationFrame(draw);
    }

    function onMove(ev: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    function onLeave() {
      mouseRef.current = null;
    }

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [dotSpacing, dotRadius, hoverRadius, baseColor, activeColor, background]);

  return (
    <canvas ref={canvasRef} className={className} aria-hidden="true" />
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const sanitized = hex.replace("#", "");
  const bigint = parseInt(sanitized.length === 3 ? sanitized.split("").map((c)=>c+c).join("") : sanitized, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
  );
}

function lerpColor(aHex: string, bHex: string, t: number) {
  const a = hexToRgb(resolveColor(aHex));
  const b = hexToRgb(resolveColor(bHex));
  const r = lerp(a.r, b.r, t);
  const g = lerp(a.g, b.g, t);
  const bl = lerp(a.b, b.b, t);
  return rgbToHex(r, g, bl);
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

// Resolves limited named colors to hex; pass through if already hex.
function resolveColor(input: string): string {
  const map: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    gray: "#9ca3af",
    "gray-300": "#d1d5db",
    "cyan-400": "#22d3ee",
    "blue-500": "#3b82f6",
    "amber-400": "#f59e0b",
    "rose-400": "#fb7185",
    "emerald-400": "#34d399",
  };
  if (input.startsWith("#")) return input;
  return map[input] || input;
}
