// main.js — Teluk Cahaya boot, game loop and state machine.
// States: menu (start screen, slow orbit over the city), playing,
// paused (pointer lock lost), busted, wasted. Day 2 added the living
// city: traffic, pedestrians, wanted level + police. Day 3 adds
// missions, combat, economy and saving.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './car.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { UiScreens } from './ui.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Missions } from './missions.js';
import { Combat, WEAPONS } from './combat.js';
import { Economy, SHOP_ITEMS } from './economy.js';
import { Save } from './save.js';
import { Particles } from './particles.js';
import { clamp, lerp, separateCars } from './utils.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || ''; // start | play | chase | mission — staging hooks
const AUTO_DRIVE = params.get('drive') === '1';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
// Golden afternoon: warm haze on the horizon, pale blue above.
scene.background = new THREE.Color(0xf7c98d);
scene.fog = new THREE.Fog(0xf2c98a, 220, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, 90, 220);

// Sun low in the west, warm; hemisphere lifts the shadows.
const sun = new THREE.DirectionalLight(0xffe0b0, 1.9);
sun.position.set(-180, 140, 60);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.85));

// ---- World ---------------------------------------------------------------
const city = buildCity(scene);
// Parked cars from the city's parking spots, plus the traffic fleet.
// Every car is stealable: E near one puts Raka behind the wheel.
const parkedCars = city.parkingSpots.map((s) => {
  const car = new Car(s.type, s.x, s.z, s.heading);
  car.owner = 'city';
  scene.add(car.mesh);
  return car;
});
const traffic = new TrafficManager(scene, city.roadGraph, city.colliders);
const cars = [...parkedCars, ...traffic.cars.map((n) => n.car)];

const player = new Player(city.spawn.x, city.spawn.z, city.spawn.heading);
scene.add(player.mesh);

const hud = new Hud(city.roadGraph);
const audio = new AudioEngine();
const particles = new Particles(scene);
const peds = new PedestrianManager(scene, city.roadGraph);

const state = {
  mode: 'menu', // menu | playing | paused | busted | wasted
  health: 100,
  armour: 0,
  cash: 0,
  wanted: 0,
  time: 0,
};

// Day 4 polish timers: screen shake, exhaust puffs, wreck smoke.
let shakeMag = 0;
let exhaustT = 0;
let smokeT = 0;

function doBusted() {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  audio.stopSiren();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showBusted(state.wanted);
}

function doWasted() {
  if (state.mode !== 'playing') return;
  state.mode = 'wasted';
  audio.stopSiren();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.showWasted();
}

// Back on the street after BUSTED or WASTED: on foot, healthy, clean.
function respawn() {
  if (player.inCar) {
    player.inCar.occupied = false;
    player.inCar = null;
  }
  player.pos.set(city.spawn.x, 0, city.spawn.z);
  player.mesh.position.copy(player.pos);
  player.mesh.visible = true;
  player.camYaw = city.spawn.heading;
  player.heading = city.spawn.heading;
  state.health = 100;
  state.wanted = 0;
  police.reset();
  combat.clearEnemies();
  missions.restartActive();
  hud.setObjective('Jelajahi Teluk Cahaya — tekan E di dekat mobil untuk mengemudi.');
  hud.showToast('Raka kembali ke jalanan.');
  setMode('playing');
}

const policeApi = {
  damagePlayer(amount) {
    // Armour soaks damage first.
    if (state.armour > 0) {
      const soaked = Math.min(state.armour, amount);
      state.armour -= soaked;
      amount -= soaked;
    }
    state.health = Math.max(0, state.health - amount);
  },
  busted() {
    doBusted();
  },
  toast(text) {
    hud.showToast(text);
  },
};
const police = new PoliceManager(scene, city.roadGraph, city.colliders);
const ui = new UiScreens(respawn);

