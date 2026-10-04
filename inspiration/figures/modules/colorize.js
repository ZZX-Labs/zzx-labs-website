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
  const nodes = state.nodes || [];
  const cards = nodes.map(n => n.el).filter(c => c && c.offsetParent !== null);
  const pal   = (state.palette || []).slice();

  if (!cards.length || !pal.length) return;

  const cols  = inferGridColsVisible(cards);
  const usage = Object.fromEntries(pal.map(c => [c, 0]));

  // Seed usage from current visible colors
  cards.forEach(c => {
    const col = c.dataset.colorResolved || c.dataset.bgColor || null;
    if (col && usage[col] != null) usage[col]++;
  });

  const maxTarget = Math.ceil(cards.length / pal.length);

  for (let i = 0; i < cards.length; i++) {
    const card  = cards[i];
    const row   = Math.floor(i / cols);
    const colIx = i % cols;

    // read *current* resolved colors for adjacency checks
    const left  = colIx > 0     ? (cards[i - 1]?.dataset.colorResolved || cards[i - 1]?.dataset.bgColor) : null;
    const above = row  > 0      ? (cards[i - cols]?.dataset.colorResolved || cards[i - cols]?.dataset.bgColor) : null;

    const current = card.dataset.colorResolved || card.dataset.bgColor || null;

    // If current color exists and doesn’t collide, keep it (no churn)
    if (current && current !== left && current !== above) {
      continue;
    }

    // Allowed list (avoid collisions with immediate neighbors)
    let allowed = pal.filter(c => c !== left && c !== above);
    if (!allowed.length) allowed = pal.slice(); // tight palette fallback

    // Least-used among allowed
    const minUse = Math.min(...allowed.map(c => usage[c] ?? 0));
    let candidates = allowed.filter(c => (usage[c] ?? 0) === minUse);

    // Keep same if it’s among candidates (soft preference)
    if (current && candidates.includes(current)) {
      setCardPaint(card, current);
      usage[current] = (usage[current] ?? 0) + 1;
      // ensure both data attrs are in sync for legacy readers
      card.dataset.bgColor = current;
      continue;
    }

    // Avoid runaway usage vs. target
    const underCap = candidates.filter(c => (usage[c] ?? 0) < maxTarget);
    if (underCap.length) candidates = underCap;

    const pick = candidates[Math.floor(Math.random() * candidates.length)] || pal[0];
    setCardPaint(card, pick);
    usage[pick] = (usage[pick] ?? 0) + 1;
    card.dataset.bgColor = pick; // legacy compat for any code reading bgColor
  }
}
