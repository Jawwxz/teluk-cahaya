// car.js — arcade driving for Teluk Cahaya's invented marques:
// Kancil (hatchback), Banteng (SUV), Elang (sports car), Komodo (van),
// plus the police Patroli cruiser (Day 2). Kinematic on purpose:
// no physics library, just accel/steer/drag and circle-vs-AABB collision
// against the city's buildings.

import * as THREE from 'three';
import { clamp, collideCircleBoxes } from './utils.js';

export const CAR_TYPES = {
  kancil: { length: 3.6, width: 1.7, height: 1.35, maxSpeed: 27, accel: 11, maxSteer: 0.55, color: 0xc23a2e },
  banteng: { length: 4.4, width: 1.9, height: 1.8, maxSpeed: 24, accel: 9, maxSteer: 0.5, color: 0x2e5aa8 },
  elang: { length: 4.2, width: 1.9, height: 1.15, maxSpeed: 35, accel: 14, maxSteer: 0.5, color: 0xe8a020 },
  komodo: { length: 4.8, width: 2.0, height: 2.0, maxSpeed: 22, accel: 8, maxSteer: 0.45, color: 0x7a7f85 },
  patroli: { length: 4.3, width: 1.9, height: 1.45, maxSpeed: 32, accel: 13, maxSteer: 0.52, color: 0x1a1a22 },
};

const WHEEL_R = 0.34;

export function buildCarMesh(type, colorOverride) {
  const spec = CAR_TYPES[type] || CAR_TYPES.kancil;
  const color = colorOverride !== undefined ? colorOverride : spec.color;
  const g = new THREE.Group();
  g.name = `car-${type}`;
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

  // Lower body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), bodyMat);
  body.position.y = WHEEL_R + H * 0.28;
  g.add(body);
  // Cabin.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.52, H * 0.5, W * 0.88), glassMat);
  cabin.position.set(-L * 0.04, WHEEL_R + H * 0.55 + H * 0.24, 0);
  g.add(cabin);
  // Roof panel (body colour, so the cabin reads as windows + roof).
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 0.08, W * 0.8), bodyMat);
  roof.position.set(-L * 0.04, WHEEL_R + H * 0.55 + H * 0.48, 0);
  g.add(roof);

  // Wheels: each wheel mesh sits in a steer pivot so front wheels can turn
  // (pivot yaws) while the tyre itself spins around its axle (mesh rolls).
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  const wheelX = [L * 0.32, -L * 0.32];
  const wheelZ = [W / 2 - 0.05, -W / 2 + 0.05];
  for (const wx of wheelX) {
    for (const wz of wheelZ) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, WHEEL_R, wz);
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      pivot.add(wheel);
      g.add(pivot);
      wheels.push({ pivot, mesh: wheel });
    }
  }

  // Headlights + taillights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x554400 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd82020, emissive: 0x440000 });
  for (const wz of [-W * 0.32, W * 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), lightMat);
    hl.position.set(L / 2 + 0.01, WHEEL_R + H * 0.3, wz);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), tailMat);
    tl.position.set(-L / 2 - 0.01, WHEEL_R + H * 0.3, wz);
    g.add(tl);
  }

  // Police livery: white doors + light bar (Day 2 uses this too).
  if (type === 'patroli') {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(L * 0.6, 0.1, W + 0.04),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    stripe.position.set(0, WHEEL_R + H * 0.42, 0);
    g.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x1122aa }),
    );
    bar.position.set(-L * 0.04, WHEEL_R + H * 0.55 + H * 0.52, 0);
    g.add(bar);
  }

  g.userData.wheels = wheels;
  g.userData.spec = spec;
  return g;
}

export class Car {
  constructor(type, x, z, heading, colorOverride) {
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.kancil;
    this.mesh = buildCarMesh(type, colorOverride);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.occupied = false;
    this.wheelSpin = 0;
    this.syncMesh();
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // input: { throttle: -1..1, steer: -1..1, handbrake: bool }
  update(dt, input, colliders) {
    const s = this.spec;
    const absSpeed = Math.abs(this.speed);
    // Steering: less lock at speed, more with the handbrake.
    const steerTarget =
      input.steer * s.maxSteer * (1 - Math.min(absSpeed / s.maxSpeed, 1) * 0.55) * (input.handbrake ? 1.5 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);

    if (input.throttle > 0) {
      this.speed += s.accel * input.throttle * dt * (1 - Math.max(this.speed, 0) / s.maxSpeed);
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) {
        this.speed -= 20 * dt; // braking
      } else {
        this.speed += s.accel * 0.7 * input.throttle * dt; // reverse
        if (this.speed < -9) this.speed = -9;
      }
    }
    // Drag + rolling resistance; handbrake scrubs speed hard.
    this.speed -= this.speed * (input.handbrake ? 2.4 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;

    // Bicycle-ish yaw: yaw rate grows with speed and steering angle.
    const wheelbase = s.length * 0.6;
    const yawRate = (this.speed / wheelbase) * Math.tan(this.steer);
    this.heading += yawRate * dt;

    const f = this.forward();
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    const radius = s.length * 0.42;
    const res = collideCircleBoxes(nx, nz, radius, colliders);
    if (res.hit) {
      const impact = Math.abs(this.speed);
      if (impact > 4) this.damage = Math.min(100, this.damage + impact * 0.9);
      this.speed *= 0.45;
    }
    this.pos.x = res.x;
    this.pos.z = res.z;

    this.wheelSpin += (this.speed / WHEEL_R) * dt;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].mesh.rotation.z = this.wheelSpin;
      // Front wheels (first two) turn with the steering.
      if (i < 2) wheels[i].pivot.rotation.y = this.steer * 0.9;
    }
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
