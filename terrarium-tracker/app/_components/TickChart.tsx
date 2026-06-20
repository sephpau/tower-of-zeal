"use client";

import { useState } from "react";
import { TIERS } from "@/app/lib/tiers";
import { TickPoint } from "@/app/lib/tickHistory";
import styles from "./TickChart.module.css";

const nf = new Intl.NumberFormat("en-US");
const fmtRatio = (v: number) => v.toFixed(6);

type Metric = "ratio" | "flame";
type Props = { history?: Record<string, TickPoint[]> };

// Chart geometry (viewBox units).
const W = 900;
const H = 260;
const PADL = 78;
const PADR = 28;
const PADT = 18;
const PADB = 28;

export default function TickChart({ history = {} }: Props) {
  const [activeKey, setActiveKey] = useState(TIERS[0].key);
  const [metric, setMetric] = useState<Metric>("ratio");

  const active = TIERS.find((t) => t.key === activeKey) ?? TIERS[0];
  const accent = active.accent;
  const series = history[activeKey] ?? [];

  const valueOf = (p: TickPoint) =>
    metric === "ratio" ? p.pool / p.total : p.total;
  const fmt = (v: number | null) =>
    v == null ? "—" : metric === "ratio" ? fmtRatio(v) : nf.format(Math.round(v));

  const values = series.map(valueOf);
  const n = values.length;
  const now = n ? values[n - 1] : null;
  const avg = n ? values.reduce((a, b) => a + b, 0) / n : null;
  const min = n ? Math.min(...values) : null;
  const max = n ? Math.max(...values) : null;

  // Y scale with a little headroom so the line isn't glued to the edges.
  const lo = min ?? 0;
  const hi = max ?? 1;
  const pad = (hi - lo || hi || 1) * 0.18;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const xAt = (i: number) =>
    PADL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) =>
    PADT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const pts = values.map((v, i) => `${xAt(i)},${yAt(v)}`);
  const linePath = pts.length ? "M" + pts.join(" L") : "";
  const areaPath = pts.length
    ? `M${xAt(0)},${PADT + innerH} L${pts.join(" L")} L${xAt(n - 1)},${
        PADT + innerH
      } Z`
    : "";
  const gridVals = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <span className="eyebrow">Logged hourly · this browser</span>
        <h2 className={styles.heading}>bAXS / Tick · history</h2>
        <p className={styles.sub}>
          bAXS earned per unit of flame, logged each tick as the site is used.
        </p>
      </div>

      <div className={`glass-card ${styles.panel}`}>
        <div className={styles.controls}>
          <div className={styles.tabs}>
            {TIERS.map((t) => {
              const on = t.key === activeKey;
              const has = (history[t.key]?.length ?? 0) > 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`${styles.tab} ${on ? styles.tabActive : ""}`}
                  style={on ? { borderColor: t.accent, color: t.accent } : undefined}
                  onClick={() => setActiveKey(t.key)}
                >
                  {t.name}
                  {has ? null : <span className={styles.tabDim}> ·</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.toggle}>
            <button
              type="button"
              className={metric === "ratio" ? styles.toggleOn : styles.toggleBtn}
              onClick={() => setMetric("ratio")}
            >
              bAXS / flame
            </button>
            <button
              type="button"
              className={metric === "flame" ? styles.toggleOn : styles.toggleBtn}
              onClick={() => setMetric("flame")}
            >
              Competing flame
            </button>
          </div>
        </div>

        <div className={styles.stats}>
          <span className={styles.stat}>
            now <b style={{ color: accent }}>{fmt(now)}</b>
          </span>
          <span className={styles.stat}>
            avg <b>{fmt(avg)}</b>
          </span>
          <span className={styles.stat}>
            min <b>{fmt(min)}</b>
          </span>
          <span className={styles.stat}>
            max <b>{fmt(max)}</b>
          </span>
          <span className={styles.count}>
            {n} tick{n === 1 ? "" : "s"} logged
          </span>
        </div>

        {n === 0 ? (
          <div className={styles.empty}>
            Collecting ticks… the chart builds as the hourly tick advances. Keep
            the site open or check back later.
          </div>
        ) : (
          <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`}>
            {gridVals.map((gv, i) => (
              <g key={i}>
                <line
                  x1={PADL}
                  x2={W - PADR}
                  y1={yAt(gv)}
                  y2={yAt(gv)}
                  stroke="rgba(255,255,255,0.07)"
                />
                <text x={PADL - 10} y={yAt(gv) + 4} textAnchor="end" className={styles.axis}>
                  {fmt(gv)}
                </text>
              </g>
            ))}
            {areaPath ? <path d={areaPath} fill={accent} opacity="0.12" /> : null}
            {linePath ? (
              <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5" />
            ) : null}
            {values.map((v, i) =>
              i === n - 1 ? (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r="4.5" fill={accent} />
              ) : null
            )}
            <text x={PADL} y={H - 7} textAnchor="start" className={styles.axis}>
              #{series[0].tick}
            </text>
            {n > 1 ? (
              <text x={W - PADR} y={H - 7} textAnchor="end" className={styles.axis}>
                #{series[n - 1].tick}
              </text>
            ) : null}
          </svg>
        )}
      </div>
    </section>
  );
}
