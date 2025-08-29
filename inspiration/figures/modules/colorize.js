// /inspiration/figures/modules/colorize.js
import { state } from './state.js';
import { inferGridColsVisible } from './grid.js';
import { setCardPaint } from './color.js';

/**
 * Color visible cards with:
 *  - no immediate adjacency collisions (left/above),
 *  - minimal churn: keep the existing color if it’s still valid,
 *  - balanced usage across the palette.
 */
export function colorizeBalancedNoAdjacency() {
  const cards = state.nodes.map(n => n.el).filter(c => c.offsetParent !== null);
  if (!cards.length || !state.palette.length) return;

  const cols = inferGridColsVisible(cards);
  const pal  = state.palette.slice(); // 8–16 colors already
  const usage = Object.fromEntries(pal.map(c => [c, 0]));

  // Seed usage with already-assigned visible colors so balance is respected
  cards.forEach(c => {
    const col = c.dataset.colorResolved;
    if (col && usage[col] != null) usage[col]++;
  });

  const maxTarget = Math.ceil(cards.length / pal.length);

  for (let i = 0; i < cards.length; i++) {
    const card  = cards[i];
    const row   = Math.floor(i / cols);
    const colIx = i % cols;

    // read *current* resolved colors for adjacency checks
    const left  = colIx > 0     ? cards[i - 1]?.dataset.colorResolved : null;
    const above = row  > 0      ? cards[i - cols]?.dataset.colorResolved : null;

    const current = card.dataset.colorResolved || null;

    // If current color exists and doesn’t collide, keep it (no churn).
    if (current && current !== left && current !== above) {
      continue;
    }

    // Build allowed list (avoid collisions)
    let allowed = pal.filter(c => c !== left && c !== above);
    if (!allowed.length) allowed = pal.slice(); // single-color or tight palette fallback

    // Pick least-used among allowed
    const minUse = Math.min(...allowed.map(c => usage[c] ?? 0));
    let candidates = allowed.filter(c => (usage[c] ?? 0) === minUse);

    // Try to keep same family if possible (soft preference for current)
    if (current && candidates.includes(current)) {
      setCardPaint(card, current);
      usage[current] = (usage[current] ?? 0) + 1;
      continue;
    }

    // Cap runaway usage a bit
    const underCap = candidates.filter(c => (usage[c] ?? 0) < maxTarget);
    if (underCap.length) candidates = underCap;

    const pick = candidates[Math.floor(Math.random() * candidates.length)] || pal[0];
    setCardPaint(card, pick);
    usage[pick] = (usage[pick] ?? 0) + 1;
  }
}
