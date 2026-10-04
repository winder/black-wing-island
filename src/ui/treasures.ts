// The Treasures screen (I): the Powers you've won, and the Accessories you can
// wear. Number keys put things on or take them off.

import { Input } from '../input';
import { ACCESSORIES, AccessoryId, POWERS, PowerId, Rewards } from '../quests/rewards';

const ORDER: AccessoryId[] = ['crown', 'rubyAmulet', 'midnightScales', 'emeraldScales', 'crimsonScales', 'goldenSheen', 'starlightSheen'];
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

export class Treasures {
  open = false;
  private el = document.createElement('div');

  constructor(hud: HTMLElement, private rewards: Rewards) {
    this.el.className = 'treasures hidden';
    hud.appendChild(this.el);
  }

  toggle() {
    this.open = !this.open;
    this.el.classList.toggle('hidden', !this.open);
    this.draw();
  }

  update(input: Input) {
    if (!this.open) return;
    DIGITS.forEach((code, i) => {
      if (input.wasPressed(code)) this.rewards.toggle(ORDER[i]);
    });
  }

  draw() {
    if (!this.open) return;
    const r = this.rewards;
    const powers = (Object.keys(POWERS) as PowerId[]).map((p) =>
      `<div class="row ${r.has(p) ? '' : 'locked'}"><b>${POWERS[p].name}</b><span>${r.has(p) ? POWERS[p].does : 'Not won yet: a reward for a big Quest'}</span></div>`).join('');
    const owned = ORDER.filter((a) => r.accessories.has(a));
    const wear = owned.length
      ? ORDER.map((a, i) => {
        if (!r.accessories.has(a)) return '';
        const worn = r.worn[ACCESSORIES[a].slot] === a;
        return `<div class="row ${worn ? 'worn' : ''}"><kbd>${i + 1}</kbd><b>${ACCESSORIES[a].name.replace(/^an? /, '')}</b><span>${worn ? 'wearing' : ''}</span></div>`;
      }).join('')
      : '<p>Nothing yet. Rescue dragons and raid Dungeons to find things to wear.</p>';
    this.el.innerHTML = `<h3>Powers</h3>${powers}<h3>Wear</h3>${wear}<p class="small">Number keys: put on / take off · I to close · V to see yourself</p>`;
  }
}
