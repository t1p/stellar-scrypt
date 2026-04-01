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
