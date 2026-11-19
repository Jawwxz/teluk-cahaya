// save.js — localStorage save/load for Teluk Cahaya progress.
// Saved: cash, armour, unlocked missions, owned weapons and cars.
// Missions always restart from their first step (checkpoint = mission
// start), so only completed-mission progress is stored.
const KEY = 'teluk-cahaya-save-v1';

export class Save {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.v === 1 ? d : null;
    } catch (e) {
      return null;
    }
  }

  store(patch) {
    this.data = {
      v: 1,
      cash: 0,
      armour: 0,
      unlocked: 0,
      weapons: ['pistol'],
      ownedCars: [],
      ...(this.data || {}),
      ...patch,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      // Storage full or blocked: progress keeps running, just not saved.
    }
  }

  clear() {
    this.data = null;
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // Nothing to do.
    }
  }
}
