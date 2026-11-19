// particles.js — cheap pooled sprites for exhaust puffs, muzzle
// flashes, explosions and damage smoke. One pool of 64 sprites is
// reused forever; nothing is allocated per frame. Colours are warm
// (sun-soaked Teluk Cahaya): grey exhaust, yellow muzzle, orange fire.
import * as THREE from 'three';

const MAX = 64;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.SpriteMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({
        sprite: s,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        grav: 0,
        grow: 0,
        base: 1,
      });
    }
  }

  spawn(x, y, z, vx, vy, vz, color, life, size, grav = 0, grow = 0) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    p.sprite.position.set(x, y, z);
    p.sprite.material.color.setHex(color);
    p.sprite.material.opacity = 0.9;
    p.sprite.scale.set(size, size, 1);
    p.sprite.visible = true;
    p.vel.set(vx, vy, vz);
    p.life = life;
    p.maxLife = life;
    p.grav = grav;
    p.grow = grow;
    p.base = size;
  }

  // Grey puffs drifting back and up from a tailpipe.
  exhaust(x, y, z, bx, bz) {
    for (let i = 0; i < 2; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.4,
        y,
        z + (Math.random() - 0.5) * 0.4,
        bx * 2 + (Math.random() - 0.5),
        0.8 + Math.random() * 0.7,
        bz * 2 + (Math.random() - 0.5),
        0x9aa0a8,
        0.55 + Math.random() * 0.3,
        0.5 + Math.random() * 0.3,
        0,
        1.6,
      );
    }
  }

  // A hot spark that streaks along the shot direction.
  muzzle(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 3; i++) {
      this.spawn(
        x,
        y,
        z,
        dx * (9 + Math.random() * 7) + (Math.random() - 0.5) * 2,
        dy * (9 + Math.random() * 7) + (Math.random() - 0.5) * 2,
        dz * (9 + Math.random() * 7) + (Math.random() - 0.5) * 2,
        i === 0 ? 0xfff2b0 : 0xffc23a,
        0.07 + Math.random() * 0.05,
        0.32 + Math.random() * 0.2,
      );
    }
  }

  // Fireball: orange core, yellow sparks, grey smoke rising.
  explosion(x, y, z) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      this.spawn(
        x,
        y + 0.3,
        z,
        Math.cos(a) * sp,
        1.5 + Math.random() * 4,
        Math.sin(a) * sp,
        i % 3 === 0 ? 0x777777 : i % 3 === 1 ? 0xff7a1a : 0xffd23a,
        0.5 + Math.random() * 0.45,
        0.7 + Math.random() * 0.9,
        -3,
        1.2,
      );
    }
  }

  // Slow grey riser from a wrecked car.
  smoke(x, y, z) {
    this.spawn(
      x + (Math.random() - 0.5) * 0.8,
      y,
      z + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.5,
      1.4 + Math.random() * 0.6,
      (Math.random() - 0.5) * 0.5,
      0x666a70,
      1.1 + Math.random() * 0.5,
      0.9 + Math.random() * 0.5,
      0,
      2.2,
    );
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        p.sprite.material.opacity = 0;
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const f = p.life / p.maxLife;
      p.sprite.material.opacity = 0.9 * f;
      const s = p.base * (1 + p.grow * (1 - f));
      p.sprite.scale.set(s, s, 1);
    }
  }
}
