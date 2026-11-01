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
    const { from, to, asset_issuer, asset_code, memo } = transfer || {};
    const residentsIndex = (indexes && indexes.residentsIndex) || {};
    const projectMapIndex = (indexes && indexes.projectMapIndex) || {};
    const accountToProjectIds = residentsIndex.accountToProjectIds || {};
    const issuerToProjectIds = residentsIndex.issuerToProjectIds || {};
    const opts = options || {};

    const unique = values => [...new Set((values || []).filter(Boolean).map(String))];
    const lookup = (map, key) => {
      if (!map || !key) return [];
      const value = map[key] || map[String(key).toUpperCase()] || map[String(key).toLowerCase()];
      return Array.isArray(value) ? value : [];
    };
    const projectIdsByToken = projectMapIndex.tokenToProjectIds || opts.tokenToProjectIds || {};
    const projectIdsByAssetCode = projectMapIndex.assetCodeToProjectIds || opts.assetCodeToProjectIds || projectIdsByToken;
    const projectById = projectMapIndex.projectById || opts.projectById || {};
    const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasToken = (text, token) => {
      const normalizedText = String(text || '').normalize('NFKC');
      const normalizedToken = String(token || '').normalize('NFKC').trim();
      if (!normalizedText || !normalizedToken) return false;
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedToken)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(normalizedText);
    };
    const memoTokenCandidates = text => {
      const matches = [];
      Object.keys(projectIdsByToken).forEach(token => { if (hasToken(text, token)) matches.push(...lookup(projectIdsByToken, token)); });
      Object.keys(projectById).forEach(projectId => {
        const mapping = projectById[projectId] || {};
        if (mapping.token_symbol && hasToken(text, mapping.token_symbol)) matches.push(projectId);
      });
      return unique(matches);
    };
    const memoProjectCandidates = text => {
      const known = [];
      Object.keys(projectById).forEach(projectId => { if (hasToken(text, projectId)) known.push(projectId); });
      const regex = opts.projectIdRegex || /(?:^|[^\p{L}\p{N}])([PMМ]?\d{3,6})(?=$|[^\p{L}\p{N}])/giu;
      const source = String(text || '');
      const matches = regex.global ? (() => {
        const all = []; let current;
        while ((current = regex.exec(source))) { all.push(current); if (current[0] === '') regex.lastIndex++; }
        return all;
      })() : (source.match(regex) ? [source.match(regex)] : []);
      for (const match of matches) {
        const projectId = (match[1] || match[0]).trim().replace(/^P/i, '');
        const isKnown = typeof opts.isProjectIdKnown === 'function' ? opts.isProjectIdKnown(projectId) : Boolean(projectById[projectId]);
        if (isKnown) known.push(projectId);
      }
      return unique(known);
    };
    const configuredMemoCandidates = text => {
      const patterns = opts.projectMemoPatterns || projectMapIndex.projectMemoPatterns || {};
      const matches = [];
      Object.keys(patterns).forEach(projectId => {
        const projectPatterns = Array.isArray(patterns[projectId]) ? patterns[projectId] : [patterns[projectId]];
        if (projectPatterns.some(pattern => pattern instanceof RegExp ? pattern.test(String(text || '')) : hasToken(text, pattern))) matches.push(projectId);
      });
      return unique(matches);
    };
    const narrowingEvidence = () => [
      { ids: memoProjectCandidates(memo), method: 'MEMO_PROJECT_ID' },
      { ids: memoTokenCandidates(memo), method: 'MEMO_TOKEN' },
      { ids: lookup(projectIdsByAssetCode, String(asset_code || '').trim().toUpperCase()), method: 'ASSET_CODE' },
      { ids: configuredMemoCandidates(memo), method: 'PROJECT_MEMO_PATTERN' }
    ];
    const narrow = (candidates, ids) => {
      const narrowed = unique(ids).filter(projectId => candidates.includes(projectId));
      return narrowed.length === 1 ? narrowed[0] : null;
    };
    const resolved = (projectId, method) => ({ project_id: projectId, mapping_method: method, candidates: [projectId], anomaly: null });
    const resolveAmbiguous = candidates => {
      const evidence = narrowingEvidence().filter(item => item.ids.length > 0);
      let narrowed = unique(candidates);
      let method = null;
      for (const item of evidence) {
        const overlap = narrowed.filter(projectId => item.ids.includes(projectId));
        if (!overlap.length) return null;
        narrowed = overlap;
        if (!method) method = item.method;
      }
      return narrowed.length === 1 ? resolved(narrowed[0], method) : null;
    };

    let anomaly = null;

    // Шаг 1: from или to в RESIDENTS accounts
    const fromProjects = accountToProjectIds[from] || [];
    const toProjects = accountToProjectIds[to] || [];
    const accountCandidates = [...new Set([...fromProjects, ...toProjects])];
    if (accountCandidates.length > 0) {
      if (accountCandidates.length === 1) {
        return { project_id: accountCandidates[0], mapping_method: 'RESIDENTS_ACCOUNT', candidates: accountCandidates, anomaly: null };
      }
      const narrowed = resolveAmbiguous(accountCandidates);
      if (narrowed) return narrowed;
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
      const narrowed = resolveAmbiguous(issuerCandidates);
      if (narrowed) return narrowed;
      anomaly = {
        reason: 'AMBIGUOUS',
        matched_accounts: [],
        matched_issuers: [asset_issuer],
        memo: memo || '',
        candidates: issuerCandidates
      };
      return { project_id: 'AMBIGUOUS', mapping_method: 'AMBIGUOUS', candidates: issuerCandidates, anomaly };
    }

    // Шаг 3: для UNMAPPED используем только однозначное пересечение memo/asset/config сигналов.
    const unmappedEvidence = narrowingEvidence().filter(item => item.ids.length > 0);
    let unmappedIds = null;
    let unmappedMethod = null;
    for (const item of unmappedEvidence) {
      unmappedIds = unmappedIds === null
        ? unique(item.ids)
        : unmappedIds.filter(projectId => item.ids.includes(projectId));
      if (!unmappedMethod) unmappedMethod = item.method;
      if (!unmappedIds.length) break;
    }
    if (unmappedIds && unmappedIds.length === 1) return resolved(unmappedIds[0], unmappedMethod);

    // Шаг 5: UNMAPPED
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

  function normalizeTransferEventDedupeKey(txHash, opId) {
    const tx = String(txHash || '').trim().toLowerCase();
    const op = String(opId || '').trim().toLowerCase();
    if (!tx || !op) return '';
    return `${tx}:${op}`;
  }

  function buildMaymunEventId(event) {
    const row = event || {};
    const sourceType = String(row.source_type || '').trim().toLowerCase();
    if (sourceType === 'transfer') {
      const dedupeKey = normalizeTransferEventDedupeKey(row.tx_hash, row.op_id);
      if (dedupeKey) return `evt_${dedupeKey.replace(':', '_')}`;
    }
    const seed = String(row.transfer_key || row.source_ref || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `evt_${seed || 'manual'}`;
  }

  function normalizeConfirmedAmount(allocationStatus, confirmedAmount) {
    const status = String(allocationStatus || '').trim().toLowerCase();
    const value = Number(confirmedAmount || 0);
    if (status !== 'confirmed') return 0;
    return value;
  }

  function hasUnconfirmedLiquidityMarkers(value) {
    const text = String(value || '').toLowerCase();
    return /pending|unconfirmed|ambiguous/.test(text);
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

  function buildTokenFlowSnapshot(trackingRows, options) {
    const list = Array.isArray(trackingRows) ? trackingRows : [];
    const opts = options || {};
    const maxInputRows = Number(opts.maxInputRows || 0);
    const limit = maxInputRows > 0 ? Math.min(maxInputRows, list.length) : list.length;
    const acc = {};

    for (let i = 0; i < limit; i++) {
      const row = list[i] || {};
      const datetime = toDate_(row.datetime);
      if (!datetime) continue;

      const projectId = String(row.project_id || '').trim();
      const residentAddress = String(row.resident_address || '').trim();
      const from = String(row.from || '').trim();
      const to = String(row.to || '').trim();
      const direction = String(row.direction || '').trim().toUpperCase();
      const assetCode = String(row.asset_code || '').trim().toUpperCase();
      const assetIssuer = String(row.asset_issuer || '').trim();
      const txHash = String(row.tx_hash || '').trim();
      const amount = Number(row.amount || 0);

      if (!projectId || !residentAddress || !from || !to || !assetCode) continue;

      const key = [projectId, residentAddress, assetCode, assetIssuer, direction, from, to].join('|');
      if (!acc[key]) {
        acc[key] = {
          project_id: projectId,
          resident_label: String(row.resident_label || '').trim(),
          resident_address: residentAddress,
          asset_code: assetCode,
          asset_issuer: assetIssuer,
          direction,
          from,
          to,
          tx_count: 0,
          total_amount: 0,
          first_seen_at: datetime,
          last_seen_at: datetime,
          _hashes: {}
        };
      }

      const item = acc[key];
      if (datetime.getTime() < item.first_seen_at.getTime()) item.first_seen_at = datetime;
      if (datetime.getTime() > item.last_seen_at.getTime()) item.last_seen_at = datetime;

      if (txHash) {
        if (!item._hashes[txHash]) {
          item._hashes[txHash] = true;
          item.tx_count += 1;
        }
      } else {
        item.tx_count += 1;
      }
      item.total_amount += amount;
    }

    const out = Object.keys(acc).map(function (key) {
      const row = acc[key];
      return {
        project_id: row.project_id,
        resident_label: row.resident_label,
        resident_address: row.resident_address,
        asset_code: row.asset_code,
        asset_issuer: row.asset_issuer,
        direction: row.direction,
        from: row.from,
        to: row.to,
        tx_count: row.tx_count,
        total_amount: row.total_amount,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at
      };
    });

    out.sort(function (a, b) {
      if (a.project_id !== b.project_id) return a.project_id < b.project_id ? -1 : 1;
      if (a.resident_address !== b.resident_address) return a.resident_address < b.resident_address ? -1 : 1;
      if (a.asset_code !== b.asset_code) return a.asset_code < b.asset_code ? -1 : 1;
      return a.first_seen_at.getTime() - b.first_seen_at.getTime();
    });

    const maxOutputRows = Number(opts.maxOutputRows || 0);
    if (maxOutputRows > 0 && out.length > maxOutputRows) {
      return out.slice(0, maxOutputRows);
    }
    return out;
  }

  function buildIssuerStructureSnapshot(trackingRows, options) {
    const list = Array.isArray(trackingRows) ? trackingRows : [];
    const opts = options || {};
    const maxInputRows = Number(opts.maxInputRows || 0);
    const limit = maxInputRows > 0 ? Math.min(maxInputRows, list.length) : list.length;
    const acc = {};

    for (let i = 0; i < limit; i++) {
      const row = list[i] || {};
      const datetime = toDate_(row.datetime);
      if (!datetime) continue;

      const projectId = String(row.project_id || '').trim();
      const residentAddress = String(row.resident_address || '').trim();
      const fundAddress = String(row.fund_address || '').trim();
      const from = String(row.from || '').trim();
      const to = String(row.to || '').trim();
      if (!projectId || !residentAddress || !from || !to) continue;

      const direction = String(row.direction || '').trim().toUpperCase();
      const counterpartyType = String(row.counterparty_type || '').trim().toUpperCase();
      const txHash = String(row.tx_hash || '').trim();

      const edgeKey = [projectId, residentAddress, fundAddress, from, to, direction, counterpartyType].join('|');
      if (!acc[edgeKey]) {
        acc[edgeKey] = {
          project_id: projectId,
          resident_label: String(row.resident_label || '').trim(),
          resident_address: residentAddress,
          fund_address: fundAddress,
          from,
          to,
          direction,
          counterparty_type: counterpartyType,
          tx_count: 0,
          first_seen_at: datetime,
          last_seen_at: datetime,
          _hashes: {}
        };
      }

      const item = acc[edgeKey];
      if (datetime.getTime() < item.first_seen_at.getTime()) item.first_seen_at = datetime;
      if (datetime.getTime() > item.last_seen_at.getTime()) item.last_seen_at = datetime;

      if (txHash) {
        if (!item._hashes[txHash]) {
          item._hashes[txHash] = true;
          item.tx_count += 1;
        }
      } else {
        item.tx_count += 1;
      }
    }

    const out = Object.keys(acc).map(function (key) {
      const row = acc[key];
      return {
        project_id: row.project_id,
        resident_label: row.resident_label,
        resident_address: row.resident_address,
        fund_address: row.fund_address,
        from: row.from,
        to: row.to,
        direction: row.direction,
        counterparty_type: row.counterparty_type,
        tx_count: row.tx_count,
        first_seen_at: row.first_seen_at,
        last_seen_at: row.last_seen_at
      };
    });

    out.sort(function (a, b) {
      if (a.project_id !== b.project_id) return a.project_id < b.project_id ? -1 : 1;
      if (a.resident_address !== b.resident_address) return a.resident_address < b.resident_address ? -1 : 1;
      return a.first_seen_at.getTime() - b.first_seen_at.getTime();
    });

    const maxOutputRows = Number(opts.maxOutputRows || 0);
    if (maxOutputRows > 0 && out.length > maxOutputRows) {
      return out.slice(0, maxOutputRows);
    }
    return out;
  }

  function parseTradeAsset(value) {
    if (value && typeof value === 'object') {
      const type = String(value.asset_type || '').trim().toLowerCase();
      if (type === 'native') return { code: 'XLM', issuer: '' };
      return {
        code: String(value.asset_code || '').trim(),
        issuer: String(value.asset_issuer || '').trim()
      };
    }
    const raw = String(value || '').trim();
    if (!raw) return { code: '', issuer: '' };
    const upper = raw.toUpperCase();
    if (upper === 'XLM' || upper === 'NATIVE') return { code: 'XLM', issuer: '' };
    const parts = raw.split(':');
    return { code: String(parts[0] || '').trim(), issuer: String(parts[1] || '').trim() };
  }

  function parseTradeTimestamp(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function mapOfferTrade(record, options) {
    const row = record || {};
    const opts = options || {};
    const fundAccounts = Object.keys(opts.fundAccounts || {})
      .map(function (key) { return String(opts.fundAccounts[key] || '').trim(); })
      .filter(Boolean);
    const base = parseTradeAsset(row.base_asset);
    const quote = parseTradeAsset(row.quote_asset);
    const baseAccount = String(row.base_account || '').trim();
    const quoteAccount = String(row.quote_account || '').trim();
    const baseIsFund = fundAccounts.indexOf(baseAccount) >= 0;
    const quoteIsFund = fundAccounts.indexOf(quoteAccount) >= 0;
    const fundAccount = baseIsFund ? baseAccount : (quoteIsFund ? quoteAccount : '');
    const fundSide = !fundAccount ? '' : (fundAccount === baseAccount ? 'base' : 'quote');
    const counterpartyAccount = fundSide === 'base' ? quoteAccount : (fundSide === 'quote' ? baseAccount : '');
    const tradeId = String(row.trade_id || row.paging_token || '').trim();
    const baseAmount = Number(row.base_amount || 0);
    const quoteAmount = Number(row.quote_amount || 0);

    return {
      trade_id: tradeId,
      paging_token: String(row.paging_token || tradeId).trim(),
      ledger: row.ledger === undefined || row.ledger === null ? '' : String(row.ledger),
      closed_at: parseTradeTimestamp(row.ledger_close_time || row.ledger_close_at || row.closed_at),
      trade_type: String(row.trade_type || '').trim(),
      base_asset: base.code,
      base_asset_issuer: base.issuer,
      base_amount: baseAmount,
      quote_asset: quote.code,
      quote_asset_issuer: quote.issuer,
      quote_amount: quoteAmount,
      base_account: baseAccount,
      quote_account: quoteAccount,
      fund_account: fundAccount,
      fund_side: fundSide,
      counterparty_account: counterpartyAccount,
      direction: fundSide === 'base' ? 'OUT' : (fundSide === 'quote' ? 'IN' : ''),
      in_scope: Boolean(fundAccount),
      price: baseAmount > 0 ? quoteAmount / baseAmount : 0,
      base_offer_id: row.base_offer_id === undefined || row.base_offer_id === null ? '' : String(row.base_offer_id),
      counter_offer_id: row.counter_offer_id === undefined || row.counter_offer_id === null ? '' : String(row.counter_offer_id)
    };
  }

  function offerTradeDedupeKey(row) {
    const trade = row || {};
    const tradeId = String(trade.trade_id || trade.paging_token || '').trim().toLowerCase();
    if (tradeId) return tradeId;
    const parts = [
      trade.ledger, trade.base_account, trade.quote_account,
      trade.base_asset, trade.base_amount, trade.quote_asset, trade.quote_amount,
      trade.base_offer_id, trade.counter_offer_id
    ].map(function (value) {
      return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
    });
    if (!parts.some(Boolean)) return '';
    return 'fallback:' + parts.join('|');
  }

  function reconcileOfferTrades(existingRows, incomingRows, options) {
    const opts = options || {};
    const known = {};
    (Array.isArray(existingRows) ? existingRows : []).forEach(function (row) {
      const key = typeof row === 'string' ? String(row).trim().toLowerCase() : offerTradeDedupeKey(row);
      if (key) known[key] = true;
    });

    const fresh = [];
    const duplicates = [];
    (Array.isArray(incomingRows) ? incomingRows : []).forEach(function (row) {
      const mapped = row && (row.trade_id || row.paging_token) ? row : mapOfferTrade(row, opts);
      const key = offerTradeDedupeKey(mapped);
      if (!key) return;
      if (known[key]) {
        duplicates.push(mapped);
        return;
      }
      known[key] = true;
      fresh.push(Object.assign({}, mapped, { dedupe_key: key }));
    });

    fresh.sort(function (a, b) {
      const ledgerDiff = Number(a.ledger || 0) - Number(b.ledger || 0);
      if (ledgerDiff !== 0) return ledgerDiff;
      return String(a.trade_id || '').localeCompare(String(b.trade_id || ''));
    });

    return {
      fresh: fresh,
      duplicates: duplicates,
      appended: fresh.length,
      skipped: duplicates.length
    };
  }

  const api = {
    parseTradeAsset,
    mapOfferTrade,
    offerTradeDedupeKey,
    reconcileOfferTrades,
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
    normalizeTransferEventDedupeKey,
    buildMaymunEventId,
    normalizeConfirmedAmount,
    hasUnconfirmedLiquidityMarkers,
    buildResidentTrackingDataset,
    buildResidentTimelineReadModel,
    buildTokenFlowSnapshot,
    buildIssuerStructureSnapshot
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.__domainCore = Object.assign(global.__domainCore || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
