// A developer's teleport panel: ` (backquote) frees the mouse and lists every
// place worth testing; click one to go straight there. Only with ?debug or ?dev.

import { Input } from '../input';

export interface Spot { id: string; label: string; group: string }

export class DevPanel {
  open = false;
  private el = document.createElement('div');

  constructor(parent: HTMLElement, private input: Input, private spots: () => Spot[], private go: (id: string) => void) {
    this.el.className = 'dev-panel hidden';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.go;
      if (!id) return;
      this.close();
      this.go(id);
    });
  }

  toggle() { if (this.open) this.close(); else this.show(); }

  private show() {
    this.open = true;
    const groups = new Map<string, Spot[]>();
    for (const s of this.spots()) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group)!.push(s);
    }
    this.el.innerHTML = `<h3>Teleport <small>(\` to close)</small></h3>` + [...groups].map(([g, list]) =>
      `<div class="group"><b>${g}</b>${list.map((s) => `<button data-go="${s.id}">${s.label}</button>`).join('')}</div>`).join('');
    this.el.classList.remove('hidden');
    this.input.unlock();
  }

  private close() {
    this.open = false;
    this.el.classList.add('hidden');
    this.input.lock();
  }
}
