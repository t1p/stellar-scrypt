/***********************
 * Stellar → Google Sheets
 * AUDIT MODE - ИСПРАВЛЕННАЯ ВЕРСИЯ
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
 * TRANSFERS - ИСПРАВЛЕННАЯ ВЕРСИЯ
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
    // Оригинальная логика - account для residentsSet
    if (!r.account) continue;
    const acc = r.account.trim();
    residentsSet.add(acc);

    // Но labels из asset_issuer
    if (r.label && r.asset_issuer) {
      labelByAccount[r.asset_issuer.trim()] = r.label.trim();
    }
  }

  // ---- лист TRANSFERS ----
  const sheet = getOrCreateSheet_(ss, 'TRANSFERS');
  sheet.getRange('A:I').clearContent(); // Очищаем только колонки A-I, чтобы сохранить столбцы J+
  
  // Оставляем данные в столбцах A-I, чтобы не затирать столбцы J и далее
  sheet.getRange(1, 1, 1, 9).setValues([[
    'section',
    'datetime',
    'from', 'from_label',
    'to', 'to_label',
    'asset',
    'amount',
    'tx_hash'
  ]]);

  // ---- основной цикл по аккаунтам фонда ----
  for (const acc of accounts) {
    const section = acc.key;
    const account = acc.account;

    const cursorKey = `cursor_transfers_${section}`;
    let cursor = getCursor_(cursorKey);
    let pages = 0;
    let processedCount = 0;
    let addedCount = 0;

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

        // Объявляем переменные сразу
        const from = op.from;
        const to = op.to;
        const amount = op.amount;

        // Детальное логирование для отладки (закомментировано)
        // console.log(`\n=== ОПЕРАЦИЯ ${processedCount} ===`);
        // console.log(`Тип: ${op.type}, asset_type: ${op.asset_type}`);
        // console.log(`Asset: ${op.asset_code}:${op.asset_issuer}`);
        // console.log(`Участники: from=${from}, to=${to}`);
        // console.log(`Аккаунт фонда: ${account}`);
        // console.log(`ResidentsSet размер: ${residentsSet.size}`);
        // console.log(`AllowedAssets размер: ${allowedAssets.size}`);
        
        // фильтр по типу операции - только операции с движением средств
        const isPayment = op.type === 'payment' || op.type.startsWith('path_payment');
        // if (!isPayment) {
        //   console.log(`❌ Отбрасываем: не payment операция (${op.type})`);
        //   continue;
        // }

        // console.log(`✅ Тип операции OK`);

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
          
        // console.log(`Проверка участников:`);
        // console.log(`  from === account: ${from} === ${account} = ${from === account}`);
        // console.log(`  to === account: ${to} === ${account} = ${to === account}`);
        // console.log(`  residentsSet.has(from): ${residentsSet.has(from)}`);
        // console.log(`  residentsSet.has(to): ${residentsSet.has(to)}`);
        // console.log(`  known: ${known}`);
        
        if (!known) {
          // console.log(`❌ Отбрасываем: неизвестные участники`);
          continue;
        }
        
        // console.log(`✅ Участники OK`);

        // Пропускаем XLM (native) полностью
        if (op.asset_type === 'native') {
          // console.log(`❌ Отбрасываем: XLM операция`);
          continue;
        }
        // console.log(`✅ Не XLM`);

        // правильная фильтрация активов с учетом issuer
        const assetKey = assetKeyFromOp_(op);
        // console.log(`Проверка актива: ${assetKey}`);
        
        if (!assetKey) {
          // console.log(`❌ Отбрасываем: assetKey null`);
          continue;
        }
        
        const assetAllowed = allowedAssets.has(assetKey);
        // console.log(`Актив в разрешенных: ${assetAllowed}`);
        
        if (!assetAllowed) {
          // console.log(`❌ Отбрасываем: актив не в списке разрешенных`);
          // console.log(`Ищем актив: ${assetKey}`);
          // console.log(`В списке есть:`, Array.from(allowedAssets));
          continue;
        }
        
        // console.log(`✅ АКТИВ OK`);
        // console.log(`🎉 ОПЕРАЦИЯ ПРОШЛА ВСЕ ФИЛЬТРЫ!`);

        const fromLabel = labelByAccount[from] || '';
        const toLabel = labelByAccount[to] || '';

        // разные amount поля для разных типов операций
        const transferAmount = (amount || op.starting_balance || '0').toString().replace(/\./g, ',');
        
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
        addedCount++;
      }

      if (rows.length) {
        // Записываем данные в столбцы A-I, чтобы не затирать столбцы J и далее
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
    
    console.log(`Секция ${section}: обработано ${processedCount} операций, добавлено ${addedCount}, сохранен курсор ${cursor}`);
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
    console.log(`Добавлен актив в фильтр: ${assetKey}`);
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

/**
 * Функция для отладки и сброса курсоров
 * Выполните эту функцию чтобы сбросить все курсоры и начать загрузку сначала
 */

