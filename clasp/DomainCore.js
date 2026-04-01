/**
 * DomainCore: pure domain functions shared between GAS runtime and Jest tests.
 * No SpreadsheetApp / UrlFetchApp dependencies.
 */
(function (global) {
  'use strict';

  function normalizeAssetKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/[\s/|]/g, ':').toUpperCase();
    const parts = normalized.split(':').filter(Boolean);
    const code = parts[0] || '';
    const issuer = parts[1] || '';
    return `${code}:${issuer}`;
  }

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

  function classifyTransfer(transfer, rules, classifyEnable) {
    const { direction, counterpartyType, memo, class_override } = transfer;

    // Приоритет: class_override всегда имеет приоритет
    if (class_override && class_override.trim()) {
      return { class: class_override.trim(), class_reason: 'OVERRIDE' };
    }

    if (!classifyEnable) {
      return { class: '', class_reason: 'DISABLED' };
    }

    const memoLower = (memo || '').toLowerCase();

    if (direction === 'OUT') {
      // OUT из fund_account → чаще Funding (если контрагент = RESIDENT)
      if (counterpartyType === 'RESIDENT') {
        return { class: 'Funding', class_reason: 'OUT_TO_RESIDENT' };
      }
      return { class: 'Funding', class_reason: 'OUT_DEFAULT' };
    }

    if (direction === 'IN') {
      // IN в fund_account от RESIDENT → Dividend или Repayment
      if (counterpartyType === 'RESIDENT') {
        // Repayment отличать через memo-паттерны (repay/return/погаш/возврат и т.п.)
        const repayPatterns = (rules.MEMO_PATTERNS_REPAY || '').split('|').filter(Boolean);
        if (repayPatterns.some(p => memoLower.includes(p.toLowerCase()))) {
          return { class: 'Repayment', class_reason: 'IN_FROM_RESIDENT_REPAY_MEMO' };
        }
        // Dividend отличать через memo-паттерны
        const dividendPatterns = (rules.MEMO_PATTERNS_DIVIDEND || '').split('|').filter(Boolean);
        if (dividendPatterns.some(p => memoLower.includes(p.toLowerCase()))) {
          return { class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DIVIDEND_MEMO' };
        }
        // По умолчанию Dividend для входящих от резидентов
        return { class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DEFAULT' };
      }
      return { class: 'Dividend', class_reason: 'IN_DEFAULT' };
    }

    return { class: '', class_reason: 'UNKNOWN_DIRECTION' };
  }

  function mapProjectIdForTransfer(transfer, indexes, options) {
    const { from, to, asset_issuer, memo } = transfer || {};
    const residentsIndex = (indexes && indexes.residentsIndex) || {};
    const accountToProjectIds = residentsIndex.accountToProjectIds || {};
    const issuerToProjectIds = residentsIndex.issuerToProjectIds || {};
    const opts = options || {};

    let anomaly = null;

    // Шаг 1: from или to в RESIDENTS accounts
    const fromProjects = accountToProjectIds[from] || [];
    const toProjects = accountToProjectIds[to] || [];
    const accountCandidates = [...new Set([...fromProjects, ...toProjects])];
    if (accountCandidates.length > 0) {
      if (accountCandidates.length === 1) {
        return { project_id: accountCandidates[0], mapping_method: 'RESIDENTS_ACCOUNT', candidates: accountCandidates, anomaly: null };
      }
      anomaly = {
        reason: 'AMBIGUOUS',
        matched_accounts: [from, to].filter(a => accountToProjectIds[a] && accountToProjectIds[a].length > 0),
        matched_issuers: [],
        memo: memo || '',
        candidates: accountCandidates
      };
      return { project_id: 'AMBIGUOUS', mapping_method: 'AMBIGUOUS', candidates: accountCandidates, anomaly };
    }

    // Шаг 2: asset_issuer в RESIDENTS issuers
    const issuerCandidates = issuerToProjectIds[asset_issuer] || [];
    if (issuerCandidates.length > 0) {
      if (issuerCandidates.length === 1) {
        return { project_id: issuerCandidates[0], mapping_method: 'RESIDENTS_ISSUER', candidates: issuerCandidates, anomaly: null };
      }
      anomaly = {
        reason: 'AMBIGUOUS',
        matched_accounts: [],
        matched_issuers: [asset_issuer],
        memo: memo || '',
        candidates: issuerCandidates
      };
      return { project_id: 'AMBIGUOUS', mapping_method: 'AMBIGUOUS', candidates: issuerCandidates, anomaly };
    }

    // Шаг 3: memo содержит Project_ID
    const regex = opts.projectIdRegex || /\bP?\d{3,6}\b/;
    const memoMatch = String(memo || '').match(regex);
    if (memoMatch) {
      const projectIdFromMemo = memoMatch[0].replace(/^P/i, ''); // Убираем P если есть
      const isKnownProjectId = typeof opts.isProjectIdKnown === 'function'
        ? opts.isProjectIdKnown
        : function () { return true; };
      if (isKnownProjectId(projectIdFromMemo)) {
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

  const api = {
    normalizeAssetKey,
    parseTokenFilter,
    classifyTransfer,
    mapProjectIdForTransfer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.__domainCore = Object.assign(global.__domainCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
