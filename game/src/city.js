// city.js — procedural Teluk Cahaya: a ~10x10-block coastal city.
// Districts: Pelabuhan (harbour, west), Menara Kaca (glass towers, north),
// Pasar Lama (old market, centre), Bukit Perumahan (hillside homes, east),
// Pantai (beach strip, south). One seeded layout, identical every load.
// Exports the road graph (for traffic), building colliders (AABBs),
// parking spots and the player spawn point.

import * as THREE from 'three';
import { mulberry32, clamp, canvasTexture } from './utils.js';

export const PITCH = 48; // distance between road centrelines
export const ROAD_HALF = 6; // half the road width
export const BLOCK = PITCH - ROAD_HALF * 2; // building block size
export const GRID = 10; // blocks per side
export const HALF_CITY = (GRID * PITCH) / 2; // 240
export const GROUND_SIZE = 640; // ground plane covers a little past the roads

// Block indices run 0..9; block (i, j) centre:
export function blockCentre(i, j) {
  return {
    x: -HALF_CITY + PITCH * i + PITCH / 2,
    z: -HALF_CITY + PITCH * j + PITCH / 2,
  };
}

export function districtAt(i, j) {
  if (i <= 1) return 'pelabuhan';
  if (j <= 1) return 'menara';
  if (i >= 7) return 'bukit';
  if (j >= 7) return 'pantai';
  if (i >= 3 && i <= 6 && j >= 3 && j <= 6) return 'pasar';
  return 'campur';
}

const DISTRICT_COLORS = {
  menara: [0x7fb4d8, 0x9fc6e2, 0x6a9fc0, 0x8fb8d4],
  pasar: [0xe8b04b, 0xd98a4a, 0xc96f4a, 0xe0a866, 0xb5764a],
  bukit: [0xf2e3c6, 0xe8c9a0, 0xd9b48a, 0xc9a586, 0xe0d0b0],
  pantai: [0xf5e9d0, 0xe8d9b0, 0xd9c9a0, 0xffffff],
  campur: [0xb8b0a4, 0x9aa8b8, 0xc0a890, 0x8a9aa8, 0xd0c0a8],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Paint the ground from above: asphalt roads with dashed centrelines,
// pale sidewalks, a sand beach in the south and water west + south.
function groundTexture(THREE, rng) {
  const S = GROUND_SIZE;
  const scale = 2048 / S;
  return canvasTexture(
    THREE,
    2048,
    2048,
    (g) => {
      const px = (x) => (x + S / 2) * scale;
      const py = (z) => (z + S / 2) * scale;
      // Base: dry grass / concrete.
      g.fillStyle = '#8a9a6a';
      g.fillRect(0, 0, 2048, 2048);
      // Sand beach, south strip.
      g.fillStyle = '#e8d5a0';
      g.fillRect(0, py(246), 2048, 2048 - py(246));
      // Water: west of the harbour and south past the beach.
      g.fillStyle = '#3a7ca8';
      g.fillRect(0, 0, px(-246), 2048);
      g.fillRect(0, py(302), 2048, 2048 - py(302));
      // Water shimmer lines.
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 3;
      for (let k = 0; k < 40; k++) {
        const x = rng() * px(-246);
        const z = rng() * 2048;
        g.beginPath();
        g.moveTo(x, z);
        g.lineTo(x + 40 + rng() * 60, z);
        g.stroke();
      }
      // Blocks: sidewalk slabs.
      g.fillStyle = '#b8b0a0';
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const c = blockCentre(i, j);
          g.fillRect(px(c.x - BLOCK / 2 - 2), py(c.z - BLOCK / 2 - 2), (BLOCK + 4) * scale, (BLOCK + 4) * scale);
        }
      }
      // Roads.
      g.fillStyle = '#54575e';
      for (let k = -5; k <= 5; k++) {
        const c = k * PITCH;
        g.fillRect(px(c - ROAD_HALF), 0, ROAD_HALF * 2 * scale, 2048);
        g.fillRect(0, py(c - ROAD_HALF), 2048, ROAD_HALF * 2 * scale);
      }
      // Dashed centrelines.
      g.fillStyle = '#e8d44a';
      for (let k = -5; k <= 5; k++) {
        const c = k * PITCH;
        for (let d = -HALF_CITY; d < HALF_CITY; d += 12) {
          g.fillRect(px(c - 0.25), py(d), 0.5 * scale, 4 * scale);
          g.fillRect(px(d), py(c - 0.25), 4 * scale, 0.5 * scale);
        }
      }
      // Crosswalks at every intersection.
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let a = -5; a <= 5; a++) {
        for (let b = -5; b <= 5; b++) {
          const x = a * PITCH;
          const z = b * PITCH;
          for (let s = -4; s <= 4; s += 2) {
            g.fillRect(px(x + s - 0.7), py(z - ROAD_HALF - 0.5), 1.4 * scale, 1 * scale);
            g.fillRect(px(x - ROAD_HALF - 0.5), py(z + s - 0.7), 1 * scale, 1.4 * scale);
          }
        }
      }
      // Central plaza in Pasar Lama.
      g.fillStyle = '#c9b896';
      const plaza = blockCentre(4, 4);
      g.fillRect(px(plaza.x - 14), py(plaza.z - 14), 28 * scale, 28 * scale);
    },
  );
}