function resetAllCursors() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  
  let cursorCount = 0;
  for (const key in allProps) {
    if (key.startsWith('cursor_transfers_')) {
      props.deleteProperty(key);
      cursorCount++;
      console.log(`Удален курсор: ${key}`);
    }
  }
  
  console.log(`Всего удалено курсоров: ${cursorCount}`);
  console.log('Теперь можно запустить syncStellarTransfers() - загрузит все операции сначала');
}

/**
 * Тест API запроса без курсора
 */
function testApiRequest() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  // Берем первый аккаунт из CONST
  const accounts = Object.entries(consts)
    .filter(([k, v]) => typeof v === 'string' && v.trim().startsWith('G'))
    .map(([k, v]) => ({ key: k, account: v.trim() }));
  
  if (accounts.length === 0) {
    console.log('Не найдено аккаунтов в CONST');
    return;
  }
  
  const testAccount = accounts[0];
  console.log(`Тестируем аккаунт: ${testAccount.key} = ${testAccount.account}`);
  
  const url = `${horizon}/accounts/${testAccount.account}/operations?order=asc&limit=5`;
  console.log(`Запрос: ${url}`);
  
  try {
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const res = JSON.parse(response.getContentText());
    console.log(`HTTP код: ${response.getResponseCode()}`);
    console.log(`Всего операций в ответе: ${res._embedded?.records?.length || 0}`);
    
    if (res._embedded?.records?.length > 0) {
      console.log('Первая операция:', res._embedded.records[0]);
    }
    
  } catch (e) {
    console.log(`Ошибка API: ${e}`);
  }
}

/**
 * Отладка листа RESIDENTS - показывает что загружается
 */
function debugResidents() {
  const ss = SpreadsheetApp.getActive();
  const residents = loadResidents_(ss);
  
  console.log(`=== ОТЛАДКА RESIDENTS ===`);
  console.log(`Загружено записей: ${residents.length}`);
  
  residents.forEach((r, i) => {
    console.log(`Строка ${i+1}:`);
    console.log(`  account: "${r.account}"`);
    console.log(`  label: "${r.label}"`);
    console.log(`  asset_code: "${r.asset_code}"`);
    console.log(`  asset_issuer: "${r.asset_issuer}"`);
    console.log('');
  });
  
  // Проверим аккаунты в CONST
  const consts = loadConsts_(ss);
  const accounts = Object.entries(consts)
    .filter(([k, v]) => typeof v === 'string' && v.trim().startsWith('G'));
  
  console.log(`=== АККАУНТЫ В CONST ===`);
  accounts.forEach(([key, val]) => {
    console.log(`${key} = ${val}`);
  });
  
  console.log(`=== ПОИСК СОВПАДЕНИЙ ===`);
  const labelByAccount = {};
  
  // labels фондов (ключ CONST → label)
  for (const [key, val] of Object.entries(consts)) {
    if (typeof val === 'string' && val.trim().startsWith('G')) {
      labelByAccount[val.trim()] = key;
      console.log(`CONST: ${val} -> "${key}"`);
    }
  }
  
  // резиденты
  for (const r of residents) {
    // Используем asset_issuer как ключ (это аккаунты Stellar)
    if (!r.asset_issuer) continue;
    const issuer = r.asset_issuer.trim();
    
    if (r.label) {
      labelByAccount[issuer] = r.label.trim();
      console.log(`RESIDENT ISSUER: ${issuer} -> "${r.label}"`);
    }
  }
  
  console.log(`=== ФИНАЛЬНАЯ КАРТА LABELS ===`);
  Object.entries(labelByAccount).forEach(([account, label]) => {
    console.log(`${account} -> "${label}"`);
  });
}

/**
 * Проверка конкретного аккаунта - выводит все операции без фильтров
 */