// ---- Day 3: combat, economy, saving and the mission chain --------------
const combat = new Combat(scene, {
  audio,
  peds,
  particles,
  shake: (m) => {
    shakeMag = Math.max(shakeMag, m);
  },
  colliders: city.colliders,
  damagePlayer: (amount) => policeApi.damagePlayer(amount),
  addCash: (n) => {
    state.cash += n;
    hud.setCash(state.cash);
  },
  toast: (text, seconds) => hud.showToast(text, seconds),
  onWeaponChange: (name) => {
    hud.setWeapon(name);
    hud.showToast(`Senjata: ${name}`);
  },
});
const save = new Save();
const economy = new Economy(scene, {
  getCash: () => state.cash,
  addCash: (n) => {
    state.cash += n;
    hud.setCash(state.cash);
  },
  spend: (n) => {
    if (state.cash < n) return false;
    state.cash -= n;
    hud.setCash(state.cash);
    return true;
  },
  toast: (text, seconds) => hud.showToast(text, seconds),
  blip: (f, d, t, v) => audio.blip(f, d, t, v),
  hasWeapon: (w) => combat.weapons.includes(w),
  unlockWeapon: (w) => combat.unlockWeapon(w),
  getArmour: () => state.armour,
  buyArmour: () => {
    state.armour = 100;
  },
  onPickupHealth: () => {
    state.health = Math.min(100, state.health + 35);
    hud.showToast('Kesehatan +35');
  },
  onPickupArmour: () => {
    state.armour = Math.min(100, state.armour + 50);
    hud.showToast('Pelindung +50');
  },
  spawnCar: (type, x, z) => {
    const car = new Car(type, x, z, 0);
    car.owner = 'player';
    scene.add(car.mesh);
    cars.push(car);
    return car;
  },
});
const missions = new Missions(scene, {
  hud,
  audio,
  ui,
  police,
  combat,
  economy,
  save,
  toast: (text, seconds) => hud.showToast(text, seconds),
});

// ?fresh=1: staged shots start from a clean profile, ignoring any save
// left in the browser profile from earlier playtests.
if (params.get('fresh') === '1') save.clear();

// Restore saved progress, if any.
if (save.data) {
  state.cash = save.data.cash || 0;
  state.armour = save.data.armour || 0;
  missions.setUnlocked(save.data.unlocked || 0);
  if (save.data.weapons && save.data.weapons.length) {
    combat.weapons = [...save.data.weapons];
    combat.weapon = combat.weapons[0];
    hud.setWeapon(WEAPONS[combat.weapon].name);
  }
  if (save.data.ownedCars) economy.ownedCars = [...save.data.ownedCars];
}

hud.setCash(state.cash);
hud.setWanted(0);
hud.setObjective('Jelajahi Teluk Cahaya — tekan E di dekat mobil untuk mengemudi.');

// Saved progress shows on the start screen.
const menuProgress = document.getElementById('menu-progress');
if (save.data && save.data.unlocked > 0) {
  menuProgress.textContent =
    `Kemajuan tersimpan: ${save.data.unlocked}/6 misi · $${state.cash.toLocaleString('en-US')}`;
}

// ---- Input ----------------------------------------------------------------
const keys = {};
let pointerLocked = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.showToast(muted ? 'Suara dimatikan (M)' : 'Suara dinyalakan (M)');
    return;
  }
  keys[e.code] = true;
  // The shop panel eats its own keys (1–4 buy, B/Esc close).
  if (shopOpen) {
    const buyIdx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (buyIdx >= 0 && SHOP_ITEMS[buyIdx]) {
      if (economy.buyItem(SHOP_ITEMS[buyIdx].id)) renderShop();
      return;
    }
    if (e.code === 'KeyB' || e.code === 'Escape') {
      closeShop();
      return;
    }
  }
  if (e.code === 'KeyE' && state.mode === 'playing') toggleCar();
  if (e.code === 'Digit1' && state.mode === 'playing') combat.setWeapon('pistol');
  if (e.code === 'Digit2' && state.mode === 'playing') combat.setWeapon('smg');
  if (e.code === 'KeyB' && state.mode === 'playing' && !player.inCar) {
    if (economy.nearestShop(player.pos.x, player.pos.z)) openShop();
    else hud.showToast('Tidak ada toko di dekatmu — cari kios beratap kuning/biru.');
  }
  if (e.code === 'Space') e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && state.mode === 'playing' && SHOT !== 'play') {
    setMode('paused');
  }
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || state.mode !== 'playing') return;
  player.camYaw -= e.movementX * 0.0028;
  player.camPitch = clamp(player.camPitch - e.movementY * 0.0028, -0.9, 0.55);
});

