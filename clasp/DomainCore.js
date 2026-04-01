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

  const api = {
    normalizeAssetKey,
    parseTokenFilter,
    classifyTransfer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.__domainCore = Object.assign(global.__domainCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);

