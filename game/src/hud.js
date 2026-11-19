// hud.js — the on-screen HUD and the 2D canvas minimap.
// DOM ids live in index.html; this module only writes to them.
// The minimap draws the road graph, the beach and harbour, the player
// arrow, every car, and (from Day 3) the mission marker.

import { GROUND_SIZE } from './city.js';

export class Hud {
  constructor(roadGraph) {
    this.roadGraph = roadGraph;
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      armourRow: document.getElementById('armour-row'),
      armour: document.getElementById('armour-fill'),
      armourText: document.getElementById('armour-text'),
      weapon: document.getElementById('weapon'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      speedNum: document.getElementById('speed-num'),
      objective: document.getElementById('objective'),
      toast: document.getElementById('toast'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.mapSize = this.el.minimap.width;
    this.scale = this.mapSize / GROUND_SIZE;
    this.toastTimer = 0;
    this.frame = 0;
    this.lastWanted = 0;
    this.missionMarker = null; // {x, z} set by missions.js (Day 3)
  }

  toMap(x, z) {
    return [
      (x + GROUND_SIZE / 2) * this.scale,
      (z + GROUND_SIZE / 2) * this.scale,
    ];
  }

  showToast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setWeapon(name) {
    this.el.weapon.textContent = name;
  }

  setCash(amount) {
    this.el.cash.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  setWanted(stars) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="star${i < stars ? ' on' : ''}">★</span>`;
    }
    this.el.stars.innerHTML = html;
  }

  update(dt, state) {
    // state: { health, cash, wanted, speedKmh, driving, player, cars,
    //          police?, peds? }
    this.frame++;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (state.wanted !== this.lastWanted) {
      this.lastWanted = state.wanted;
      this.setWanted(state.wanted);
    }
    this.el.health.style.width = `${state.health}%`;
    this.el.healthText.textContent = `${Math.round(state.health)}`;
    if (state.armour > 0) {
      this.el.armourRow.style.display = 'flex';
      this.el.armour.style.width = `${state.armour}%`;
      this.el.armourText.textContent = `${Math.round(state.armour)}`;
    } else {
      this.el.armourRow.style.display = 'none';
    }
    if (state.driving) {
      this.el.speedNum.textContent = `${Math.round(state.speedKmh)}`;
      this.el.speed.style.display = 'block';
    } else {
      this.el.speed.style.display = 'none';
    }
    // The minimap is cheap; redraw every second frame.
    if (this.frame % 2 === 0) this.drawMinimap(state);
  }

  drawMinimap(state) {
    const g = this.mapCtx;
    const S = this.mapSize;
    g.clearRect(0, 0, S, S);
    // City base.
    g.fillStyle = '#20262e';
    g.fillRect(0, 0, S, S);
    // Water west + south.
    g.fillStyle = '#2f6f9e';
    g.fillRect(0, 0, (GROUND_SIZE / 2 - 246) * this.scale, S);
    g.fillRect(0, (302 + GROUND_SIZE / 2) * this.scale, S, S);
    // Beach strip.
    g.fillStyle = '#c9b478';
    g.fillRect(0, (246 + GROUND_SIZE / 2) * this.scale, S, (302 - 246) * this.scale);
    // Roads.
    g.strokeStyle = '#5a6068';
    g.lineWidth = 2;
    g.beginPath();
    for (const [a, b] of this.roadGraph.edges) {
      const na = this.roadGraph.nodes[a];
      const nb = this.roadGraph.nodes[b];
      const [x1, y1] = this.toMap(na.x, na.z);
      const [x2, y2] = this.toMap(nb.x, nb.z);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
    // Mission marker.
    if (this.missionMarker) {
      const [mx, my] = this.toMap(this.missionMarker.x, this.missionMarker.z);
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.arc(mx, my, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#20262e';
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Cars as dots.
    for (const car of state.cars) {
      const [cx, cy] = this.toMap(car.pos.x, car.pos.z);
      g.fillStyle = car.occupied ? '#ffffff' : '#9fb4c8';
      g.beginPath();
      g.arc(cx, cy, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // Police cruisers: red dots with a white ring (blink on odd frames).
    if (state.police) {
      for (const car of state.police) {
        const [cx, cy] = this.toMap(car.pos.x, car.pos.z);
        g.fillStyle = this.frame % 30 < 15 ? '#ff4a3a' : '#3a6ad8';
        g.beginPath();
        g.arc(cx, cy, 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        g.stroke();
      }
    }
    // Pedestrians: tiny pale dots.
    if (state.peds) {
      g.fillStyle = '#c9b896';
      for (const ped of state.peds) {
        const [px2, py2] = this.toMap(ped.pos.x, ped.pos.z);
        g.fillRect(px2 - 1, py2 - 1, 2, 2);
      }
    }
    // Player arrow (heading: 0 faces +Z, which is down on the map).
    const [px, py] = this.toMap(state.player.pos.x, state.player.pos.z);
    g.save();
    g.translate(px, py);
    g.rotate(state.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 6);
    g.lineTo(-4, -5);
    g.lineTo(0, -2.5);
    g.lineTo(4, -5);
    g.closePath();
    g.fill();
    g.restore();
    // North marker.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.fillText('N', S / 2, 12);
  }
}
