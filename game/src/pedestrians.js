// pedestrians.js — people on the sidewalks of Teluk Cahaya.
// They walk the road graph offset onto the sidewalk, pause at
// intersections as if waiting to cross, and run from danger: a speeding
// car close by, a gunshot, or a police chase nearby. Hit by Raka's car
// they go down — and the Patroli notice.

import * as THREE from 'three';
import { mulberry32 } from './utils.js';
import { ROAD_HALF } from './city.js';

const COUNT = 24;
const JACKETS = [0xd84a3a, 0x3a8a4a, 0x3a6ad8, 0xe8a020, 0x8a5ad8, 0x4a9a9a, 0xc98a5e, 0x7a7f85];
const WALK_MIN = 1.0;
const WALK_MAX = 1.7;
const FLEE_SPEED = 3.6;
const SIDEWALK = ROAD_HALF + 1.6;

export function buildPedMesh(color) {
  const g = new THREE.Group();
  g.name = 'ped';
  const jacket = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.22), pants);
  legs.position.y = 0.35;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), jacket);
  torso.position.y = 1.0;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.5;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
  cap.position.y = 1.54;
  g.add(cap);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.12), jacket);
    arm.position.set(s * 0.31, 1.0, 0);
    g.add(arm);
  }
  return g;
}

export class PedestrianManager {
  constructor(scene, roadGraph) {
    this.scene = scene;
    this.graph = roadGraph;
    this.rng = mulberry32(20261120);
    this.time = 0;
    this.adj = new Map();
    for (const [a, b] of roadGraph.edges) {
      if (!this.adj.has(a)) this.adj.set(a, []);
      if (!this.adj.has(b)) this.adj.set(b, []);
      this.adj.get(a).push(b);
      this.adj.get(b).push(a);
    }
    this.list = [];
    for (let i = 0; i < COUNT; i++) {
      const color = JACKETS[Math.floor(this.rng() * JACKETS.length)];
      const mesh = buildPedMesh(color);
      const scale = 0.9 + this.rng() * 0.2;
      mesh.scale.setScalar(scale);
      scene.add(mesh);
      const from = Math.floor(this.rng() * roadGraph.nodes.length);
      const neighbours = this.adj.get(from) || [];
      const to = neighbours.length
        ? neighbours[Math.floor(this.rng() * neighbours.length)]
        : from;
      const ped = {
        mesh,
        from,
        to,
        side: this.rng() < 0.5 ? 1 : -1,
        speed: WALK_MIN + this.rng() * (WALK_MAX - WALK_MIN),
        state: 'walk', // walk | wait | flee | down
        timer: 0,
        heading: 0,
        hitCooldown: 0,
        fleeX: 0,
        fleeZ: 0,
        pos: new THREE.Vector3(0, 0, 0),
      };
      const n = roadGraph.nodes[from];
      ped.pos.set(n.x, 0, n.z);
      this.list.push(ped);
    }
  }

  // Sidewalk point for the edge from->to, offset to one side of the road.
  edgeTarget(ped) {
    const a = this.graph.nodes[ped.from];
    const b = this.graph.nodes[ped.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular: (-dz, dx) normalised, times the sidewalk offset.
    return {
      x: b.x + (-dz / len) * ped.side * SIDEWALK,
      z: b.z + (dx / len) * ped.side * SIDEWALK,
    };
  }

  pickNext(ped) {
    const neighbours = this.adj.get(ped.to) || [];
    const options = neighbours.filter((n) => n !== ped.from);
    const pool = options.length ? options : neighbours;
    ped.from = ped.to;
    ped.to = pool.length ? pool[Math.floor(this.rng() * pool.length)] : ped.to;
    if (this.rng() < 0.5) ped.side = -ped.side;
  }

  // Something scary happened at (x, z): everyone nearby runs from it.
  scare(x, z, radius) {
    for (const ped of this.list) {
      if (ped.state === 'down' || ped.state === 'flee') continue;
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 0.01) continue;
      ped.state = 'flee';
      ped.timer = 2 + this.rng() * 2;
      ped.fleeX = ped.pos.x + (dx / d) * 18;
      ped.fleeZ = ped.pos.z + (dz / d) * 18;
    }
  }