function testSpecificAccount() {
  const TEST_ACCOUNT = 'GBQVV4KL7FICHZTL3HGAP6EDGUQQXBMXKJQN5LMM5YTYLLNG3HM7MTMD'; // MTMD
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'TEST_ACCOUNT_OPERATIONS');
  sheet.clear();
  sheet.appendRow([
    'operation_id',
    'datetime', 
    'type',
    'from',
    'to',
    'asset_code',
    'asset_issuer',
    'asset_type',
    'amount',
    'transaction_hash'
  ]);
  
  console.log(`Проверяем аккаунт: ${TEST_ACCOUNT}`);
  
  let cursor = null;
  let page = 0;
  let totalOps = 0;
  
  do {
    const url = cursor 
      ? `${horizon}/accounts/${TEST_ACCOUNT}/operations?cursor=${cursor}&order=asc&limit=50`
      : `${horizon}/accounts/${TEST_ACCOUNT}/operations?order=asc&limit=50`;
    
    console.log(`Загружаем страницу ${page + 1}...`);
    
    try {
      const response = UrlFetchApp.fetch(url, {
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });
      
      const res = JSON.parse(response.getContentText());
      const records = res._embedded?.records || [];
      
      if (records.length === 0) {
        console.log(`Страница ${page + 1}: нет операций`);
        break;
      }
      
      console.log(`Страница ${page + 1}: ${records.length} операций`);
      
      const rows = [];
      for (const op of records) {
        cursor = op.paging_token;
        totalOps++;
        
        rows.push([
          op.id,
          op.created_at,
          op.type,
          op.from || '',
          op.to || '',
          op.asset_code || '',
          op.asset_issuer || '',
          op.asset_type || '',
          op.amount || op.starting_balance || '',
          op.transaction_hash
        ]);
      }
      
      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setValues(rows);
      }
      
      page++;
      if (page >= 10) { // ограничиваем для теста
        console.log(`Ограничение страниц достигнуто (10)`);
        break;
      }
      
    } catch (e) {
      console.log(`Ошибка: ${e}`);
      break;
    }
    
  } while (cursor);
  
  console.log(`Итого операций: ${totalOps}`);
  console.log(`Результат сохранен в лист TEST_ACCOUNT_OPERATIONS`);
}

/**
 * Детальный анализ конкретного аккаунта и актива
 */
