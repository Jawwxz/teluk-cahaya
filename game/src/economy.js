// economy.js — cash, world pickups and the two shops.
// Pickups: health (+35), armour (+50) and cash packets ($25–$50) lying
// around the city; they bob, respawn after 25 s. Shops: Toko Senjata
// (SMG $600) and Dealer Mobil (Banteng $900, Elang $1.200) — walk up to
// the kiosk and press B. The full shop panel arrives Day 4.
import * as THREE from 'three';

const RESPAWN_S = 25;
const PICKUPS = [
  { kind: 'health', x: 24, z: 0 },
  { kind: 'health', x: -48, z: -24 },
  { kind: 'health', x: 96, z: 96 },
  { kind: 'armour', x: -96, z: 48 },
  { kind: 'armour', x: 48, z: -96 },
  { kind: 'cash', x: 0, z: 96, amount: 50 },
  { kind: 'cash', x: -144, z: -48, amount: 25 },
  { kind: 'cash', x: 144, z: 0, amount: 25 },
];

const SHOPS = [
  {
    kind: 'weapon',
    name: 'Toko Senjata',
    x: 0,
    z: 48,
    color: 0x37c978,
    item: 'smg',
    label: 'SMG',
    price: 600,
  },
  {
    kind: 'dealer',
    name: 'Dealer Mobil',
    x: 48,
    z: 0,
    color: 0x3a6ad8,
    item: 'elang',
    label: 'Elang',
    price: 1200,
  },
  {
    kind: 'dealer',
    name: 'Dealer Mobil',
    x: -48,
    z: 96,
    color: 0x3a6ad8,
    item: 'banteng',
    label: 'Banteng',
    price: 900,
  },
];

function kioskMesh(color) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.6, 2.4),
    new THREE.MeshLambertMaterial({ color }),
  );
  box.position.y = 1.3;
  g.add(box);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.25, 3),
    new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
  );
  roof.position.y = 2.75;
  g.add(roof);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.7, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  );
  sign.position.set(0, 2.2, 1.25);
  g.add(sign);
  return g;
}

export class Economy {
  // hooks: { getCash, addCash, spend, toast, blip, unlockWeapon,
  //          hasWeapon, spawnCar, ownedCars }
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.time = 0;
    this.ownedCars = [];
    this.pickups = [];
    for (const def of PICKUPS) {
      const color =
        def.kind === 'health' ? 0x37c978 : def.kind === 'armour' ? 0x3a6ad8 : 0xffd23a;
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
      );
      mesh.position.set(def.x, 1.1, def.z);
      scene.add(mesh);
      this.pickups.push({ ...def, mesh, taken: 0 });
    }
    this.shops = [];
    for (const def of SHOPS) {
      const mesh = kioskMesh(def.color);
      mesh.position.set(def.x, 0, def.z);
      scene.add(mesh);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 14, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beacon.position.set(def.x, 7, def.z);
      scene.add(beacon);
      this.shops.push({ ...def, mesh, beacon });
    }
  }

  addCash(n) {
    this.hooks.addCash(n);
  }

  getCash() {
    return this.hooks.getCash();
  }

  nearestShop(px, pz) {
    let best = null;
    let bestD = 7;
    for (const s of this.shops) {
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  // Press B near a kiosk: buy its item, or hear why not.
  tryBuyNear(px, pz) {
    const shop = this.nearestShop(px, pz);
    if (!shop) return false;
    const h = this.hooks;
    if (shop.kind === 'weapon') {
      if (h.hasWeapon(shop.item)) {
        h.toast('Kamu sudah punya SMG.');
        return true;
      }
      if (!h.spend(shop.price)) {
        h.toast(`Uang kurang — SMG harganya $${shop.price}.`);
        return true;
      }
      h.unlockWeapon(shop.item);
      h.blip(880, 0.12);
      h.toast(`SMG dibeli! Tekan 2 untuk memakainya.`);
      return true;
    }
    // Dealer: one car per kiosk, owned once bought.
    if (this.ownedCars.includes(shop.item)) {
      h.toast(`Kamu sudah punya ${shop.label}.`);
      return true;
    }
    if (!h.spend(shop.price)) {
      h.toast(`Uang kurang — ${shop.label} harganya $${shop.price}.`);
      return true;
    }
    this.ownedCars.push(shop.item);
    h.spawnCar(shop.item, shop.x + 6, shop.z + 6);
    h.blip(880, 0.12);
    h.toast(`${shop.label} dibeli! Mobilmu terparkir di samping dealer.`);
    return true;
  }

  update(dt, player, playerCar) {
    this.time += dt;
    const px = player.pos.x;
    const pz = player.pos.z;
    for (const p of this.pickups) {
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 1.1 + Math.sin(this.time * 2 + p.x) * 0.15;
      if (p.taken > 0) {
        p.taken -= dt;
        if (p.taken <= 0) p.mesh.visible = true;
        continue;
      }
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > 2.6) continue;
      p.taken = RESPAWN_S;
      p.mesh.visible = false;
      if (p.kind === 'health') {
        this.hooks.onPickupHealth();
      } else if (p.kind === 'armour') {
        this.hooks.onPickupArmour();
      } else {
        this.addCash(p.amount);
        this.hooks.toast(`+$${p.amount} ditemukan di jalan!`);
      }
      this.hooks.blip(990, 0.1);
    }
  }
}