  knockDown(ped, seconds) {
    ped.state = 'down';
    ped.timer = seconds;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  // Raka's car hit someone? Returns the pedestrian, or null.
  checkPlayerCarHit(car) {
    if (!car) return null;
    if (Math.abs(car.speed) < 2) return null;
    for (const ped of this.list) {
      if (ped.state === 'down' || ped.hitCooldown > 0) continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 1.8) {
        ped.hitCooldown = 5;
        this.knockDown(ped, 2.5);
        return ped;
      }
    }
    return null;
  }

  update(dt, player, playerCar, allCars) {
    this.time += dt;
    for (const ped of this.list) {
      if (ped.hitCooldown > 0) ped.hitCooldown -= dt;

      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          // Get up and run away from the road.
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = 0;
          ped.state = 'flee';
          ped.timer = 3;
          const away = Math.atan2(ped.pos.x, ped.pos.z);
          ped.fleeX = ped.pos.x + Math.sin(away) * 14;
          ped.fleeZ = ped.pos.z + Math.cos(away) * 14;
        }
        continue;
      }

      if (ped.state === 'wait') {
        ped.timer -= dt;
        if (ped.timer <= 0) ped.state = 'walk';
        this.syncMesh(ped, dt);
        continue;
      }

      // A speeding car close by scares people off the road.
      if (ped.state === 'walk' && playerCar && Math.abs(playerCar.speed) > 8) {
        const d = Math.hypot(ped.pos.x - playerCar.pos.x, ped.pos.z - playerCar.pos.z);
        if (d < 7) this.scare(playerCar.pos.x, playerCar.pos.z, 9);
      }
      // NPC cars that touch a pedestrian make them run (no wanted level).
      if (ped.state === 'walk' && allCars) {
        for (const car of allCars) {
          if (car === playerCar) continue;
          if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 1.8) {
            this.scare(car.pos.x, car.pos.z, 8);
            break;
          }
        }
      }

      let tx;
      let tz;
      let speed = ped.speed;
      if (ped.state === 'flee') {
        tx = ped.fleeX;
        tz = ped.fleeZ;
        speed = FLEE_SPEED;
        ped.timer -= dt;
        if (ped.timer <= 0 || Math.hypot(tx - ped.pos.x, tz - ped.pos.z) < 1) {
          ped.state = 'walk';
          // Rejoin the graph from the nearest intersection.
          let best = 0;
          let bestD = Infinity;
          this.graph.nodes.forEach((n, i) => {
            const d = Math.hypot(n.x - ped.pos.x, n.z - ped.pos.z);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          ped.from = best;
          const neighbours = this.adj.get(best) || [];
          ped.to = neighbours.length
            ? neighbours[Math.floor(this.rng() * neighbours.length)]
            : best;
        }
      } else {
        const t = this.edgeTarget(ped);
        tx = t.x;
        tz = t.z;
      }

      const dx = tx - ped.pos.x;
      const dz = tz - ped.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, speed * dt);
        ped.pos.x += (dx / d) * step;
        ped.pos.z += (dz / d) * step;
        ped.heading = Math.atan2(dx, dz);
      }
      if (ped.state === 'walk' && d < 1.2) {
        // Reached the corner: sometimes wait as if for the light.
        if (this.rng() < 0.3) {
          ped.state = 'wait';
          ped.timer = 1 + this.rng() * 2;
        } else {
          this.pickNext(ped);
        }
      }
      this.syncMesh(ped, dt);
    }
  }

  syncMesh(ped, dt) {
    ped.mesh.position.x = ped.pos.x;
    ped.mesh.position.z = ped.pos.z;
    ped.mesh.rotation.y = ped.heading;
    if (ped.state === 'walk' || ped.state === 'flee') {
      const moving = ped.state === 'flee' ? FLEE_SPEED : ped.speed;
      ped.mesh.position.y = Math.abs(Math.sin(this.time * 9)) * 0.04 * Math.min(1, moving / WALK_MIN);
    } else if (ped.state !== 'down') {
      ped.mesh.position.y = 0;
    }
  }
}