// Mouse fire: click for the pistol, hold for the SMG. Only on foot.
let mouseDown = false;
let mouseHeld = false;
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || state.mode !== 'playing' || !pointerLocked || player.inCar) return;
  mouseDown = true;
  mouseHeld = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseHeld = false;
});

function footInput() {
  return {
    f: keys.KeyW || keys.ArrowUp,
    b: keys.KeyS || keys.ArrowDown,
    l: keys.KeyA || keys.ArrowLeft,
    r: keys.KeyD || keys.ArrowRight,
    sprint: keys.ShiftLeft || keys.ShiftRight,
  };
}

function driveInput() {
  return {
    throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
    steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
    handbrake: !!keys.Space,
  };
}

function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function toggleCar() {
  if (player.inCar) {
    const car = player.inCar;
    car.occupied = false;
    // Step out to the car's left side, facing away from it.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    player.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    player.mesh.position.copy(player.pos);
    player.mesh.visible = true;
    player.camYaw = car.heading;
    player.inCar = null;
    hud.showToast('Keluar dari mobil (E)');
    audio.blip(520, 0.08);
  } else {
    const car = nearestCar(3.5);
    if (!car) {
      hud.showToast('Tidak ada mobil di dekatmu');
      return;
    }
    car.occupied = true;
    player.inCar = car;
    player.mesh.visible = false;
    player.camYaw = car.heading;
    if (car.owner !== 'player') {
      // First time behind this wheel: it's theft, and the Patroli notice.
      car.owner = 'player';
      police.addStars(1);
      hud.showToast('Mobil dicuri! Patroli mengejarmu');
      audio.blip(220, 0.25, 'sawtooth', 0.2);
    }
    hud.showToast(`${car.type === 'kancil' ? 'Kancil' : car.type} — W/S gas & rem, A/D belok, Spasi rem tangan, E keluar`);
    audio.blip(880, 0.1);
  }
}

// ---- Shop panel (Day 4) -------------------------------------------------
// B near a kiosk opens the panel; 1–4 buy, B/Esc closes. Keyboard only,
// so the pointer lock never has to break.
let shopOpen = false;
const shopEl = document.getElementById('shop');
const shopRowsEl = document.getElementById('shop-rows');
const shopCashEl = document.getElementById('shop-cash');

function renderShop() {
  shopCashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
  let html = '';
  SHOP_ITEMS.forEach((item, i) => {
    const owned = economy.itemState(item.id) === 'owned';
    const afford = state.cash >= item.price;
    const status = owned
      ? '<span class="owned">Dimiliki</span>'
      : afford
        ? `<span class="price">$${item.price}</span>`
        : `<span class="poor">$${item.price} — uang kurang</span>`;
    html += `<div class="shop-row"><span class="key">${i + 1}</span><span class="name">${item.name}<span class="desc">${item.desc}</span></span>${status}</div>`;
  });
  shopRowsEl.innerHTML = html;
}

function openShop() {
  shopOpen = true;
  renderShop();
  shopEl.style.display = 'block';
  audio.blip(660, 0.08);
}

function closeShop() {
  shopOpen = false;
  shopEl.style.display = 'none';
}

