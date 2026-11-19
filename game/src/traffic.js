// traffic.js — NPC traffic for Teluk Cahaya.
// Cars follow the road graph, stop at traffic lights, brake for the car
// ahead and for the player, and respawn around the player so the streets
// always feel alive near him. The cars are ordinary Car instances, so
// pressing E near one puts Raka behind the wheel (and the Patroli notice).

import * as THREE from 'three';
import { mulberry32, clamp, angleDelta } from './utils.js';
import { Car } from './car.js';
import { PITCH, ROAD_HALF } from './city.js';

const TRAFFIC_COLORS = [0x8a97a3, 0x4a7a5a, 0xb08a3c, 0x7a4a6a, 0x3c5a7a, 0x9a3a2e, 0x5a5a5a];
const TRAFFIC_TYPES = ['kancil', 'kancil', 'banteng', 'komodo', 'elang'];
const COUNT = 12;
const CRUISE_MIN = 9;
const CRUISE_MAX = 13;
const RESPAWN_FAR = 210;
const RESPAWN_MIN = 70;
const RESPAWN_MAX = 140;

// One 14-second cycle per intersection, offset so lights do not all
// change together: 6 s north-south green, 1 s amber, 6 s east-west
// green, 1 s amber. `a` and `b` are the intersection's grid coords.
export function lightPhase(time, a, b) {
  const off = ((a + 5) * 3 + (b + 5) * 7) % 14;
  const p = (time + off) % 14;
  if (p < 6) return 'ns';
  if (p < 7) return 'amber-ns';
  if (p < 13) return 'ew';
  return 'amber-ew';
}

export class TrafficManager {
  constructor(scene, roadGraph, colliders) {
    this.scene = scene;
    this.graph = roadGraph;
    this.colliders = colliders;
    this.rng = mulberry32(20261120);
    this.time = 0;

    // Adjacency: node index -> [neighbour indices].
    this.adj = new Map();
    for (const [a, b] of roadGraph.edges) {
      if (!this.adj.has(a)) this.adj.set(a, []);
      if (!this.adj.has(b)) this.adj.set(b, []);
      this.adj.get(a).push(b);
      this.adj.get(b).push(a);
    }

    this.cars = [];
    for (let i = 0; i < COUNT; i++) {
      const type = TRAFFIC_TYPES[Math.floor(this.rng() * TRAFFIC_TYPES.length)];
      const color = TRAFFIC_COLORS[Math.floor(this.rng() * TRAFFIC_COLORS.length)];
      const car = new Car(type, 0, 0, 0, color);
      car.owner = 'traffic';
      scene.add(car.mesh);
      const npc = {
        car,
        node: 0, // node index we drive towards
        prev: -1, // node index we came from
        cruise: CRUISE_MIN + this.rng() * (CRUISE_MAX - CRUISE_MIN),
      };
      this.placeAtRandomNode(npc, 0, 0, 40, 160);
      this.cars.push(npc);
    }

    this.buildLights(scene);
  }

  nodeCoords(idx) {
    // Nodes were built a = -5..5 outer, b = -5..5 inner.
    return { a: Math.floor(idx / 11) - 5, b: (idx % 11) - 5 };
  }

  pickNext(npc) {
    const neighbours = this.adj.get(npc.node) || [];
    const options = neighbours.filter((n) => n !== npc.prev);
    const pool = options.length ? options : neighbours;
    if (!pool.length) return npc.node;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  // Put an NPC on a random road node minD..maxD metres from (px, pz),
  // heading down a random road from there.
  placeAtRandomNode(npc, px, pz, minD, maxD) {
    const nodes = this.graph.nodes;
    for (let tries = 0; tries < 60; tries++) {
      const idx = Math.floor(this.rng() * nodes.length);
      const n = nodes[idx];
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < minD || d > maxD) continue;
      npc.car.pos.set(n.x, 0, n.z);
      npc.car.speed = 0;
      npc.prev = idx;
      npc.node = this.pickNext({ node: idx, prev: -1 });
      const t = nodes[npc.node];
      npc.car.heading = Math.atan2(t.x - n.x, t.z - n.z);
      npc.car.syncMesh();
      return;
    }
    // Fallback: leave the car where it is.
  }