function analyzeAccountAsset() {
  const TEST_ACCOUNT = 'GCKCV7T56CAPFUYMCQUYSEUMZRC7GA7CAQ2BOL3RPS4NQXDTRCSULMFB'; // MABIZ_MFBOND
  const TARGET_ASSET = 'IMTabak'; // Актив который есть в балансе но нет в операциях
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'ACCOUNT_ASSET_ANALYSIS');
  sheet.clear();
  sheet.appendRow([
    'analysis_type',
    'operation_id',
    'datetime', 
    'type',
    'subtype',
    'from',
    'to',
    'asset_code',
    'asset_issuer',
    'asset_type',
    'amount',
    'starting_balance',
    'transaction_hash'
  ]);
  
  console.log(`Анализируем аккаунт: ${TEST_ACCOUNT}`);
  console.log(`Ищем актив: ${TARGET_ASSET}`);
  
  let cursor = null;
  let page = 0;
  let totalOps = 0;
  let targetAssetOps = 0;
  let createAccountOps = 0;
  let trustlineOps = 0;
  let otherOps = 0;
  
  do {
    const url = cursor 
      ? `${horizon}/accounts/${TEST_ACCOUNT}/operations?cursor=${cursor}&order=asc&limit=100`
      : `${horizon}/accounts/${TEST_ACCOUNT}/operations?order=asc&limit=100`;
    
    console.log(`Загружаем страницу ${page + 1}...`);
    
    try {
      const response = UrlFetchApp.fetch(url, {
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });
      
      const res = JSON.parse(response.getContentText());
      const records = res._embedded?.records || [];
      
      if (records.length === 0) {
        console.log(`Страница ${page + 1}: нет операций`);
        break;
      }
      
      console.log(`Страница ${page + 1}: ${records.length} операций`);
      
      const rows = [];
      for (const op of records) {
        cursor = op.paging_token;
        totalOps++;
        
        let isTargetAsset = false;
        let analysisType = 'other';
        
        // Проверяем операции с нашим активом
        if (op.asset_code === TARGET_ASSET || 
            (op.asset_issuer && op.type === 'change_trust') ||
            op.type === 'create_account') {
          isTargetAsset = true;
          
          if (op.type === 'change_trust') {
            trustlineOps++;
            analysisType = 'trustline';
          } else if (op.type === 'create_account') {
            createAccountOps++;
            analysisType = 'create_account';
          } else {
            targetAssetOps++;
            analysisType = 'target_asset';
          }
        }
        
        // Записываем все операции с target asset или все операции до 50
        if (isTargetAsset || totalOps <= 50) {
          rows.push([
            analysisType,
            op.id,
            op.created_at,
            op.type,
            op.type_i || '',
            op.from || '',
            op.to || '',
            op.asset_code || '',
            op.asset_issuer || '',
            op.asset_type || '',
            op.amount || '',
            op.starting_balance || '',
            op.transaction_hash
          ]);
        }
        
        // Логируем интересные операции
        if (isTargetAsset || op.type === 'change_trust' || op.type === 'create_account') {
          console.log(`Интересная операция ${totalOps}:`);
          console.log(`  Тип: ${op.type}`);
          console.log(`  От: ${op.from || 'N/A'}`);
          console.log(`  Кому: ${op.to || 'N/A'}`);
          console.log(`  Актив: ${op.asset_code || 'N/A'}:${op.asset_issuer || 'N/A'}`);
          console.log(`  Сумма: ${op.amount || op.starting_balance || 'N/A'}`);
          console.log(`  Хэш: ${op.transaction_hash}`);
          console.log('');
        }
      }
      
      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setValues(rows);
      }
      
      page++;
      if (page >= 50) { // увеличиваем лимит для полного анализа
        console.log(`Ограничение страниц достигнуто (50)`);
        break;
      }
      
    } catch (e) {
      console.log(`Ошибка: ${e}`);
      break;
    }
    
  } while (cursor);
  
  console.log(`=== ИТОГОВАЯ СТАТИСТИКА ===`);
  console.log(`Всего операций: ${totalOps}`);
  console.log(`Операции с активом ${TARGET_ASSET}: ${targetAssetOps}`);
  console.log(`Create account операции: ${createAccountOps}`);
  console.log(`Trustline операции: ${trustlineOps}`);
  console.log(`Результат сохранен в лист ACCOUNT_ASSET_ANALYSIS`);
}

/**
 * Проверка effects эндпоинта для поиска появления актива
 */
function checkEffectsEndpoint() {
  const TEST_ACCOUNT = 'GCKCV7T56CAPFUYMCQUYSEUMZRC7GA7CAQ2BOL3RPS4NQXDTRCSULMFB'; // MABIZ_MFBOND
  const TARGET_ASSET = 'IMTabak';
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'ACCOUNT_EFFECTS');
  sheet.clear();
  sheet.appendRow([
    'effect_type',
    'created_at',
    'asset_code',
    'asset_issuer',
    'balance',
    'limit',
    'operation_type',
    'operation_id',
    'transaction_hash'
  ]);
  
  console.log(`Проверяем effects эндпоинт для аккаунта: ${TEST_ACCOUNT}`);
  console.log(`Ищем эффекты связанные с активом: ${TARGET_ASSET}`);
  
  let cursor = null;
  let page = 0;
  let totalEffects = 0;
  let targetEffects = 0;
  
  do {
    const url = cursor 
      ? `${horizon}/accounts/${TEST_ACCOUNT}/effects?cursor=${cursor}&order=asc&limit=100`
      : `${horizon}/accounts/${TEST_ACCOUNT}/effects?order=asc&limit=100`;
    
    console.log(`Загружаем страницу effects ${page + 1}...`);
    
    try {
      const response = UrlFetchApp.fetch(url, {
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });
      
      const res = JSON.parse(response.getContentText());
      const records = res._embedded?.records || [];
      
      if (records.length === 0) {
        console.log(`Effects страница ${page + 1}: нет эффектов`);
        break;
      }
      
      console.log(`Effects страница ${page + 1}: ${records.length} эффектов`);
      
      const rows = [];
      for (const effect of records) {
        cursor = effect.paging_token;
        totalEffects++;
        
        let isTargetAsset = false;
        
        // Проверяем эффекты связанные с нашим активом
        if (effect.asset_code === TARGET_ASSET || 
            (effect.balance && effect.asset_code) ||
            effect.type === 'trustline' ||
            effect.type === 'account_credited' ||
            effect.type === 'account_debited') {
          isTargetAsset = true;
          targetEffects++;
        }
        
        // Записываем эффекты с target asset или первые 200
        if (isTargetAsset || totalEffects <= 200) {
          rows.push([
            effect.type,
            effect.created_at,
            effect.asset_code || '',
            effect.asset_issuer || '',
            effect.balance || '',
            effect.limit || '',
            effect.operation?.type || '',
            effect.operation?.id || '',
            effect.operation?.transaction_hash || ''
          ]);
        }
        
        // Логируем интересные эффекты
        if (isTargetAsset || effect.type === 'trustline') {
          console.log(`Интересный эффект ${totalEffects}:`);
          console.log(`  Тип эффекта: ${effect.type}`);
          console.log(`  Актив: ${effect.asset_code || 'N/A'}:${effect.asset_issuer || 'N/A'}`);
          console.log(`  Баланс: ${effect.balance || 'N/A'}`);
          console.log(`  Лимит: ${effect.limit || 'N/A'}`);
          console.log(`  Операция: ${effect.operation?.type || 'N/A'}`);
          console.log('');
        }
      }
      
      if (rows.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setValues(rows);
      }
      
      page++;
      if (page >= 20) { // ограничиваем для анализа
        console.log(`Ограничение effects страниц достигнуто (20)`);
        break;
      }
      
    } catch (e) {
      console.log(`Ошибка в effects: ${e}`);
      break;
    }
    
  } while (cursor);
  
  console.log(`=== ИТОГОВАЯ СТАТИСТИКА EFFECTS ===`);
  console.log(`Всего эффектов: ${totalEffects}`);
  console.log(`Эффекты с активом ${TARGET_ASSET}: ${targetEffects}`);
  console.log(`Результат сохранен в лист ACCOUNT_EFFECTS`);
}

