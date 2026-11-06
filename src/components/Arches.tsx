/** Line-art of the three arches from the logo, drawn as hairlines. Decorative. */
export function ArchesArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 420" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9cfa6" stopOpacity=".9" />
          <stop offset="1" stopColor="#c9a66b" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 200, 400].map((x, i) => (
        <g key={x} stroke="url(#ag)" strokeWidth="1.2">
          <path d={`M${x + 10} 420V110a90 90 0 0 1 180 0v310`} />
          <path d={`M${x + 30} 420V118a70 70 0 0 1 140 0v302`} strokeOpacity=".5" />
          {i === 0 && <path d={`M${x + 10} 330l70-70h110`} strokeOpacity=".7" />}
          {i === 1 && <path d={`M${x + 10} 400c80 0 180-60 180-170M${x + 70} 90l30 40`} strokeOpacity=".7" />}
          {i === 2 && <path d={`M${x + 10} 300l120-110 60 40`} strokeOpacity=".7" />}
        </g>
      ))}
    </svg>
  );
}

export function Silk() {
  return (
    <>
      <div className="silk" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="grain" aria-hidden />
      <div className="fade-b" aria-hidden />
    </>
  );
}
