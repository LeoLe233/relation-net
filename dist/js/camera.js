// Camera math is independent of graph data and never changes saved node positions.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
export const FOCUS_MIN_ZOOM = 0.85;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const viewportCenter = area => ({x:area.left + area.width / 2, y:area.top + area.height / 2});

export function centeredCamera(point, area, scale = 1) {
  const center = viewportCenter(area), k = clamp(scale, MIN_ZOOM, MAX_ZOOM);
  return {x:center.x - point.x * k, y:center.y - point.y * k, k};
}

export function fittedCamera(points, area, {focus = null, minZoom = MIN_ZOOM} = {}) {
  if (!points.length) return centeredCamera({x:0,y:0}, area);
  const left = Math.min(...points.map(p=>p.x)) - 115;
  const right = Math.max(...points.map(p=>p.x)) + 115;
  const top = Math.min(...points.map(p=>p.y)) - 125;
  const bottom = Math.max(...points.map(p=>p.y)) + 110;
  const fitScale = Math.min(area.width / (right-left), area.height / (bottom-top));
  const k = clamp(fitScale, minZoom, 1.3);
  // When the neighborhood is too large, keep its chosen person readable and centered.
  const center = focus && fitScale < minZoom ? focus : {x:(left+right)/2,y:(top+bottom)/2};
  return centeredCamera(center, area, k);
}

export function zoomedCamera(camera, factor, point) {
  const k = clamp(camera.k * factor, MIN_ZOOM, MAX_ZOOM);
  return {x:point.x - (point.x-camera.x)*k/camera.k, y:point.y - (point.y-camera.y)*k/camera.k, k};
}

export function pinchedCamera(camera, initial, current) {
  const midpoint = points => ({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
  const distance = points => Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
  const before=midpoint(initial),after=midpoint(current);
  const next=zoomedCamera(camera,distance(current)/Math.max(1,distance(initial)),before);
  return {...next,x:next.x+after.x-before.x,y:next.y+after.y-before.y};
}

export function resizedCamera(camera, previousArea, nextArea) {
  const before = viewportCenter(previousArea), after = viewportCenter(nextArea);
  return {...camera, x:camera.x + after.x-before.x, y:camera.y + after.y-before.y};
}