/**
 * Детальный анализ баланса конкретного аккаунта
 */
function detailedBalanceAnalysis() {
  const TEST_ACCOUNT = 'GCKCV7T56CAPFUYMCQUYSEUMZRC7GA7CAQ2BOL3RPS4NQXDTRCSULMFB'; // MABIZ_MFBOND
  const TARGET_ASSET = 'IMTabak';
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'DETAILED_BALANCE_ANALYSIS');
  sheet.clear();
  sheet.appendRow([
    'asset_code',
    'asset_issuer',
    'asset_type',
    'balance',
    'limit',
    'buying_liabilities',
    'selling_liabilities',
    'last_modified_ledger',
    'is_authorized',
    'is_authorized_to_maintain_liabilities',
    'paging_token',
    'sponsorship'
  ]);
  
  console.log(`Детальный анализ баланса аккаунта: ${TEST_ACCOUNT}`);
  console.log(`Ищем актив: ${TARGET_ASSET}`);
  
  try {
    const url = `${horizon}/accounts/${TEST_ACCOUNT}`;
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const res = JSON.parse(response.getContentText());
    const balances = res.balances || [];
    
    console.log(`Найдено балансов: ${balances.length}`);
    
    const rows = [];
    let targetBalanceFound = false;
    
    for (const balance of balances) {
      const isTargetAsset = balance.asset_code === TARGET_ASSET;
      
      if (isTargetAsset) {
        targetBalanceFound = true;
        console.log(`🎯 НАЙДЕН ЦЕЛЕВОЙ АКТИВ ${TARGET_ASSET}:`);
        console.log(`  asset_code: ${balance.asset_code}`);
        console.log(`  asset_issuer: ${balance.asset_issuer}`);
        console.log(`  asset_type: ${balance.asset_type}`);
        console.log(`  balance: ${balance.balance}`);
        console.log(`  limit: ${balance.limit}`);
        console.log(`  buying_liabilities: ${balance.buying_liabilities}`);
        console.log(`  selling_liabilities: ${balance.selling_liabilities}`);
        console.log(`  last_modified_ledger: ${balance.last_modified_ledger}`);
        console.log(`  is_authorized: ${balance.is_authorized}`);
        console.log(`  is_authorized_to_maintain_liabilities: ${balance.is_authorized_to_maintain_liabilities}`);
        console.log(`  paging_token: ${balance.paging_token}`);
        console.log(`  sponsorship: ${balance.sponsorship}`);
        console.log('');
      }
      
      rows.push([
        balance.asset_code || '',
        balance.asset_issuer || '',
        balance.asset_type || '',
        balance.balance || '',
        balance.limit || '',
        balance.buying_liabilities || '',
        balance.selling_liabilities || '',
        balance.last_modified_ledger || '',
        balance.is_authorized || '',
        balance.is_authorized_to_maintain_liabilities || '',
        balance.paging_token || '',
        balance.sponsorship || ''
      ]);
    }
    
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    
    if (!targetBalanceFound) {
      console.log(`❌ Актив ${TARGET_ASSET} НЕ НАЙДЕН в балансе аккаунта!`);
      console.log('Все активы в балансе:');
      balances.forEach((b, i) => {
        console.log(`${i+1}. ${b.asset_code || 'XLM'}:${b.asset_issuer || 'native'} = ${b.balance}`);
      });
    }
    
  } catch (e) {
    console.log(`Ошибка при получении баланса: ${e}`);
  }
  
  console.log(`Результат сохранен в лист DETAILED_BALANCE_ANALYSIS`);
}