  // Traffic-light poles at every second intersection, with a lamp whose
  // colour follows the light state for that crossing.
  buildLights(scene) {
    const spots = [];
    for (const a of [-4, -2, 0, 2, 4]) {
      for (const b of [-4, -2, 0, 2, 4]) {
        spots.push({ a, b, x: a * PITCH + ROAD_HALF + 1, z: b * PITCH + ROAD_HALF + 1 });
      }
    }
    this.lightSpots = spots;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.2, 5);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const lampGeo = new THREE.SphereGeometry(0.34, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 2.6, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, 5.3, s.z);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);
      lamps.setColorAt(i, color.setHex(0x37c978));
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    this.lampMesh = lamps;
    scene.add(poles);
    scene.add(lamps);
  }

  updateLights() {
    if (!this.lampMesh) return;
    const color = new THREE.Color();
    this.lightSpots.forEach((s, i) => {
      const phase = lightPhase(this.time, s.a, s.b);
      const hex = phase === 'ns' ? 0x37c978 : phase === 'amber-ns' ? 0xffd23a : 0xd82020;
      this.lampMesh.setColorAt(i, color.setHex(hex));
    });
    if (this.lampMesh.instanceColor) this.lampMesh.instanceColor.needsUpdate = true;
  }

  update(dt, player, playerCar, peds, allCars) {
    this.time += dt;
    this.updateLights();
    const px = player.pos.x;
    const pz = player.pos.z;

    for (const npc of this.cars) {
      const car = npc.car;
      if (car.occupied) continue; // Raka is driving it; traffic waits.

      // Too far from the player: respawn on a road nearer to him.
      if (Math.hypot(car.pos.x - px, car.pos.z - pz) > RESPAWN_FAR) {
        this.placeAtRandomNode(npc, px, pz, RESPAWN_MIN, RESPAWN_MAX);
        continue;
      }

      const target = this.graph.nodes[npc.node];
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5) {
        npc.prev = npc.node;
        npc.node = this.pickNext(npc);
      }

      const desired = Math.atan2(dx, dz);
      const steer = clamp(angleDelta(car.heading, desired) * 2.2, -1, 1);

      // Target speed: cruise, slower near the corner, stopped at a red light.
      let targetSpeed = npc.cruise;
      if (dist < 16) targetSpeed = Math.min(targetSpeed, 6);
      if (npc.prev >= 0) {
        const from = this.graph.nodes[npc.prev];
        const ns = from.x === target.x; // moving along Z = north-south
        const { a, b } = this.nodeCoords(npc.node);
        const phase = lightPhase(this.time, a, b);
        const green = (ns && phase === 'ns') || (!ns && phase === 'ew');
        if (!green && dist < 14) targetSpeed = 0;
      }

      // Brake for the car ahead, for Raka on foot or in his car, and
      // for pedestrians stepping into the road.
      const fwd = car.forward();
      for (const other of allCars) {
        if (other === car) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 8 && fwd.x * ox + fwd.z * oz > 0) {
          targetSpeed = 0;
          break;
        }
      }
      if (targetSpeed > 0) {
        const ox = px - car.pos.x;
        const oz = pz - car.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 7 && fwd.x * ox + fwd.z * oz > 0) targetSpeed = 0;
      }
      if (targetSpeed > 0 && peds) {
        for (const ped of peds.list) {
          if (ped.state === 'down') continue;
          const ox = ped.pos.x - car.pos.x;
          const oz = ped.pos.z - car.pos.z;
          const d = Math.hypot(ox, oz);
          if (d < 6 && fwd.x * ox + fwd.z * oz > 0) {
            targetSpeed = 0;
            break;
          }
        }
      }

      let throttle = 0;
      if (car.speed < targetSpeed - 0.5) throttle = 1;
      else if (car.speed > targetSpeed + 0.5) throttle = -1;
      car.update(
        dt,
        { throttle, steer: Math.abs(car.speed) < 0.3 ? 0 : steer, handbrake: false },
        this.colliders,
      );
    }
  }
}
