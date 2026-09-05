const parseDice = require('../../utils/parseDice');

describe('parseDice', () => {
  test('parses a typical formula 2d6+1', () => {
    const result = parseDice('2d6+1');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('rolls');
    expect(typeof result.total).toBe('number');
    expect(Array.isArray(result.rolls)).toBe(true);
    expect(result.rolls.length).toBe(2);
  });

  test('throws on invalid formula string', () => {
    expect(() => parseDice('bad')).toThrow('Invalid dice format');
  });

  test('throws when exceeding the dice-count limit', () => {
    expect(() => parseDice('101d6')).toThrow('Too many dice');
  });

  test('accepts every die in the standard polyhedral set', () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      expect(() => parseDice(`1d${sides}`)).not.toThrow();
    }
  });

  test('rejects dice that are not part of the standard polyhedral set', () => {
    for (const sides of [3, 5, 7, 17, 1000]) {
      expect(() => parseDice(`1d${sides}`)).toThrow(`Unsupported die: d${sides}`);
    }
  });

  test('supports keep highest modifier', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.6);
    const result = parseDice('2d6kh1');
    expect(result.rolls.filter(r => r.includes('**'))).toHaveLength(1);
    Math.random.mockRestore();
  });

  test('handles numeric modifier', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    const result = parseDice('1d6-1');
    expect(typeof result.total).toBe('number');
    Math.random.mockRestore();
  });

  test('supports combining multiple dice types in one formula', () => {
    // 1d20 -> floor(0.5*20)+1 = 11, 1d4 -> floor(0.25*4)+1 = 2, +5 modifier
    // (every die counts toward the total here, so each is bolded, same as a
    // single dice-group formula with no keep-highest/lowest clause)
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);
    const result = parseDice('1d20 + 1d4 + 5');
    expect(result.total).toBe(11 + 2 + 5);
    expect(result.rolls).toEqual(['1d20: **11**', '1d4: **2**']);
    Math.random.mockRestore();
  });

  test('supports subtracting a dice term', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
    const result = parseDice('2d6-1d4');
    expect(result.rolls).toEqual(['2d6: **4**, **4**', '1d4: **3**']);
    expect(result.total).toBe(4 + 4 - 3);
    Math.random.mockRestore();
  });

  test('rejects malformed formulas that a loose tokenizer might otherwise silently accept', () => {
    expect(() => parseDice('1d20++5')).toThrow('Invalid dice format');
    expect(() => parseDice('1d20+')).toThrow('Invalid dice format');
    expect(() => parseDice('+5')).toThrow('Invalid dice format'); // no dice group at all
  });

  test('rejects formulas with too many terms', () => {
    const manyTerms = Array(21).fill('1d4').join('+');
    expect(() => parseDice(manyTerms)).toThrow('Too many terms. Calm down, wizard.');
  });

  test('still enforces per-term dice-count and valid-sides limits within a multi-term formula', () => {
    expect(() => parseDice('1d20+101d6')).toThrow('Too many dice');
    expect(() => parseDice('1d20+1d7')).toThrow('Unsupported die: d7');
  });
});
