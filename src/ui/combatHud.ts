// On-screen combat info: the dragon's health and fire, a red flash when hurt,
// the health bar of the monster you're fighting, and the knocked-out screen.

import { MAX_FIRE, MAX_HEALTH, Vitals } from '../combat/vitals';
import { Monster } from '../monsters/monster';

export class CombatHud {
  private root = document.createElement('div');
  private health: HTMLDivElement;
  private fire: HTMLDivElement;
  private fireBox: HTMLDivElement;
  private flash: HTMLDivElement;
  private foe: HTMLDivElement;
  private foeName: HTMLDivElement;
  private foeBar: HTMLDivElement;
  private ko: HTMLDivElement;
  private koText: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root.innerHTML = `
      <div class="hurt-flash"></div>
      <div class="vitals">
        <div class="bar health"><div class="fill"></div><span>Health</span></div>
        <div class="bar fire"><div class="fill"></div><span>Fire</span></div>
      </div>
      <div class="foe hidden"><div class="foe-name"></div><div class="bar"><div class="fill"></div></div></div>
      <div class="ko hidden"><div class="ko-text"></div></div>`;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.health = q('.health .fill');
    this.fire = q('.fire .fill');
    this.fireBox = q('.fire');
    this.flash = q('.hurt-flash');
    this.foe = q('.foe');
    this.foeName = q('.foe-name');
    this.foeBar = q('.foe .fill');
    this.ko = q('.ko');
    this.koText = q('.ko-text');
  }

  update(v: Vitals, foe: Monster | null) {
    this.health.style.width = `${(v.health / MAX_HEALTH) * 100}%`;
    this.health.classList.toggle('low', v.health < 30);
    this.fire.style.width = `${(v.fire / MAX_FIRE) * 100}%`;
    this.fireBox.classList.toggle('empty', v.outOfFire);
    this.flash.style.opacity = String(v.hurtFlash * 0.7);
    this.foe.classList.toggle('hidden', !foe);
    if (foe) {
      this.foeName.textContent = foe.name;
      this.foeBar.style.width = `${(foe.health / foe.maxHealth) * 100}%`;
    }
  }

  /** Show the knocked-out screen; `stage` 0 = just knocked out, 1 = waking up. */
  knockedOut(stage: 0 | 1 | null) {
    this.ko.classList.toggle('hidden', stage === null);
    this.ko.classList.toggle('waking', stage === 1);
    this.koText.textContent = stage === 1 ? 'You wake up safe in the Home Village…' : 'You were knocked out!';
  }
}
