// economy.js — cash, world pickups, the shops and the shop panel.
// Pickups: health (+35), armour (+50) and cash packets ($25–$50) lying
// around the city; they bob, respawn after 25 s. Shops (Day 4): Toko
// Senjata (SMG $600), Toko Pelindung (rompi $400), Dealer Mobil
// (Banteng $900, Elang $1.200) — walk up to a kiosk and press B for
// the panel, then 1–4 to buy, B to close.
import * as THREE from 'three';

// The full catalogue the shop panel shows (same ids as the kiosks).
export const SHOP_ITEMS = [
  { id: 'smg', name: 'SMG', price: 600, desc: 'Senjata otomatis — tekan 2 untuk memakai' },
  { id: 'armour', name: 'Rompi Pelindung', price: 400, desc: 'Pelindung penuh (100)' },
  { id: 'banteng', name: 'Banteng (SUV)', price: 900, desc: 'Mobilmu sendiri, terparkir di dealer' },
  { id: 'elang', name: 'Elang (Sport)', price: 1200, desc: 'Mobil tercepat di Teluk Cahaya' },
];

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
  {
    kind: 'armour',
    name: 'Toko Pelindung',
    x: -96,
    z: 0,
    color: 0x9a7bd8,
    item: 'armour',
    label: 'Rompi Pelindung',
    price: 400,
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

  // Buy one catalogue item (the shop panel calls this with 1–4).
  // Returns true when the panel should refresh its rows.
  buyItem(id) {
    const item = SHOP_ITEMS.find((x) => x.id === id);
    if (!item) return false;
    const h = this.hooks;
    if (id === 'smg') {
      if (h.hasWeapon('smg')) {
        h.toast('Kamu sudah punya SMG.');
        return true;
      }
      if (!h.spend(item.price)) {
        h.toast(`Uang kurang — SMG harganya $${item.price}.`);
        return true;
      }
      h.unlockWeapon('smg');
      h.blip(880, 0.12);
      h.toast('SMG dibeli! Tekan 2 untuk memakainya.');
      return true;
    }
    if (id === 'armour') {
      if (h.getArmour() >= 100) {
        h.toast('Rompi pelindungmu sudah penuh.');
        return true;
      }
      if (!h.spend(item.price)) {
        h.toast(`Uang kurang — rompi harganya $${item.price}.`);
        return true;
      }
      h.buyArmour();
      h.blip(880, 0.12);
      h.toast('Rompi Pelindung dibeli! Pelindung penuh.');
      return true;
    }
    // Dealer cars: one of each, owned once bought.
    if (this.ownedCars.includes(id)) {
      h.toast(`Kamu sudah punya ${item.name}.`);
      return true;
    }
    if (!h.spend(item.price)) {
      h.toast(`Uang kurang — ${item.name} harganya $${item.price}.`);
      return true;
    }
    this.ownedCars.push(id);
    const shop = this.shops.find((s) => s.item === id);
    h.spawnCar(id, (shop ? shop.x : 0) + 6, (shop ? shop.z : 0) + 6);
    h.blip(880, 0.12);
    h.toast(`${item.name} dibeli! Mobilmu terparkir di samping dealer.`);
    return true;
  }

  // Owned / affordable state for one catalogue row.
  itemState(id) {
    const h = this.hooks;
    if (id === 'smg') return h.hasWeapon('smg') ? 'owned' : 'buy';
    if (id === 'armour') return h.getArmour() >= 100 ? 'owned' : 'buy';
    return this.ownedCars.includes(id) ? 'owned' : 'buy';
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
