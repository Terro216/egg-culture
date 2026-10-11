// Test-only, portable into a Playwright page. Reads the displayed board, not future gate sides.
export function pilotTarget(sim, state, bankAt = 1) {
  if (state.nextRead > sim.seconds) return state.target;
  state.nextRead = sim.seconds + (state.reaction ?? 0.2);
  const apply = (n, op) => {
    const v = op.value ** BigInt(op.power ?? 1) * (op.unit ?? 1n);
    if (op.kind === 'add') return n + v;
    if (op.kind === 'subtract') return n > v ? n - v : 0n;
    if (op.kind === 'multiply') return v>0n?n * v / (op.divisor ?? 1n)||1n:0n;
    if (op.kind === 'percent') return v<100n?n * (100n - v) / 100n||1n:0n;
    if (op.kind === 'keep') return v>0n?n * v / 100n||1n:0n;
    return n * (op.divisor ?? 1n) / v||1n;
  };
  const hazard = sim.rows.find(row => row.kind === 'hazard' && row.at - sim.distance > -10 && row.at - sim.distance < 18);
  const row = hazard ?? sim.rows.find(row => row.kind !== 'modifier' && row.at > sim.distance + 3.2 && !sim.collected.has(row.id));
  let target = state.target ?? 0;
  if (row?.kind === 'gate') {
    const changed = row.swap && row.swapStartedAt !== undefined && sim.seconds - row.swapStartedAt >= 0.25;
    const ops = changed ? [row.operations[1], row.operations[0]] : row.operations;
    const values = ops.map(op => apply(sim.eggs, op));
    target = values[0] >= values[1] ? -2.65 : 2.65;
    if (values.every(n => n < sim.eggs) && row.reference !== undefined) sim.cancelNextGate();
  } else if (row?.kind === 'hazard') {
    const d = Math.min(10, row.sector), time = sim.motionTime + Math.max(0, (row.at - sim.distance - 3.2) / sim.speed);
    const x = row.hazard === 'gap' ? row.x * 0.7 : (row.sector === 0 ? row.x : row.x * 0.12) + Math.sin(time * (0.8 + d * 0.055) + row.variant) * (row.sector === 0 ? 0.7 : Math.min(3.4, 2.7 + d * 0.08));
    target = x < 0 ? 2.9 : -2.9;
  } else if (row?.kind === 'pickup' || row?.kind === 'shield' || row?.kind === 'power') target = row.x;
  else if (row?.kind === 'exit') target = row.sector + 1 >= bankAt ? -2.65 : 2.65;
  const separated=offset=>{
    const distance=sim.distance+offset,sector=distance<352?0:1+Math.floor((distance-352)/336);
    const local=distance-(sector===0?0:352+(sector-1)*336);
    return sector>=4&&(sector+sim.seed%3)%3===1&&((local>112&&local<136)||(local>204&&local<232));
  };
  if(target*sim.x<0&&(separated(3.2)||separated(-10)))target=sim.x<0?-2.65:2.65;
  state.target = target;
  return target;
}
