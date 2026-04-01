const { addressListContains } = require('../clasp/DomainCore');

describe('addressListContains', () => {
  it('returns false for empty target', () => {
    expect(addressListContains('GAAA,GBBB', '')).toBe(false);
  });

  it('finds target in comma/semicolon list', () => {
    expect(addressListContains('GAAA; GBBB, GCCC', 'GBBB')).toBe(true);
    expect(addressListContains('GAAA; GBBB, GCCC', 'GCCC')).toBe(true);
  });

  it('returns false when target is absent', () => {
    expect(addressListContains('GAAA; GBBB', 'GZZZ')).toBe(false);
  });
});
