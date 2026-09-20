// A bounded, dependency-free layout for the app's rectangular character cards.
// It only returns positions; callers own saving, undo and stale-result checks.
const GAP_X = 205, GAP_Y = 185;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const copyPoints = points => points.map(p => ({...p}));

function separateCards(points) {
  // Resolve crowded cards first, then use a deterministic free-slot fallback.
  for (let pass = 0; pass < 45; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y;
      const overlapX = GAP_X - Math.abs(dx), overlapY = GAP_Y - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      moved = true;
      if (overlapX < overlapY) {
        const shift = (overlapX + 1) / 2 * (dx < 0 ? -1 : 1);
        a.x -= shift; b.x += shift;
      } else {
        const shift = (overlapY + 1) / 2 * (dy < 0 ? -1 : 1);
        a.y -= shift; b.y += shift;
      }
    }
    if (!moved) break;
  }
  const placed = [];
  const blocked = (x, y) => placed.some(p => Math.abs(p.x - x) < GAP_X && Math.abs(p.y - y) < GAP_Y);
  for (const p of points) {
    const x = p.x, y = p.y;
    if (blocked(x, y)) {
      search: for (let ring = 1; ring <= points.length; ring++) {
        for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const nx = x + dx * (GAP_X + 2), ny = y + dy * (GAP_Y + 2);
          if (!blocked(nx, ny)) {p.x = nx; p.y = ny; break search;}
        }
      }
    }
    placed.push(p);
  }
}

function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < -0.001 && side(c, d, a) * side(c, d, b) < -0.001;
}

function hitsCard(a, b, p) {
  let low = 0, high = 1;
  for (const [axis, half] of [['x', 84], ['y', 76]]) {
    const delta = b[axis] - a[axis], offset = a[axis] - p[axis];
    if (Math.abs(delta) < 0.0001) {if (Math.abs(offset) > half) return false; continue;}
    const t1 = (-half - offset) / delta, t2 = (half - offset) / delta;
    low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
    if (low > high) return false;
  }
  return true;
}

function score(points, allEdges) {
  // Sample only for very dense graphs to keep work bounded at the 500-node cap.
  const stride = Math.max(1, Math.ceil(allEdges.length / 400));
  const edges = allEdges.filter((_, i) => i % stride === 0);
  let result = 0;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    result += Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) / 500;
    for (let j = 0; j < points.length; j++) {
      if (j !== a && j !== b && hitsCard(points[a], points[b], points[j])) result += 160;
    }
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j];
      if (a !== c && a !== d && b !== c && b !== d && crosses(points[a], points[b], points[c], points[d])) result += 100;
    }
  }
  const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  return result + width * height / 1000000 + (width + height) / 10000;
}

async function relax(points, edges, groups, yieldControl) {
  const n = points.length, steps = n > 150 ? 160 : 220, ideal = 245;
  for (let step = 0; step < steps; step++) {
    const fx = new Float64Array(n), fy = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
      if (Math.abs(dx) + Math.abs(dy) < 0.01) {dx = (i + 1) * 0.07; dy = (j + 1) * 0.09;}
      const squared = Math.max(100, dx * dx + dy * dy), force = ideal * ideal / squared;
      fx[i] += dx * force; fy[i] += dy * force; fx[j] -= dx * force; fy[j] -= dy * force;
    }
    for (const [a, b] of edges) {
      const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
      const force = Math.hypot(dx, dy) / ideal;
      fx[a] += dx * force; fy[a] += dy * force; fx[b] -= dx * force; fy[b] -= dy * force;
    }
    // A weak faction pull keeps related groups readable without changing membership.
    for (const group of groups) {
      const cx = group.reduce((sum, i) => sum + points[i].x, 0) / group.length;
      const cy = group.reduce((sum, i) => sum + points[i].y, 0) / group.length;
      for (const i of group) {fx[i] += (cx - points[i].x) * 0.4; fy[i] += (cy - points[i].y) * 0.4;}
    }
    const temperature = 65 * (1 - step / steps) ** 1.3 + 0.8;
    for (let i = 0; i < n; i++) {
      fx[i] -= points[i].x * 0.035; fy[i] -= points[i].y * 0.035;
      const distance = Math.hypot(fx[i], fy[i]) || 1;
      const scale = Math.min(temperature, distance) / distance;
      points[i].x += fx[i] * scale; points[i].y += fy[i] * scale;
    }
    // Yield frequently; a larger imported graph must not lock the editor.
    if (step % 16 === 15) await yieldControl();
  }
  separateCards(points);
  return points;
}

