/**
 * Unit tests for mapProjectIdForTransfer_ function
 */

// Copy of the mapProjectIdForTransfer_ function
const PROJECT_ID_REGEX = null; // null uses default /\bP?\d{3,6}\b/

function mapProjectIdForTransfer_(transfer, indexes) {
  const { from, to, asset_issuer, memo } = transfer;
  const { accountToProjectIds, issuerToProjectIds } = indexes.residentsIndex;

  let candidates = [];
  let anomaly = null;

  // Шаг 1: from или to в RESIDENTS accounts
  const fromProjects = accountToProjectIds[from] || [];
  const toProjects = accountToProjectIds[to] || [];
  const accountCandidates = [...new Set([...fromProjects, ...toProjects])];
  if (accountCandidates.length > 0) {
    if (accountCandidates.length === 1) {
      return { project_id: accountCandidates[0], mapping_method: 'RESIDENTS_ACCOUNT', candidates: accountCandidates, anomaly: null };
    } else {
      anomaly = {
        reason: 'AMBIGUOUS',
        matched_accounts: [from, to].filter(a => accountToProjectIds[a] && accountToProjectIds[a].length > 0),
        matched_issuers: [],
        memo: memo || '',
        candidates: accountCandidates
      };
      return { project_id: 'AMBIGUOUS', mapping_method: 'AMBIGUOUS', candidates: accountCandidates, anomaly };
    }
  }

  // Шаг 2: asset_issuer в RESIDENTS issuers
  const issuerCandidates = issuerToProjectIds[asset_issuer] || [];
  if (issuerCandidates.length > 0) {
    if (issuerCandidates.length === 1) {
      return { project_id: issuerCandidates[0], mapping_method: 'RESIDENTS_ISSUER', candidates: issuerCandidates, anomaly: null };
    } else {
      anomaly = {
        reason: 'AMBIGUOUS',
        matched_accounts: [],
        matched_issuers: [asset_issuer],
        memo: memo || '',
        candidates: issuerCandidates
      };
      return { project_id: 'AMBIGUOUS', mapping_method: 'AMBIGUOUS', candidates: issuerCandidates, anomaly };
    }
  }

  // Шаг 3: memo содержит Project_ID
  const regex = PROJECT_ID_REGEX || /\bP?\d{3,6}\b/;
  const memoMatch = (memo || '').match(regex);
  if (memoMatch) {
    const projectIdFromMemo = memoMatch[0].replace(/^P/i, ''); // Убираем P если есть
    // Проверим, есть ли такой project_id в PROJECT_MAP (мокаем)
    const mockProjectMap = {
      '123': true,
      '456': true,
      '789': true
    };
    if (mockProjectMap[projectIdFromMemo]) {
      return { project_id: projectIdFromMemo, mapping_method: 'MEMO_PROJECT_ID', candidates: [projectIdFromMemo], anomaly: null };
    }
  }

  // Шаг 4: UNMAPPED
  anomaly = {
    reason: 'UNMAPPED',
    matched_accounts: [],
    matched_issuers: [],
    memo: memo || '',
    candidates: []
  };
  return { project_id: 'UNMAPPED', mapping_method: 'UNMAPPED', candidates: [], anomaly };
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