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
  const horizon = mustGet_(consts, 'HORIZON_URL').trim();
  const accounts = getFundAccounts_(consts);

  const sheet = getOrCreateSheet_(ss, 'ASSETS');
  const sheetErr = getOrCreateSheet_(ss, 'ASSETS_ERRORS');
  const sheetDbg = getOrCreateSheet_(ss, 'ASSETS_DEBUG');

  // ASSETS snapshot
  sheet.clear();
  sheet.appendRow(['section', 'asset', 'issuer', 'balance', 'limit', 'asset_type', 'raw']);

  // Errors log
  if (sheetErr.getLastRow() === 0) {
    sheetErr.appendRow(['ts', 'section', 'account', 'error']);
  }

  // Debug log (сырой balances по каждому аккаунту)
  sheetDbg.clear();
  sheetDbg.appendRow(['section', 'account', 'balances_json']);

  const rows = [];

  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account.trim();

    try {
      const url = `${horizon}/accounts/${account}`;
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'Accept': 'application/json' }
      });

      const code = resp.getResponseCode();
      const text = resp.getContentText();

      if (code < 200 || code >= 300) {
        sheetErr.appendRow([new Date().toISOString(), section, account, `HTTP ${code}: ${text.slice(0, 200)}`]);
        continue;
      }

      const res = JSON.parse(text);
      if (!res.balances) {
        sheetErr.appendRow([new Date().toISOString(), section, account, `No balances[] in response: ${text.slice(0, 200)}`]);
        continue;
      }

      // пишем сырой balances для отладки
      sheetDbg.appendRow([section, account, JSON.stringify(res.balances)]);

      for (const b of res.balances) {
        // native
        if (b.asset_type === 'native') {
          rows.push([section, 'XLM', 'native', b.balance, '', b.asset_type, '']);
          continue;
        }

        // liquidity pool shares (важно не потерять!)
        if (b.asset_type === 'liquidity_pool_shares') {
          rows.push([section, 'LP_SHARES', b.liquidity_pool_id || '', b.balance, '', b.asset_type, '']);
          continue;
        }

        // стандартные credit_alphanum4/12 и подобные
        const codeA = b.asset_code || '';
        const issuerA = b.asset_issuer || '';

        rows.push([
          section,
          codeA,
          issuerA,
          b.balance,
          b.limit || '',
          b.asset_type || '',
          ''
        ]);
      }

    } catch (e) {
      sheetErr.appendRow([new Date().toISOString(), section, account, String(e)]);
    }
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/**
 * Быстрый точечный дебаг: руками ставишь ACCOUNT и смотришь balances
 */
function debugSingleAccountAssets() {
  const ACCOUNT = 'GAQ5ERJVI6IW5UVNPEVXUUVMXH3GCDHJ4BJAXMAAKPR5VBWWAUOMABIZ'; // поменяй на нужный
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL').trim();

  const sheetDbg = getOrCreateSheet_(ss, 'ASSETS_DEBUG_SINGLE');
  sheetDbg.clear();
  sheetDbg.appendRow(['account', 'balances_pretty']);

  const url = `${horizon}/accounts/${ACCOUNT}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
  const text = resp.getContentText();

  const res = JSON.parse(text);
  sheetDbg.appendRow([ACCOUNT, JSON.stringify(res.balances, null, 2)]);
}


/* =========================
 * TRANSFERS (без изменений)
 * ========================= */

function syncStellarTransfers() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const residents = loadResidents_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');

  // ---- фондовые аккаунты из CONST ----
  const accounts = Object.entries(consts)
    .filter(([k, v]) => typeof v === 'string' && v.trim().startsWith('G'))
    .map(([k, v]) => ({ key: k, account: v.trim() }));

  // ---- карты и множества ----
  const residentsSet = new Set();
  const allowedAssets = buildAllowedAssetsSet_(residents); // правильная фильтрация с issuer
  const labelByAccount = {};
  
  // Отладочная информация
  console.log(`Загружено ${residents.length} записей резидентов`);
  console.log(`Разрешено активов: ${allowedAssets.size}`);
  console.log(`Активы:`, Array.from(allowedAssets));

  // labels фондов (ключ CONST → label)
  for (const [key, val] of Object.entries(consts)) {
    if (typeof val === 'string' && val.trim().startsWith('G')) {
      labelByAccount[val.trim()] = key;
    }
  }

  // резиденты
  for (const r of residents) {
    if (!r.account) continue;
    const acc = r.account.trim();
    residentsSet.add(acc);

    if (r.label) {
      labelByAccount[acc] = r.label.trim();
    }
  }

  // ---- лист TRANSFERS ----
  const sheet = getOrCreateSheet_(ss, 'TRANSFERS');
  sheet.clear(); // Очищаем лист в начале
  sheet.appendRow([
    'section',
    'datetime',
    'from', 'from_label',
    'to', 'to_label',
    'asset',
    'amount',
    'tx_hash'
  ]);

  // ---- основной цикл по аккаунтам фонда ----
  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account;

    const cursorKey = `cursor_transfers_${section}`;
    let cursor = getCursor_(cursorKey);
    let pages = 0;
    let processedCount = 0;

    do {
      const url = cursor
        ? `${horizon}/accounts/${account}/operations?cursor=${cursor}&order=asc&limit=200`
        : `${horizon}/accounts/${account}/operations?order=asc&limit=200`;

      const response = UrlFetchApp.fetch(url, {
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });

      const res = JSON.parse(response.getContentText());
      const records = res._embedded?.records || [];
      if (!records.length) break;

      const rows = [];

      for (const op of records) {
        cursor = op.paging_token;
        processedCount++;

        // фильтр по типу операции - только операции с движением средств
        const isPayment = op.type === 'payment' || op.type.startsWith('path_payment');
        if (!isPayment) continue;

        const from = op.from;
        const to = op.to;
        const amount = op.amount;

        // для create_account нужно искать amount в других полях
        const isCreateAccount = op.type === 'create_account';
        if (isCreateAccount) {
          if (!op.account || !op.starting_balance) continue;
        }

        // фильтр по участникам
        const known =
          from === account ||
          to === account ||
          residentsSet.has(from) ||
          residentsSet.has(to);

        if (!known) continue;

        // правильная фильтрация активов с учетом issuer
        const assetKey = assetKeyFromOp_(op);
        if (assetKey && !allowedAssets.has(assetKey)) continue; // пропускаем если актив есть в списке но не разрешен
        
        // Пропускаем XLM (native) полностью
        if (op.asset_type === 'native') continue;

        const fromLabel = labelByAccount[from] || '';
        const toLabel = labelByAccount[to] || '';

        // разные amount поля для разных типов операций
        const transferAmount = amount || op.starting_balance || '0';
        
        const txUrl = `https://stellar.expert/explorer/public/tx/${op.transaction_hash}`;
        const txLinkFormula = `=HYPERLINK("${txUrl}", "${op.transaction_hash}")`;

        rows.push([
          section,
          op.created_at,
          from, fromLabel,
          to, toLabel,
          op.asset_code || 'UNKNOWN',
          transferAmount,
          txLinkFormula
        ]);
      }

      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setValues(rows);
      }

      pages++;
      if (pages > 30) {
        console.log(`Превышен лимит страниц (30) для секции ${section}`);
        break;
      }
    } while (cursor);

    if (cursor) {
      setCursor_(cursorKey, cursor);
    }
    
    console.log(`Секция ${section}: обработано ${processedCount} операций, сохранен курсор ${cursor}`);
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
      label: String(r[1] || '').trim(),
      asset_code: String(r[2] || '').trim(),
      asset_issuer: String(r[3] || '').trim()
    }));
}

