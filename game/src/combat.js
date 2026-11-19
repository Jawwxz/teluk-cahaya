// combat.js — hitscan weapons, enemy shooters, tracers.
// Pistol (slow, hard) and SMG (fast, loose). Shots raycast against
// enemy meshes first, then the city's building boxes, so walls block
// fire. Enemies are Geng Ombak shooters: they walk at Raka, shoot back
// with tracers, flash red when hit and fall when dead. Every shot
// scares nearby pedestrians away.
import * as THREE from 'three';
import { buildPedMesh } from './pedestrians.js';
import { clamp, collideCircleBoxes } from './utils.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, rate: 0.32, spread: 0.015, range: 70, auto: false },
  smg: { name: 'SMG', damage: 17, rate: 0.085, spread: 0.05, range: 55, auto: true },
};

const ENEMY_HP = 100;
const ENEMY_SPEED = 2.2;
const ENEMY_RANGE = 42;
const BOUNTY = 25;

function rayHitsBox(ox, oy, oz, dx, dy, dz, b) {
  // Slab test against an AABB { minX, maxX, minZ, maxZ } with height 0..30.
  let t0 = 0;
  let t1 = Infinity;
  const axes = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, 0, 30],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let a = (lo - o) / d;
      let c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

export class Combat {
  // hooks: { audio, peds, colliders, damagePlayer, addCash, toast,
  //          onWeaponChange }
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.weapons = ['pistol'];
    this.weapon = 'pistol';
    this.cooldown = 0;
    this.flashT = 0;
    this.flashEl = document.getElementById('flash');
    this.raycaster = new THREE.Raycaster();
    this.enemyGroup = new THREE.Group();
    scene.add(this.enemyGroup);
    this.enemies = [];
    this.tracers = [];
    const geo = new THREE.BoxGeometry(0.07, 0.07, 1);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
  }

  unlockWeapon(w) {
    if (!this.weapons.includes(w)) this.weapons.push(w);
  }

  setWeapon(w) {
    if (!this.weapons.includes(w) || this.weapon === w) return false;
    this.weapon = w;
    this.cooldown = Math.max(this.cooldown, 0.15);
    this.hooks.onWeaponChange(WEAPONS[w].name);
    return true;
  }

  spawnEnemies(spots, hp = ENEMY_HP) {
    const made = [];
    for (const [x, z] of spots) {
      const mesh = buildPedMesh(0xd82020);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.14, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
      );
      gun.position.set(0.32, 1.05, 0.25);
      mesh.add(gun);
      mesh.position.set(x, 0, z);
      this.enemyGroup.add(mesh);
      const enemy = {
        mesh,
        pos: new THREE.Vector3(x, 0, z),
        hp,
        maxHp: hp,
        shootT: 0.8 + Math.random() * 0.8,
        hitT: 0,
        deadT: 0,
        alive: true,
        heading: 0,
      };
      mesh.userData.enemy = enemy;
      this.enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  enemiesAlive() {
    return this.enemies.filter((e) => e.alive).length;
  }

  clearEnemies() {
    for (const e of this.enemies) this.enemyGroup.remove(e.mesh);
    this.enemies = [];
  }

  addTracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    t.mesh.position.copy(mid);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.9;
    t.life = 0.09;
  }

  // Fire one hitscan shot from the camera through the screen centre.
  fire(camera) {
    const w = WEAPONS[this.weapon];
    if (this.cooldown > 0) return;
    this.cooldown = w.rate;
    this.flashT = 0.06;
    if (this.flashEl) this.flashEl.style.opacity = '0.55';
    this.hooks.audio.blip(150, 0.07, 'square', 0.3);
    this.hooks.audio.blip(75, 0.12, 'sawtooth', 0.18);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * w.spread * 2;
    dir.y += (Math.random() - 0.5) * w.spread * 2;
    dir.z += (Math.random() - 0.5) * w.spread * 2;
    dir.normalize();
    const origin = camera.position.clone();
    // Nearest enemy along the ray.
    this.raycaster.set(origin, dir);
    this.raycaster.far = w.range;
    // Muzzle spark at the gun, streaking along the shot.
    if (this.hooks.particles) {
      const m = origin.clone().addScaledVector(dir, 1.1);
      m.y -= 0.25;
      this.hooks.particles.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z);
    }
    let hitEnemy = null;
    let hitDist = Infinity;
    for (const hit of this.raycaster.intersectObjects(this.enemyGroup.children, true)) {
      let o = hit.object;
      while (o && !o.userData.enemy) o = o.parent;
      if (o && o.userData.enemy.alive) {
        hitEnemy = o.userData.enemy;
        hitDist = hit.distance;
        break;
      }
    }
    // Walls block the shot: nearest building along the ray.
    let blockDist = Infinity;
    for (const b of this.hooks.colliders) {
      const t = rayHitsBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b);
      if (t < blockDist) blockDist = t;
    }
    const end = origin.clone().addScaledVector(dir, Math.min(hitDist, blockDist, w.range));
    this.addTracer(origin.clone().addScaledVector(dir, 1.2), end);
    if (hitEnemy && hitDist < blockDist) {
      hitEnemy.hp -= w.damage;
      hitEnemy.hitT = 0.12;
      for (const m of hitEnemy.mesh.children) {
        if (m.material && m.material.emissive) m.material.emissive.setHex(0x881111);
      }
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false;
        hitEnemy.deadT = 3;
        hitEnemy.mesh.rotation.z = Math.PI / 2;
        hitEnemy.mesh.position.y = 0.3;
        if (this.hooks.particles) {
          this.hooks.particles.explosion(hitEnemy.pos.x, 1, hitEnemy.pos.z);
        }
        if (this.hooks.audio.explosion) this.hooks.audio.explosion();
        if (this.hooks.shake) this.hooks.shake(0.5);
        this.hooks.addCash(BOUNTY);
        this.hooks.toast(`Anggota Geng Ombak tumbang! +$${BOUNTY}`);
      }
    }
    this.hooks.peds.scare(origin.x, origin.z, 22);
  }

  update(dt, ctx) {
    // ctx: { player, camera, mouseDown, mouseHeld }
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashEl) this.flashEl.style.opacity = String(Math.max(0, this.flashT / 0.06) * 0.55);
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    const w = WEAPONS[this.weapon];
    const wantFire = ctx.mouseDown || (w.auto && ctx.mouseHeld);
    if (wantFire && !ctx.player.inCar) this.fire(ctx.camera);
    // Enemy AI: walk at Raka, shoot back.
    for (const e of this.enemies) {
      if (!e.alive) {
        if (e.deadT > 0) {
          e.deadT -= dt;
          if (e.deadT <= 0) this.enemyGroup.remove(e.mesh);
        }
        continue;
      }
      if (e.hitT > 0) {
        e.hitT -= dt;
        if (e.hitT <= 0) {
          for (const m of e.mesh.children) {
            if (m.material && m.material.emissive) m.material.emissive.setHex(0x000000);
          }
        }
      }
      const dx = ctx.player.pos.x - e.pos.x;
      const dz = ctx.player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      if (d > 11 && d < ENEMY_RANGE) {
        const step = Math.min(d - 10, ENEMY_SPEED * dt);
        // Axis-separated, building-aware: enemies no longer clip corners.
        const nx = e.pos.x + (dx / d) * step;
        const nz = e.pos.z + (dz / d) * step;
        const res = collideCircleBoxes(nx, nz, 0.5, this.hooks.colliders);
        e.pos.x = res.x;
        e.pos.z = res.z;
        e.mesh.position.copy(e.pos);
        e.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.04;
      }
      e.shootT -= dt;
      if (e.shootT <= 0 && d < ENEMY_RANGE) {
        e.shootT = 1.3 + Math.random() * 0.9;
        const from = e.pos.clone().setY(1.4);
        const to = ctx.player.pos.clone().setY(1.2);
        this.addTracer(from, to);
        this.hooks.audio.blip(120, 0.08, 'square', 0.22);
        const chance = clamp(0.6 - d * 0.008, 0.12, 0.6);
        if (Math.random() < chance) {
          this.hooks.damagePlayer(9);
          this.hooks.toast('Kamu tertembak!');
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deadT > 0);
  }
}
