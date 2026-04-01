const { resolveResidentsColumnIndexes } = require('../clasp/DomainCore');

describe('resolveResidentsColumnIndexes', () => {
  it('uses defaults when headers are missing', () => {
    const defaults = { labelIdx: 1, accountsIdx: 16, issuersIdx: 17 };
    expect(resolveResidentsColumnIndexes(null, defaults)).toEqual(defaults);
  });

  it('resolves indices from canonical headers', () => {
    const headers = ['id', 'label', 'foo', 'account_s', 'asset_issuer'];
    const result = resolveResidentsColumnIndexes(headers, { labelIdx: 1, accountsIdx: 16, issuersIdx: 17 });
    expect(result).toEqual({ labelIdx: 1, accountsIdx: 3, issuersIdx: 4 });
  });

  it('normalizes header spacing/case', () => {
    const headers = ['Label', 'Account S', 'Asset Issuer'];
    const result = resolveResidentsColumnIndexes(headers, { labelIdx: 1, accountsIdx: 16, issuersIdx: 17 });
    expect(result).toEqual({ labelIdx: 0, accountsIdx: 1, issuersIdx: 2 });
  });
});