// ---- Menus -----------------------------------------------------------------
const overlayMenu = document.getElementById('menu');
const overlayPaused = document.getElementById('paused');

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('menu-mode', mode === 'menu');
  overlayMenu.style.display = mode === 'menu' ? 'flex' : 'none';
  overlayPaused.style.display = mode === 'paused' ? 'flex' : 'none';
  if (mode === 'playing' && SHOT !== 'play') {
    // A programmatic click (e.g. a test) is not a user gesture; swallow
    // the rejection instead of logging an unhandled error.
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
  if (mode !== 'playing' && document.pointerLockElement) document.exitPointerLock();
}

document.getElementById('start-btn').addEventListener('click', () => {
  audio.ensure();
  audio.blip(660, 0.1);
  setMode('playing');
});
document.getElementById('resume-btn').addEventListener('click', () => {
  audio.ensure();
  setMode('playing');
});
overlayMenu.addEventListener('click', (e) => {
  if (e.target === overlayMenu) {
    audio.ensure();
    setMode('playing');
  }
});

// ---- Loop ------------------------------------------------------------------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(0, 90, 220);
const camTarget = new THREE.Vector3(0, 0, 0);
const tmpTarget = new THREE.Vector3();
let menuAngle = 0;
let saveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  if (state.mode === 'playing') {
    if (player.inCar) {
      const car = player.inCar;
      const input = driveInput();
      if (car.damage >= 100) {
        // Wrecked: the engine is dead until Raka gets out and finds another.
        input.throttle = 0;
      }
      car.update(dt, input, city.colliders);
      // Exhaust puffs while the throttle is down; a wreck blows up once.
      if (input.throttle > 0 && Math.abs(car.speed) > 3) {
        exhaustT += dt;
        if (exhaustT > 0.09) {
          exhaustT = 0;
          const bx = -Math.sin(car.heading);
          const bz = -Math.cos(car.heading);
          particles.exhaust(
            car.pos.x + bx * car.spec.length * 0.5,
            0.45,
            car.pos.z + bz * car.spec.length * 0.5,
            bx,
            bz,
          );
        }
      }
      if (car.damage >= 100 && !car.wrecked) {
        car.wrecked = true;
        particles.explosion(car.pos.x, 1, car.pos.z);
        audio.explosion();
        shakeMag = Math.max(shakeMag, 0.8);
      }
      if (car.damage >= 100) {
        smokeT += dt;
        if (smokeT > 0.25) {
          smokeT = 0;
          particles.smoke(car.pos.x, 1.2, car.pos.z);
        }
      }
      // Camera follows the car's heading, eased so turns do not whip.
      player.camYaw += (car.heading - player.camYaw) * Math.min(1, dt * 3);
      tmpTarget.set(car.pos.x, 1.4, car.pos.z);
      let cam;
      if (SHOT === 'chase') {
        // Cover shot: park the camera ahead of the car and look back at
        // it, so the Patroli cruisers on its tail are in the frame.
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        cam = new THREE.Vector3(car.pos.x + fx * 11, 4.2, car.pos.z + fz * 11);
      } else {
        cam = player.carCameraPosition(car);
      }
      camPos.lerp(cam, 1 - Math.exp(-6 * dt));
      camTarget.lerp(tmpTarget, 1 - Math.exp(-8 * dt));
      audio.setEngine(Math.abs(car.speed) / car.spec.maxSpeed, true);
      hud.update(dt, {
        health: state.health,
        armour: state.armour,
        cash: state.cash,
        wanted: state.wanted,
        speedKmh: car.speedKmh,
        driving: true,
        player,
        cars,
        police: police.allCars(),
        peds: peds.list,
      });
    } else {
      player.updateOnFoot(dt, footInput(), city.colliders);
      tmpTarget.copy(player.cameraTarget());
      const cam = player.cameraPosition();
      camPos.lerp(cam, 1 - Math.exp(-10 * dt));
      camTarget.lerp(tmpTarget, 1 - Math.exp(-12 * dt));
      audio.setEngine(0, false);
      hud.update(dt, {
        health: state.health,
        armour: state.armour,
        cash: state.cash,
        wanted: state.wanted,
        speedKmh: 0,
        driving: false,
        player,
        cars,
        police: police.allCars(),
        peds: peds.list,
      });
    }

    // ---- Day 2: the living city ----------------------------------------
    traffic.update(dt, player, player.inCar, peds, cars);
    peds.update(dt, player, player.inCar, cars);
    const hitPed = peds.checkPlayerCarHit(player.inCar);
    if (hitPed) {
      police.addStars(1);
      hud.showToast('Kamu menabrak pejalan kaki! Patroli mengejarmu');
      audio.blip(180, 0.3, 'sawtooth', 0.25);
    }
    police.update(dt, player, player.inCar, policeApi);
    // Pedestrians scatter from a chase passing by.
    for (const pc of police.active) {
      peds.scare(pc.car.pos.x, pc.car.pos.z, 9);
    }
    // Car-vs-car: rams, bumps and roadblocks are solid.
    const allTraffic = [...cars, ...police.allCars()];
    for (let i = 0; i < allTraffic.length; i++) {
      for (let j = i + 1; j < allTraffic.length; j++) {
        const impact = separateCars(allTraffic[i], allTraffic[j]);
        if (impact > 4) {
          allTraffic[i].damage = Math.min(100, allTraffic[i].damage + impact * 0.4);
          allTraffic[j].damage = Math.min(100, allTraffic[j].damage + impact * 0.4);
        }
      }
    }
    // Wanted level, siren and objective follow the police state.
    const prevWanted = state.wanted;
    state.wanted = police.wanted;
    if (state.wanted > 0) {
      audio.startSiren();
      if (prevWanted === 0) {
        hud.setObjective('Kabur dari Patroli! Sembunyi sampai bintang hilang.');
      }
    } else {
      audio.stopSiren();
      if (prevWanted > 0) {
        hud.setObjective('Jelajahi Teluk Cahaya — tekan E di dekat mobil untuk mengemudi.');
      }
    }
    if (state.health <= 0) doWasted();
    // ---- Day 3: combat, missions, economy, autosave ------------------
    combat.update(dt, { player, camera, mouseDown, mouseHeld });
    mouseDown = false;
    missions.update(dt, { player, playerCar: player.inCar });
    economy.update(dt, player, player.inCar);
    // Walking away from a kiosk closes the shop panel.
    if (shopOpen && !economy.nearestShop(player.pos.x, player.pos.z)) closeShop();
    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      save.store({
        cash: state.cash,
        armour: state.armour,
        unlocked: missions.unlocked,
        weapons: combat.weapons,
        ownedCars: economy.ownedCars,
      });
    }
    // Cinematic orbit for staged screenshots (no pointer lock headless).
    if (SHOT === 'play') {
      player.camYaw += dt * 0.12;
    }
  } else {
    // Menu: slow orbit above the city so the start screen has a backdrop.
    if (SHOT === 'city') {
      // Wide dusk frame: harbour cranes west, glass towers north.
      camPos.lerp(new THREE.Vector3(150, 135, 215), 1 - Math.exp(-2 * dt));
      camTarget.lerp(new THREE.Vector3(-50, 8, -70), 1 - Math.exp(-2 * dt));
    } else {
      menuAngle += dt * 0.03;
      tmpTarget.set(0, 10, 0);
      camPos.lerp(new THREE.Vector3(Math.sin(menuAngle) * 210, 95, Math.cos(menuAngle) * 210), 1 - Math.exp(-2 * dt));
      camTarget.lerp(tmpTarget, 1 - Math.exp(-2 * dt));
    }
  }

  particles.update(dt);

  // Gentle water shimmer.
  for (const w of city.water) {
    w.material.opacity = 0.8 + Math.sin(state.time * 0.7) * 0.05;
  }

  camera.position.copy(camPos);
  // Screen shake from explosions decays fast.
  if (shakeMag > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shakeMag;
    camera.position.y += (Math.random() - 0.5) * shakeMag * 0.6;
    camera.position.z += (Math.random() - 0.5) * shakeMag;
    shakeMag *= Math.exp(-5 * dt);
  }
  camera.lookAt(camTarget);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Shot hooks: ?shot=play skips the menu for headless screenshots;
