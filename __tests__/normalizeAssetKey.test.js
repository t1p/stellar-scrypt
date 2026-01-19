/**
 * Unit tests for normalizeAssetKey_ function
 */

// Copy of the normalizeAssetKey_ function
function normalizeAssetKey_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/[\s/|]/g, ':').toUpperCase();
  const parts = normalized.split(':').filter(Boolean);
  const code = parts[0] || '';
  const issuer = parts[1] || '';
  return `${code}:${issuer}`;
}

describe('normalizeAssetKey_', () => {
  it('should handle empty input', () => {
    expect(normalizeAssetKey_('')).toBe('');
    expect(normalizeAssetKey_(null)).toBe('');
    expect(normalizeAssetKey_(undefined)).toBe('');
  });

  it('should normalize simple asset key', () => {
    expect(normalizeAssetKey_('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should convert separators to colons', () => {
    expect(normalizeAssetKey_('EURMTL/GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(normalizeAssetKey_('EURMTL|GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should remove spaces and convert to uppercase', () => {
    expect(normalizeAssetKey_('  eurmtl : gbXGqjWVlwoyhfLvtkwv5FGWKXV7zGYYgycnb3dhmmjr7wl3h6hfgnT  '))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle multiple separators', () => {
    expect(normalizeAssetKey_('EURMTL / GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should filter empty parts', () => {
    expect(normalizeAssetKey_('EURMTL::GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle extra parts', () => {
    expect(normalizeAssetKey_('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT:EXTRA'))
      .toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
  });

  it('should handle code only (no issuer)', () => {
    expect(normalizeAssetKey_('XLM')).toBe('XLM:');
  });

  it('should handle native XLM', () => {
    expect(normalizeAssetKey_('native')).toBe('NATIVE:');
    expect(normalizeAssetKey_('XLM')).toBe('XLM:');
  });
});