export async function arrangeGraph(board, {aspectRatio = 1.4, yieldControl = pause} = {}) {
  const characters = [...board.characters].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const indices = new Map(characters.map((p, i) => [p.id, i]));
  const parents = characters.map((_, i) => i);
  const root = i => {while (parents[i] !== i) {parents[i] = parents[parents[i]]; i = parents[i];} return i;};
  const join = (a, b) => {parents[root(a)] = root(b);};
  const edges = [], seen = new Set();
  for (const r of board.relations) {
    const a = indices.get(r.source), b = indices.get(r.target);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!seen.has(key)) {seen.add(key); edges.push([a, b]); join(a, b);}
  }
  const groups = board.factions.map(f => [...new Set(f.members.map(id => indices.get(id)).filter(i => i !== undefined))]);
  for (const group of groups) for (let i = 1; i < group.length; i++) join(group[0], group[i]);
  const components = new Map();
  characters.forEach((_, i) => {const key = root(i); if (!components.has(key)) components.set(key, []); components.get(key).push(i);});
  const boxes = [];
  for (const members of components.values()) {
    const local = new Map(members.map((i, index) => [i, index]));
    const links = edges.filter(([a]) => local.has(a)).map(([a, b]) => [local.get(a), local.get(b)]);
    const factions = groups.filter(g => g.length && local.has(g[0])).map(g => g.map(i => local.get(i)));
    const degree = members.map(() => 0);
    links.forEach(([a, b]) => {degree[a]++; degree[b]++;});
    const order = members.map((_, i) => i).sort((a, b) => degree[b] - degree[a] || a - b);
    let best, bestScore = Infinity;
    // Try two deterministic starting arrangements for small graphs, one for large ones.
    const trials = members.length <= 80 ? 2 : 1;
    for (let trial = 0; trial < trials; trial++) {
      const points = members.map(i => ({id: characters[i].id, x: 0, y: 0}));
      order.forEach((i, rank) => {
        const angle = rank * (trial ? 2.1 : 2.39996323), radius = 170 * Math.sqrt(rank);
        points[i].x = Math.cos(angle) * radius; points[i].y = Math.sin(angle) * radius;
      });
      const candidate = members.length > 1 ? await relax(points, links, factions, yieldControl) : points;
      const candidateScore = score(candidate, links);
      if (candidateScore < bestScore) {best = candidate; bestScore = candidateScore;}
    }
    // A good existing drawing remains a candidate rather than being blindly replaced.
    const existing = members.map(i => ({id: characters[i].id, x: characters[i].x, y: characters[i].y}));
    separateCards(existing);
    if (score(existing, links) <= bestScore) best = existing;
    const minX = Math.min(...best.map(p => p.x)), minY = Math.min(...best.map(p => p.y));
    const width = Math.max(...best.map(p => p.x)) - minX + GAP_X;
    const height = Math.max(...best.map(p => p.y)) - minY + GAP_Y;
    boxes.push({points: copyPoints(best).map(p => ({...p, x: p.x - minX, y: p.y - minY})), width, height});
    await yieldControl();
  }
  // Shelf-pack disconnected groups, including isolated people, into a compact canvas.
  boxes.sort((a, b) => b.height - a.height || b.width - a.width);
  const area = boxes.reduce((sum, box) => sum + (box.width + 90) * (box.height + 110), 0);
  const rowWidth = Math.max(400, Math.sqrt(area * Math.max(0.7, Math.min(2, aspectRatio))), ...boxes.map(b => b.width));
  const result = [];
  let x = 160, y = 160, rowHeight = 0;
  for (const box of boxes) {
    if (x > 160 && x - 160 + box.width > rowWidth) {x = 160; y += rowHeight + 110; rowHeight = 0;}
    result.push(...box.points.map(p => ({id: p.id, x: Math.round(p.x + x), y: Math.round(p.y + y)})));
    x += box.width + 90; rowHeight = Math.max(rowHeight, box.height);
  }
  return result;
}
