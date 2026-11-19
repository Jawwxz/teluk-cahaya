// missions.js — the Teluk Cahaya story arc (missions 1–3 Day 3, 4–6 Day 4).
// Raka the courier is pulled into the turf war between Geng Ombak and
// Keluarga Merpati. Each mission: marker + objective text + short
// dialogue lines, pays $ and unlocks the next; fail → retry from the
// mission start (the checkpoint). A glowing beacon marks the target
// in the world and on the minimap.
import * as THREE from 'three';

const DEFS = [
  {
    id: 1,
    title: 'Paket untuk Dara',
    reward: 300,
    briefing: [
      "Dara: 'Raka! Paket ini harus sampai ke Pelabuhan sebelum senja.'",
      "Dara: 'Hati-hati — anak-anak Ombak mengincar jalan itu.'",
    ],
    steps: [
      { type: 'goto', x: 0, z: -48, r: 6, text: 'Ambil paket di Pasar Lama' },
      { type: 'goto', x: -192, z: 0, r: 6, text: 'Antar paket ke dermaga Pelabuhan' },
    ],
    done: "Paket sampai! Dara: 'Kamu bisa diandalkan, Raka.'",
  },
  {
    id: 2,
    title: 'Kabur dari Ombak',
    reward: 500,
    briefing: [
      "Geng Ombak menyerbu pasar! Kabur ke Menara Kaca — cepat!",
      'Patroli mengejarmu. Jangan sampai tertangkap!',
    ],
    steps: [
      {
        type: 'chase',
        x: 48,
        z: -192,
        r: 8,
        time: 75,
        stars: 2,
        text: 'Kabur ke Menara Kaca!',
      },
    ],
    done: 'Kamu lolos dari kejaran! Keluarga Merpati berutang padamu.',
  },
  {
    id: 3,
    title: 'Rebut Pasar Lama',
    reward: 800,
    briefing: [
      "Keluarga Merpati: 'Rebut kembali Pasar Lama dari Geng Ombak.'",
      'Mereka bersenjata. Tembak duluan, tanya belakangan.',
    ],
    steps: [
      { type: 'goto', x: 48, z: 48, r: 8, text: 'Datang ke Pasar Lama' },
      {
        type: 'eliminate',
        count: 3,
        spots: [
          [40, 40],
          [56, 48],
          [48, 56],
        ],
        text: 'Habisi 3 anggota Geng Ombak',
      },
    ],
    done: 'Pasar Lama kembali! Para pedagang bisa bernapas lagi.',
  },
  {
    id: 4,
    title: 'Selamatkan Dara',
    reward: 1000,
    briefing: [
      "Dara diculik! Geng Ombak menahannya di gudang Pelabuhan.",
      "Dara: 'Raka! Aku di sini — hati-hati, mereka bersenjata!'",
      "Dara: 'Ayo, bawa aku ke rumah aman di Bukit Perumahan.'",
    ],
    steps: [
      { type: 'goto', x: -144, z: 48, r: 8, text: 'Temukan gudang tempat Dara ditahan' },
      {
        type: 'eliminate',
        count: 3,
        spots: [
          [-152, 40],
          [-136, 56],
          [-144, 64],
        ],
        text: 'Habisi 3 penjaga Geng Ombak',
      },
      { type: 'goto', x: -96, z: 96, r: 6, text: 'Bawa Dara ke rumah aman' },
    ],
    done: "Dara selamat! Keluarga Merpati: 'Kami berutang nyawa padamu.'",
  },
  {
    id: 5,
    title: 'Rencana Perampokan',
    reward: 1200,
    briefing: [
      "Merpati: 'Curi cetak biru brankas Ombak di Menara Kaca.'",
      'Patroli mengejarmu! Kabur ke Bukit Perumahan.',
      "Merpati: 'Serahkan cetak birunya — perampokan besar dimulai.'",
    ],
    steps: [
      { type: 'goto', x: 144, z: -48, r: 6, text: 'Ambil cetak biru di Menara Kaca' },
      {
        type: 'chase',
        x: 96,
        z: -144,
        r: 8,
        time: 75,
        stars: 2,
        text: 'Kabur dari Patroli ke Bukit Perumahan!',
      },
      { type: 'goto', x: 144, z: 96, r: 6, text: 'Serahkan cetak biru ke Merpati' },
    ],
    done: 'Cetak biru di tangan! Perampokan dermaga bisa dimulai.',
  },
  {
    id: 6,
    title: 'Perang di Dermaga',
    reward: 2000,
    briefing: [
      'Malam penentuan: rebut dermaga Pelabuhan dari Geng Ombak.',
      'Lima penjaga terakhir. Habisi mereka semua!',
      'Patroli datang! Kabur ke Pasar Lama — ini akhir perang.',
    ],
    steps: [
      { type: 'goto', x: -192, z: -48, r: 8, text: 'Ke dermaga Pelabuhan' },
      {
        type: 'eliminate',
        count: 5,
        spots: [
          [-200, -56],
          [-184, -40],
          [-192, -32],
          [-176, -56],
          [-200, -32],
        ],
        text: 'Habisi 5 anggota Geng Ombak',
      },
      {
        type: 'chase',
        x: 0,
        z: 0,
        r: 8,
        time: 90,
        stars: 3,
        text: 'Kabur dari Patroli ke Pasar Lama!',
      },
    ],
    done: 'Dermaga direbut! Teluk Cahaya akhirnya tenang — untuk sekarang.',
  },
];

