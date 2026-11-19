// utils.js — small helpers shared by every Teluk Cahaya module.
// Seeded random numbers (so the city layout is identical on every load),
// math helpers, circle-vs-AABB collision, and canvas textures painted
// at runtime so the game needs no image files at all.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest signed angle from a to b, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Push a circle (x, z, radius) out of every AABB in `boxes`.
// Each box is { minX, maxX, minZ, maxZ }. Returns true if any push happened.
export function collideCircleBoxes(x, z, radius, boxes) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    let dx = x - cx;
    let dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.000001) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      x += dx * push;
      z += dz * push;
    } else {
      // Circle centre is inside the box: shove it out along the shortest side.
      const left = x - b.minX;
      const right = b.maxX - x;
      const top = z - b.minZ;
      const bottom = b.maxZ - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.minX - radius;
      else if (m === right) x = b.maxX + radius;
      else if (m === top) z = b.minZ - radius;
      else z = b.maxZ + radius;
    }
  }
  return { x, z, hit };
}

// Make a THREE.CanvasTexture from a painter function. `repeat` tiles it.
export function canvasTexture(THREE, w, h, paint, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Facade texture: warm plaster with a grid of windows, some lit.
export function buildingFacadeTexture(THREE, base, litRatio) {
  return canvasTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 8;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
        g.fillRect(c * cw + cw * 0.2, r * ch + ch * 0.22, cw * 0.6, ch * 0.56);
      }
    }
  });
}
