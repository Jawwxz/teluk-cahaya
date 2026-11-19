// ui.js — full-screen overlays for BUSTED, WASTED and (Day 4) the
// mission-complete screen. main.js owns the game state; this module
// only shows and hides the screens and wires their buttons.

export class UiScreens {
  constructor(onRespawn) {
    this.bustedEl = document.getElementById('busted');
    this.wastedEl = document.getElementById('wasted');
    this.bustedText = document.getElementById('busted-text');
    this.wastedText = document.getElementById('wasted-text');
    this.completeEl = document.getElementById('mission-complete');
    this.completeText = document.getElementById('mission-complete-text');
    document.getElementById('busted-btn').addEventListener('click', () => {
      this.hide();
      onRespawn();
    });
    document.getElementById('wasted-btn').addEventListener('click', () => {
      this.hide();
      onRespawn();
    });
    document.getElementById('mission-complete-btn').addEventListener('click', () => {
      this.hideMissionComplete();
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

  // A short celebration: title, payout, and a Lanjut button. The game
  // keeps running behind it; missions.js hides it after a few seconds.
  showMissionComplete(title, reward) {
    this.completeText.textContent =
      `"${title}" selesai! Hadiah $${reward} masuk ke kantong Raka.`;
    this.completeEl.style.display = 'flex';
  }

  hideMissionComplete() {
    this.completeEl.style.display = 'none';
  }

  hide() {
    this.bustedEl.style.display = 'none';
    this.wastedEl.style.display = 'none';
    this.hideMissionComplete();
  }
}
