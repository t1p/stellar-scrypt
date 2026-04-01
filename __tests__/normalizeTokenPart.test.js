const { normalizeTokenPart } = require('../clasp/DomainCore');

describe('normalizeTokenPart', () => {
  it('uppercases and trims string', () => {
    expect(normalizeTokenPart(' usdc ')).toBe('USDC');
  });

  it('returns empty string for nullish values', () => {
    expect(normalizeTokenPart(null)).toBe('');
    expect(normalizeTokenPart(undefined)).toBe('');
  });

  it('handles numbers by string conversion', () => {
    expect(normalizeTokenPart(123)).toBe('123');
  });
});
