// /inspiration/figures/modules/colorize.js
import { state } from './state.js';
import { inferGridColsVisible } from './grid.js';
import { setCardPaint } from './color.js';

function getAssignedColor(el) {
  return el?.dataset?.colorResolved || el?.dataset?.bgColor || '';
}

export function colorizeBalancedNoAdjacency() {
  const cards = state.nodes.map(n => n.el).filter(c => c && c.offsetParent !== null);
  const pal   = (state.palette || []).slice();

  if (!cards.length || !pal.length) return;

  const cols     = Math.max(1, inferGridColsVisible(cards));
  const maxTarget = Math.ceil(cards.length / pal.length);

  // Track how often each palette color is used this pass
  const usage = Object.fromEntries(pal.map(c => [c, 0]));
  // Current pass assignments (parallel to cards)
  const assigned = new Array(cards.length);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const row = Math.floor(i / cols), col = i % cols;

    const leftColor  = col > 0 ? assigned[i - 1] : '';
    const aboveColor = row > 0 ? assigned[i - cols] : '';

    const prev = getAssignedColor(card); // stable between calls

    // Keep previous color if it doesn't collide with left/above
    if (prev && prev !== leftColor && prev !== aboveColor) {
      assigned[i] = prev;
      if (prev in usage) usage[prev] += 1;
      continue;
    }

    // Build allowed set avoiding immediate neighbors
    let allowed = pal.filter(c => c !== leftColor && c !== aboveColor);
    if (!allowed.length) allowed = pal.slice(); // edge-case: tiny palettes

    // Prefer the least-used colors, under a soft cap
    const minUse = Math.min(...allowed.map(c => usage[c] ?? 0));
    let candidates = allowed.filter(c => (usage[c] ?? 0) === minUse);
    const underCap = candidates.filter(c => (usage[c] ?? 0) < maxTarget);
    if (underCap.length) candidates = underCap;

    // Deterministic pick (no RNG flicker)
    const picked = candidates[0] || allowed[0] || pal[0];
    assigned[i] = picked;
    usage[picked] = (usage[picked] ?? 0) + 1;
  }

  // Apply only if changed (keeps things stable across reflows/loads)
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const now  = getAssignedColor(card);
    const next = assigned[i];
    if (now !== next) {
      setCardPaint(card, next);
      // Also mirror into bgColor for legacy readers
      card.dataset.bgColor = next;
    }
  }
}
