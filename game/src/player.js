// player.js — Raka on foot: third-person WASD + mouse look, Shift sprint,
// E to get in and out of a car. The camera sits behind him; the same yaw
// drives both his facing and the car's chase camera when he drives.

import * as THREE from 'three';
import { clamp, collideCircleBoxes, lerp } from './utils.js';

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.2;
const RADIUS = 0.5;

export function buildPlayerMesh() {
  const g = new THREE.Group();
  g.name = 'raka';
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0e7a6a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), jacket);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.66;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.position.y = 1.7;
  g.add(cap);
  // A courier satchel, so he reads as a courier at a glance.
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.34), new THREE.MeshLambertMaterial({ color: 0xe8a020 }));
  bag.position.set(0, 1.15, 0.24);
  g.add(bag);
  return g;
}

export class Player {
  constructor(x, z, heading) {
    this.mesh = buildPlayerMesh();
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading; // where his body faces
    this.camYaw = heading; // where the camera looks (mouse)
    this.camPitch = -0.22;
    this.vel = new THREE.Vector3();
    this.inCar = null; // Car instance, or null when on foot
    this.mesh.position.copy(this.pos);
  }

  // input: { f, b, l, r, sprint } as booleans; dt seconds.
  updateOnFoot(dt, input, colliders) {
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    // Camera yaw 0 looks along +Z; forward is the camera direction.
    let mx = 0;
    let mz = 0;
    if (input.f) { mx += sin; mz += cos; }
    if (input.b) { mx -= sin; mz -= cos; }
    // Right = forward x up = (-cos, sin); D moves right, A moves left.
    if (input.r) { mx -= cos; mz += sin; }
    if (input.l) { mx += cos; mz -= sin; }
    const len = Math.hypot(mx, mz);
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    if (len > 0.01) {
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;
      // Face the direction he runs.
      const targetHeading = Math.atan2(mx, mz);
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -dt * 10, dt * 10);
    } else {
      mx = 0;
      mz = 0;
    }
    // Smooth acceleration so he does not stop dead.
    this.vel.x = lerp(this.vel.x, mx, Math.min(1, dt * 10));
    this.vel.z = lerp(this.vel.z, mz, Math.min(1, dt * 10));
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const res = collideCircleBoxes(nx, nz, RADIUS, colliders);
    this.pos.x = res.x;
    this.pos.z = res.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // A little bob while running, so he does not glide.
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.014)) * 0.05 * Math.min(1, moving / WALK_SPEED);
  }

  // Third-person camera: behind the player at camYaw/camPitch.
  // Returns the camera position; main.js points the camera at the head.
  cameraTarget() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
  }

  cameraPosition(dist = 5.5, height = 2.1) {
    const cp = Math.cos(this.camPitch);
    return new THREE.Vector3(
      this.pos.x - Math.sin(this.camYaw) * cp * dist,
      this.pos.y + height - Math.sin(this.camPitch) * dist,
      this.pos.z - Math.cos(this.camYaw) * cp * dist,
    );
  }

  // Driving camera: further back, lower, following the car's heading.
  carCameraPosition(car, dist = 8.5, height = 3.0) {
    return new THREE.Vector3(
      car.pos.x - Math.sin(car.heading) * dist,
      height,
      car.pos.z - Math.cos(car.heading) * dist,
    );
  }
}
