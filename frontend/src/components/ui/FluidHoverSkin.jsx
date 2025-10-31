import React, { useCallback, useEffect, useMemo, useRef } from "react";

const DEFAULT_COLORS = ["#3C4EF5", "#AB34F5", "#22D3EE"];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export default function FluidHoverSkin({
  as: Component = "div",
  className = "",
  children,
  colors,
  intensity = 0.75,
  style,
}) {
  const nodeRef = useRef(null);
  const mergedColors = useMemo(() => {
    const palette = colors && colors.length ? colors : DEFAULT_COLORS;
    if (palette.length >= 3) return palette.slice(0, 3);
    if (palette.length === 2) return [...palette, palette[1]];
    if (palette.length === 1) return [palette[0], palette[0], palette[0]];
    return DEFAULT_COLORS;
  }, [colors]);

  const setNodeRef = useCallback((node) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const handleMove = (event) => {
      const rect = node.getBoundingClientRect();
      const xRatio = clamp01((event.clientX - rect.left) / rect.width);
      const yRatio = clamp01((event.clientY - rect.top) / rect.height);
      node.style.setProperty("--fluid-x", `${xRatio * 100}%`);
      node.style.setProperty("--fluid-y", `${yRatio * 100}%`);
      node.style.setProperty("--fluid-scale", "1.08");
      node.style.setProperty("--fluid-opacity", `${0.55 + intensity * 0.35}`);
    };

    const handleEnter = () => {
      node.style.setProperty("--fluid-scale", "1.04");
      node.style.setProperty("--fluid-opacity", `${0.5 + intensity * 0.3}`);
    };

    const handleLeave = () => {
      node.style.setProperty("--fluid-x", "50%");
      node.style.setProperty("--fluid-y", "50%");
      node.style.setProperty("--fluid-scale", "1");
      node.style.setProperty("--fluid-opacity", `${0.4 + intensity * 0.2}`);
    };

    handleLeave();

    node.addEventListener("pointermove", handleMove);
    node.addEventListener("pointerenter", handleEnter);
    node.addEventListener("pointerleave", handleLeave);

    return () => {
      node.removeEventListener("pointermove", handleMove);
      node.removeEventListener("pointerenter", handleEnter);
      node.removeEventListener("pointerleave", handleLeave);
    };
  }, [intensity]);

  const mergedStyle = useMemo(() => ({
    "--fluid-color-1": mergedColors[0],
    "--fluid-color-2": mergedColors[1],
    "--fluid-color-3": mergedColors[2],
    "--fluid-opacity": 0.4 + intensity * 0.2,
    "--fluid-scale": 1,
    "--fluid-x": "50%",
    "--fluid-y": "50%",
    ...style,
  }), [intensity, mergedColors, style]);

  return (
    <Component ref={setNodeRef} className={`fluid-skin ${className}`} style={mergedStyle}>
      {children}
    </Component>
  );
}
