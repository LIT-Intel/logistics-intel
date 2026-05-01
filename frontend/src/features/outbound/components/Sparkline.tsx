import React from "react";

export function Sparkline({
  values,
  color = "#3B82F6",
  width = 80,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) {
    return (
      <div
        className="rounded"
        style={{
          width,
          height,
          background: "#F1F5F9",
        }}
      />
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * width},${
          height - ((v - min) / range) * height
        }`,
    )
    .join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`0,${height} ${pts} ${width},${height}`}
        fill={color}
        opacity={0.08}
      />
    </svg>
  );
}