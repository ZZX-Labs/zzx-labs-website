import { state } from './state.js';
import { inferGridColsVisible } from './grid.js';
import { setCardPaint } from './color.js';

export function colorizeBalancedNoAdjacency() {
  const cards = state.nodes.map(n => n.el).filter(c => c.offsetParent !== null);
  if (!cards.length || !state.palette.length) return;

  const cols = inferGridColsVisible(cards);
  const pal  = state.palette.slice(); // already constrained to 8–16
  const usage = Object.fromEntries(pal.map(c => [c, 0]));
  const maxTarget = Math.ceil(cards.length / pal.length);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const row = Math.floor(i / cols), col = i % cols;
    const left  = col > 0 ? cards[i - 1]?.dataset.bgColor : null;
    const above = row > 0 ? cards[i - cols]?.dataset.bgColor : null;

    let allowed = pal.filter(c => c !== left && c !== above);
    const minUse = Math.min(...allowed.map(c => usage[c]));
    let candidates = allowed.filter(c => usage[c] === minUse);
    const underCap = candidates.filter(c => usage[c] < maxTarget);
    if (underCap.length) candidates = underCap;

    const picked = candidates[Math.floor(Math.random() * candidates.length)] || pal[0];
    usage[picked] = (usage[picked] || 0) + 1;
    setCardPaint(card, picked);
  }
}
