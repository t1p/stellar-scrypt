/**
 * Unit tests for parseStellarAddressList function
 */

const { parseStellarAddressList } = require('../clasp/DomainCore');

describe('parseStellarAddressList', () => {
  it('returns empty array for empty value', () => {
    expect(parseStellarAddressList('')).toEqual([]);
    expect(parseStellarAddressList(null)).toEqual([]);
  });

  it('parses comma and semicolon separated addresses', () => {
    const input = ' GAAA ; GBBB, GCCC ';
    expect(parseStellarAddressList(input)).toEqual(['GAAA', 'GBBB', 'GCCC']);
  });

  it('filters non-stellar values and trims spaces', () => {
    const input = '  ,foo; bar; GVALID1 ;   GVALID2  ; MNOT_STELLAR';
    expect(parseStellarAddressList(input)).toEqual(['GVALID1', 'GVALID2']);
  });
});
