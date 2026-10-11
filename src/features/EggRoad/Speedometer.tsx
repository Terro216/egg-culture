const point = (fraction: number, radius: number) => {
  const angle = (fraction - 0.5) * Math.PI;
  return { x: 90 + Math.sin(angle) * radius, y: 74 - Math.cos(angle) * radius };
};

export function Speedometer({ speed, unit, maximum = 160 }: { speed: number; unit: string; maximum?: number }) {
  const value = Math.max(0, Math.round(speed * 3.6));
  const fraction = Math.min(1, value / maximum);
  return <svg className="egg-road-speedometer" viewBox="0 0 180 108" role="img" aria-label={`${value} ${unit}`}>
    <path className="egg-road-dial" d="M36 74 A54 54 0 0 1 144 74" pathLength="1" />
    <path className="egg-road-dial-fill" d="M36 74 A54 54 0 0 1 144 74" pathLength="1" strokeDasharray={`${fraction} 1`} />
    {Array.from({ length: 9 }, (_, index) => {
      const speed = index * maximum / 8, major = index % 2 === 0, from = point(index / 8, 47), to = point(index / 8, major ? 39 : 43), label = point(index / 8, 67);
      return <g key={index}>
        <line className="egg-road-dial-tick" x1={from.x} y1={from.y} x2={to.x} y2={to.y} opacity={major ? 1 : 0.5} />
        {major && <text className="egg-road-dial-label" x={label.x} y={label.y + 3}>{speed === maximum ? `${speed}+` : speed}</text>}
      </g>;
    })}
    <g className="egg-road-needle" style={{ transform: `rotate(${fraction * 180 - 90}deg)` }}>
      <path d="M87.5 74 L90 31 L92.5 74 Z" />
    </g>
    <circle className="egg-road-dial-hub" cx="90" cy="74" r="4" />
    <text className="egg-road-speed-value" x="90" y="94">{value}</text>
    <text className="egg-road-speed-unit" x="90" y="105">{unit}</text>
  </svg>;
}