function buildAllowedAssetsSet_(residents) {
  const s = new Set(); // НЕ добавляем XLM - он не нужен в результатах
  for (const r of residents) {
    if (!r.asset_code) continue;
    
    // Пропускаем XLM полностью
    if (r.asset_code.toUpperCase() === 'XLM' || r.asset_issuer === 'native') {
      continue;
    }
    
    // Для кредитных активов добавляем код:issuer
    const assetKey = `${r.asset_code.trim()}:${r.asset_issuer.trim()}`;
    s.add(assetKey);
  }
  console.log(`Фильтр активов: добавлено ${s.size} уникальных активов`);
  return s;
}

function assetKeyFromOp_(op) {
  return op.asset_type === 'native'
    ? null // XLM не обрабатываем
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
    'flow_type',
    'flow_role',
    'last_counterparty',
    'counterparty_type',
    'last_tx_hash',
    'tx_link'
  ]);

  /* ---------- текущие балансы ---------- */
  const balances = {};
  const assetRows = assetsSheet.getDataRange().getValues().slice(1);

  for (const r of assetRows) {
    const [section, balance_type, asset, issuer, balance] = r;
    if (balance_type !== 'trustline') continue;
    balances[`${section}|${asset}|${issuer}`] = parseFloat(balance);
  }

  /* ---------- история ---------- */
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
            flow_type: '',
            flow_role: '',
            last_counterparty: '',
            counterparty_type: '',
            last_tx_hash: '',
            tx_link: ''
          };
        }

        const amount = parseFloat(p.amount);
        const isIncoming = p.to === account;
        const counterparty = isIncoming ? p.from : p.to;

        if (isIncoming) {
          history[key].total_received += amount;
          if (!history[key].first_received_at) {
            history[key].first_received_at = p.created_at;
          }
        } else if (p.from === account) {
          history[key].total_sent += amount;
        } else {
          continue;
        }

        history[key].flow_type = p.type;
        history[key].flow_role = isIncoming ? 'in' : 'out';
        history[key].last_counterparty = counterparty;
        history[key].counterparty_type =
          counterparty === issuer ? 'issuer' : 'non_issuer';
        history[key].last_tx_hash = p.transaction_hash;
        history[key].tx_link =
          `https://stellar.expert/explorer/public/tx/${p.transaction_hash}`;
      }

      pages++;
      if (pages > 30) break;
    } while (cursor);
  }

  /* ---------- сборка ---------- */
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
      h.flow_type,
      h.flow_role,
      h.last_counterparty,
      h.counterparty_type,
      h.last_tx_hash,
      h.tx_link
    ]);
  }

  if (rows.length) {
    historySheet
      .getRange(2, 1, rows.length, rows[0].length)
      .setValues(rows);
  }
}