/**
 * Проверка конкретного ledger для поиска операции с активом
 */
function checkSpecificLedger() {
  const TARGET_LEDGER = 52836466; // ledger где был изменен актив IMTabak
  const TARGET_ASSET = 'IMTabak';
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'LEDGER_OPERATIONS');
  sheet.clear();
  sheet.appendRow([
    'operation_id',
    'transaction_hash',
    'type',
    'type_i',
    'source_account',
    'from',
    'to',
    'asset_code',
    'asset_issuer',
    'amount',
    'created_at'
  ]);
  
  console.log(`Проверяем ledger: ${TARGET_LEDGER}`);
  console.log(`Ищем операции с активом: ${TARGET_ASSET}`);
  
  try {
    const url = `${horizon}/ledgers/${TARGET_LEDGER}/operations`;
    console.log(`Запрос: ${url}`);
    
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const res = JSON.parse(response.getContentText());
    const records = res._embedded?.records || [];
    
    console.log(`Найдено операций в ledger ${TARGET_LEDGER}: ${records.length}`);
    
    const rows = [];
    let targetOps = 0;
    
    for (const op of records) {
      let isTargetAsset = false;
      
      // Проверяем операции с нашим активом
      if (op.asset_code === TARGET_ASSET || 
          (op.asset_issuer === 'GAKGV47MQO7IXHWJDWYBJY6T2O65SXHIFFE5M5OIAT46OTAUTIUZGTBK')) {
        isTargetAsset = true;
        targetOps++;
      }
      
      // Записываем все операции с target asset или все операции
      if (isTargetAsset || targetOps < 10) {
        rows.push([
          op.id,
          op.transaction_hash,
          op.type,
          op.type_i || '',
          op.source_account || '',
          op.from || '',
          op.to || '',
          op.asset_code || '',
          op.asset_issuer || '',
          op.amount || '',
          op.created_at || ''
        ]);
      }
      
      // Логируем операции с нашим активом
      if (isTargetAsset) {
        console.log(`🎯 НАЙДЕНА ОПЕРАЦИЯ С АКТИВОМ ${TARGET_ASSET}:`);
        console.log(`  operation_id: ${op.id}`);
        console.log(`  type: ${op.type}`);
        console.log(`  source_account: ${op.source_account}`);
        console.log(`  from: ${op.from || 'N/A'}`);
        console.log(`  to: ${op.to || 'N/A'}`);
        console.log(`  asset: ${op.asset_code || 'N/A'}:${op.asset_issuer || 'N/A'}`);
        console.log(`  amount: ${op.amount || 'N/A'}`);
        console.log(`  transaction_hash: ${op.transaction_hash}`);
        console.log('');
      }
    }
    
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    
    console.log(`=== ИТОГОВАЯ СТАТИСТИКА ===`);
    console.log(`Операций с активом ${TARGET_ASSET}: ${targetOps}`);
    
    if (targetOps === 0) {
      console.log(`❌ Операции с активом ${TARGET_ASSET} не найдены в ledger ${TARGET_LEDGER}`);
      console.log('Это может означать:');
      console.log('1. Операция была отфильтрована API');
      console.log('2. Актив был добавлен через системную операцию');
      console.log('3. Данные не синхронизированы');
    }
    
  } catch (e) {
    console.log(`Ошибка при получении ledger: ${e}`);
  }
  
  console.log(`Результат сохранен в лист LEDGER_OPERATIONS`);
}

