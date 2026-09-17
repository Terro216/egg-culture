const MAX_SPEED = 160;
const ticks = Array.from({ length: 9 }, (_, index) => index * 20);
const point = (speed: number, radius: number) => {
  const angle = (speed / MAX_SPEED - 0.5) * Math.PI;
  return { x: 90 + Math.sin(angle) * radius, y: 74 - Math.cos(angle) * radius };
};

export function Speedometer({ speed, unit }: { speed: number; unit: string }) {
  const value = Math.max(0, Math.round(speed * 3.6));
  const fraction = Math.min(1, value / MAX_SPEED);
  return <svg className="egg-road-speedometer" viewBox="0 0 180 108" role="img" aria-label={`${value} ${unit}`}>
    <path className="egg-road-dial" d="M36 74 A54 54 0 0 1 144 74" pathLength="1" />
    <path className="egg-road-dial-fill" d="M36 74 A54 54 0 0 1 144 74" pathLength="1" strokeDasharray={`${fraction} 1`} />
    {ticks.map(speed => {
      const major = speed % 40 === 0, from = point(speed, 47), to = point(speed, major ? 39 : 43), label = point(speed, 67);
      return <g key={speed}>
        <line className="egg-road-dial-tick" x1={from.x} y1={from.y} x2={to.x} y2={to.y} opacity={major ? 1 : 0.5} />
        {major && <text className="egg-road-dial-label" x={label.x} y={label.y + 3}>{speed === MAX_SPEED ? `${speed}+` : speed}</text>}
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
