/***********************
 * Stellar → Google Sheets
 * AUDIT MODE
 ***********************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Stellar')
    .addItem('Обновить переводы', 'syncStellarTransfers')
    .addItem('Обновить активы (AUDIT)', 'syncFundAssets')
    .addSeparator()
    .addItem('Обновить всё', 'syncAllStellar')
    .addToUi();
}

function syncAllStellar() {
  syncStellarTransfers();
  syncFundAssets();
}

/* =========================
 * ASSETS — AUDIT MODE
 * ========================= */

function syncFundAssets() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  const accounts = getFundAccounts_(consts);

  const sheet = getOrCreateSheet_(ss, 'ASSETS');
  sheet.clear();
  sheet.appendRow([
    'section',
    'balance_type',
    'asset',
    'issuer_or_id',
    'balance',
    'limit'
  ]);

  const rows = [];

  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account;

    const url = `${horizon}/accounts/${account}`;
    const res = JSON.parse(
      UrlFetchApp.fetch(url, { headers: { Accept: 'application/json' } })
        .getContentText()
    );

    if (!res.balances) continue;

    for (const b of res.balances) {

      // XLM
      if (b.asset_type === 'native') {
        rows.push([
          section,
          'native',
          'XLM',
          'native',
          b.balance,
          ''
        ]);
      }

      // Trustline
      else if (b.asset_type.startsWith('credit_alphanum')) {
        rows.push([
          section,
          'trustline',
          b.asset_code,
          b.asset_issuer,
          b.balance,
          b.limit || ''
        ]);
      }

      // Liquidity Pool (AMM)
      else if (b.asset_type === 'liquidity_pool_shares') {
        rows.push([
          section,
          'liquidity_pool',
          'LP',
          b.liquidity_pool_id,
          b.balance,
          ''
        ]);
      }

      // Всё остальное — не теряем, но помечаем
      else {
        rows.push([
          section,
          b.asset_type,
          '',
          '',
          b.balance || '',
          ''
        ]);
      }
    }
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/* =========================
 * TRANSFERS (без изменений)
 * ========================= */

function syncStellarTransfers() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const residents = loadResidents_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');

  const accounts = getFundAccounts_(consts);
  const residentsSet = new Set(residents.map(r => r.account));
  const allowedAssets = buildAllowedAssetsSet_(residents);

  const sheet = getOrCreateSheet_(ss, 'TRANSFERS');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'section',
      'datetime',
      'from',
      'to',
      'asset',
      'amount',
      'tx_hash'
    ]);
  }

  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account;

    const cursorKey = `cursor_transfers_${section}`;
    const cursor = getCursor_(cursorKey);

    const url = cursor
      ? `${horizon}/accounts/${account}/operations?cursor=${cursor}&order=asc&limit=200`
      : `${horizon}/accounts/${account}/operations?order=asc&limit=200`;

    const res = JSON.parse(
      UrlFetchApp.fetch(url, { headers: { Accept: 'application/json' } })
        .getContentText()
    );

    if (!res._embedded) continue;

    const rows = [];
    let lastPaging = null;

    for (const op of res._embedded.records) {
      lastPaging = op.paging_token || lastPaging;

      if (op.type !== 'payment') continue;

      const asset = assetKeyFromOp_(op);
      if (!allowedAssets.has(asset)) continue;

      rows.push([
        section,
        op.created_at,
        op.from,
        op.to,
        asset,
        op.amount,
        op.transaction_hash
      ]);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
        .setValues(rows);
    }

    if (lastPaging) {
      setCursor_(cursorKey, lastPaging);
    }
  }
}

/* =========================
 * HELPERS
 * ========================= */

