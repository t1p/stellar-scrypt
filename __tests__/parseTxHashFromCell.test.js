const { parseTxHashFromCell } = require('../clasp/DomainCore');

describe('parseTxHashFromCell', () => {
  it('extracts hash from Horizon transaction URL', () => {
    const cell = 'https://horizon.stellar.org/transactions/ABCDEF1234567890';
    expect(parseTxHashFromCell(cell)).toBe('ABCDEF1234567890');
  });

  it('extracts hash from HYPERLINK formula-like tail', () => {
    const cell = '=HYPERLINK("https://horizon.stellar.org/transactions/ABC", "FEDCBA9876543210")';
    expect(parseTxHashFromCell(cell)).toBe('ABC');
  });

  it('uses raw hash when cell contains hash only', () => {
    const cell = 'A1B2C3D4E5F6G7H8I9J0';
    expect(parseTxHashFromCell(cell)).toBe('A1B2C3D4E5F6G7H8I9J0');
  });

  it('returns empty string when hash cannot be parsed', () => {
    const cell = 'not-a-hash';
    expect(parseTxHashFromCell(cell)).toBe('');
  });
});
