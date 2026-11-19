// main.js — Teluk Cahaya boot, game loop and state machine.
// States: menu (start screen, slow orbit over the city), playing,
// paused (pointer lock lost). Day 1: on foot + one drivable car family,
// HUD + minimap. Traffic, police, missions and combat arrive Day 2-3.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './car.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { clamp, lerp } from './utils.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || ''; // start | play — staging hooks for screenshots
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
const cars = city.parkingSpots.map((s) => {
  const car = new Car(s.type, s.x, s.z, s.heading);
  scene.add(car.mesh);
  return car;
});

const player = new Player(city.spawn.x, city.spawn.z, city.spawn.heading);
scene.add(player.mesh);

const hud = new Hud(city.roadGraph);
const audio = new AudioEngine();

const state = {
  mode: 'menu', // menu | playing | paused
  health: 100,
  cash: 0,
  wanted: 0,
  time: 0,
};

hud.setCash(0);
hud.setWanted(0);
hud.setObjective('Jelajahi Teluk Cahaya — tekan E di dekat mobil untuk mengemudi.');

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
  if (e.code === 'KeyE' && state.mode === 'playing') toggleCar();
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
    hud.showToast(`${car.type === 'kancil' ? 'Kancil' : car.type} — W/S gas & rem, A/D belok, Spasi rem tangan, E keluar`);
    audio.blip(880, 0.1);
  }
}

// ---- Menus -----------------------------------------------------------------
const overlayMenu = document.getElementById('menu');
const overlayPaused = document.getElementById('paused');

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('menu-mode', mode === 'menu');
  overlayMenu.style.display = mode === 'menu' ? 'flex' : 'none';
  overlayPaused.style.display = mode === 'paused' ? 'flex' : 'none';
  if (mode === 'playing' && SHOT !== 'play') canvas.requestPointerLock();
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  if (state.mode === 'playing') {
    if (player.inCar) {
      const car = player.inCar;
      car.update(dt, driveInput(), city.colliders);
      // Camera follows the car's heading, eased so turns do not whip.
      player.camYaw += (car.heading - player.camYaw) * Math.min(1, dt * 3);
      tmpTarget.set(car.pos.x, 1.4, car.pos.z);
      const cam = player.carCameraPosition(car);
      camPos.lerp(cam, 1 - Math.exp(-6 * dt));
      camTarget.lerp(tmpTarget, 1 - Math.exp(-8 * dt));
      audio.setEngine(Math.abs(car.speed) / car.spec.maxSpeed, true);
      hud.update(dt, {
        health: state.health,
        cash: state.cash,
        wanted: state.wanted,
        speedKmh: car.speedKmh,
        driving: true,
        player,
        cars,
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
        cash: state.cash,
        wanted: state.wanted,
        speedKmh: 0,
        driving: false,
        player,
        cars,
      });
    }
    // Cinematic orbit for staged screenshots (no pointer lock headless).
    if (SHOT === 'play') {
      player.camYaw += dt * 0.12;
    }
  } else {
    // Menu: slow orbit above the city so the start screen has a backdrop.
    menuAngle += dt * 0.03;
    tmpTarget.set(0, 10, 0);
    camPos.lerp(new THREE.Vector3(Math.sin(menuAngle) * 210, 95, Math.cos(menuAngle) * 210), 1 - Math.exp(-2 * dt));
    camTarget.lerp(tmpTarget, 1 - Math.exp(-2 * dt));
  }

  // Gentle water shimmer.
  for (const w of city.water) {
    w.material.opacity = 0.8 + Math.sin(state.time * 0.7) * 0.05;
  }

  camera.position.copy(camPos);
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
if (SHOT === 'play') {
  state.mode = 'playing';
  overlayMenu.style.display = 'none';
  if (AUTO_DRIVE) {
    const car = nearestCar(500);
    if (car) {
      car.occupied = true;
      player.inCar = car;
      player.mesh.visible = false;
      player.camYaw = car.heading;
    }
  }
}

animate();

// Debug handle for headless playtests (not part of the game UI).
window.__game = { scene, player, cars, city, state, THREE };