function beaconMesh() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23a,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 13;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd23a,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

export class Missions {
  // hooks: { hud, audio, police, combat, economy, save, toast }
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.unlocked = 0; // missions completed
    this.active = null; // { def, step, timer, lineIdx }
    this.idle = 0; // seconds with no mission running
    this.celebrate = 0; // mission-complete screen still showing
    this.holdObjective = false; // staged shots keep their own objective text
    this.beacon = beaconMesh();
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  get current() {
    return this.unlocked < DEFS.length ? DEFS[this.unlocked] : null;
  }

  setUnlocked(n) {
    this.unlocked = Math.min(n, DEFS.length);
  }

  startCurrent() {
    const def = this.current;
    if (!def) return false;
    this.active = { def, step: 0, timer: 0, lineIdx: 0 };
    this.hooks.audio.blip(660, 0.12);
    this.hooks.toast(`Misi ${def.id}: ${def.title}`);
    this.enterStep();
    return true;
  }

  restartActive() {
    if (!this.active) return;
    const def = this.active.def;
    this.hooks.combat.clearEnemies();
    this.active = { def, step: 0, timer: 0, lineIdx: 0 };
    this.enterStep();
  }

  enterStep() {
    const step = this.active.def.steps[this.active.step];
    this.active.timer = 0;
    this.active.lineIdx = 0;
    if (step.type === 'chase') {
      this.hooks.police.addStars(step.stars);
    }
    if (step.type === 'eliminate') {
      this.hooks.combat.spawnEnemies(step.spots);
    }
    if (step.x !== undefined) {
      this.beacon.position.set(step.x, 0, step.z);
      this.beacon.visible = true;
      this.hooks.hud.missionMarker = { x: step.x, z: step.z };
    } else {
      this.beacon.visible = false;
      this.hooks.hud.missionMarker = null;
    }
    this.hooks.hud.setObjective(`Misi ${this.active.def.id}: ${step.text}`);
    const line = this.active.def.briefing[this.active.step];
    if (line) this.hooks.toast(line, 5);
  }

  completeStep() {
    const { def } = this.active;
    this.active.step++;
    this.hooks.audio.blip(880, 0.1);
    if (this.active.step >= def.steps.length) {
      this.completeMission();
    } else {
      this.enterStep();
    }
  }

  completeMission() {
    const { def } = this.active;
    this.hooks.economy.addCash(def.reward);
    this.unlocked++;
    this.hooks.save.store({
      unlocked: this.unlocked,
      cash: this.hooks.economy.getCash(),
    });
    this.beacon.visible = false;
    this.hooks.hud.missionMarker = null;
    this.hooks.audio.jingle();
    this.hooks.ui.showMissionComplete(def.title, def.reward);
    this.celebrate = 4; // the next mission waits for the screen
    this.hooks.toast(`${def.done} +$${def.reward}`);
    this.active = null;
    this.idle = 0;
  }

  failMission(reason) {
    this.hooks.combat.clearEnemies();
    this.hooks.toast(`${reason} Misi diulang dari awal.`, 4);
    this.active = null;
    this.idle = -3; // a short breather before the retry starts
  }

  update(dt, ctx) {
    // ctx: { player, playerCar }
    this.beacon.userData.ring.scale.setScalar(
      1 + Math.sin(performance.now() * 0.004) * 0.12,
    );
    if (!this.active) {
      // A staged shot (e.g. the chase cover) holds its own objective text.
      if (this.holdObjective) return;
      if (!this.current) {
        this.hooks.hud.setObjective('Semua misi selesai — Teluk Cahaya milikmu.');
        return;
      }
      // The mission-complete screen holds the next start for a beat.
      if (this.celebrate > 0) {
        this.celebrate -= dt;
        if (this.celebrate <= 0) this.hooks.ui.hideMissionComplete();
        return;
      }
      // Next mission starts on its own a few seconds after the last one.
      this.idle += dt;
      if (this.idle > 2) this.startCurrent();
      return;
    }
    const step = this.active.def.steps[this.active.step];
    const px = ctx.player.pos.x;
    const pz = ctx.player.pos.z;
    if (step.type === 'goto') {
      const d = Math.hypot(step.x - px, step.z - pz);
      if (d < step.r) this.completeStep();
    } else if (step.type === 'chase') {
      this.active.timer += dt;
      const left = Math.ceil(step.time - this.active.timer);
      const d = Math.hypot(step.x - px, step.z - pz);
      if (d < step.r) {
        this.completeStep();
      } else if (left <= 0) {
        this.failMission('Waktu habis!');
      } else {
        this.hooks.hud.setObjective(`Misi ${this.active.def.id}: ${step.text} — ${left} dtk`);
      }
    } else if (step.type === 'eliminate') {
      if (this.hooks.combat.enemiesAlive() === 0) this.completeStep();
    }
  }
}
