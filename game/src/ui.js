// ui.js — full-screen overlays for BUSTED and WASTED (and, from Day 4,
// the mission-complete screen). main.js owns the game state; this module
// only shows and hides the screens and wires their buttons.

export class UiScreens {
  constructor(onRespawn) {
    this.bustedEl = document.getElementById('busted');
    this.wastedEl = document.getElementById('wasted');
    this.bustedText = document.getElementById('busted-text');
    this.wastedText = document.getElementById('wasted-text');
    document.getElementById('busted-btn').addEventListener('click', () => {
      this.hide();
      onRespawn();
    });
    document.getElementById('wasted-btn').addEventListener('click', () => {
      this.hide();
      onRespawn();
    });
  }

  showBusted(stars) {
    this.bustedText.textContent =
      `Patroli menangkapmu dengan ${stars} bintang. Raka kehilangan jejak — mulai lagi dari tempat aman.`;
    this.bustedEl.style.display = 'flex';
  }

  showWasted() {
    this.wastedText.textContent = 'Raka tumbang di jalanan Teluk Cahaya. Bangkit lagi dan lanjutkan.';
    this.wastedEl.style.display = 'flex';
  }

  hide() {
    this.bustedEl.style.display = 'none';
    this.wastedEl.style.display = 'none';
  }
}
