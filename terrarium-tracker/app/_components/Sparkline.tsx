"use client";

import { SeriesPoint } from "@/app/lib/history";

type Props = {
  data: SeriesPoint[];
  color: string;
  width?: number;
  height?: number;
};

// Tiny inline SVG line chart of the last hourly totals.
export default function Sparkline({ data, color, width = 240, height = 40 }: Props) {
  if (data.length < 2) {
    return (
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: `${height}px` }}>
        {data.length === 0 ? "Collecting hourly history…" : "1 point so far — more each hour"}
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const w = width;
  const h = height;
  const stepX = (w - pad * 2) / (data.length - 1);

  const pts = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d.value - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  const gid = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  const last = pts[pts.length - 1];

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}
