/**
 * Unit tests for normalizeAssetKey_ function
 */

const { normalizeAssetKey } = require('../clasp/DomainCore');

describe('normalizeAssetKey', () => {
  it('should handle empty input', () => {
    expect(normalizeAssetKey('')).toBe('');
    expect(normalizeAssetKey(null)).toBe('');
    expect(normalizeAssetKey(undefined)).toBe('');
  });

  it('should normalize simple asset key', () => {
    expect(normalizeAssetKey('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should convert separators to colons', () => {
    expect(normalizeAssetKey('EURMTL/GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(normalizeAssetKey('EURMTL|GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should remove spaces and convert to uppercase', () => {
    expect(normalizeAssetKey('  eurmtl : gbXGqjWVlwoyhfLvtkwv5FGWKXV7zGYYgycnb3dhmmjr7wl3h6hfgnT  '))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle multiple separators', () => {
    expect(normalizeAssetKey('EURMTL / GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should filter empty parts', () => {
    expect(normalizeAssetKey('EURMTL::GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle extra parts', () => {
    expect(normalizeAssetKey('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT:EXTRA'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle code only (no issuer)', () => {
    expect(normalizeAssetKey('XLM')).toBe('XLM:');
  });

  it('should handle native XLM', () => {
    expect(normalizeAssetKey('native')).toBe('NATIVE:');
    expect(normalizeAssetKey('XLM')).toBe('XLM:');
  });
});
