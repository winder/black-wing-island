// Shows the Materials you're carrying, and a "+5 Wood" message when you get some.

import { Inventory, MATERIAL_NAMES, Material } from '../build/inventory';

const ICONS: Record<Material, string> = { wood: '🪵', stone: '🪨', gold: '🪙' };

export class InventoryHud {
  private root = document.createElement('div');
  private counts: Record<Material, HTMLSpanElement>;
  private toasts = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'inventory';
    this.root.innerHTML = (Object.keys(ICONS) as Material[])
      .map((m) => `<div title="${MATERIAL_NAMES[m]}">${ICONS[m]} <span data-m="${m}">0</span></div>`).join('');
    this.counts = Object.fromEntries((Object.keys(ICONS) as Material[])
      .map((m) => [m, this.root.querySelector<HTMLSpanElement>(`[data-m="${m}"]`)!])) as Record<Material, HTMLSpanElement>;
    this.toasts.className = 'toasts';
    parent.append(this.root, this.toasts);
  }

  update(inv: Inventory) {
    for (const m of Object.keys(this.counts) as Material[]) this.counts[m].textContent = String(inv[m]);
  }

  toast(text: string) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  gained(m: Material, n: number) { this.toast(`+${n} ${MATERIAL_NAMES[m]} ${ICONS[m]}`); }
}