// ?drive=1 starts the player inside the nearest car.
// ?shot=chase stages a police chase (3 stars, cruisers pulled in close).
// ?shot=mission stages a mission in progress (?mission=N picks which).
// ?shot=street stages Raka on foot on a market street, camera north.
// ?shot=city stages a wide dusk view over the harbour/downtown (menu).
// ?fresh=1 wipes the saved profile first, so staged shots start clean.
if (SHOT === 'play' || SHOT === 'chase' || SHOT === 'mission' || SHOT === 'street') {
  state.mode = 'playing';
  overlayMenu.style.display = 'none';
  // The boot hook bypasses setMode, so drop the menu-mode class too —
  // otherwise the HUD panels (stars, minimap, objective) stay hidden.
  document.body.classList.remove('menu-mode');
  if (AUTO_DRIVE || SHOT === 'chase') {
    const car = nearestCar(500);
    if (car) {
      car.occupied = true;
      player.inCar = car;
      player.mesh.visible = false;
      player.camYaw = car.heading;
    }
  }
  if (SHOT === 'chase') {
    police.addStars(3);
    police.stageChase(player.inCar);
    // Pull the cruisers in tighter for the cover frame: stageChase leaves
    // them 26+ m back, and the shot reads better at 15–29 m behind.
    const chased = player.inCar;
    if (chased) {
      const fx = Math.sin(chased.heading);
      const fz = Math.cos(chased.heading);
      police.active.forEach((entry, i) => {
        const back = 15 + i * 7;
        const side = (i % 2 === 0 ? 1 : -1) * 3;
        entry.car.pos.set(
          chased.pos.x - fx * back - fz * side,
          0,
          chased.pos.z - fz * back + fx * side,
        );
        entry.car.heading = chased.heading;
        entry.car.speed = chased.speed;
        entry.car.syncMesh();
      });
    }
    missions.holdObjective = true; // the chase objective text stays put
    hud.setObjective('Kabur dari Patroli! Sembunyi sampai bintang hilang.');
  }
  if (SHOT === 'mission') {
    // Stage a mission in progress (?mission=N picks which one).
    // A clean slate first: the browser profile may hold a finished save.
    save.clear();
    const mNum = Math.max(1, Math.min(6, parseInt(params.get('mission') || '1', 10)));
    missions.setUnlocked(mNum - 1);
    state.cash = 0;
    hud.setCash(0);
    missions.startCurrent();
    const stage =
      mNum === 3
        ? { x: 48, z: 44, yaw: 0 }
        : mNum === 6
          ? { x: -192, z: -44, yaw: Math.PI }
          : { x: 0, z: -30, yaw: Math.PI };
    player.pos.set(stage.x, 0, stage.z);
    player.mesh.position.copy(player.pos);
    player.camYaw = stage.yaw;
    player.heading = stage.yaw;
  }
  if (SHOT === 'street') {
    // On foot on the market avenue, camera behind Raka looking north
    // toward the plaza stalls, the glass towers, and traffic ahead.
    player.pos.set(0, 0, 24);
    player.mesh.position.copy(player.pos);
    player.camYaw = Math.PI;
    player.heading = Math.PI;
  }
}
if (SHOT === 'city') {
  // A still frame, not play: the menu state keeps the HUD hidden and
  // the menu branch holds a fixed camera; hide the title overlay.
  overlayMenu.style.display = 'none';
}

animate();

// Debug handle for headless playtests (not part of the game UI).
window.__game = { scene, player, cars, city, state, THREE, traffic, peds, police, missions, combat, economy, save, particles };