/**
 * Получение транзакции по хэшу напрямую
 */
function getTransactionByHash() {
  const TARGET_HASH = '64498a57629aca1a29b0b9eaed09e6cccf90bc369a9a64a49ea08ea1360715b7';
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'TRANSACTION_BY_HASH');
  sheet.clear();
  sheet.appendRow([
    'operation_id',
    'type',
    'type_i',
    'source_account',
    'from',
    'to',
    'asset_code',
    'asset_issuer',
    'amount',
    'created_at'
  ]);
  
  console.log(`Получаем транзакцию по хэшу: ${TARGET_HASH}`);
  
  try {
    const url = `${horizon}/transactions/${TARGET_HASH}/operations`;
    console.log(`Запрос: ${url}`);
    
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const res = JSON.parse(response.getContentText());
    const records = res._embedded?.records || [];
    
    console.log(`Найдено операций в транзакции: ${records.length}`);
    
    const rows = [];
    for (const op of records) {
      rows.push([
        op.id,
        op.type,
        op.type_i || '',
        op.source_account || '',
        op.from || '',
        op.to || '',
        op.asset_code || '',
        op.asset_issuer || '',
        op.amount || '',
        op.created_at || ''
      ]);
      
      console.log(`Операция ${op.id}:`);
      console.log(`  Тип: ${op.type}`);
      console.log(`  От: ${op.from || 'N/A'}`);
      console.log(`  Кому: ${op.to || 'N/A'}`);
      console.log(`  Актив: ${op.asset_code || 'N/A'}:${op.asset_issuer || 'N/A'}`);
      console.log(`  Сумма: ${op.amount || 'N/A'}`);
      console.log('');
    }
    
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    
  } catch (e) {
    console.log(`Ошибка при получении транзакции: ${e}`);
  }
  
  console.log(`Результат сохранен в лист TRANSACTION_BY_HASH`);
}

/**
 * Получение самой транзакции по хэшу
 */
function getTransactionDetails() {
  const TARGET_HASH = '64498a57629aca1a29b0b9eaed09e6cccf90bc369a9a64a49ea08ea1360715b7';
  
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  const sheet = getOrCreateSheet_(ss, 'TRANSACTION_DETAILS');
  sheet.clear();
  sheet.appendRow([
    'field',
    'value'
  ]);
  
  console.log(`Получаем детали транзакции: ${TARGET_HASH}`);
  
  try {
    const url = `${horizon}/transactions/${TARGET_HASH}`;
    console.log(`Запрос: ${url}`);
    
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const code = response.getResponseCode();
    const text = response.getContentText();
    
    console.log(`HTTP код: ${code}`);
    console.log(`Ответ: ${text}`);
    
    if (code >= 200 && code < 300) {
      const tx = JSON.parse(text);
      
      const fields = [
        ['id', tx.id],
        ['hash', tx.hash],
        ['ledger', tx.ledger],
        ['created_at', tx.created_at],
        ['source_account', tx.source_account],
        ['source_account_sequence', tx.source_account_sequence],
        ['fee_charged', tx.fee_charged],
        ['fee_account', tx.fee_account],
        ['max_fee', tx.max_fee],
        ['operation_count', tx.operation_count],
        ['envelope_xdr', tx.envelope_xdr],
        ['result_xdr', tx.result_xdr],
        ['result_meta_xdr', tx.result_meta_xdr],
        ['fee_meta_xdr', tx.fee_meta_xdr],
        ['memo_type', tx.memo_type],
        ['memo', tx.memo],
        ['signatures', tx.signatures?.join(', ')],
        ['valid_before', tx.valid_before],
        ['valid_after', tx.valid_after]
      ];
      
      const rows = fields.filter(([key, value]) => value !== undefined && value !== null);
      
      if (rows.length) {
        sheet.getRange(2, 1, rows.length, 2).setValues(rows);
      }
      
      console.log('=== ДЕТАЛИ ТРАНЗАКЦИИ ===');
      console.log(`ID: ${tx.id}`);
      console.log(`Ledger: ${tx.ledger}`);
      console.log(`Source Account: ${tx.source_account}`);
      console.log(`Operation Count: ${tx.operation_count}`);
      console.log(`Memo: ${tx.memo || 'N/A'}`);
      console.log(`Memo Type: ${tx.memo_type || 'N/A'}`);
      
    } else {
      console.log(`Ошибка HTTP: ${code}`);
      console.log(`Ответ: ${text}`);
    }
    
  } catch (e) {
    console.log(`Ошибка при получении транзакции: ${e}`);
  }
  
  console.log(`Результат сохранен в лист TRANSACTION_DETAILS`);
}

