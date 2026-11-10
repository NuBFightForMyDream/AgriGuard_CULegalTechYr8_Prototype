import { cx } from "./ui";

/** Illustrated cover for a produce card (no photo uploads yet): a tinted backdrop with the fruit drawn in SVG. */
const BG: Record<string, string> = {
  mango: "from-amber-100 via-yellow-50 to-lime-100",
  durian: "from-lime-100 via-green-50 to-emerald-100",
  mangosteen: "from-fuchsia-100 via-rose-50 to-purple-100",
  longan: "from-amber-50 via-orange-50 to-yellow-100",
  orange: "from-orange-100 via-amber-50 to-yellow-100",
  rambutan: "from-rose-100 via-red-50 to-orange-100",
  other: "from-green-100 via-lime-50 to-emerald-100",
};

function Leaf({ x, y, r = 0, s = 1 }: { x: number; y: number; r?: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
      d="M0 0 C 8 -10, 22 -10, 30 0 C 22 8, 8 8, 0 0 Z"
      fill="#4d7c0f"
      opacity="0.9"
    />
  );
}

function Mango({ x, y, s = 1, r = -20 }: { x: number; y: number; s?: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="26" ry="19" fill="#f59e0b" />
      <ellipse cx="-8" cy="-6" rx="9" ry="5" fill="#fde68a" opacity="0.7" />
      <path d="M22 -6 q 6 -4 10 -2" stroke="#65a30d" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Leaf x={26} y={-8} r={-30} s={0.7} />
    </g>
  );
}

function Durian({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const spikes = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${Math.cos(a) * 30},${Math.sin(a) * 26} ${Math.cos(a + 0.2) * 22},${Math.sin(a + 0.2) * 19}`;
  }).join(" ");
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <polygon points={spikes} fill="#65a30d" />
      <ellipse cx="0" cy="0" rx="23" ry="20" fill="#84cc16" />
      {[-10, 0, 10].map((dx) => [-8, 4].map((dy) => <circle key={`${dx}${dy}`} cx={dx} cy={dy} r="2.2" fill="#4d7c0f" />))}
      <rect x="-2" y="-34" width="4" height="10" rx="2" fill="#78350f" />
    </g>
  );
}

function Mangosteen({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="22" fill="#6b21a8" />
      <ellipse cx="-7" cy="-7" rx="7" ry="4" fill="#c084fc" opacity="0.5" />
      {[-50, -15, 15, 50].map((a) => (
        <ellipse key={a} cx="0" cy="-22" rx="5" ry="8" fill="#4d7c0f" transform={`rotate(${a} 0 -14)`} />
      ))}
      <rect x="-1.5" y="-34" width="3" height="8" rx="1.5" fill="#3f6212" />
    </g>
  );
}

function Longan({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const pts = [[0, 0], [-14, 8], [14, 8], [-7, 20], [7, 20], [0, 32], [-20, -4], [20, -4]];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -24 L0 -6 M0 -14 L-18 -8 M0 -14 L18 -8" stroke="#78350f" strokeWidth="2.5" fill="none" />
      {pts.map(([px, py], i) => (
        <g key={i}>
          <circle cx={px} cy={py} r="9" fill="#d6a76c" />
          <circle cx={px - 3} cy={py - 3} r="2.5" fill="#f5deb3" opacity="0.8" />
        </g>
      ))}
    </g>
  );
}

function Orange({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="22" fill="#f97316" />
      <circle cx="-7" cy="-7" r="6" fill="#fdba74" opacity="0.6" />
      <Leaf x={0} y={-20} r={-40} s={0.7} />
    </g>
  );
}

function Rambutan({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const hairs = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    return (
      <path
        key={i}
        d={`M${Math.cos(a) * 18} ${Math.sin(a) * 18} q ${Math.cos(a + 0.6) * 8} ${Math.sin(a + 0.6) * 8} ${Math.cos(a) * 12} ${Math.sin(a) * 12}`}
        stroke="#16a34a"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    );
  });
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {hairs}
      <circle r="19" fill="#dc2626" />
      <circle cx="-6" cy="-6" r="5" fill="#f87171" opacity="0.7" />
    </g>
  );
}

function Basket({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx="-12" cy="-10" r="11" fill="#f59e0b" />
      <circle cx="10" cy="-12" r="10" fill="#dc2626" />
      <circle cx="0" cy="-20" r="9" fill="#84cc16" />
      <path d="M-30 -4 h60 l-8 28 h-44 z" fill="#a16207" />
      <path d="M-26 6 h52 M-24 14 h48" stroke="#854d0e" strokeWidth="2" />
    </g>
  );
}

const DRAW: Record<string, (p: { x: number; y: number; s?: number }) => React.ReactNode> = {
  mango: (p) => <Mango {...p} />,
  durian: (p) => <Durian {...p} />,
  mangosteen: (p) => <Mangosteen {...p} />,
  longan: (p) => <Longan {...p} />,
  orange: (p) => <Orange {...p} />,
  rambutan: (p) => <Rambutan {...p} />,
  other: (p) => <Basket {...p} />,
};

export function ProduceArt({ type, className, compact }: { type: string; className?: string; compact?: boolean }) {
  const draw = DRAW[type] ?? DRAW.other;
  return (
    <div className={cx("relative overflow-hidden bg-gradient-to-br", BG[type] ?? BG.other, className)} aria-hidden>
      <svg viewBox="0 0 240 110" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
        <circle cx="210" cy="10" r="46" fill="white" opacity="0.35" />
        <circle cx="20" cy="105" r="38" fill="white" opacity="0.3" />
        <Leaf x={14} y={22} r={-20} s={1.3} />
        <Leaf x={196} y={92} r={160} s={1.1} />
        {compact ? (
          draw({ x: 120, y: 58, s: 1.15 })
        ) : (
          <>
            {draw({ x: 92, y: 62, s: 1.2 })}
            {draw({ x: 150, y: 52, s: 0.95 })}
            {draw({ x: 186, y: 70, s: 0.7 })}
          </>
        )}
      </svg>
    </div>
  );
}
