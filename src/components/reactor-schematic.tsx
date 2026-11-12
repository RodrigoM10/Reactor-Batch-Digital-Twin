"use client";

import type { EnergyMode } from "@/engine";
import { fmt } from "@/lib/format";

interface Props {
  T: number;
  X: number;
  Tlow: number; // T que se pinta como "fría"
  Thigh: number; // T que se pinta como "caliente"
  mode: EnergyMode;
  T_cool?: number;
  T_cool_out?: number | null;
  runaway?: boolean;
  label?: string;
}

/** Esquema del reactor: color del líquido según T, agitador, camisa con refrigerante y barra de conversión. */
export function ReactorSchematic({ T, X, Tlow, Thigh, mode, T_cool, T_cool_out, runaway, label }: Props) {
  const heat = Thigh > Tlow ? Math.min(Math.max((T - Tlow) / (Thigh - Tlow), 0), 1) : 0;
  const liquid = `color-mix(in oklab, var(--liquid-hot) ${Math.round(heat * 100)}%, var(--liquid-cold))`;
  const cooled = mode === "icq" || mode === "jacket";
  const spin = `${Math.max(0.35, 1.4 - heat * 0.9)}s`;
  const bubbles = heat > 0.35;
  const xPct = Math.min(Math.max(X, 0), 1);

  return (
    <svg viewBox="0 0 340 300" className="h-full w-full" role="img" aria-label={label ?? `Reactor a ${fmt(T)} K con conversión ${fmt(X, 3)}`}>
      <defs>
        <clipPath id="vessel-clip">
          <path d="M90 70 h140 v150 a30 30 0 0 1 -30 30 h-80 a30 30 0 0 1 -30 -30 z" />
        </clipPath>
        <linearGradient id="liquid-shine" x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.18" />
          <stop offset="0.4" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Motor y eje */}
      <rect x="146" y="14" width="28" height="22" rx="4" fill="var(--surface-2)" stroke="var(--border)" />
      <line x1="160" y1="36" x2="160" y2="70" stroke="var(--muted)" strokeWidth="3" />

      {/* Camisa de enfriamiento */}
      {cooled && (
        <g>
          <path
            d="M78 92 v128 a42 42 0 0 0 42 42 h80 a42 42 0 0 0 42 -42 v-128"
            fill="none"
            stroke="var(--cool)"
            strokeOpacity="0.25"
            strokeWidth="14"
          />
          <path
            d="M78 92 v128 a42 42 0 0 0 42 42 h80 a42 42 0 0 0 42 -42 v-128"
            fill="none"
            stroke="var(--cool)"
            strokeWidth="2"
            strokeDasharray="6 6"
            style={{ animation: "flow 1s linear infinite" }}
          />
          <line x1="22" y1="250" x2="80" y2="250" stroke="var(--cool)" strokeWidth="4" />
          <line x1="242" y1="100" x2="300" y2="100" stroke="var(--heat)" strokeOpacity="0.7" strokeWidth="4" />
          <text x="22" y="266" fontSize="10" fill="var(--cool)" className="num">
            {fmt(T_cool)} K
          </text>
          {T_cool_out !== null && T_cool_out !== undefined && (
            <text x="300" y="92" fontSize="10" textAnchor="end" fill="var(--heat)" className="num">
              {fmt(T_cool_out)} K
            </text>
          )}
        </g>
      )}

      {/* Recipiente y líquido */}
      <g clipPath="url(#vessel-clip)">
        <rect x="90" y="70" width="140" height="190" fill="var(--surface-2)" />
        <rect x="90" y="100" width="140" height="160" style={{ fill: liquid, transition: "fill 120ms linear" }} />
        <rect x="90" y="100" width="140" height="160" fill="url(#liquid-shine)" />
        {bubbles &&
          [110, 135, 185, 210].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={250}
              r={3 + (i % 2)}
              fill="white"
              fillOpacity="0.6"
              style={{ animation: `bubble ${2.2 - heat}s ease-in ${i * 0.4}s infinite` }}
            />
          ))}
      </g>
      <path
        d="M90 70 h140 v150 a30 30 0 0 1 -30 30 h-80 a30 30 0 0 1 -30 -30 z"
        fill="none"
        stroke={runaway ? "var(--danger)" : "var(--text)"}
        strokeOpacity={runaway ? 1 : 0.55}
        strokeWidth={runaway ? 3 : 2}
      />

      {/* Agitador */}
      <line x1="160" y1="70" x2="160" y2="215" stroke="var(--muted)" strokeWidth="3" />
      <g style={{ transformOrigin: "160px 215px", transformBox: "view-box", animation: `spin ${spin} linear infinite` }}>
        <ellipse cx="160" cy="215" rx="26" ry="5" fill="var(--muted)" fillOpacity="0.8" />
      </g>

      {/* Termómetro */}
      <g>
        <rect x="262" y="140" width="10" height="100" rx="5" fill="var(--surface-2)" stroke="var(--border)" />
        <rect
          x="264"
          y={140 + 98 * (1 - heat)}
          width="6"
          height={98 * heat + 2}
          rx="3"
          style={{ fill: liquid }}
        />
        <circle cx="267" cy="246" r="9" style={{ fill: liquid }} stroke="var(--border)" />
        <text x="282" y="200" fontSize="13" fontWeight="600" fill="var(--text)" className="num">
          {fmt(T)} K
        </text>
        <text x="282" y="214" fontSize="10" fill="var(--muted)">
          T reactor
        </text>
      </g>

      {/* Conversión */}
      <g>
        <rect x="40" y="110" width="12" height="100" rx="6" fill="var(--surface-2)" stroke="var(--border)" />
        <rect x="42" y={112 + 96 * (1 - xPct)} width="8" height={96 * xPct} rx="4" fill="var(--accent)" />
        <text x="46" y="98" fontSize="13" fontWeight="600" textAnchor="middle" fill="var(--accent)" className="num">
          {(xPct * 100).toFixed(1)}%
        </text>
        <text x="46" y="226" fontSize="10" textAnchor="middle" fill="var(--muted)">
          X
        </text>
      </g>

      {runaway && (
        <text x="160" y="292" fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--danger)">
          ⚠ Riesgo de descontrol térmico
        </text>
      )}
    </svg>
  );
}
