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

  function normalizeTokenPart(value) {
    return String(value || '').trim().toUpperCase();
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

  function parseTxHashFromCell(txCellValue) {
    const txCell = String(txCellValue || '');
    const txHashMatch = txCell.match(/transactions\/(\w+)/) || txCell.match(/"([A-Z0-9]+)"\s*\)?$/i);
    let txHash = txHashMatch ? txHashMatch[1] : '';
    if (!txHash && /^[A-Z0-9]{10,}$/i.test(txCell)) {
      txHash = txCell;
    }
    return txHash;
  }

  function parseStellarAddressList(value) {
    return String(value || '')
      .split(/[,;]/)
      .map(function (item) { return String(item || '').trim(); })
      .filter(function (item) { return item.startsWith('G'); });
  }

  function addressListContains(value, targetAddress) {
    const target = String(targetAddress || '').trim();
    if (!target) return false;
    return parseStellarAddressList(value).includes(target);
  }

  function normalizeHeaderKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function resolveResidentsColumnIndexes(headers, defaults) {
    const fallback = defaults || { labelIdx: 1, accountsIdx: 16, issuersIdx: 17 };
    const rawHeaders = Array.isArray(headers) ? headers : [];
    if (!rawHeaders.length) {
      return fallback;
    }

    const normalized = rawHeaders.map(normalizeHeaderKey);
    const findIdx = function (key, fallbackIdx) {
      const idx = normalized.indexOf(key);
      return idx >= 0 ? idx : fallbackIdx;
    };

    return {
      labelIdx: findIdx('label', fallback.labelIdx),
      accountsIdx: findIdx('account_s', fallback.accountsIdx),
      issuersIdx: findIdx('asset_issuer', fallback.issuersIdx)
    };
  }

  function isFundAddress(addr, fundAccounts) {
    return Object.values(fundAccounts || {}).includes(String(addr || '').trim());
  }

  function isResidentAddress(addr, residentsMap) {
    return String(addr || '').trim() in (residentsMap || {});
  }

  function evaluateCounterpartyScope(counterpartyScope, flags, options) {
    const f = flags || {};
    const fromIsFund = Boolean(f.fromIsFund);
    const toIsFund = Boolean(f.toIsFund);
    const fromIsRes = Boolean(f.fromIsRes);
    const toIsRes = Boolean(f.toIsRes);
    const relaxRoleFilter = Boolean(options && options.relaxRoleFilter);

    if (counterpartyScope === 'FUND_RESIDENT_ONLY') {
      const strictMatch = (fromIsRes && toIsFund) || (fromIsFund && toIsRes);
      return strictMatch || (relaxRoleFilter && (fromIsFund || toIsFund));
    }
    if (counterpartyScope === 'FUND_FUND') {
      return fromIsFund && toIsFund;
    }
    if (counterpartyScope === 'RESIDENT_RESIDENT') {
      return fromIsRes && toIsRes;
    }
    if (counterpartyScope === 'ALL_RELEVANT') {
      return fromIsFund || toIsFund || fromIsRes || toIsRes;
    }
    return (fromIsRes && toIsFund) || (fromIsFund && toIsRes);
  }

  function toDate_(value) {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function buildResidentTrackingDataset(transfers, options) {
    const rows = [];
    const list = Array.isArray(transfers) ? transfers : [];
    const opts = options || {};
    const residentsMap = opts.residentsMap || {};
    const fundAccounts = opts.fundAccounts || {};

    for (let i = 0; i < list.length; i++) {
      const t = list[i] || {};
      const from = String(t.from || '').trim();
      const to = String(t.to || '').trim();
      const direction = String(t.direction || '').trim().toUpperCase();
      const counterpartyType = String(t.counterparty_type || '').trim().toUpperCase();
      const datetime = toDate_(t.datetime);

      if (!datetime) continue;

      const fromResidentLabel = residentsMap[from] || '';
      const toResidentLabel = residentsMap[to] || '';

      let residentAddress = '';
      let residentLabel = '';

      if (fromResidentLabel && toResidentLabel) {
        residentAddress = direction === 'OUT' ? to : from;
        residentLabel = direction === 'OUT' ? toResidentLabel : fromResidentLabel;
      } else if (fromResidentLabel) {
        residentAddress = from;
        residentLabel = fromResidentLabel;
      } else if (toResidentLabel) {
        residentAddress = to;
        residentLabel = toResidentLabel;
      } else if (counterpartyType === 'RESIDENT') {
        residentAddress = direction === 'IN' ? from : to;
        residentLabel = '';
      } else {
        continue;
      }

      const fromIsFund = isFundAddress(from, fundAccounts);
      const toIsFund = isFundAddress(to, fundAccounts);
      let fundAddress = '';
      if (fromIsFund && !toIsFund) fundAddress = from;
      else if (toIsFund && !fromIsFund) fundAddress = to;
      else if (direction === 'IN') fundAddress = to;
      else if (direction === 'OUT') fundAddress = from;

      rows.push({
        datetime,
        project_id: String(t.project_id || '').trim(),
        resident_address: residentAddress,
        resident_label: residentLabel,
        fund_address: fundAddress,
        fund_account_key: String(t.fund_account_key || '').trim(),
        direction,
        counterparty_type: counterpartyType,
        from,
        to,
        asset_code: String(t.asset_code || t.asset || '').trim(),
        asset_issuer: String(t.asset_issuer || '').trim(),
        amount: Number(t.amount || 0),
        class: String(t.class || '').trim(),
        memo: String(t.memo || '').trim(),
        tx_hash: parseTxHashFromCell(t.tx_hash || ''),
        is_first_contact: false
      });
    }

    rows.sort(function (a, b) {
      return a.datetime.getTime() - b.datetime.getTime();
    });

    const firstSeen = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const firstKey = `${row.project_id}|${row.resident_address}`;
      if (!firstSeen[firstKey]) {
        row.is_first_contact = true;
        firstSeen[firstKey] = true;
      }
    }

    return rows;
  }

  function buildResidentTimelineReadModel(trackingRows, options) {
    const list = Array.isArray(trackingRows) ? trackingRows : [];
    const opts = options || {};
    const out = [];

    for (let i = 0; i < list.length; i++) {
      const row = list[i] || {};
      const datetime = toDate_(row.datetime);
      if (!datetime) continue;

      const projectId = String(row.project_id || '').trim();
      const residentAddress = String(row.resident_address || '').trim();
      if (!projectId || !residentAddress) continue;

      out.push({
        datetime,
        project_id: projectId,
        resident_label: String(row.resident_label || '').trim(),
        resident_address: residentAddress,
        fund_account_key: String(row.fund_account_key || '').trim(),
        fund_address: String(row.fund_address || '').trim(),
        direction: String(row.direction || '').trim().toUpperCase(),
        counterparty_type: String(row.counterparty_type || '').trim().toUpperCase(),
        from: String(row.from || '').trim(),
        to: String(row.to || '').trim(),
        asset_code: String(row.asset_code || '').trim(),
        asset_issuer: String(row.asset_issuer || '').trim(),
        amount: Number(row.amount || 0),
        class: String(row.class || '').trim(),
        memo: String(row.memo || '').trim(),
        tx_hash: String(row.tx_hash || '').trim(),
        source_is_first_contact: Boolean(row.is_first_contact),
        interaction_key: `${projectId}|${residentAddress}`,
        is_entry_point: false,
        entry_point_at: null,
        event_index: 0,
        days_since_entry_point: 0
      });
    }

    out.sort(function (a, b) {
      return a.datetime.getTime() - b.datetime.getTime();
    });

    const pairState = {};
    for (let i = 0; i < out.length; i++) {
      const row = out[i];
      const key = row.interaction_key;
      if (!pairState[key]) {
        pairState[key] = {
          firstAt: row.datetime,
          index: 0
        };
      }
      pairState[key].index += 1;

      const firstAt = pairState[key].firstAt;
      const dayMs = 24 * 60 * 60 * 1000;
      const firstDay = Date.UTC(firstAt.getUTCFullYear(), firstAt.getUTCMonth(), firstAt.getUTCDate());
      const currentDay = Date.UTC(row.datetime.getUTCFullYear(), row.datetime.getUTCMonth(), row.datetime.getUTCDate());

      row.entry_point_at = firstAt;
      row.event_index = pairState[key].index;
      row.is_entry_point = pairState[key].index === 1;
      row.days_since_entry_point = Math.max(0, Math.floor((currentDay - firstDay) / dayMs));
    }

    const maxRows = Number(opts.maxRows || 0);
    if (maxRows > 0 && out.length > maxRows) {
      return out.slice(0, maxRows);
    }

    return out;
  }

  const api = {
    normalizeAssetKey,
    normalizeTokenPart,
    parseTokenFilter,
    classifyTransfer,
    mapProjectIdForTransfer,
    parseTxHashFromCell,
    parseStellarAddressList,
    addressListContains,
    resolveResidentsColumnIndexes,
    isFundAddress,
    isResidentAddress,
    evaluateCounterpartyScope,
    buildResidentTrackingDataset,
    buildResidentTimelineReadModel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.__domainCore = Object.assign(global.__domainCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
