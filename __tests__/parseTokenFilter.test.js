/**
 * Unit tests for parseTokenFilter function
 */

// Copy of the parseTokenFilter function
function parseTokenFilter(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { raw: '', norm: '', code: '', issuer: '', hasIssuer: false };
  const normalized = raw.replace(/\s+/g, '').toUpperCase();
  const normalizedSep = normalized.replace(/[\/|]/g, ':');
  const parts = normalizedSep.split(':').filter(Boolean);
  const code = parts[0] || '';
  const issuer = parts[1] || '';
  return {
    raw,
    norm: normalizedSep,
    code,
    issuer,
    hasIssuer: Boolean(issuer)
  };
}

describe('parseTokenFilter', () => {
  it('should handle empty input', () => {
    const result = parseTokenFilter('');
    expect(result).toEqual({ raw: '', norm: '', code: '', issuer: '', hasIssuer: false });
  });

  it('should handle null input', () => {
    const result = parseTokenFilter(null);
    expect(result).toEqual({ raw: '', norm: '', code: '', issuer: '', hasIssuer: false });
  });

  it('should parse code only', () => {
    const result = parseTokenFilter('EURMTL');
    expect(result).toEqual({
      raw: 'EURMTL',
      norm: 'EURMTL',
      code: 'EURMTL',
      issuer: '',
      hasIssuer: false
    });
  });

  it('should parse code:issuer format', () => {
    const result = parseTokenFilter('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(result).toEqual({
      raw: 'EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      norm: 'EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      code: 'EURMTL',
      issuer: 'GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      hasIssuer: true
    });
  });

  it('should handle slash separator', () => {
    const result = parseTokenFilter('EURMTL/GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(result).toEqual({
      raw: 'EURMTL/GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      norm: 'EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      code: 'EURMTL',
      issuer: 'GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      hasIssuer: true
    });
  });

  it('should handle pipe separator', () => {
    const result = parseTokenFilter('EURMTL|GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(result).toEqual({
      raw: 'EURMTL|GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      norm: 'EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      code: 'EURMTL',
      issuer: 'GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT',
      hasIssuer: true
    });
  });

  it('should normalize case and remove spaces', () => {
    const result = parseTokenFilter('  eurmtl : gbXGqjWVlwoyhfLvtkwv5FGWKXV7zGYYgycnb3dhmmjr7wl3h6hfgnT  ');
    expect(result.norm).toBe('EURMTL:GBXGQJWVLWOYHFLVTKWV5FGWKXV7ZGYYGYCNB3DHMMJR7WL3H6HFGNT');
    expect(result.code).toBe('EURMTL');
    expect(result.hasIssuer).toBe(true);
  });

  it('should handle multiple colons', () => {
    const result = parseTokenFilter('EURMTL:ISSUER:EXTRA');
    expect(result.code).toBe('EURMTL');
    expect(result.issuer).toBe('ISSUER');
    expect(result.norm).toBe('EURMTL:ISSUER:EXTRA');
  });

  it('should handle empty parts', () => {
    const result = parseTokenFilter('EURMTL::');
    expect(result.code).toBe('EURMTL');
    expect(result.issuer).toBe('');
    expect(result.hasIssuer).toBe(false);
  });
});