function loadConsts_(ss) {
  const sheet = ss.getSheetByName('CONST');
  const values = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < values.length; i++) {
    const k = String(values[i][0] || '').trim();
    const v = String(values[i][1] || '').trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function getFundAccounts_(consts) {
  return Object.entries(consts)
    .filter(([k, v]) => v.startsWith('G'))
    .map(([k, v]) => ({ key: k, account: v }));
}

function loadResidents_(ss) {
  const sheet = ss.getSheetByName('RESIDENTS');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  return values.slice(1)
    .filter(r => r[0])
    .map(r => ({
      account: String(r[0]).trim(),
      asset_code: String(r[2] || '').trim(),
      asset_issuer: String(r[3] || '').trim()
    }));
}

function buildAllowedAssetsSet_(residents) {
  const s = new Set(['XLM']);
  for (const r of residents) {
    if (!r.asset_code) continue;
    if (r.asset_issuer === 'native') {
      s.add('XLM');
    } else {
      s.add(`${r.asset_code}:${r.asset_issuer}`);
    }
  }
  return s;
}

function assetKeyFromOp_(op) {
  return op.asset_type === 'native'
    ? 'XLM'
    : `${op.asset_code}:${op.asset_issuer}`;
}

function mustGet_(obj, key) {
  if (!obj[key]) throw new Error(`В CONST нет ключа ${key}`);
  return obj[key];
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getCursor_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setCursor_(key, v) {
  PropertiesService.getScriptProperties().setProperty(key, v);
}
function syncAssetHistory() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  const accounts = getFundAccounts_(consts);

  const assetsSheet = ss.getSheetByName('ASSETS');
  if (!assetsSheet) throw new Error('Сначала обнови ASSETS');

  const historySheet = getOrCreateSheet_(ss, 'ASSET_HISTORY');
  historySheet.clear();
  historySheet.appendRow([
    'section',
    'asset',
    'issuer',
    'first_received_at',
    'total_received',
    'total_sent',
    'current_balance',
    'trustline_open',
    'last_counterparty',
    'last_tx_hash'
  ]);

  /* -------- текущие балансы -------- */
  const balances = {};
  const assetRows = assetsSheet.getDataRange().getValues().slice(1);

  for (const r of assetRows) {
    const [section, balance_type, asset, issuer, balance] = r;
    if (balance_type !== 'trustline') continue;
    balances[`${section}|${asset}|${issuer}`] = parseFloat(balance);
  }

  /* -------- история -------- */
  const history = {};

  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account;

    let cursor = null;
    let pages = 0;

    do {
      const url = cursor
        ? `${horizon}/accounts/${account}/payments?cursor=${cursor}&order=asc&limit=200`
        : `${horizon}/accounts/${account}/payments?order=asc&limit=200`;

      const res = JSON.parse(
        UrlFetchApp.fetch(url, { headers: { Accept: 'application/json' } })
          .getContentText()
      );

      const records = res._embedded?.records || [];
      if (!records.length) break;

      for (const p of records) {
        cursor = p.paging_token;

        if (!p.asset_code) continue;
        if (p.type !== 'payment' && !p.type.startsWith('path_payment')) continue;

        const asset = p.asset_code;
        const issuer = p.asset_issuer;
        const key = `${section}|${asset}|${issuer}`;

        if (!history[key]) {
          history[key] = {
            section,
            asset,
            issuer,
            first_received_at: null,
            total_received: 0,
            total_sent: 0,
            last_counterparty: '',
            last_tx_hash: ''
          };
        }

        const amount = parseFloat(p.amount);

        if (p.to === account) {
          history[key].total_received += amount;
          if (!history[key].first_received_at) {
            history[key].first_received_at = p.created_at;
          }
          history[key].last_counterparty = p.from;
          history[key].last_tx_hash = p.transaction_hash;
        }

        if (p.from === account) {
          history[key].total_sent += amount;
          history[key].last_counterparty = p.to;
          history[key].last_tx_hash = p.transaction_hash;
        }
      }

      pages++;
      if (pages > 30) break; // защита
    } while (cursor);
  }

  /* -------- сборка -------- */
  const rows = [];

  for (const key of Object.keys(history)) {
    const h = history[key];
    const bal = balances[key] ?? 0;

    rows.push([
      h.section,
      h.asset,
      h.issuer,
      h.first_received_at || '',
      h.total_received.toFixed(7),
      h.total_sent.toFixed(7),
      bal.toFixed(7),
      bal > 0 ? 'yes' : 'no',
      h.last_counterparty,
      h.last_tx_hash
    ]);
  }

  if (rows.length) {
    historySheet
      .getRange(2, 1, rows.length, rows[0].length)
      .setValues(rows);
  }
}

