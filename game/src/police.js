// police.js — the wanted level and the Patroli.
// Stars 1–5. Police cruisers spawn, chase and ram; at 3+ stars they set
// roadblocks ahead of Raka. Lose them by outrunning or hiding: once no
// cruiser is close, the stars tick down. Stand still next to one for
// too long and it's BUSTED; get your health to zero and it's WASTED.

import * as THREE from 'three';
import { clamp, angleDelta } from './utils.js';
import { Car } from './car.js';

const MAX_ACTIVE = 5;
const SPAWN_MIN = 40;
const SPAWN_MAX = 90;
const DECAY_DIST = 100;
const DECAY_TIME = 6;
const BUSTED_DIST = 6;
const BUSTED_TIME = 2.5;
const ON_FOOT_HIT_DIST = 2.2;
const ON_FOOT_HIT_DAMAGE = 12;

export class PoliceManager {
  constructor(scene, roadGraph, colliders) {
    this.scene = scene;
    this.graph = roadGraph;
    this.colliders = colliders;
    this.wanted = 0;
    this.time = 0;
    this.decayTimer = 0;
    this.bustedTimer = 0;
    this.playerPos = { x: 0, z: 24 };
    this.playerHeading = Math.PI;

    // A pool of cruisers, hidden until the wanted level calls for them.
    this.pool = [];
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const car = new Car('patroli', 0, 0, 0);
      car.owner = 'patroli';
      car.mesh.visible = false;
      scene.add(car.mesh);
      this.pool.push({ car, active: false, stuck: 0, detour: 0, detourSign: 1, hitCooldown: 0 });
    }
    this.active = []; // pool entries currently on the street
    this.roadblock = []; // static cruisers parked across the road
    this.roadblockCentre = null;
  }

  // Every cruiser the HUD and the collision pass should know about.
  allCars() {
    const list = this.active.map((e) => e.car);
    for (const c of this.roadblock) list.push(c);
    return list;
  }

  addStars(n) {
    if (n <= 0) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.decayTimer = 0;
    this.syncCount();
  }

  removeStar() {
    this.wanted = Math.max(0, this.wanted - 1);
    this.decayTimer = 0;
    this.syncCount();
  }

  syncCount() {
    const want = this.wanted === 0 ? 0 : Math.min(this.wanted, MAX_ACTIVE);
    while (this.active.length < want) this.spawnOne();
    while (this.active.length > want) this.despawnOne(this.active[this.active.length - 1]);
    if (this.wanted < 3) this.clearRoadblock();
  }

  spawnOne() {
    const free = this.pool.find((e) => !e.active);
    if (!free) return;
    const nodes = this.graph.nodes;
    let idx = -1;
    for (let tries = 0; tries < 60; tries++) {
      const cand = Math.floor(Math.random() * nodes.length);
      const d = Math.hypot(nodes[cand].x - this.playerPos.x, nodes[cand].z - this.playerPos.z);
      if (d >= SPAWN_MIN && d <= SPAWN_MAX) {
        idx = cand;
        break;
      }
    }
    if (idx < 0) idx = Math.floor(Math.random() * nodes.length);
    const n = nodes[idx];
    free.car.pos.set(n.x, 0, n.z);
    free.car.speed = 0;
    free.car.heading = Math.atan2(this.playerPos.x - n.x, this.playerPos.z - n.z);
    free.car.syncMesh();
    free.car.mesh.visible = true;
    free.active = true;
    free.stuck = 0;
    free.detour = 0;
    free.hitCooldown = 0;
    this.active.push(free);
  }

  despawnOne(entry) {
    entry.active = false;
    entry.car.mesh.visible = false;
    entry.car.speed = 0;
    const i = this.active.indexOf(entry);
    if (i >= 0) this.active.splice(i, 1);
  }

  spawnRoadblock() {
    if (this.roadblock.length) return;
    const fx = Math.sin(this.playerHeading);
    const fz = Math.cos(this.playerHeading);
    const cx = this.playerPos.x + fx * 45;
    const cz = this.playerPos.z + fz * 45;
    // Parked across the road: perpendicular to Raka's direction.
    const heading = this.playerHeading + Math.PI / 2;
    for (const s of [-3.4, 3.4]) {
      const car = new Car('patroli', cx - fz * s, cz + fx * s, heading);
      car.owner = 'patroli';
      this.scene.add(car.mesh);
      this.roadblock.push(car);
    }
    this.roadblockCentre = { x: cx, z: cz };
  }

  clearRoadblock() {
    for (const car of this.roadblock) this.scene.remove(car.mesh);
    this.roadblock = [];
    this.roadblockCentre = null;
  }

  reset() {
    this.wanted = 0;
    this.decayTimer = 0;
    this.bustedTimer = 0;
    while (this.active.length) this.despawnOne(this.active[this.active.length - 1]);
    this.clearRoadblock();
  }

  // Stage a chase for screenshots: pull the active cruisers in close
  // behind the player's car.
  stageChase(playerCar) {
    if (!playerCar) return;
    const fx = Math.sin(playerCar.heading);
    const fz = Math.cos(playerCar.heading);
    this.active.forEach((entry, i) => {
      const back = 26 + i * 10;
      const side = (i % 2 === 0 ? 1 : -1) * 3.5;
      entry.car.pos.set(
        playerCar.pos.x - fx * back - fz * side,
        0,
        playerCar.pos.z - fz * back + fx * side,
      );
      entry.car.heading = playerCar.heading;
      entry.car.speed = playerCar.speed;
      entry.car.syncMesh();
    });
  }

  nearestDist() {
    let best = Infinity;
    for (const e of this.active) {
      const d = Math.hypot(e.car.pos.x - this.playerPos.x, e.car.pos.z - this.playerPos.z);
      if (d < best) best = d;
    }
    return best;
  }

  // api: { damagePlayer(amount), busted(), toast(text) }
  update(dt, player, playerCar, api) {
    this.time += dt;
    // Chase the car Raka is driving, not the spot where he got in.
    this.playerPos.x = playerCar ? playerCar.pos.x : player.pos.x;
    this.playerPos.z = playerCar ? playerCar.pos.z : player.pos.z;
    this.playerHeading = playerCar ? playerCar.heading : player.camYaw;

    if (this.wanted === 0) return;

    // Roadblocks at 3+ stars; clear them once the heat drops.
    if (this.wanted >= 3 && this.roadblock.length === 0) this.spawnRoadblock();
    if (this.wanted < 3) this.clearRoadblock();
    if (this.roadblockCentre) {
      const d = Math.hypot(
        this.roadblockCentre.x - this.playerPos.x,
        this.roadblockCentre.z - this.playerPos.z,
      );
      if (d > 160) this.clearRoadblock(); // a fresh one spawns ahead instead
    }

    const playerSpeed = playerCar
      ? Math.abs(playerCar.speed)
      : Math.hypot(player.vel.x, player.vel.z);

    for (const entry of this.active) {
      const car = entry.car;
      if (entry.hitCooldown > 0) entry.hitCooldown -= dt;

      // Pursuit steering: aim at where Raka will be, not where he is.
      const lookAhead = playerCar ? 0.4 : 0;
      const tx = this.playerPos.x + (playerCar ? Math.sin(playerCar.heading) * playerCar.speed * lookAhead : 0);
      const tz = this.playerPos.z + (playerCar ? Math.cos(playerCar.heading) * playerCar.speed * lookAhead : 0);
      let desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      if (entry.detour > 0) {
        entry.detour -= dt;
        desired += entry.detourSign * 1.1;
      }
      const dist = Math.hypot(tx - car.pos.x, tz - car.pos.z);
      const steer = clamp(angleDelta(car.heading, desired) * 2, -1, 1);
      let throttle = 1;
      if (dist < 4) throttle = 0.2;
      else if (dist < 10) throttle = 0.5;
      if (!playerCar && dist < 3) throttle = 0; // stop to make the arrest
      car.update(dt, { throttle, steer, handbrake: false }, this.colliders);

      // Stuck behind a building: swing around it for a moment.
      if (throttle > 0.5 && Math.abs(car.speed) < 1.5) {
        entry.stuck += dt;
        if (entry.stuck > 1.2) {
          entry.stuck = 0;
          entry.detour = 1.2;
          entry.detourSign = -entry.detourSign;
        }
      } else {
        entry.stuck = 0;
      }

      // A cruiser clipping Raka on foot hurts.
      if (!playerCar && dist < ON_FOOT_HIT_DIST && Math.abs(car.speed) > 3 && entry.hitCooldown <= 0) {
        entry.hitCooldown = 1;
        const away = Math.atan2(player.pos.x - car.pos.x, player.pos.z - car.pos.z);
        player.pos.x += Math.sin(away) * 1.5;
        player.pos.z += Math.cos(away) * 1.5;
        api.damagePlayer(ON_FOOT_HIT_DAMAGE);
        api.toast('Patroli menabrakmu!');
      }
    }

    // BUSTED: caught standing still next to a cruiser.
    const near = this.nearestDist();
    if (near < BUSTED_DIST && playerSpeed < 1.5) {
      this.bustedTimer += dt;
      if (this.bustedTimer > BUSTED_TIME) {
        this.bustedTimer = 0;
        api.busted();
        return;
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }

    // Lose them: no cruiser close for a while, the stars tick down.
    if (near > DECAY_DIST) {
      this.decayTimer += dt;
      if (this.decayTimer > DECAY_TIME) {
        this.removeStar();
        if (this.wanted === 0) api.toast('Kamu lolos dari Patroli.');
      }
    } else {
      this.decayTimer = 0;
    }
  }
}