/**
 * Тестирование получения транзакций по хэшам на работающих транзакциях
 */
function testTransactionHashes() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL');
  
  // Берем первый аккаунт фонда для теста
  const accounts = Object.entries(consts)
    .filter(([k, v]) => typeof v === 'string' && v.trim().startsWith('G'))
    .map(([k, v]) => ({ key: k, account: v.trim() }));
  
  if (accounts.length === 0) {
    console.log('Не найдено аккаунтов в CONST');
    return;
  }
  
  const testAccount = accounts[0];
  console.log(`Тестируем аккаунт: ${testAccount.key} = ${testAccount.account}`);
  
  const sheet = getOrCreateSheet_(ss, 'TRANSACTION_HASHES_TEST');
  sheet.clear();
  sheet.appendRow([
    'transaction_hash',
    'api_status',
    'http_code',
    'operation_count',
    'source_account',
    'ledger',
    'created_at',
    'memo'
  ]);
  
  try {
    // Получаем несколько операций для получения хэшей транзакций
    const url = `${horizon}/accounts/${testAccount.account}/operations?order=desc&limit=10`;
    const response = UrlFetchApp.fetch(url, {
      headers: { Accept: 'application/json' },
      muteHttpExceptions: true
    });
    
    const res = JSON.parse(response.getContentText());
    const operations = res._embedded?.records || [];
    
    console.log(`Найдено операций: ${operations.length}`);
    
    const rows = [];
    const uniqueHashes = new Set();
    
    // Собираем уникальные хэши транзакций
    for (const op of operations) {
      if (op.transaction_hash) {
        uniqueHashes.add(op.transaction_hash);
      }
    }
    
    const hashes = Array.from(uniqueHashes).slice(0, 5); // берем первые 5 хэшей
    console.log(`Тестируем хэши: ${hashes.length}`);
    
    for (const hash of hashes) {
      console.log(`Проверяем хэш: ${hash}`);
      
      try {
        const txUrl = `${horizon}/transactions/${hash}`;
        const txResponse = UrlFetchApp.fetch(txUrl, {
          headers: { Accept: 'application/json' },
          muteHttpExceptions: true
        });
        
        const txCode = txResponse.getResponseCode();
        
        if (txCode >= 200 && txCode < 300) {
          const tx = JSON.parse(txResponse.getContentText());
          
          rows.push([
            hash,
            'SUCCESS',
            txCode,
            tx.operation_count || '',
            tx.source_account || '',
            tx.ledger || '',
            tx.created_at || '',
            tx.memo || ''
          ]);
          
          console.log(`✅ УСПЕХ: операций=${tx.operation_count}, memo=${tx.memo}`);
        } else {
          const txText = txResponse.getContentText();
          
          rows.push([
            hash,
            'ERROR',
            txCode,
            '',
            '',
            '',
            '',
            txText.slice(0, 100)
          ]);
          
          console.log(`❌ ОШИБКА ${txCode}: ${txText.slice(0, 100)}`);
        }
        
      } catch (e) {
        rows.push([
          hash,
          'EXCEPTION',
          'N/A',
          '',
          '',
          '',
          '',
          String(e).slice(0, 100)
        ]);
        
        console.log(`❌ ИСКЛЮЧЕНИЕ: ${e}`);
      }
    }
    
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    
    console.log(`=== ИТОГОВАЯ СТАТИСТИКА ===`);
    console.log(`Протестировано хэшей: ${hashes.length}`);
    console.log(`Успешных: ${rows.filter(r => r[1] === 'SUCCESS').length}`);
    console.log(`Ошибочных: ${rows.filter(r => r[1] === 'ERROR').length}`);
    console.log(`Исключений: ${rows.filter(r => r[1] === 'EXCEPTION').length}`);
    
  } catch (e) {
    console.log(`Ошибка при получении операций: ${e}`);
  }
  
  console.log(`Результат сохранен в лист TRANSACTION_HASHES_TEST`);
}
