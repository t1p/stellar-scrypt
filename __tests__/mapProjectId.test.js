/**
 * Unit tests for mapProjectIdForTransfer_ function
 */

const { mapProjectIdForTransfer } = require('../clasp/DomainCore');

const PROJECT_ID_REGEX = /\bP?\d{3,6}\b/;
const mockProjectMap = {
  '123': true,
  '456': true,
  '789': true
};

function mapProjectIdForTransfer_(transfer, indexes) {
  return mapProjectIdForTransfer(transfer, indexes, {
    projectIdRegex: PROJECT_ID_REGEX,
    isProjectIdKnown: (projectId) => Boolean(mockProjectMap[projectId])
  });
}

describe('mapProjectIdForTransfer_', () => {
  const mockIndexes = {
    residentsIndex: {
      accountToProjectIds: {
        'GACCOUNT1': ['P123'],
        'GACCOUNT2': ['P456'],
        'GACCOUNT_AMBIGUOUS': ['P123', 'P456']
      },
      issuerToProjectIds: {
        'GISSUER1': ['P789'],
        'GISSUER_AMBIGUOUS': ['P123', 'P789']
      }
    }
  };

  // Shape must match buildProjectMapIndex_() in clasp/Резиденты Мабиз.js.
  const projectMapIndex = {
    tokenToProjectIds: { TOC: ['M45171'], TIC: ['M13118'] },
    assetCodeToProjectIds: { TOC: ['M45171'], TIC: ['M13118'] },
    projectById: {
      M45171: { token_symbol: 'TOC' },
      M13118: { token_symbol: 'TIC' }
    }
  };
  const mabizIndexes = {
    residentsIndex: {
      accountToProjectIds: { SHARED_ACCOUNT: ['M45171', 'M13118'] },
      issuerToProjectIds: { SHARED_ISSUER: ['M45171', 'M13118'] }
    },
    projectMapIndex
  };

  describe('Account-based mapping', () => {
    it('should map single project from from account', () => {
      const transfer = { from: 'GACCOUNT1', to: 'GOTHER', asset_issuer: 'GISSUER', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result).toEqual({
        project_id: 'P123',
        mapping_method: 'RESIDENTS_ACCOUNT',
        candidates: ['P123'],
        anomaly: null
      });
    });

    it('should map single project from to account', () => {
      const transfer = { from: 'GOTHER', to: 'GACCOUNT2', asset_issuer: 'GISSUER', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result).toEqual({
        project_id: 'P456',
        mapping_method: 'RESIDENTS_ACCOUNT',
        candidates: ['P456'],
        anomaly: null
      });
    });

    it('should return AMBIGUOUS for multiple candidates from accounts', () => {
      const transfer = { from: 'GACCOUNT_AMBIGUOUS', to: 'GACCOUNT2', asset_issuer: 'GISSUER', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.project_id).toBe('AMBIGUOUS');
      expect(result.mapping_method).toBe('AMBIGUOUS');
      expect(result.anomaly.reason).toBe('AMBIGUOUS');
      expect(result.anomaly.matched_accounts).toContain('GACCOUNT_AMBIGUOUS');
    });
  });

  describe('Issuer-based mapping', () => {
    it('should map single project from issuer', () => {
      const transfer = { from: 'GOTHER', to: 'GOTHER2', asset_issuer: 'GISSUER1', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result).toEqual({
        project_id: 'P789',
        mapping_method: 'RESIDENTS_ISSUER',
        candidates: ['P789'],
        anomaly: null
      });
    });

    it('should return AMBIGUOUS for multiple candidates from issuer', () => {
      const transfer = { from: 'GOTHER', to: 'GOTHER2', asset_issuer: 'GISSUER_AMBIGUOUS', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.project_id).toBe('AMBIGUOUS');
      expect(result.mapping_method).toBe('AMBIGUOUS');
      expect(result.anomaly.reason).toBe('AMBIGUOUS');
      expect(result.anomaly.matched_issuers).toContain('GISSUER_AMBIGUOUS');
    });
  });

  describe('Memo-based mapping', () => {
    it('should map project from memo with P prefix', () => {
      const transfer = { from: 'GOTHER', to: 'GOTHER2', asset_issuer: 'GISSUER', memo: 'Payment for P123 project' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result).toEqual({
        project_id: '123',
        mapping_method: 'MEMO_PROJECT_ID',
        candidates: ['123'],
        anomaly: null
      });
    });

    it('should map project from memo without P prefix', () => {
      const transfer = { from: 'GOTHER', to: 'GOTHER2', asset_issuer: 'GISSUER', memo: 'Payment for 456 project' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result).toEqual({
        project_id: '456',
        mapping_method: 'MEMO_PROJECT_ID',
        candidates: ['456'],
        anomaly: null
      });
    });

    it('should ignore memo project not in PROJECT_MAP', () => {
      const transfer = { from: 'GOTHER', to: 'GOTHER2', asset_issuer: 'GISSUER', memo: 'Payment for P999 project' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.project_id).toBe('UNMAPPED');
    });
  });

  describe('Unmapped cases', () => {
    it('should return UNMAPPED when no matches found', () => {
      const transfer = { from: 'GUNKNOWN', to: 'GUNKNOWN2', asset_issuer: 'GUNKNOWN_ISSUER', memo: 'No project info' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.project_id).toBe('UNMAPPED');
      expect(result.mapping_method).toBe('UNMAPPED');
      expect(result.anomaly.reason).toBe('UNMAPPED');
    });

    it('should handle null/undefined memo', () => {
      const transfer = { from: 'GUNKNOWN', to: 'GUNKNOWN2', asset_issuer: 'GUNKNOWN_ISSUER', memo: null };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.project_id).toBe('UNMAPPED');
      expect(result.anomaly.memo).toBe('');
    });
  });

  describe('MABIZ deterministic narrowing', () => {
    it('maps TOC divs to M45171 from a shared account/issuer', () => {
      const result = mapProjectIdForTransfer({
        from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'TOC divs'
      }, mabizIndexes);
      expect(result).toEqual({ project_id: 'M45171', mapping_method: 'MEMO_TOKEN', candidates: ['M45171'], anomaly: null });
    });

    it('does not resolve a TIC-like memo to TOC', () => {
      const result = mapProjectIdForTransfer({
        from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TIC', memo: 'TIC dividends'
      }, mabizIndexes);
      expect(result.project_id).toBe('M13118');
      expect(result.mapping_method).toBe('MEMO_TOKEN');
    });

    it('keeps an ambiguous historical transfer unresolved without a deterministic signal', () => {
      const result = mapProjectIdForTransfer({
        from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'OTHER', memo: 'historical transfer'
      }, mabizIndexes);
      expect(result.project_id).toBe('AMBIGUOUS');
      expect(result.anomaly.reason).toBe('AMBIGUOUS');
    });

    it('resolves a previously unmapped project ID with a word-boundary match', () => {
      const result = mapProjectIdForTransfer({
        from: 'UNKNOWN', to: 'OTHER', asset_issuer: 'UNKNOWN', asset_code: '', memo: 'settlement M45171'
      }, mabizIndexes);
      expect(result.project_id).toBe('M45171');
      expect(result.mapping_method).toBe('MEMO_PROJECT_ID');
    });

    it('does not treat a partial token as a match', () => {
      const result = mapProjectIdForTransfer({
        from: 'UNKNOWN', to: 'OTHER', asset_issuer: 'UNKNOWN', asset_code: '', memo: 'TOCXYZ divs'
      }, mabizIndexes);
      expect(result.project_id).toBe('UNMAPPED');
    });

    it('keeps conflicting deterministic signals ambiguous', () => {
      const result = mapProjectIdForTransfer({
        from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'TIC dividends'
      }, mabizIndexes);
      expect(result.project_id).toBe('AMBIGUOUS');
    });

    it('uses asset_code alone when it is the only deterministic signal', () => {
      const result = mapProjectIdForTransfer({
        from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'divs'
      }, mabizIndexes);
      expect(result).toEqual({ project_id: 'M45171', mapping_method: 'ASSET_CODE', candidates: ['M45171'], anomaly: null });
    });

    it('supports an explicit project memo pattern without partial matching', () => {
      const indexes = {
        residentsIndex: { accountToProjectIds: {}, issuerToProjectIds: {} },
        projectMapIndex: { projectMemoPatterns: { M45171: ['TOC coupon'] } }
      };
      expect(mapProjectIdForTransfer({ memo: 'TOC coupon paid' }, indexes)).toEqual({
        project_id: 'M45171', mapping_method: 'PROJECT_MEMO_PATTERN', candidates: ['M45171'], anomaly: null
      });
      expect(mapProjectIdForTransfer({ memo: 'TOC coupons' }, indexes).project_id).toBe('UNMAPPED');
    });
  });

  describe('Priority order', () => {
    it('should prioritize accounts over issuer', () => {
      const transfer = { from: 'GACCOUNT1', to: 'GOTHER', asset_issuer: 'GISSUER1', memo: '' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.mapping_method).toBe('RESIDENTS_ACCOUNT');
    });

    it('should prioritize accounts over memo', () => {
      const transfer = { from: 'GACCOUNT1', to: 'GOTHER', asset_issuer: 'GISSUER', memo: 'Payment for P456' };
      const result = mapProjectIdForTransfer_(transfer, mockIndexes);
      expect(result.mapping_method).toBe('RESIDENTS_ACCOUNT');
    });
  });
});