function facadeTexture(THREE, repeatX, repeatY) {
  return canvasTexture(
    THREE,
    128,
    256,
    (g, w, h) => {
      g.fillStyle = '#cfc8bc';
      g.fillRect(0, 0, w, h);
      const cols = 4;
      const rows = 8;
      const cw = w / cols;
      const ch = h / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = Math.random() < 0.28;
          g.fillStyle = lit ? '#ffd98a' : '#31404f';
          g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.24, cw * 0.56, ch * 0.52);
        }
      }
    },
    repeatX,
    repeatY,
  );
}

export function buildCity(scene) {
  const rng = mulberry32(20261119);
  const colliders = [];
  const parkingSpots = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ map: groundTexture(THREE, rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  group.add(ground);

  // Water planes (animated slightly by main.js via userData).
  const waterMat = new THREE.MeshLambertMaterial({
    color: 0x2f6f9e,
    transparent: true,
    opacity: 0.85,
  });
  const waterWest = new THREE.Mesh(new THREE.PlaneGeometry(120, GROUND_SIZE), waterMat);
  waterWest.rotation.x = -Math.PI / 2;
  waterWest.position.set(-HALF_CITY - 60 - 6, 0.15, 0);
  group.add(waterWest);
  const waterSouth = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, 120), waterMat.clone());
  waterSouth.rotation.x = -Math.PI / 2;
  waterSouth.position.set(0, 0.15, HALF_CITY + 60 + 6);
  group.add(waterSouth);

  // ---- Buildings, bucketed by height band so window texture stays sane.
  const bands = {
    low: { maxH: 12, tex: facadeTexture(THREE, 2, 2), list: [] },
    mid: { maxH: 32, tex: facadeTexture(THREE, 3, 4), list: [] },
    tall: { maxH: 999, tex: facadeTexture(THREE, 4, 8), list: [] },
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // origin at the bottom centre

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const d = districtAt(i, j);
      const c = blockCentre(i, j);
      if (d === 'pelabuhan') {
        // Shipping containers, stacked 1-2 high.
        for (let k = 0; k < 5; k++) {
          const w = 6 + rng() * 2;
          const dep = 2.6;
          const h = 2.6 * (rng() < 0.4 ? 2 : 1);
          const x = c.x + (rng() - 0.5) * 22;
          const z = c.z + (rng() - 0.5) * 22;
          bands.low.list.push({ x, z, w, d: dep, h, color: pick(rng, [0xb0503c, 0x3c6fb0, 0x4a8a4a, 0xc0a030, 0x7050a0]) });
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - dep / 2, maxZ: z + dep / 2 });
        }
        continue;
      }
      if (d === 'menara') {
        const h = 55 + rng() * 55;
        const w = 20 + rng() * 8;
        bands.tall.list.push({ x: c.x, z: c.z, w, d: w, h, color: pick(rng, DISTRICT_COLORS.menara) });
        colliders.push({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - w / 2, maxZ: c.z + w / 2 });
        continue;
      }
      if (d === 'pasar') {
        // Low shop-houses around a small courtyard; stalls added below.
        const n = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = 9 + rng() * 6;
          const dep = 9 + rng() * 6;
          const h = 7 + rng() * 8;
          const x = c.x + (rng() - 0.5) * 18;
          const z = c.z + (rng() - 0.5) * 18;
          bands.low.list.push({ x, z, w, d: dep, h, color: pick(rng, DISTRICT_COLORS.pasar) });
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - dep / 2, maxZ: z + dep / 2 });
        }
        continue;
      }
      if (d === 'bukit') {
        const n = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = 8 + rng() * 5;
          const dep = 8 + rng() * 5;
          const h = 5 + rng() * 5;
          const x = c.x + (rng() - 0.5) * 20;
          const z = c.z + (rng() - 0.5) * 20;
          bands.low.list.push({ x, z, w, d: dep, h, color: pick(rng, DISTRICT_COLORS.bukit) });
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - dep / 2, maxZ: z + dep / 2 });
        }
        continue;
      }
      if (d === 'pantai') {
        if (rng() < 0.6) {
          const w = 10 + rng() * 6;
          const dep = 8 + rng() * 4;
          const h = 6 + rng() * 5;
          bands.low.list.push({ x: c.x, z: c.z - 4, w, d: dep, h, color: pick(rng, DISTRICT_COLORS.pantai) });
          colliders.push({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - 4 - dep / 2, maxZ: c.z - 4 + dep / 2 });
        }
        continue;
      }
      // campur: one or two mid-rise blocks.
      const n = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const w = 12 + rng() * 8;
        const dep = 12 + rng() * 8;
        const h = 12 + rng() * 20;
        const x = c.x + (rng() - 0.5) * 14;
        const z = c.z + (rng() - 0.5) * 14;
        bands.mid.list.push({ x, z, w, d: dep, h, color: pick(rng, DISTRICT_COLORS.campur) });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - dep / 2, maxZ: z + dep / 2 });
      }
    }
  }

  for (const band of Object.values(bands)) {
    if (!band.list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ map: band.tex });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, band.list.length);
    band.list.forEach((b, idx) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, color.setHex(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // ---- Harbour cranes (Pelabuhan, two of them).
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a030 });
  for (const [cx, cz] of [[-228, -120], [-228, 72]]) {
    const crane = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(3, 42, 3), craneMat);
    mast.position.y = 21;
    crane.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2.5, 2.5), craneMat);
    arm.position.set(10, 40, 0);
    crane.add(arm);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), craneMat);
    cab.position.set(2, 36, 0);
    crane.add(cab);
    crane.position.set(cx, 0, cz);
    group.add(crane);
    colliders.push({ minX: cx - 2, maxX: cx + 2, minZ: cz - 2, maxZ: cz + 2 });
  }

  // ---- Market stalls in Pasar Lama (canvas awnings).
  const stallColors = [0xd84a3a, 0x3a8a4a, 0x3a6ad8, 0xe8a020];
  const stallGeo = new THREE.BoxGeometry(4, 2.2, 3);
  const awningGeo = new THREE.BoxGeometry(4.6, 0.25, 3.6);
  const plaza = blockCentre(4, 4);
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    const x = plaza.x + Math.cos(ang) * 10;
    const z = plaza.z + Math.sin(ang) * 10;
    const stall = new THREE.Mesh(stallGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    stall.position.set(x, 1.1, z);
    group.add(stall);
    const awn = new THREE.Mesh(awningGeo, new THREE.MeshLambertMaterial({ color: stallColors[k % stallColors.length] }));
    awn.position.set(x, 2.6, z);
    awn.rotation.y = ang;
    group.add(awn);
    colliders.push({ minX: x - 2, maxX: x + 2, minZ: z - 1.5, maxZ: z + 1.5 });
  }

  // ---- Palm trees along the beach and the main avenue.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const canopyGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });
  const palmSpots = [];
  for (let k = 0; k < 26; k++) palmSpots.push({ x: -216 + k * 18, z: 252 + (rng() - 0.5) * 8 });
  for (let k = 0; k < 12; k++) palmSpots.push({ x: (rng() - 0.5) * 400, z: -240 + 48 * Math.floor(rng() * 10) + 8 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 2.5, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(p.x, 6, p.z);
    dummy.scale.set(1, 0.7, 1);
    dummy.updateMatrix();
    canopies.setMatrixAt(idx, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(canopies);

  // ---- Street lamps at intersections.
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  const lampHeadGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xaa8833 });
  const lampSpots = [];
  for (let a = -5; a <= 5; a += 2) {
    for (let b = -5; b <= 5; b += 2) {
      lampSpots.push({ x: a * PITCH + ROAD_HALF + 1, z: b * PITCH + ROAD_HALF + 1 });
    }
  }
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  lampSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 3, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(p.x, 6.1, p.z);
    dummy.updateMatrix();
    lampHeads.setMatrixAt(idx, dummy.matrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  lampHeads.instanceMatrix.needsUpdate = true;
  group.add(lamps);
  group.add(lampHeads);

  // ---- Road graph: intersections at every road crossing.
  const nodes = [];
  const nodeIndex = new Map();
  for (let a = -5; a <= 5; a++) {
    for (let b = -5; b <= 5; b++) {
      nodeIndex.set(`${a},${b}`, nodes.length);
      nodes.push({ x: a * PITCH, z: b * PITCH });
    }
  }
  const edges = [];
  for (let a = -5; a <= 5; a++) {
    for (let b = -5; b <= 5; b++) {
      const n = nodeIndex.get(`${a},${b}`);
      if (a < 5) edges.push([n, nodeIndex.get(`${a + 1},${b}`)]);
      if (b < 5) edges.push([n, nodeIndex.get(`${a},${b + 1}`)]);
    }
  }

  // Parking spots along roads near the centre, for the player's first cars.
  const spotDefs = [
    { x: 3, z: 30, heading: 0, type: 'kancil' },
    { x: -3, z: -60, heading: Math.PI, type: 'banteng' },
    { x: 51, z: 3, heading: Math.PI / 2, type: 'komodo' },
    { x: -51, z: -3, heading: -Math.PI / 2, type: 'elang' },
    { x: 99, z: 3, heading: Math.PI / 2, type: 'kancil' },
  ];
  for (const s of spotDefs) parkingSpots.push(s);

  scene.add(group);
  return {
    group,
    colliders,
    parkingSpots,
    roadGraph: { nodes, edges },
    water: [waterWest, waterSouth],
    spawn: { x: 0, z: 24, heading: Math.PI },
  };
}
