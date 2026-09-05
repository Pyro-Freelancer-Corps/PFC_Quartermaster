const MAX_TERMS = 20;

// The standard 7-piece polyhedral set — no d17s, d333s, or other dice that
// don't physically exist.
const VALID_SIDES = [4, 6, 8, 10, 12, 20, 100];

// A term is either a dice group (2d6, d20, 1d6kh1) or a flat integer modifier.
const TERM_BODY = '(?:\\d*d\\d+(?:kh\\d+|kl\\d+)?|\\d+)';
// Anchored across the whole string so malformed input (e.g. stray "++") is
// rejected outright instead of silently dropped by a looser tokenizer.
const FORMULA_REGEX = new RegExp(`^[+-]?${TERM_BODY}(?:[+-]${TERM_BODY})*$`, 'i');
const DICE_TERM_REGEX = /^(\d*)d(\d+)(kh\d+|kl\d+)?$/i;

function rollDiceTerm(count, sides, keep) {
  if (!VALID_SIDES.includes(sides)) {
    throw new Error(`Unsupported die: d${sides}. Valid dice are d${VALID_SIDES.join(', d')}.`);
  }

  if (count > 100) {
    throw new Error('Too many dice. Calm down, wizard.');
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);

  let kept = [...rolls];
  if (keep) {
    const keepHigh = keep.toLowerCase().startsWith('kh');
    const num = parseInt(keep.slice(2));
    kept = [...rolls]
      .sort((a, b) => (keepHigh ? b - a : a - b))
      .slice(0, num);
  }

  const total = kept.reduce((sum, val) => sum + val, 0);
  const displays = rolls.map((r) => (kept.includes(r) ? `**${r}**` : `${r}`));

  return { total, displays };
}

module.exports = function parseDice(formula) {
  const normalized = formula.replace(/\s+/g, '');
  if (!normalized || !FORMULA_REGEX.test(normalized)) {
    throw new Error('Invalid dice format');
  }

  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (tokens.length > MAX_TERMS) {
    throw new Error('Too many terms. Calm down, wizard.');
  }

  let total = 0;
  let diceTermCount = 0;
  const diceTermResults = [];

  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1;
    const body = token.replace(/^[+-]/, '');

    const diceMatch = body.match(DICE_TERM_REGEX);
    if (diceMatch) {
      diceTermCount += 1;
      const count = parseInt(diceMatch[1] || '1');
      const sides = parseInt(diceMatch[2]);
      const keep = diceMatch[3];
      const { total: termTotal, displays } = rollDiceTerm(count, sides, keep);
      total += sign * termTotal;
      diceTermResults.push({ label: `${count}d${sides}${keep || ''}`, displays });
      continue;
    }

    total += sign * parseInt(body);
  }

  if (!diceTermCount) throw new Error('Invalid dice format');

  // A single dice group keeps the old flat display (no label needed); once a
  // formula mixes multiple dice types, each group is labeled so it's clear
  // which rolls came from which dice.
  const rolls = diceTermResults.length === 1
    ? diceTermResults[0].displays
    : diceTermResults.map(({ label, displays }) => `${label}: ${displays.join(', ')}`);

  return { total, rolls };
};
