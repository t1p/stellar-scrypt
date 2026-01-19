const DEBUG = true;
const DEBUG_LEVEL = 2;
const DEFAULT_HORIZON_URL = 'https://archive.stellar.validationcloud.io/v1/H4KC7iRdHf-G0jIblbqY8JKfzSb4Aiq_I97id7yrdzY';

const SHEET_TRANSFERS = 'TRANSFERS';
const SHEET_MEMO_QUEUE = 'TRANSFERS_MEMO_QUEUE';
const SHEET_DEBUG = 'DEBUG_LOG';
const SHEET_CONST = 'CONST';
const SHEET_RESIDENTS = 'RESIDENTS';
const SHEET_ACCOUNTS = 'ACCOUNTS';
const SHEET_ADDRESS_TRANSACTIONS = 'ADDRESS_TRANSACTIONS';
const SHEET_BALANCE_CHANGES = 'BALANCE_CHANGES';

const SHEET_CLICKUP_SCHEMA = 'CLICKUP_SCHEMA';
const SHEET_CLICKUP_TASKS = 'CLICKUP_TASKS';
const SHEET_PROJECT_MAP = 'PROJECT_MAP';
const SHEET_ANOMALIES = 'ANOMALIES';
const SHEET_FACT_MONTHLY = 'FACT_MONTHLY';
const SHEET_KPI_RAW = 'KPI_RAW';

const MEMO_CACHE_TTL = 21600; // 6 часов
const MAX_MEMO_FETCH_PER_RUN = 300;

// ========== Вспомогательные функции ==========
function newRunId_() {
  return Utilities.getUuid();
}

// Маппинг и классификация
const PROJECT_ID_REGEX = null; // Если null, используется дефолт /\bP?\d{3,6}\b/
const MEMO_PATTERNS_REPAY = 'repay|return|погаш|возврат|refund';
const MEMO_PATTERNS_DIVIDEND = 'dividend|дивиденд|profit|прибыль';
const MEMO_PATTERNS_OPEX = 'opex|опекс|fee|комиссия';
const CLASSIFY_ENABLE = true;

// ========== Меню ==========
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Stellar')
    .addItem('Обновить переводы', 'syncStellarTransfers')
    .addItem('Догрузить memo', 'syncTransfersMemos')
    .addItem('Сбросить курсоры', 'resetAllCursors')
    .addItem('Показать транзакции между адресами', 'showTransactionsBetweenAddresses')
    .addItem('Тестировать транзакции между адресами', 'testFetchTransactionsBetweenAddresses')
    .addItem('Обновить все', 'syncAllStellar')
    .addSeparator()
    .addItem('Переклассифицировать TRANSFERS (по override приоритет)', 'reclassifyTransfers')
    .addItem('Перемаппить project_id для UNMAPPED/AMBIGUOUS', 'remappingProjectIds')
    .addSeparator()
    .addItem('Создать CLICKUP_SCHEMA', 'initializeClickUpSchema')
    .addItem('Создать CLICKUP_TASKS', 'initializeClickUpTasks')
    .addItem('Создать PROJECT_MAP', 'initializeProjectMap')
    .addItem('Создать ANOMALIES', 'initializeAnomalies')
    .addItem('Создать FACT_MONTHLY', 'initializeFactMonthly')
    .addItem('Создать KPI_RAW', 'initializeKpiRaw')
    .addItem('Инициализировать новые листы', 'initializeNewSheets')
    .addSeparator()
    .addItem('Собрать FACT_MONTHLY', 'buildFactMonthly')
    .addItem('Собрать KPI_RAW', 'buildKpiRaw')
    .addSeparator()
    .addItem('ClickUp Инвентаризация', 'clickupInventory')
    .addItem('Синхронизация задач ClickUp', 'syncClickUpTasks')
    .addItem('Обновить резидентов из ClickUp', 'updateResidentsFromTasks')
    .addSeparator()
    .addItem('Апгрейд листа TRANSFERS', 'upgradeTransfersSheet')
    .addItem('Апгрейд листа RESIDENTS', 'upgradeResidentsSheet')
    .addItem('Апгрейд всех листов', 'upgradeExistingSheets')
    .addToUi();
}

// ========== Главный запуск ==========
function syncAllStellar() {
  syncStellarTransfers();
  syncTransfersMemos();
}

// ========== Сброс курсоров ==========
function resetAllCursors() {
  const props = PropertiesService.getUserProperties();
  const keys = props.getKeys();
  for (const key of keys) {
    if (key.startsWith('cursor_payments_')) props.deleteProperty(key);
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'resetAllCursors',
    fundKey: 'ALL',
    details: 'Все курсоры сброшены.'
  });
}

// ========== Вспомогательные функции для append-only ==========
function getExistingTransferKeys(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();

  // Предполагаем колонки: tx_hash в J (10), op_id в O (15)
  const data = sheet.getRange(2, 10, lastRow - 1, 6).getValues(); // J:O
  const existingKeys = new Set();

  for (const row of data) {
    const txCell = row[0] ? String(row[0]) : '';
    const txHashMatch = txCell.match(/transactions\/(\w+)/) || txCell.match(/"([A-Z0-9]+)"\s*\)?$/i);
    let txHash = txHashMatch ? txHashMatch[1] : '';
    if (!txHash && /^[A-Z0-9]{10,}$/.test(txCell)) {
      txHash = txCell;
    }
    const opId = row[5] || '';
    if (txHash && opId) {
      existingKeys.add(`${txHash}:${opId}`);
    }
  }

  if (DEBUG) Logger.log(`[getExistingTransferKeys] Found ${existingKeys.size} existing transfer keys`);
  return existingKeys;
}

function getExistingAnomalyKeys(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();

  // Колонки: timestamp A, tx_hash B, issue_type C, details D, suggested_project_id E
  const data = sheet.getRange(2, 2, lastRow - 1, 2).getValues(); // B:C tx_hash, issue_type
  const existingKeys = new Set();

  for (const row of data) {
    const txHash = String(row[0] || '').trim();
    const issueType = String(row[1] || '').trim();
    if (txHash && issueType) {
      existingKeys.add(`${txHash}:${issueType}`);
    }
  }

  if (DEBUG) Logger.log(`[getExistingAnomalyKeys] Found ${existingKeys.size} existing anomaly keys`);
  return existingKeys;
}

function appendNewRows(sheet, newRows) {
  if (newRows.length === 0) return 0;

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);

  if (DEBUG) Logger.log(`[appendNewRows] Appended ${newRows.length} new rows starting from row ${startRow}`);
  return newRows.length;
}

// ========== Основная синхронизация ==========
function syncStellarTransfers() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const resSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const accSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS) || ss.insertSheet(SHEET_TRANSFERS);
  const balanceChangesSheet = ss.getSheetByName(SHEET_BALANCE_CHANGES) || ss.insertSheet(SHEET_BALANCE_CHANGES);
  const anomaliesSheet = ss.getSheetByName(SHEET_ANOMALIES) || ss.insertSheet(SHEET_ANOMALIES);

  // Создаем заголовки, если лист пуст
  if (transfersSheet.getLastRow() === 0) {
    transfersSheet.appendRow(['section', 'datetime', 'from', 'from_label', 'to', 'to_label', 'asset', 'amount', 'memo', 'tx_hash']);
    transfersSheet.getRange('H:H').setNumberFormat('0,########'); // Формат для Amount
    transfersSheet.getRange('B:B').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Формат для Datetime
    // Расширяем таблицу новыми колонками
    upgradeTransfersSheet();
  }

  if (anomaliesSheet.getLastRow() === 0) {
    anomaliesSheet.appendRow(['timestamp', 'tx_hash', 'issue_type', 'details', 'suggested_project_id']);
    anomaliesSheet.getRange('A:A').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }

  // Создаем заголовки, если лист BALANCE_CHANGES пуст
  if (balanceChangesSheet.getLastRow() === 0) {
    balanceChangesSheet.appendRow(['fund_account', 'asset', 'change_amount', 'new_balance', 'tx_hash', 'datetime']);
    balanceChangesSheet.getRange('C:C').setNumberFormat('0,########'); // Формат для change_amount
    balanceChangesSheet.getRange('D:D').setNumberFormat('0,########'); // Формат для new_balance
    balanceChangesSheet.getRange('F:F').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Формат для datetime
  }

  const config = parseConstSheet(constSheet);
  const residentsMap = parseResidentsSheet(resSheet);
  const accountsLabelMap = parseAccountsSheet(accSheet);
  const bsnLabelMap = fetchBSNLabels();
  const fundAccounts = config.fundAccounts;
  const horizon = config.HORIZON_URL || DEFAULT_HORIZON_URL;
  const startDate = config.START_DATE ? new Date(`${config.START_DATE}T00:00:00Z`) : null;
  const endDate = config.END_DATE ? new Date(`${config.END_DATE}T23:59:59Z`) : null;
  const tokenFilterInfo = parseTokenFilter(config.TOKEN_FILTER || '');
  const relaxRoleFilter = String(config.RELAX_ROLE_FILTER || '').trim().toUpperCase() === 'TRUE' || String(config.RELAX_ROLE_FILTER || '').trim() === '1';
  const counterpartyScope = config.COUNTERPARTY_SCOPE || 'FUND_RESIDENT_ONLY';
  const includeNativeXLM = config.include_native_xlm || false;
  const assetAllowlist = (config.asset_allowlist || []).map(normalizeAssetKey_);
  const assetBlocklist = (config.asset_blocklist || []).map(normalizeAssetKey_);
  const minAmount = config.min_amount || 0.01;

  // Построить индексы для маппинга
  const projectMapIndex = buildProjectMapIndex_();
  const residentsIndex = buildResidentsIndex_();
  const indexes = { projectMapIndex, residentsIndex };

  // Правила для классификации
  const rules = {
    MEMO_PATTERNS_REPAY: MEMO_PATTERNS_REPAY,
    MEMO_PATTERNS_DIVIDEND: MEMO_PATTERNS_DIVIDEND,
    MEMO_PATTERNS_OPEX: MEMO_PATTERNS_OPEX
  };

  const props = PropertiesService.getUserProperties();
  const cache = CacheService.getScriptCache();

  // Получаем существующие ключи для дедупликации
  const existingKeys = getExistingTransferKeys(transfersSheet);
  const existingAnomalyKeys = getExistingAnomalyKeys(anomaliesSheet);

  const allRows = [];
  const allNewMemoHashes = [];
  const allBalanceChangeRows = [];
  const allAnomalyRows = [];

  for (const fundKey in fundAccounts) {
    const fundAddress = fundAccounts[fundKey];
    const cursorKey = `cursor_payments_${fundKey}`;
    const cursor = props.getProperty(cursorKey);
      const log = {
        timestamp: new Date().toISOString(),
        stage: 'syncStellarTransfers',
        fundKey,
        address: fundAddress,
        cursor_before: cursor || 'START',
        cursor_after: '',
        fetched: 0,
        dropType: 0,
        typeOk: 0,
        dropNonNative: 0,
        nonNative: 0,
        dropInDate: 0,
        inDate: 0,
        dropMinAmount: 0,
        minAmountOk: 0,
        dropRole: 0,
        roleOk: 0,
        dropDuplicate: 0,
        dropNoTxHash: 0,
        uniqueTx: 0,
        dropTokenFilter: 0,
        dropAssetFilter: 0,
        dropCounterpartyScope: 0,
        dedupSkipped: 0,
        rowsPrepared: 0,
        rowsAppended: 0,
      memoCacheHit: 0,
      memoFetched: 0,
      memoQueued: 0,
      unmapped_count: 0,
      ambiguous_count: 0,
      classified_counts: {},
    };

    const url = `${horizon}/accounts/${fundAddress}/payments?order=asc&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
    const records = fetchAllPayments(url, fundKey, endDate, log);

    const txHashes = new Set();
    const rows = [];
    let newCursor = cursor;

    for (const rec of records) {
      log.fetched++;
      newCursor = rec.paging_token; // Обновляем курсор на каждой записи

      if (!['payment', 'path_payment_strict_send', 'path_payment_strict_receive'].includes(rec.type)) {
        log.dropType++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по типу: ${rec.type}`);
        continue;
      }
      log.typeOk++;

      if (rec.asset_type === 'native' && !includeNativeXLM) {
        log.dropNonNative++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен native (XLM): ${rec.transaction_hash}`);
        continue;
      }
      log.nonNative++;

      const dt = new Date(rec.created_at);
      if ((startDate && dt < startDate) || (endDate && dt > endDate)) {
        log.dropInDate++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по дате: ${rec.created_at}`);
        // Если order=asc и мы вышли за END_DATE, можно прекращать чтение
        if (endDate && dt > endDate) break;
        continue;
      }
      log.inDate++;

      const amountFloat = parseFloat(rec.amount);
      if (amountFloat < minAmount) {
        log.dropMinAmount++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по сумме: ${rec.amount} < ${minAmount}`);
        continue;
      }
      log.minAmountOk++;

      const from = rec.from || '';
      const to = rec.to || '';

      const fromIsFund = isFund(from, fundAccounts);
      const toIsFund = isFund(to, fundAccounts);
      const fromIsRes = isResident(from, residentsMap);
      const toIsRes = isResident(to, residentsMap);

      if (DEBUG && DEBUG_LEVEL >= 1) {
        Logger.log(`[${fundKey}] TX ${rec.transaction_hash}: from=${from}, to=${to}, F_from=${fromIsFund}, F_to=${toIsFund}, R_from=${fromIsRes}, R_to=${toIsRes}`);
      }

      let scopeAllowed = false;
      if (counterpartyScope === 'FUND_RESIDENT_ONLY') {
        scopeAllowed = (fromIsRes && toIsFund) || (fromIsFund && toIsRes);
        if (!scopeAllowed && relaxRoleFilter && (fromIsFund || toIsFund)) {
          scopeAllowed = true;
        }
      } else if (counterpartyScope === 'FUND_FUND') {
        scopeAllowed = fromIsFund && toIsFund;
      } else if (counterpartyScope === 'RESIDENT_RESIDENT') {
        scopeAllowed = fromIsRes && toIsRes;
      } else if (counterpartyScope === 'ALL_RELEVANT') {
        scopeAllowed = fromIsFund || toIsFund || fromIsRes || toIsRes;
      } else {
        scopeAllowed = (fromIsRes && toIsFund) || (fromIsFund && toIsRes);
      }

      if (!scopeAllowed) {
        log.dropCounterpartyScope++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по COUNTERPARTY_SCOPE=${counterpartyScope}: from=${from}, to=${to}`);
        continue;
      }

      let section = '';
      if (to === fundAddress) section = 'IN';
      else if (from === fundAddress) section = 'OUT';
      else if (relaxRoleFilter && (fromIsFund || toIsFund)) {
        section = toIsFund ? 'IN' : 'OUT';
        if (DEBUG && DEBUG_LEVEL >= 1) {
          Logger.log(`[${fundKey}] Ослабленный roleOk: from=${from}, to=${to}, section=${section}`);
        }
      }

      if (!section) {
        log.dropRole++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по ролям: from=${from}, to=${to}`);
        continue;
      }
      log.roleOk++;

      const txHash = rec.transaction_hash;
      const opId = rec.id || rec.paging_token || '';
      const uniqueKey = `${txHash || ''}:${opId}`;
      if (!txHash) {
        log.dropNoTxHash++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен без tx_hash: opId=${opId}`);
        continue;
      }
      if (txHashes.has(uniqueKey)) {
        log.dropDuplicate++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Дубликат uniqueKey=${uniqueKey}`);
        continue;
      }
      if (existingKeys.has(uniqueKey)) {
        log.dedupSkipped++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по дедупу (append-only): uniqueKey=${uniqueKey}`);
        continue;
      }
      txHashes.add(uniqueKey);
      existingKeys.add(uniqueKey);
      log.uniqueTx++;

      const assetCode = rec.asset_code || rec.asset_type;
      const amount = amountFloat;
      const assetIssuer = rec.asset_issuer || '';
      const assetKey = `${assetCode}:${assetIssuer}`;
      const assetCodeNorm = normalizeTokenPart(assetCode);
      const assetIssuerNorm = normalizeTokenPart(assetIssuer);
      const assetKeyNorm = `${assetCodeNorm}:${assetIssuerNorm}`;

      // Фильтр по asset_allowlist/blocklist
      if (assetAllowlist.length > 0 && !assetAllowlist.includes(assetKeyNorm)) {
        log.dropAssetFilter++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по asset_allowlist: ${assetKeyNorm}`);
        continue;
      }
      if (assetBlocklist.length > 0 && assetBlocklist.includes(assetKeyNorm)) {
        log.dropAssetFilter++;
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по asset_blocklist: ${assetKeyNorm}`);
        continue;
      }

      if (tokenFilterInfo.norm) {
        const tokenMatch = tokenFilterInfo.hasIssuer
          ? (assetCodeNorm === tokenFilterInfo.code && assetIssuerNorm === tokenFilterInfo.issuer)
          : assetCodeNorm === tokenFilterInfo.code;
        if (DEBUG && DEBUG_LEVEL >= 2) {
          Logger.log(
            `[${fundKey}] TokenFilter check: tokenFilterRaw=${tokenFilterInfo.raw}, tokenFilterNorm=${tokenFilterInfo.norm}, ` +
            `assetKey=${assetKey}, assetKeyNorm=${assetKeyNorm}, assetCode=${assetCode}, assetIssuer=${assetIssuer}, ` +
            `match=${tokenMatch}, mode=${tokenFilterInfo.hasIssuer ? 'CODE:ISSUER' : 'CODE'}`
          );
        }
        if (!tokenMatch) {
          log.dropTokenFilter++;
          if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по tokenFilter: ${assetKey}`);
          continue;
        }
      }
      const changeAmount = section === 'IN' ? amount : -amount;
      const newBalance = '';

      allBalanceChangeRows.push([
        fundAddress,
        assetKey,
        changeAmount,
        newBalance,
        txHash,
        dt
      ]);

      // 1. Попытка получить memo из кэша
      const cachedMemo = cache.get(`memo:${txHash}`);
      let memoText = '';

      if (cachedMemo !== null) {
        memoText = cachedMemo;
        log.memoCacheHit++;
      } else {
        // 2. Добавляем в очередь для последующей загрузки
        allNewMemoHashes.push(txHash);
        log.memoQueued++;
      }

      const direction = section;
      const counterpartyAddress = section === 'IN' ? from : to;
      let counterpartyType = 'UNKNOWN';
      if (counterpartyAddress) {
        if (isResident(counterpartyAddress, residentsMap)) counterpartyType = 'RESIDENT';
        else if (isFund(counterpartyAddress, fundAccounts)) counterpartyType = 'FUND';
        else counterpartyType = 'EXTERNAL';
      }

      const tags = fundKey === 'MABIZ_DEFAULT' ? 'D' : '';

      // Маппинг project_id
      const mappingResult = mapProjectIdForTransfer_({ from, to, asset_issuer: assetIssuer, memo: memoText }, indexes);
      const projectId = mappingResult.project_id;
      
      if (projectId === 'UNMAPPED') log.unmapped_count++;
      if (projectId === 'AMBIGUOUS') log.ambiguous_count++;

      // Классификация
      const classification = classifyTransfer_({ direction, counterpartyType, memo: memoText, class_override: '' }, rules);
      const transferClass = classification.class;
      
      if (transferClass) {
        log.classified_counts[transferClass] = (log.classified_counts[transferClass] || 0) + 1;
      }

      // Обработка аномалий
      if (mappingResult.anomaly) {
        const anomalyKey = `${txHash}:${mappingResult.anomaly.reason}`;
        if (!existingAnomalyKeys.has(anomalyKey)) {
          allAnomalyRows.push([
            new Date(),
            txHash,
            mappingResult.anomaly.reason,
            JSON.stringify(mappingResult.anomaly),
            mappingResult.candidates.join(', ')
          ]);
          existingAnomalyKeys.add(anomalyKey);
        }
      }

      const row = [
        section,
        dt, // Передаем объект Date, чтобы Google Sheets мог его правильно отформатировать
        from,
        resolveLabel(from, accountsLabelMap, fundAccounts, residentsMap, bsnLabelMap),
        to,
        resolveLabel(to, accountsLabelMap, fundAccounts, residentsMap, bsnLabelMap),
        assetCode,
        amount,
        memoText, // Пока пусто, если нет в кэше
        `=HYPERLINK("${horizon.replace('/horizon', '')}/transactions/${txHash}"; "${txHash}")`,
        fundKey,
        assetCode,
        assetIssuer,
        assetKey,
        opId,
        direction,
        counterpartyType,
        projectId,
        transferClass,
        '', // class_override
        tags
      ];
      rows.push(row);
    }

    log.rowsPrepared = rows.length;
    log.rowsAppended = rows.length;
    log.rows_fetched = log.fetched;
    log.rows_appended = log.rowsAppended;
    log.dedup_skipped = log.dedupSkipped;
    allRows.push(...rows);

    // Запись курсора
    props.setProperty(cursorKey, newCursor);

    // Логирование курсора
    log.cursor_after = newCursor || log.cursor_before;

    // Запись лога курсора
    writeDebugLog({
      run_id,
      module: 'stellar',
      timestamp: new Date().toISOString(),
      stage: 'cursor',
      fund_key: fundKey,
      cursor_before: log.cursor_before,
      cursor_after: log.cursor_after
    });

    // Запись лога. Если rowsWritten == 0, лог должен явно вывести главную причину
    const dropStats = {
      type: log.dropType,
      nonNative: log.dropNonNative,
      inDate: log.dropInDate,
      minAmount: log.dropMinAmount,
      roleOk: log.dropRole,
      uniqueTx: log.dropDuplicate,
      tokenFilter: log.dropTokenFilter,
      assetFilter: log.dropAssetFilter,
      counterpartyScope: log.dropCounterpartyScope,
      noTxHash: log.dropNoTxHash,
      dedupSkipped: log.dedupSkipped
    };
    let topDropKey = '';
    let topDropVal = -1;
    for (const k in dropStats) {
      if (dropStats[k] > topDropVal) {
        topDropVal = dropStats[k];
        topDropKey = k;
      }
    }

    if (log.rowsPrepared === 0 && log.fetched > 0) {
      if (log.roleOk === 0) log.details = 'Главная причина: roleOk (фонд↔резидент) = 0';
      else if (log.minAmountOk === 0) log.details = 'Главная причина: minAmountOk (min_amount) = 0';
      else if (log.inDate === 0) log.details = 'Главная причина: inDate = 0';
      else if (log.nonNative === 0 && !includeNativeXLM) log.details = 'Главная причина: nonNative (XLM) = 0';
      else if (log.dedupSkipped > 0) log.details = 'Главная причина: все строки уже существуют (dedup).';
      else log.details = 'Неизвестная причина обнуления выборки.';
    } else if (log.rowsPrepared > 0) {
      log.details = `Успешно подготовлено ${log.rowsPrepared} строк. Топ-фильтр: ${topDropKey}=${topDropVal}`;
    } else if (log.fetched === 0) {
      log.details = `Не получено ни одной записи из Horizon. Проверьте адрес фонда ${fundAddress} и HORIZON_URL.`;
    }
    writeDebugLog({
      run_id,
      module: 'stellar',
      ...log
    });
  }

  // Append-only запись в TRANSFERS
  if (allRows.length > 0) {
    const appended = appendNewRows(transfersSheet, allRows);

    // Форматирование столбцов
    transfersSheet.getRange('H:H').setNumberFormat('0,########'); // Amount
    transfersSheet.getRange('B:B').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Datetime

    // Обновляем счетчик rowsAppended в последнем логе
    const lastLog = readLastDebugLog();
    if (lastLog) {
      lastLog.rowsAppended = appended;
      lastLog.rows_appended = appended;
      writeDebugLog(lastLog, true); // Перезаписываем последнюю строку
    }
  }

  // Запись новых хэшей в TRANSFERS_MEMO_QUEUE
  if (allNewMemoHashes.length > 0) {
    const memoSheet = ss.getSheetByName(SHEET_MEMO_QUEUE) || ss.insertSheet(SHEET_MEMO_QUEUE);
    if (memoSheet.getLastRow() === 0) memoSheet.appendRow(['txHash']);
    
    // Получаем существующие хэши для проверки уникальности
    const existing = new Set();
    if (memoSheet.getLastRow() > 1) {
      memoSheet.getRange(2, 1, memoSheet.getLastRow() - 1, 1).getValues().flat().forEach(h => existing.add(h));
    }
    
    const uniqueNewMemos = new Set(allNewMemoHashes);
    const hashesToWrite = [...uniqueNewMemos].filter(h => !existing.has(h));

    if (hashesToWrite.length > 0) {
      memoSheet.getRange(memoSheet.getLastRow() + 1, 1, hashesToWrite.length, 1).setValues(hashesToWrite.map(h => [h]));
    }
  }

  // Запись всех строк в BALANCE_CHANGES
  if (allBalanceChangeRows.length > 0) {
    const startRow = balanceChangesSheet.getLastRow() + 1;
    balanceChangesSheet.getRange(startRow, 1, allBalanceChangeRows.length, 6).setValues(allBalanceChangeRows);
  }

  // Запись аномалий
  if (allAnomalyRows.length > 0) {
    const startRow = anomaliesSheet.getLastRow() + 1;
    anomaliesSheet.getRange(startRow, 1, allAnomalyRows.length, 5).setValues(allAnomalyRows);
  }
}

// ========== Memo загрузка ==========
function syncTransfersMemos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memoSheet = ss.getSheetByName(SHEET_MEMO_QUEUE);
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  const cache = CacheService.getScriptCache();

  if (!memoSheet || memoSheet.getLastRow() <= 1) return;

  const hashes = memoSheet.getRange(2, 1, memoSheet.getLastRow() - 1, 1).getValues().flat();
  const batch = hashes.slice(0, MAX_MEMO_FETCH_PER_RUN);
  if (batch.length === 0) return;

  const horizon = parseConstSheet(ss.getSheetByName(SHEET_CONST)).HORIZON_URL;
  const memoMap = {};
  const fetched = [];
  let memoFetchedCount = 0;

  for (const hash of batch) {
    const cached = cache.get(`memo:${hash}`);
    if (cached !== null) {
      memoMap[hash] = cached;
      continue;
    }
    try {
      const res = UrlFetchApp.fetch(`${horizon}/transactions/${hash}`, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
          if (DEBUG) Logger.log(`Ошибка Horizon API при загрузке memo для ${hash}: ${res.getResponseCode()}`);
          continue;
      }
      const json = JSON.parse(res.getContentText());
      const memo = json.memo || '';
      memoMap[hash] = memo;
      cache.put(`memo:${hash}`, memo, MEMO_CACHE_TTL);
      fetched.push(hash);
      memoFetchedCount++;
    } catch (e) {
      if (DEBUG) Logger.log(`Ошибка при загрузке memo для ${hash}: ${e.toString()}`);
      // Оставляем в очереди, если ошибка
    }
  }

  // Обновление листа TRANSFERS
  // Столбец I (9) - memo, Столбец J (10) - tx_hash (гиперссылка)
  const dataRange = transfersSheet.getRange(2, 9, transfersSheet.getLastRow() - 1, 2);
  const data = dataRange.getValues();
  const valuesToUpdate = [];

  for (let i = 0; i < data.length; i++) {
    const [memo, link] = data[i];
    
    // Если memo пустое И ссылка на транзакцию существует
    if (!memo && String(link).includes('transactions/')) {
      const hash = String(link).match(/transactions\/([A-Z0-9]+)/)?.[1];
      if (hash && memoMap[hash] !== undefined) {
        // Обновляем memo, если оно было получено
        valuesToUpdate.push([memoMap[hash], link]);
        continue;
      }
    }
    valuesToUpdate.push(data[i]);
  }
  dataRange.setValues(valuesToUpdate);

  // Удаляем обработанные (успешно или неуспешно) хэши из очереди
  const remaining = hashes.slice(batch.length);
  memoSheet.getRange(2, 1, memoSheet.getLastRow() - 1, 1).clearContent();
  if (remaining.length > 0) {
    memoSheet.getRange(2, 1, remaining.length, 1).setValues(remaining.map(h => [h]));
  }
  
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'syncTransfersMemos',
    fundKey: 'ALL',
    details: `Обработано ${batch.length} хэшей. Загружено из Horizon: ${memoFetchedCount}.`
  });
}

// ========== Утилиты ==========
function parseConstSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  const config = { fundAccounts: {} };
  let fundCount = 0;
  for (const [key, val] of rows) {
    if (!key) continue;
    const strVal = String(val).trim();
    if (key === 'HORIZON_URL') config.HORIZON_URL = strVal;
    else if (key === 'START_DATE') config.START_DATE = strVal;
    else if (key === 'END_DATE') config.END_DATE = strVal;
    else if (key === 'TOKEN_FILTER') config.TOKEN_FILTER = strVal;
    else if (key === 'RELAX_ROLE_FILTER') config.RELAX_ROLE_FILTER = strVal;
    else if (key === 'COUNTERPARTY_SCOPE') config.COUNTERPARTY_SCOPE = strVal;
    else if (key === 'include_native_xlm') config.include_native_xlm = strVal.toUpperCase() === 'TRUE';
    else if (key === 'asset_allowlist') config.asset_allowlist = strVal ? strVal.split(',').map(s => s.trim()) : [];
    else if (key === 'asset_blocklist') config.asset_blocklist = strVal ? strVal.split(',').map(s => s.trim()) : [];
    else if (key === 'min_amount') config.min_amount = parseFloat(strVal) || 0.01;
    else if (key === 'CLICKUP_API_KEY') config.CLICKUP_API_KEY = strVal;
    else if (key === 'CLICKUP_WORKSPACE_ID') config.CLICKUP_WORKSPACE_ID = strVal;
    else if (key === 'CLICKUP_LIST_IDS') config.CLICKUP_LIST_IDS = strVal ? strVal.split(',').map(s => s.trim()) : [];
    else if (strVal && strVal.startsWith('G')) {
      config.fundAccounts[key] = strVal;
      fundCount++;
    }
  }
  if (DEBUG) {
    Logger.log(`[parseConstSheet] fundAccounts=${fundCount}, hasHorizon=${!!config.HORIZON_URL}, startDate=${config.START_DATE || 'NONE'}, endDate=${config.END_DATE || 'NONE'}, tokenFilter=${config.TOKEN_FILTER || 'NONE'}, counterpartyScope=${config.COUNTERPARTY_SCOPE || 'FUND_RESIDENT_ONLY'}, includeNativeXLM=${config.include_native_xlm}, assetAllowlist=${config.asset_allowlist?.length || 0}, assetBlocklist=${config.asset_blocklist?.length || 0}, minAmount=${config.min_amount}, clickupApiKey=${!!config.CLICKUP_API_KEY}, clickupWorkspaceId=${config.CLICKUP_WORKSPACE_ID || 'NONE'}, clickupListIds=${config.CLICKUP_LIST_IDS?.length || 0}`);
  }
  return config;
}

function parseResidentsSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  const map = {};
  let totalAccounts = 0;
  let totalIssuers = 0;
  let skippedNoLabel = 0;
  // Предполагаем, что B=label (индекс 1), Q=Account_s (индекс 16), R=Asset_issuer (индекс 17)
  for (let i = 1; i < rows.length; i++) { // Начинаем с 1, пропуская заголовок
    const row = rows[i];
    const label = (row[1] || '').toString().trim();
    if (!label) {
      skippedNoLabel++;
      continue;
    }
    
    // Парсим Account_s (Q)
    const accounts = (row[16] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));
    
    // Парсим Asset_issuer (R)
    const issuers = (row[17] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));

    totalAccounts += accounts.length;
    totalIssuers += issuers.length;

    for (const a of [...accounts, ...issuers]) {
      if (a) map[a] = label;
    }
  }
  if (DEBUG) {
    Logger.log(`[parseResidentsSheet] rows=${rows.length - 1}, accounts=${totalAccounts}, issuers=${totalIssuers}, skippedNoLabel=${skippedNoLabel}, mapped=${Object.keys(map).length}`);
  }
  return map;
}

function parseAccountsSheet(sheet) {
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) { // Пропускаем заголовок
    const [acc, label] = rows[i];
    if (acc && label) map[String(acc).trim()] = String(label).trim();
  }
  return map;
}

function parseProjectMapSheet(sheet) {
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) { // Пропускаем заголовок
    const [projectId, clickupTaskId, stellarAccount, stellarIssuer, tokenSymbol, isActive] = rows[i];
    if (projectId && isActive !== false && isActive !== 'FALSE') {
      map[String(projectId).trim()] = {
        clickup_task_id: clickupTaskId ? String(clickupTaskId).trim() : null,
        stellar_account: stellarAccount ? String(stellarAccount).trim() : null,
        stellar_issuer: stellarIssuer ? String(stellarIssuer).trim() : null,
        token_symbol: tokenSymbol ? String(tokenSymbol).trim() : null
      };
    }
  }
  return map;
}

function buildProjectMapIndex_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PROJECT_MAP);
  const projectMap = parseProjectMapSheet(sheet);
  const index = {
    stellarAccountToProjectIds: {},
    stellarIssuerToProjectIds: {},
    tokenToProjectIds: {}
  };

  for (const projectId in projectMap) {
    const mapping = projectMap[projectId];
    if (mapping.stellar_account) {
      const acc = mapping.stellar_account;
      if (!index.stellarAccountToProjectIds[acc]) index.stellarAccountToProjectIds[acc] = [];
      if (!index.stellarAccountToProjectIds[acc].includes(projectId)) {
        index.stellarAccountToProjectIds[acc].push(projectId);
      }
    }
    if (mapping.stellar_issuer) {
      const iss = mapping.stellar_issuer;
      if (!index.stellarIssuerToProjectIds[iss]) index.stellarIssuerToProjectIds[iss] = [];
      if (!index.stellarIssuerToProjectIds[iss].includes(projectId)) {
        index.stellarIssuerToProjectIds[iss].push(projectId);
      }
    }
    if (mapping.token_symbol) {
      const tok = mapping.token_symbol;
      if (!index.tokenToProjectIds[tok]) index.tokenToProjectIds[tok] = [];
      if (!index.tokenToProjectIds[tok].includes(projectId)) {
        index.tokenToProjectIds[tok].push(projectId);
      }
    }
  }

  if (DEBUG) Logger.log(`[buildProjectMapIndex_] Built index with ${Object.keys(index.stellarAccountToProjectIds).length} accounts, ${Object.keys(index.stellarIssuerToProjectIds).length} issuers, ${Object.keys(index.tokenToProjectIds).length} tokens`);
  return index;
}

function buildResidentsIndex_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const projectMapSheet = ss.getSheetByName(SHEET_PROJECT_MAP);
  
  const projectMap = parseProjectMapSheet(projectMapSheet);
  
  // Инвертируем projectMap для быстрого поиска project_id по account/issuer
  const accountToProjectIds = {};
  const issuerToProjectIds = {};
  for (const projectId in projectMap) {
    const mapping = projectMap[projectId];
    if (mapping.stellar_account) {
      const acc = mapping.stellar_account;
      if (!accountToProjectIds[acc]) accountToProjectIds[acc] = [];
      accountToProjectIds[acc].push(projectId);
    }
    if (mapping.stellar_issuer) {
      const iss = mapping.stellar_issuer;
      if (!issuerToProjectIds[iss]) issuerToProjectIds[iss] = [];
      issuerToProjectIds[iss].push(projectId);
    }
  }

  const index = {
    accountToProjectIds: {},
    issuerToProjectIds: {}
  };

  // Читаем RESIDENTS напрямую для получения всех аккаунтов и эмитентов
  const rows = resSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Q=Account_s (16), R=Asset_issuer (17)
    const accounts = (row[16] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));
    const issuers = (row[17] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));

    for (const a of accounts) {
      if (accountToProjectIds[a]) {
        if (!index.accountToProjectIds[a]) index.accountToProjectIds[a] = [];
        accountToProjectIds[a].forEach(pid => {
          if (!index.accountToProjectIds[a].includes(pid)) index.accountToProjectIds[a].push(pid);
        });
      }
    }
    for (const iss of issuers) {
      if (issuerToProjectIds[iss]) {
        if (!index.issuerToProjectIds[iss]) index.issuerToProjectIds[iss] = [];
        issuerToProjectIds[iss].forEach(pid => {
          if (!index.issuerToProjectIds[iss].includes(pid)) index.issuerToProjectIds[iss].push(pid);
        });
      }
    }
  }

  if (DEBUG) Logger.log(`[buildResidentsIndex_] Built index with ${Object.keys(index.accountToProjectIds).length} accounts, ${Object.keys(index.issuerToProjectIds).length} issuers`);
  return index;
}

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
    // Проверим, есть ли такой project_id в PROJECT_MAP
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const projectMap = parseProjectMapSheet(ss.getSheetByName(SHEET_PROJECT_MAP));
    if (projectMap[projectIdFromMemo]) {
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

function classifyTransfer_(transfer, rules) {
  const { direction, counterpartyType, memo, class_override } = transfer;

  // Приоритет: class_override всегда имеет приоритет
  if (class_override && class_override.trim()) {
    return { class: class_override.trim(), class_reason: 'OVERRIDE' };
  }

  if (!CLASSIFY_ENABLE) {
    return { class: '', class_reason: 'DISABLED' };
  }

  const memoLower = (memo || '').toLowerCase();

  if (direction === 'OUT') {
    // OUT из fund_account → чаще Funding (если контрагент = RESIDENT)
    if (counterpartyType === 'RESIDENT') {
      return { class: 'Funding', class_reason: 'OUT_TO_RESIDENT' };
    } else {
      return { class: 'Funding', class_reason: 'OUT_DEFAULT' };
    }
  } else if (direction === 'IN') {
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
    } else {
      return { class: 'Dividend', class_reason: 'IN_DEFAULT' };
    }
  }

  return { class: '', class_reason: 'UNKNOWN_DIRECTION' };
}

/**
 * Переклассифицирует существующие транзакции в листе TRANSFERS.
 * Не трогает строки, где уже есть class_override.
 */
function reclassifyTransfers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!transfersSheet || transfersSheet.getLastRow() <= 1) return;

  const dataRange = transfersSheet.getRange(2, 1, transfersSheet.getLastRow() - 1, transfersSheet.getLastColumn());
  const data = dataRange.getValues();
  const headers = transfersSheet.getRange(1, 1, 1, transfersSheet.getLastColumn()).getValues()[0];

  const memoIdx = headers.indexOf('memo');
  const directionIdx = headers.indexOf('direction');
  const counterpartyTypeIdx = headers.indexOf('counterparty_type');
  const classIdx = headers.indexOf('class');
  const classOverrideIdx = headers.indexOf('class_override');

  if (memoIdx === -1 || directionIdx === -1 || counterpartyTypeIdx === -1 || classIdx === -1 || classOverrideIdx === -1) {
    SpreadsheetApp.getUi().alert('Необходимые колонки не найдены в TRANSFERS');
    return;
  }

  const rules = {
    MEMO_PATTERNS_REPAY: MEMO_PATTERNS_REPAY,
    MEMO_PATTERNS_DIVIDEND: MEMO_PATTERNS_DIVIDEND,
    MEMO_PATTERNS_OPEX: MEMO_PATTERNS_OPEX
  };

  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const classOverride = String(row[classOverrideIdx] || '').trim();
    
    // Если есть override, не трогаем
    if (classOverride) continue;

    const transfer = {
      direction: row[directionIdx],
      counterpartyType: row[counterpartyTypeIdx],
      memo: row[memoIdx],
      class_override: ''
    };

    const classification = classifyTransfer_(transfer, rules);
    if (classification.class !== row[classIdx]) {
      row[classIdx] = classification.class;
      count++;
    }
  }

  if (count > 0) {
    dataRange.setValues(data);
  }

  SpreadsheetApp.getUi().alert(`Переклассификация завершена. Обновлено строк: ${count}`);
  
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'reclassifyTransfers',
    fundKey: 'ALL',
    details: `Updated ${count} rows`
  });
}

/**
 * Перемапливает project_id для UNMAPPED/AMBIGUOUS транзакций в листе TRANSFERS.
 */
function remappingProjectIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  const anomaliesSheet = ss.getSheetByName(SHEET_ANOMALIES) || ss.insertSheet(SHEET_ANOMALIES);
  
  if (!transfersSheet || transfersSheet.getLastRow() <= 1) return;

  const dataRange = transfersSheet.getRange(2, 1, transfersSheet.getLastRow() - 1, transfersSheet.getLastColumn());
  const data = dataRange.getValues();
  const headers = transfersSheet.getRange(1, 1, 1, transfersSheet.getLastColumn()).getValues()[0];

  const fromIdx = headers.indexOf('from');
  const toIdx = headers.indexOf('to');
  const assetIssuerIdx = headers.indexOf('asset_issuer');
  const memoIdx = headers.indexOf('memo');
  const projectIdIdx = headers.indexOf('project_id');
  const txHashIdx = headers.indexOf('tx_hash');

  if (fromIdx === -1 || toIdx === -1 || assetIssuerIdx === -1 || memoIdx === -1 || projectIdIdx === -1 || txHashIdx === -1) {
    SpreadsheetApp.getUi().alert('Необходимые колонки не найдены в TRANSFERS');
    return;
  }

  const indexes = {
    projectMapIndex: buildProjectMapIndex_(),
    residentsIndex: buildResidentsIndex_()
  };

  const existingAnomalyKeys = getExistingAnomalyKeys(anomaliesSheet);
  const allAnomalyRows = [];
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const currentProjectId = String(row[projectIdIdx] || '').trim();

    // Перемапливаем только UNMAPPED, AMBIGUOUS или пустые
    if (currentProjectId && currentProjectId !== 'UNMAPPED' && currentProjectId !== 'AMBIGUOUS') continue;

    const txCell = String(row[txHashIdx]);
    const txHashMatch = txCell.match(/transactions\/(\w+)/) || txCell.match(/"([A-Z0-9]+)"\s*\)?$/i);
    let txHash = txHashMatch ? txHashMatch[1] : '';
    if (!txHash && /^[A-Z0-9]{10,}$/.test(txCell)) {
      txHash = txCell;
    }

    const transfer = {
      from: row[fromIdx],
      to: row[toIdx],
      asset_issuer: row[assetIssuerIdx],
      memo: row[memoIdx]
    };

    const mappingResult = mapProjectIdForTransfer_(transfer, indexes);
    if (mappingResult.project_id !== currentProjectId) {
      row[projectIdIdx] = mappingResult.project_id;
      count++;

      if (mappingResult.anomaly && txHash) {
        const anomalyKey = `${txHash}:${mappingResult.anomaly.reason}`;
        if (!existingAnomalyKeys.has(anomalyKey)) {
          allAnomalyRows.push([
            new Date(),
            txHash,
            mappingResult.anomaly.reason,
            JSON.stringify(mappingResult.anomaly),
            mappingResult.candidates.join(', ')
          ]);
          existingAnomalyKeys.add(anomalyKey);
        }
      }
    }
  }

  if (count > 0) {
    dataRange.setValues(data);
  }

  if (allAnomalyRows.length > 0) {
    const startRow = anomaliesSheet.getLastRow() + 1;
    anomaliesSheet.getRange(startRow, 1, allAnomalyRows.length, 5).setValues(allAnomalyRows);
  }

  SpreadsheetApp.getUi().alert(`Ремаппинг завершен. Обновлено строк: ${count}`);

  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'remappingProjectIds',
    fundKey: 'ALL',
    details: `Updated ${count} rows, added ${allAnomalyRows.length} anomalies`
  });
}

function fetchBSNLabels() {
  try {
    const json = UrlFetchApp.fetch('https://bsn.expert/json', { muteHttpExceptions: true });
    if (json.getResponseCode() !== 200) return {};
    const data = JSON.parse(json.getContentText());
    const map = {};
    for (const t of data.tokens || []) {
      if (t.accounts) for (const a of t.accounts) map[String(a).trim()] = t.label;
    }
    return map;
  } catch (e) {
    if (DEBUG) Logger.log(`Ошибка при загрузке BSN JSON: ${e.toString()}`);
    return {};
  }
}

function resolveLabel(addr, acc, fundAccounts, res, bsn) {
  // Приоритет: ACCOUNTS > CONST > RESIDENTS > BSN JSON
  addr = String(addr).trim();
  
  // 1. ACCOUNTS
  const accSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACCOUNTS);
  const accountsLabelMap = parseAccountsSheet(accSheet);
  if (accountsLabelMap[addr]) return accountsLabelMap[addr];
  
  // 2. CONST (фондовые аккаунты)
  const fundKey = Object.keys(fundAccounts).find(k => fundAccounts[k] === addr);
  if (fundKey) return fundKey;
  
  // 3. RESIDENTS
  const resSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RESIDENTS);
  const residentsMap = parseResidentsSheet(resSheet);
  if (residentsMap[addr]) return residentsMap[addr];
  
  // 4. BSN JSON
  const bsnLabelMap = fetchBSNLabels();
  if (bsnLabelMap[addr]) return bsnLabelMap[addr];
  
  return '';
}

function isFund(addr, fundAccounts) {
  return Object.values(fundAccounts).includes(String(addr).trim());
}

function isResident(addr, residentsMap) {
  return String(addr).trim() in residentsMap;
}

function normalizeTokenPart(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeAssetKey_(value) {
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

function fetchAllPayments(baseUrl, fundKey, endDate, log) {
  const out = [];
  let next = baseUrl;
  while (next) {
    try {
      const res = UrlFetchApp.fetch(next, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
          if (DEBUG) Logger.log(`[${fundKey}] Ошибка Horizon API: ${res.getResponseCode()}, URL: ${next}`);
          break;
      }
      const json = JSON.parse(res.getContentText());
      const records = json._embedded?.records || [];
      
      if (records.length === 0) break;
      
      out.push(...records);
      const last = records[records.length - 1];
      
      // Проверка на выход за END_DATE
      if (endDate && new Date(last.created_at) > endDate) {
          if (DEBUG) Logger.log(`[${fundKey}] Прекращение чтения: достигнута END_DATE`);
          break;
      }
      
      const nextLink = json._links?.next?.href;
      if (!nextLink) break;
      next = nextLink;

    } catch (e) {
      if (DEBUG) Logger.log(`[${fundKey}] Критическая ошибка при fetchAllPayments: ${e.toString()}`);
      break;
    }
  }
  return out;
}

function fetchTransactionMemo_(txHash, horizon, cache, log) {
  const cached = cache.get(`memo:${txHash}`);
  if (cached !== null) {
    if (log) log.memoCacheHit++;
    return cached;
  }

  try {
    const res = UrlFetchApp.fetch(`${horizon}/transactions/${txHash}`, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      if (log) log.memoErrors++;
      if (DEBUG) Logger.log(`Ошибка Horizon API при загрузке memo для ${txHash}: ${res.getResponseCode()}`);
      return '';
    }
    const json = JSON.parse(res.getContentText());
    const memo = json.memo || '';
    cache.put(`memo:${txHash}`, memo, MEMO_CACHE_TTL);
    if (log) log.memoFetched++;
    return memo;
  } catch (e) {
    if (log) log.memoErrors++;
    if (DEBUG) Logger.log(`Ошибка при загрузке memo для ${txHash}: ${e.toString()}`);
    return '';
  }
}

function writeDebugLog(logObj, overwriteLast = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DEBUG) || ss.insertSheet(SHEET_DEBUG);

  // Поддержка обратной совместимости: если переданы stage, fundKey, details - конвертировать
  if (typeof logObj === 'string' || (logObj.stage && logObj.fundKey && logObj.details && !logObj.timestamp)) {
    // Старый формат: writeDebugLog(stage, fundKey, details)
    const stage = typeof logObj === 'string' ? arguments[0] : logObj.stage;
    const fundKey = arguments[1] || logObj.fundKey;
    const details = arguments[2] || logObj.details;
    logObj = {
      timestamp: new Date().toISOString(),
      stage: stage,
      fund_key: fundKey,
      details_json: details
    };
  } else {
    // Новый формат: объект
    logObj.timestamp = logObj.timestamp || new Date().toISOString();
  }

  // Обработать специальные поля
  if (logObj.classified_counts) {
    logObj.classified_counts_json = JSON.stringify(logObj.classified_counts);
  }
  if (logObj.errors) {
    logObj.errors = typeof logObj.errors === 'object' && logObj.errors.stack ? logObj.errors.stack : String(logObj.errors);
  }

  // Убедиться, что заголовки обновлены
  upgradeDebugLogSheet();

  // Получить текущие заголовки для маппинга колонок
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = {};
  headers.forEach((h, i) => headerMap[h] = i + 1); // 1-based

  // Создать массив для записи, в порядке заголовков
  const logArray = [];
  const requiredHeaders = ['timestamp', 'run_id', 'module', 'stage', 'fund_key', 'cursor_before', 'cursor_after', 'api_calls', 'rows_fetched', 'rows_appended', 'dedup_skipped', 'unmapped_count', 'ambiguous_count', 'classified_counts_json', 'errors', 'details_json'];

  for (const h of requiredHeaders) {
    if (headerMap[h]) {
      logArray[headerMap[h] - 1] = logObj[h] || '';
    }
  }

  // Записать в лист
  if (overwriteLast && sheet.getLastRow() > 0) {
    sheet.getRange(sheet.getLastRow(), 1, 1, logArray.length).setValues([logArray]);
  } else {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, 1, logArray.length).setValues([logArray]);
  }

  if (DEBUG) Logger.log(JSON.stringify(logObj));
}

function readLastDebugLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DEBUG);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  try {
    const lastRow = sheet.getRange(sheet.getLastRow(), 4).getValue();
    return JSON.parse(lastRow);
  } catch (e) {
    return null;
  }
}

/**
 * Обновляет заголовки листа DEBUG_LOG, добавляя недостающие колонки.
 */
function upgradeDebugLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DEBUG) || ss.insertSheet(SHEET_DEBUG);
  const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  let headers = headersRange.getValues()[0];

  // Если лист пуст, добавить базовые заголовки
  if (sheet.getLastRow() === 0) {
    const baseHeaders = ['timestamp', 'stage', 'fundKey', 'details_json'];
    sheet.appendRow(baseHeaders);
    headers = baseHeaders;
  }

  // Новые колонки в порядке добавления
  const newCols = ['run_id', 'module', 'fund_key', 'cursor_before', 'cursor_after', 'api_calls', 'rows_fetched', 'rows_appended', 'dedup_skipped', 'unmapped_count', 'ambiguous_count', 'classified_counts_json', 'errors', 'details_json'];

  // Проверить, какие колонки отсутствуют
  const existingCols = new Set(headers);
  const missing = newCols.filter(col => !existingCols.has(col));

  if (missing.length > 0) {
    // Добавить недостающие колонки справа
    const startCol = headers.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'upgradeDebugLogSheet',
      fundKey: '',
      details: 'Added columns: ' + missing.join(', ')
    });
  }
}

// ========== ClickUp API интеграция ==========

/**
 * Базовый метод для вызовов ClickUp API
 * @param {string} endpoint - API endpoint (без базового URL)
 * @param {string} method - HTTP метод (GET, POST, etc.)
 * @param {Object} headers - Дополнительные заголовки
 * @param {Object} payload - Тело запроса для POST/PUT
 * @returns {Object} - Ответ API
 */
function callClickUpAPI(endpoint, method = 'GET', headers = {}, payload = null) {
  const constSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const apiKey = config.CLICKUP_API_KEY;

  if (!apiKey) {
    throw new Error('CLICKUP_API_KEY не найден в CONST листе');
  }

  const baseUrl = 'https://api.clickup.com/api/v2';
  const url = `${baseUrl}${endpoint}`;

  const defaultHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  const finalHeaders = { ...defaultHeaders, ...headers };

  const options = {
    method: method,
    headers: finalHeaders,
    muteHttpExceptions: true
  };

  if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.payload = JSON.stringify(payload);
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(responseText);
    } else {
      throw new Error(`ClickUp API error ${responseCode}: ${responseText}`);
    }
  } catch (e) {
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'callClickUpAPI',
      fundKey: 'ERROR',
      details: `API call failed: ${e.toString()}, endpoint: ${endpoint}`
    });
    throw e;
  }
}

/**
 * Получает структуру workspace: Spaces, Folders, Lists
 * @returns {Array} - Массив объектов структуры
 */
function getWorkspaceStructure() {
  const constSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const workspaceId = config.CLICKUP_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error('CLICKUP_WORKSPACE_ID не найден в CONST листе');
  }

  const structure = [];

  // Получить spaces
  const spacesResponse = callClickUpAPI(`/team/${workspaceId}/space?archived=false`);
  const spaces = spacesResponse.spaces || [];

  for (const space of spaces) {
    structure.push({
      type: 'Space',
      id: space.id,
      name: space.name,
      parent_id: null,
      status_options: null,
      custom_field_config: null
    });

    // Получить folders в space
    const foldersResponse = callClickUpAPI(`/space/${space.id}/folder?archived=false`);
    const folders = foldersResponse.folders || [];

    for (const folder of folders) {
      structure.push({
        type: 'Folder',
        id: folder.id,
        name: folder.name,
        parent_id: space.id,
        status_options: null,
        custom_field_config: null
      });

      // Получить lists в folder
      const listsResponse = callClickUpAPI(`/folder/${folder.id}/list?archived=false`);
      const lists = listsResponse.lists || [];

      for (const list of lists) {
        structure.push({
          type: 'List',
          id: list.id,
          name: list.name,
          parent_id: folder.id,
          status_options: null,
          custom_field_config: null
        });
      }
    }

    // Lists напрямую в space (без folder)
    const spaceListsResponse = callClickUpAPI(`/space/${space.id}/list?archived=false`);
    const spaceLists = spaceListsResponse.lists || [];

    for (const list of spaceLists) {
      structure.push({
        type: 'List',
        id: list.id,
        name: list.name,
        parent_id: space.id,
        status_options: null,
        custom_field_config: null
      });
    }
  }

  return structure;
}

/**
 * Получает статусы для списка
 * @param {string} listId - ID списка
 * @returns {Array} - Массив статусов
 */
function getListStatuses(listId) {
  const response = callClickUpAPI(`/list/${listId}`);
  return response.statuses || [];
}

/**
 * Получает кастомные поля для списка
 * @param {string} listId - ID списка
 * @returns {Array} - Массив кастомных полей
 */
function getCustomFields(listId) {
  const response = callClickUpAPI(`/list/${listId}/field`);
  return response.fields || [];
}

/**
 * Получает пользователей workspace
 * @returns {Array} - Массив пользователей
 */
function getWorkspaceUsers() {
  const constSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const workspaceId = config.CLICKUP_WORKSPACE_ID;

  if (!workspaceId) {
    throw new Error('CLICKUP_WORKSPACE_ID не найден в CONST листе');
  }

  const response = callClickUpAPI(`/team/${workspaceId}`);
  const members = response.members || [];
  return members.map(member => ({
    id: member.user.id,
    name: `${member.user.username} (${member.user.email})`
  }));
}

/**
 * Inventory mode: собирает и записывает схему ClickUp в CLICKUP_SCHEMA
 */
function clickupInventory() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemaSheet = ss.getSheetByName(SHEET_CLICKUP_SCHEMA) || ss.insertSheet(SHEET_CLICKUP_SCHEMA);

  // Инициализировать заголовки если нужно
  if (schemaSheet.getLastRow() === 0) {
    schemaSheet.appendRow(['type', 'id', 'name', 'parent_id', 'status_options', 'custom_field_config']);
  }

  try {
    // Получить структуру
    const structure = getWorkspaceStructure();

    // Получить пользователей
    const users = getWorkspaceUsers();

    // Получить статусы и поля для списков
    const constSheet = ss.getSheetByName(SHEET_CONST);
    const config = parseConstSheet(constSheet);
    const listIds = config.CLICKUP_LIST_IDS || [];

    for (const item of structure) {
      if (item.type === 'List' && listIds.includes(String(item.id))) {
        // Статусы
        const statuses = getListStatuses(item.id);
        item.status_options = JSON.stringify(statuses);

        // Кастомные поля
        const fields = getCustomFields(item.id);
        item.custom_field_config = JSON.stringify(fields);
      }
    }

    // Добавить пользователей
    for (const user of users) {
      structure.push({
        type: 'User',
        id: user.id,
        name: user.name,
        parent_id: null,
        status_options: null,
        custom_field_config: null
      });
    }

    // Очистить старые данные
    const lastRow = schemaSheet.getLastRow();
    if (lastRow > 1) {
      schemaSheet.getRange(2, 1, lastRow - 1, 6).clearContent();
    }

    // Записать новые данные
    const rows = structure.map(item => [
      item.type,
      item.id,
      item.name,
      item.parent_id,
      item.status_options,
      item.custom_field_config
    ]);

    if (rows.length > 0) {
      schemaSheet.getRange(2, 1, rows.length, 6).setValues(rows);
    }

    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'clickupInventory',
      fundKey: 'SUCCESS',
      details: `Inventory completed: ${structure.length} items recorded`
    });

  } catch (e) {
    writeDebugLog({
      run_id,
      module: 'clickup',
      timestamp: new Date().toISOString(),
      stage: 'clickupInventory',
      fundKey: 'ERROR',
      details: `Inventory failed: ${e.toString()}`
    });
    throw e;
  }
}

/**
 * Получает задачи из указанных списков
 * @param {Array} listIds - Массив ID списков
 * @param {string} lastUpdated - Дата последнего обновления (ISO string)
 * @returns {Array} - Массив задач
 */
function getTasksFromLists(listIds, lastUpdated = null) {
  const allTasks = [];

  for (const listId of listIds) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        page: page,
        archived: false,
        include_closed: true
      });

      if (lastUpdated) {
        params.append('date_updated_gt', Math.floor(new Date(lastUpdated).getTime() / 1000));
      }

      const response = callClickUpAPI(`/list/${listId}/task?${params.toString()}`);
      const tasks = response.tasks || [];

      if (tasks.length === 0) {
        hasMore = false;
      } else {
        allTasks.push(...tasks);
        page++;
        // Ограничение на 100 страниц для безопасности
        if (page > 100) hasMore = false;
      }
    }
  }

  return allTasks;
}

/**
 * Парсит данные задачи ClickUp
 * @param {Object} task - Задача из API
 * @returns {Object} - Парсированные данные
 */
function parseTaskData(task) {
  const customFields = {};
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      customFields[field.name] = field.value;
    }
  }

  // Найти project_id из custom fields
  const projectId = customFields['Project_ID'] || customFields['project_id'] || null;

  return {
    task_id: task.id,
    project_id: projectId,
    name: task.name,
    status: task.status?.status || '',
    assignee: task.assignees?.map(a => a.username).join(', ') || '',
    due_date: task.due_date ? new Date(parseInt(task.due_date)) : null,
    updated_at: new Date(task.date_updated || task.date_created),
    folder_link: `https://app.clickup.com/t/${task.id}`,
    custom_fields_json: JSON.stringify(customFields)
  };
}

/**
 * Sync mode: синхронизирует задачи ClickUp в CLICKUP_TASKS
 */
function syncClickUpTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = ss.getSheetByName(SHEET_CLICKUP_TASKS) || ss.insertSheet(SHEET_CLICKUP_TASKS);

  // Инициализировать заголовки если нужно
  if (tasksSheet.getLastRow() === 0) {
    tasksSheet.appendRow(['task_id', 'project_id', 'name', 'status', 'assignee', 'due_date', 'updated_at', 'folder_link', 'custom_fields_json']);
    tasksSheet.getRange('F:F').setNumberFormat('dd-mm-yyyy');
    tasksSheet.getRange('G:G').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }

  try {
    const constSheet = ss.getSheetByName(SHEET_CONST);
    const config = parseConstSheet(constSheet);
    const listIds = config.CLICKUP_LIST_IDS || [];

    if (listIds.length === 0) {
      throw new Error('CLICKUP_LIST_IDS не заданы в CONST листе');
    }

    // Найти последнюю дату обновления в существующих задачах
    const lastRow = tasksSheet.getLastRow();
    let lastUpdated = null;
    if (lastRow > 1) {
      const lastUpdatedCell = tasksSheet.getRange(lastRow, 7).getValue(); // updated_at в колонке G (7)
      if (lastUpdatedCell) {
        lastUpdated = new Date(lastUpdatedCell).toISOString();
      }
    }

    // Получить задачи
    const tasks = getTasksFromLists(listIds, lastUpdated);

    // Парсить данные
    const parsedTasks = tasks.map(parseTaskData);

    // Записать новые задачи
    if (parsedTasks.length > 0) {
      const rows = parsedTasks.map(task => [
        task.task_id,
        task.project_id,
        task.name,
        task.status,
        task.assignee,
        task.due_date,
        task.updated_at,
        task.folder_link,
        task.custom_fields_json
      ]);

      const startRow = tasksSheet.getLastRow() + 1;
      tasksSheet.getRange(startRow, 1, rows.length, 9).setValues(rows);
    }

    // Проверить на неоднозначности Project_ID
    const anomalies = [];
    for (const task of parsedTasks) {
      if (!task.project_id) {
        anomalies.push({
          timestamp: new Date().toISOString(),
          tx_hash: task.task_id, // Используем task_id как идентификатор
          issue_type: 'MISSING_PROJECT_ID',
          details: `Задача "${task.name}" не имеет Project_ID`,
          suggested_project_id: null
        });
      }
    }

    // Записать аномалии
    if (anomalies.length > 0) {
      const anomaliesSheet = ss.getSheetByName(SHEET_ANOMALIES) || ss.insertSheet(SHEET_ANOMALIES);
      if (anomaliesSheet.getLastRow() === 0) {
        anomaliesSheet.appendRow(['timestamp', 'tx_hash', 'issue_type', 'details', 'suggested_project_id']);
        anomaliesSheet.getRange('A:A').setNumberFormat('dd-mm-yyyy hh:mm:ss');
      }

      const anomalyRows = anomalies.map(a => [
        new Date(a.timestamp),
        a.tx_hash,
        a.issue_type,
        a.details,
        a.suggested_project_id
      ]);

      const startRow = anomaliesSheet.getLastRow() + 1;
      anomaliesSheet.getRange(startRow, 1, anomalyRows.length, 5).setValues(anomalyRows);
    }

    // Обновить резидентов только для задач с Project_ID
    const validTasks = parsedTasks.filter(t => t.project_id);
    updateResidentsFromTasks(validTasks);

    writeDebugLog({
      run_id,
      module: 'clickup',
      timestamp: new Date().toISOString(),
      stage: 'syncClickUpTasks',
      fundKey: 'SUCCESS',
      details: `Sync completed: ${parsedTasks.length} tasks processed, ${anomalies.length} anomalies recorded`
    });

  } catch (e) {
    writeDebugLog({
      run_id,
      module: 'clickup',
      timestamp: new Date().toISOString(),
      stage: 'syncClickUpTasks',
      fundKey: 'ERROR',
      details: `Sync failed: ${e.toString()}`
    });
    throw e;
  }
}

/**
 * Обновляет RESIDENTS на основе задач ClickUp
 * @param {Array} tasks - Массив парсированных задач
 */
function updateResidentsFromTasks(tasks) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const residentsSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const projectMapSheet = ss.getSheetByName(SHEET_PROJECT_MAP);

  if (!residentsSheet) return;

  const projectMap = parseProjectMapSheet(projectMapSheet);
  const residentsData = residentsSheet.getDataRange().getValues();
  const headers = residentsData[0];

  // Найти индексы колонок
  const curatorIdx = headers.indexOf('Curator');
  const caseStatusIdx = headers.indexOf('Case_Status');
  const nextActionIdx = headers.indexOf('Next_Action');
  const nextActionDueIdx = headers.indexOf('Next_Action_Due');
  const nextPaymentDueIdx = headers.indexOf('Next_Payment_Due');
  const workStatusIdx = headers.indexOf('Work_Status/Notes');

  if (curatorIdx === -1 || nextActionIdx === -1 || nextActionDueIdx === -1 || nextPaymentDueIdx === -1) {
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'updateResidentsFromTasks',
      fundKey: 'WARNING',
      details: 'Не найдены необходимые колонки в RESIDENTS для обновления'
    });
    return;
  }

  const updates = [];

  for (const task of tasks) {
    if (!task.project_id) continue;

    const mapping = projectMap[task.project_id];
    if (!mapping) continue;

    // Найти строку резидента по project_id (предполагаем, что project_id соответствует какому-то идентификатору в RESIDENTS)
    // Для простоты, ищем по имени или другому полю, но поскольку ТЗ говорит "по PROJECT_MAP", используем mapping
    // Предполагаем, что в RESIDENTS есть колонка с project_id или используем mapping для поиска

    // Простая логика: обновляем по имени задачи или custom fields
    // В ТЗ: обновлять поля Curator, Next_Action, Next_Action_Due, Next_Payment_Due, Work_Status/Notes, Folder_Link

    // Для демонстрации, найдем строку по имени (если совпадает с task.name или custom field)
    // Но лучше использовать project_id для поиска в RESIDENTS

    // Предположим, что в RESIDENTS есть колонка 'Project_ID' или используем mapping.stellar_account для поиска

    let residentRowIdx = -1;
    for (let i = 1; i < residentsData.length; i++) {
      const row = residentsData[i];
      // Ищем по project_id в какой-то колонке, скажем по имени или custom
      // Для упрощения, если task.project_id совпадает с каким-то полем
      // В реальности нужно определить логику поиска

      // Используем mapping для обновления конкретных резидентов
      // Но поскольку mapping имеет stellar_account, найдем по нему

      const accountColIdx = headers.indexOf('Account_s'); // Предполагаем колонку Account_s
      if (accountColIdx !== -1 && row[accountColIdx] && String(row[accountColIdx]).trim() === mapping.stellar_account) {
        residentRowIdx = i;
        break;
      }
    }

    if (residentRowIdx === -1) continue;

    // Обновить поля
    const customFields = JSON.parse(task.custom_fields_json || '{}');

    const update = {
      row: residentRowIdx + 1, // 1-based
      curator: customFields['Curator'] || task.assignee,
      nextAction: customFields['Next_Action'] || task.name,
      nextActionDue: task.due_date,
      nextPaymentDue: customFields['Next_Payment_Due'] ? new Date(customFields['Next_Payment_Due']) : null,
      workStatus: customFields['Work_Status'] || task.status,
      folderLink: task.folder_link
    };

    updates.push(update);
  }

  // Применить обновления
  for (const update of updates) {
    if (curatorIdx !== -1) residentsSheet.getRange(update.row, curatorIdx + 1).setValue(update.curator);
    if (nextActionIdx !== -1) residentsSheet.getRange(update.row, nextActionIdx + 1).setValue(update.nextAction);
    if (nextActionDueIdx !== -1 && update.nextActionDue) residentsSheet.getRange(update.row, nextActionDueIdx + 1).setValue(update.nextActionDue);
    if (nextPaymentDueIdx !== -1 && update.nextPaymentDue) residentsSheet.getRange(update.row, nextPaymentDueIdx + 1).setValue(update.nextPaymentDue);
    if (workStatusIdx !== -1) residentsSheet.getRange(update.row, workStatusIdx + 1).setValue(update.workStatus);
    // Folder_Link колонка, если есть
    const folderLinkIdx = headers.indexOf('Folder_Link');
    if (folderLinkIdx !== -1) residentsSheet.getRange(update.row, folderLinkIdx + 1).setValue(update.folderLink);
  }

  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'updateResidentsFromTasks',
    fundKey: 'SUCCESS',
    details: `Updated ${updates.length} residents`
  });
}

// ========== Функция для показа диалога транзакций между адресами ==========
function showTransactionsBetweenAddresses() {
  const ui = SpreadsheetApp.getUi();

  // Запрос параметров
  const fromAddrResponse = ui.prompt('Введите адрес отправителя (fromAddr):', ui.ButtonSet.OK_CANCEL);
  if (fromAddrResponse.getSelectedButton() !== ui.Button.OK) return;
  const fromAddr = fromAddrResponse.getResponseText().trim();

  const toAddrResponse = ui.prompt('Введите адрес получателя (toAddr):', ui.ButtonSet.OK_CANCEL);
  if (toAddrResponse.getSelectedButton() !== ui.Button.OK) return;
  const toAddr = toAddrResponse.getResponseText().trim();

  const assetCodeResponse = ui.prompt('Введите код актива (assetCode):', ui.ButtonSet.OK_CANCEL);
  if (assetCodeResponse.getSelectedButton() !== ui.Button.OK) return;
  const assetCode = assetCodeResponse.getResponseText().trim();

  const assetIssuerResponse = ui.prompt('Введите адрес эмитента актива (assetIssuer, опционально):', ui.ButtonSet.OK_CANCEL);
  if (assetIssuerResponse.getSelectedButton() !== ui.Button.OK) return;
  const assetIssuer = assetIssuerResponse.getResponseText().trim() || '';

  const startDateResponse = ui.prompt('Введите начальную дату (YYYY-MM-DD, опционально):', ui.ButtonSet.OK_CANCEL);
  if (startDateResponse.getSelectedButton() !== ui.Button.OK) return;
  const startDateStr = startDateResponse.getResponseText().trim();
  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00Z') : null;

  const endDateResponse = ui.prompt('Введите конечную дату (YYYY-MM-DD, опционально):', ui.ButtonSet.OK_CANCEL);
  if (endDateResponse.getSelectedButton() !== ui.Button.OK) return;
  const endDateStr = endDateResponse.getResponseText().trim();
  const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59Z') : null;

  // Валидация
  const errors = [];
  if (!isValidStellarAddress(fromAddr)) errors.push('Неверный адрес отправителя (должен начинаться с G и иметь 56 символов)');
  if (!isValidStellarAddress(toAddr)) errors.push('Неверный адрес получателя (должен начинаться с G и иметь 56 символов)');
  if (fromAddr === toAddr) errors.push('Адреса отправителя и получателя не могут быть одинаковыми');
  if (!assetCode) errors.push('Код актива обязателен');
  if (assetIssuer && !isValidStellarAddress(assetIssuer)) errors.push('Неверный адрес эмитента актива (должен начинаться с G и иметь 56 символов)');
  if (startDate && isNaN(startDate.getTime())) errors.push('Неверный формат начальной даты (используйте YYYY-MM-DD)');
  if (endDate && isNaN(endDate.getTime())) errors.push('Неверный формат конечной даты (используйте YYYY-MM-DD)');
  if (startDate && endDate && startDate > endDate) errors.push('Начальная дата не может быть позже конечной');

  if (errors.length > 0) {
    ui.alert('Ошибки валидации:\n' + errors.join('\n'));
    return;
  }

  // Вызов функции
  try {
    fetchTransactionsBetweenAddresses(fromAddr, toAddr, assetCode, assetIssuer, startDate, endDate);
    ui.alert('Транзакции успешно загружены в лист ' + SHEET_ADDRESS_TRANSACTIONS);
  } catch (e) {
    ui.alert('Ошибка при загрузке транзакций: ' + e.toString());
  }
}

// ========== Вспомогательные функции валидации ==========
function isValidStellarAddress(addr) {
  return addr && addr.startsWith('G') && addr.length === 56;
}

// ========== Функция для получения транзакций между двумя адресами ==========
function fetchTransactionsBetweenAddresses(fromAddr, toAddr, assetCode, assetIssuer, startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const horizon = config.HORIZON_URL;
  const addresses = [fromAddr, toAddr];
  const cache = CacheService.getScriptCache();

  const log = {
    timestamp: new Date().toISOString(),
    stage: 'fetchTransactionsBetweenAddresses',
    fromAddr,
    toAddr,
    assetCode,
    assetIssuer,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    fetchedTotal: 0,
    filteredDirection: 0,
    filteredAsset: 0,
    filteredDate: 0,
    duplicatesRemoved: 0,
    memoCacheHit: 0,
    memoFetched: 0,
    memoErrors: 0,
    finalRows: 0
  };

  const allPayments = [];
  const txHashes = new Set();

  // Запрос платежей для каждого адреса
  for (const addr of addresses) {
    const url = `${horizon}/accounts/${addr}/payments?order=asc&limit=200`;
    Logger.log(`[fetchTransactionsBetweenAddresses] Запрос платежей для ${addr}: ${url}`);
    const payments = fetchAllPayments(url, addr, null, log); // Используем fetchAllPayments, передаем null для endDate чтобы получить все
    allPayments.push(...payments);
    log.fetchedTotal += payments.length;
    Logger.log(`[fetchTransactionsBetweenAddresses] Получено ${payments.length} платежей для ${addr}`);
  }

  // Фильтрация и обработка
  const filteredPayments = [];
  const uniqueTx = new Set();

  for (const rec of allPayments) {
    // Фильтрация по направлению: только между fromAddr и toAddr
    const from = rec.from || '';
    const to = rec.to || '';
    if (!((from === fromAddr && to === toAddr) || (from === toAddr && to === fromAddr))) {
      Logger.log(`[fetchTransactionsBetweenAddresses] Пропущен по направлению: from=${from}, to=${to}`);
      continue;
    }
    log.filteredDirection++;

    // Фильтрация по активу
    const recAssetCode = rec.asset_code || '';
    const recAssetIssuer = rec.asset_issuer || '';
    if (recAssetCode !== assetCode || recAssetIssuer !== assetIssuer) {
      Logger.log(`[fetchTransactionsBetweenAddresses] Пропущен по активу: ${recAssetCode}:${recAssetIssuer} != ${assetCode}:${assetIssuer}`);
      continue;
    }
    log.filteredAsset++;

    // Фильтрация по дате
    const dt = new Date(rec.created_at);
    if ((startDate && dt < startDate) || (endDate && dt > endDate)) {
      Logger.log(`[fetchTransactionsBetweenAddresses] Пропущен по дате: ${dt}`);
      continue;
    }
    log.filteredDate++;

    // Удаление дубликатов
    const txHash = rec.transaction_hash;
    if (uniqueTx.has(txHash)) {
      Logger.log(`[fetchTransactionsBetweenAddresses] Дубликат: ${txHash}`);
      continue;
    }
    uniqueTx.add(txHash);
    log.duplicatesRemoved++; // Это счетчик до удаления, но фактически удаляем

    const memoText = fetchTransactionMemo_(txHash, horizon, cache, log);

    filteredPayments.push({
      datetime: dt,
      from,
      to,
      asset: recAssetCode,
      amount: parseFloat(rec.amount),
      memo: memoText,
      tx_hash: txHash
    });
  }

  // Сортировка по дате
  filteredPayments.sort((a, b) => a.datetime - b.datetime);

  log.finalRows = filteredPayments.length;

  // Запись в лист
  const sheet = ss.getSheetByName(SHEET_ADDRESS_TRANSACTIONS) || ss.insertSheet(SHEET_ADDRESS_TRANSACTIONS);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['datetime', 'from', 'to', 'asset', 'amount', 'memo', 'tx_hash']);
    sheet.getRange('E:E').setNumberFormat('0,########'); // Amount
    sheet.getRange('A:A').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Datetime
  }

  // Очистка старых данных
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  }

  // Запись новых данных
  if (filteredPayments.length > 0) {
    const rows = filteredPayments.map(p => [
      p.datetime,
      p.from,
      p.to,
      p.asset,
      p.amount,
      p.memo,
      `=HYPERLINK("${horizon.replace('/horizon', '')}/transactions/${p.tx_hash}"; "${p.tx_hash}")`
    ]);
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  }

  // Логирование
  writeDebugLog(log);
}

// ========== Тестовая функция ==========
function testFetchTransactionsBetweenAddresses() {
  const fromAddr = 'GBGGX7QD3JCPFKOJTLBRAFU3SIME3WSNDXETWI63EDCORLBB6HIP2CRR'; // Binance USDC hot wallet
  const toAddr = 'GCKCV7T56CAPFUYMCQUYSEUMZRC7GA7CAQ2BOL3RPS4NQXDTRCSULMFB'; // Known USDC holder
  const assetCode = 'EURMTL';
  const assetIssuer = 'GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V'; // Centre issuer
  const startDate = new Date('2022-01-01T00:00:00Z');
  const endDate = new Date('2026-01-01T23:59:59Z');
  try {
    fetchTransactionsBetweenAddresses(fromAddr, toAddr, assetCode, assetIssuer, startDate, endDate);
    Logger.log('Тест завершен успешно.');
  } catch (e) {
    Logger.log('Ошибка в тесте: ' + e.toString());
  }
}
// ========== Инициализация новых листов ==========
function initializeClickUpSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLICKUP_SCHEMA) || ss.insertSheet(SHEET_CLICKUP_SCHEMA);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['type', 'id', 'name', 'parent_id', 'status_options', 'custom_field_config']);
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeClickUpSchema',
    fundKey: SHEET_CLICKUP_SCHEMA,
    details: 'Initialized sheet with headers'
  });
}

function initializeClickUpTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLICKUP_TASKS) || ss.insertSheet(SHEET_CLICKUP_TASKS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['task_id', 'project_id', 'name', 'status', 'assignee', 'due_date', 'updated_at', 'folder_link', 'custom_fields_json']);
    sheet.getRange('F:F').setNumberFormat('dd-mm-yyyy');
    sheet.getRange('G:G').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeClickUpTasks',
    fundKey: SHEET_CLICKUP_TASKS,
    details: 'Initialized sheet with headers and formatting'
  });
}

function initializeProjectMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_PROJECT_MAP) || ss.insertSheet(SHEET_PROJECT_MAP);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['project_id', 'clickup_task_id', 'stellar_account', 'stellar_issuer', 'token_symbol', 'is_active']);
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeProjectMap',
    fundKey: SHEET_PROJECT_MAP,
    details: 'Initialized sheet with headers'
  });
}

function initializeAnomalies() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ANOMALIES) || ss.insertSheet(SHEET_ANOMALIES);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'tx_hash', 'issue_type', 'details', 'suggested_project_id']);
    sheet.getRange('A:A').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeAnomalies',
    fundKey: SHEET_ANOMALIES,
    details: 'Initialized sheet with headers and formatting'
  });
}

function initializeFactMonthly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_FACT_MONTHLY) || ss.insertSheet(SHEET_FACT_MONTHLY);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['month', 'project_id', 'class', 'amount_asset', 'asset_code', 'asset_issuer', 'tags', 'is_pif']);
    sheet.getRange('A:A').setNumberFormat('yyyy-mm');
    sheet.getRange('D:D').setNumberFormat('0.00');
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeFactMonthly',
    fundKey: SHEET_FACT_MONTHLY,
    details: 'Initialized sheet with headers and formatting'
  });
}

function initializeKpiRaw() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_KPI_RAW) || ss.insertSheet(SHEET_KPI_RAW);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['metric', 'value', 'details']);
  }
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeKpiRaw',
    fundKey: SHEET_KPI_RAW,
    details: 'Initialized sheet with headers'
  });
}

function buildFactMonthly() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  const factSheet = ss.getSheetByName(SHEET_FACT_MONTHLY) || ss.insertSheet(SHEET_FACT_MONTHLY);

  if (!transfersSheet || transfersSheet.getLastRow() <= 1) {
    writeDebugLog({
      run_id,
      module: 'aggregate',
      timestamp: new Date().toISOString(),
      stage: 'buildFactMonthly',
      fundKey: 'ERROR',
      details: 'TRANSFERS sheet is empty or not found'
    });
    return;
  }

  // Инициализировать FACT_MONTHLY если нужно
  if (factSheet.getLastRow() === 0) {
    initializeFactMonthly();
  }

  const transfersData = transfersSheet.getDataRange().getValues();
  const headers = transfersData[0];

  // Найти индексы колонок
  const datetimeIdx = headers.indexOf('datetime');
  const amountIdx = headers.indexOf('amount');
  const fundAccountKeyIdx = headers.indexOf('fund_account_key');
  const assetCodeIdx = headers.indexOf('asset_code');
  const assetIssuerIdx = headers.indexOf('asset_issuer');
  const projectIdIdx = headers.indexOf('project_id');
  const classIdx = headers.indexOf('class');
  const tagsIdx = headers.indexOf('tags');

  if (datetimeIdx === -1 || amountIdx === -1 || fundAccountKeyIdx === -1 || assetCodeIdx === -1 || assetIssuerIdx === -1 || projectIdIdx === -1 || classIdx === -1 || tagsIdx === -1) {
    writeDebugLog({
      run_id,
      module: 'aggregate',
      timestamp: new Date().toISOString(),
      stage: 'buildFactMonthly',
      fundKey: 'ERROR',
      details: 'Required columns not found in TRANSFERS'
    });
    return;
  }

  const aggregates = {};
  const monthsSet = new Set();
  let rowsRead = 0;
  let rowsSkipped = 0;

  for (let i = 1; i < transfersData.length; i++) {
    const row = transfersData[i];
    rowsRead++;

    const datetime = row[datetimeIdx];
    const amount = parseFloat(row[amountIdx]) || 0;
    const fundAccountKey = String(row[fundAccountKeyIdx] || '').trim();
    const assetCode = String(row[assetCodeIdx] || '').trim();
    const assetIssuer = String(row[assetIssuerIdx] || '').trim();
    const projectId = String(row[projectIdIdx] || '').trim();
    const classVal = String(row[classIdx] || '').trim();
    const tags = String(row[tagsIdx] || '').trim();

    // Пропустить если class пустой, Unknown, или project_id UNMAPPED/AMBIGUOUS
    if (!classVal || classVal === 'Unknown' || projectId === 'UNMAPPED' || projectId === 'AMBIGUOUS') {
      rowsSkipped++;
      continue;
    }

    // Извлечь month YYYY-MM
    const dt = new Date(datetime);
    if (isNaN(dt.getTime())) continue;
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;

    monthsSet.add(month);

    // is_pif: если fund_account_key === 'MFBOND'
    const isPif = fundAccountKey === 'MFBOND';

    const key = `${month}-${projectId}-${classVal}-${assetCode}`;

    if (!aggregates[key]) {
      aggregates[key] = {
        month,
        project_id: projectId,
        class: classVal,
        amount_asset: 0,
        asset_code: assetCode,
        asset_issuer: assetIssuer,
        tags,
        is_pif: isPif
      };
    }

    aggregates[key].amount_asset += amount;
  }

  // Очистить FACT_MONTHLY
  const lastRow = factSheet.getLastRow();
  if (lastRow > 1) {
    factSheet.getRange(2, 1, lastRow - 1, factSheet.getLastColumn()).clearContent();
  }

  // Записать новые данные
  const rows = Object.values(aggregates);
  if (rows.length > 0) {
    const dataRows = rows.map(r => [r.month, r.project_id, r.class, r.amount_asset, r.asset_code, r.asset_issuer, r.tags, r.is_pif]);
    factSheet.getRange(2, 1, dataRows.length, 8).setValues(dataRows);
  }

  writeDebugLog({
    run_id,
    module: 'aggregate',
    timestamp: new Date().toISOString(),
    stage: 'buildFactMonthly',
    fundKey: 'SUCCESS',
    rows_read_transfers: rowsRead,
    rows_written_fact: rows.length,
    months_covered: Array.from(monthsSet).sort().join(', '),
    rows_skipped: rowsSkipped
  });
}

function buildKpiRaw() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const residentsSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  const kpiSheet = ss.getSheetByName(SHEET_KPI_RAW) || ss.insertSheet(SHEET_KPI_RAW);

  if (!residentsSheet || residentsSheet.getLastRow() <= 1) {
    writeDebugLog({
      run_id,
      module: 'aggregate',
      timestamp: new Date().toISOString(),
      stage: 'buildKpiRaw',
      fundKey: 'ERROR',
      details: 'RESIDENTS sheet is empty or not found'
    });
    return;
  }

  // Инициализировать KPI_RAW если нужно
  if (kpiSheet.getLastRow() === 0) {
    initializeKpiRaw();
  }

  const residentsData = residentsSheet.getDataRange().getValues();
  const headers = residentsData[0];

  // Найти индексы колонок
  const curatorIdx = headers.indexOf('Curator');
  const nextActionDueIdx = headers.indexOf('Next_Action_Due');
  const nextPaymentDueIdx = headers.indexOf('Next_Payment_Due');

  if (curatorIdx === -1 || nextActionDueIdx === -1 || nextPaymentDueIdx === -1) {
    writeDebugLog({
      run_id,
      module: 'aggregate',
      timestamp: new Date().toISOString(),
      stage: 'buildKpiRaw',
      fundKey: 'ERROR',
      details: 'Required columns not found in RESIDENTS'
    });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalProjects = 0;
  let curatorFilled = 0;
  let nextActionDueFilled = 0;
  let nextPaymentDueFilled = 0;
  let nextActionDueOverdue = 0;
  let nextPaymentDueOverdue = 0;
  let projectsWithOverdueAction = 0;
  let projectsWithOverduePayment = 0;

  for (let i = 1; i < residentsData.length; i++) {
    const row = residentsData[i];
    totalProjects++;

    const curator = String(row[curatorIdx] || '').trim();
    if (curator) curatorFilled++;

    const nextActionDueStr = row[nextActionDueIdx];
    const nextActionDue = nextActionDueStr ? new Date(nextActionDueStr) : null;
    if (nextActionDue) {
      nextActionDueFilled++;
      if (nextActionDue < today) {
        nextActionDueOverdue++;
        projectsWithOverdueAction++;
      }
    }

    const nextPaymentDueStr = row[nextPaymentDueIdx];
    const nextPaymentDue = nextPaymentDueStr ? new Date(nextPaymentDueStr) : null;
    if (nextPaymentDue) {
      nextPaymentDueFilled++;
      if (nextPaymentDue < today) {
        nextPaymentDueOverdue++;
        projectsWithOverduePayment++;
      }
    }
  }

  // Посчитать UNMAPPED/AMBIGUOUS из TRANSFERS
  let unmappedCount = 0;
  let ambiguousCount = 0;
  if (transfersSheet && transfersSheet.getLastRow() > 1) {
    const transfersData = transfersSheet.getDataRange().getValues();
    const transfersHeaders = transfersData[0];
    const projectIdIdx = transfersHeaders.indexOf('project_id');
    if (projectIdIdx !== -1) {
      for (let i = 1; i < transfersData.length; i++) {
        const projectId = String(transfersData[i][projectIdIdx] || '').trim();
        if (projectId === 'UNMAPPED') unmappedCount++;
        if (projectId === 'AMBIGUOUS') ambiguousCount++;
      }
    }
  }

  // Подготовить метрики
  const metrics = [
    { metric: 'total_projects', value: totalProjects, details: 'Общее количество проектов в RESIDENTS' },
    { metric: 'curator_fill_rate', value: totalProjects > 0 ? (curatorFilled / totalProjects) : 0, details: `${curatorFilled} из ${totalProjects} проектов имеют заполненный Curator` },
    { metric: 'next_action_due_fill_rate', value: totalProjects > 0 ? (nextActionDueFilled / totalProjects) : 0, details: `${nextActionDueFilled} из ${totalProjects} проектов имеют заполненный Next_Action_Due` },
    { metric: 'next_payment_due_fill_rate', value: totalProjects > 0 ? (nextPaymentDueFilled / totalProjects) : 0, details: `${nextPaymentDueFilled} из ${totalProjects} проектов имеют заполненный Next_Payment_Due` },
    { metric: 'next_action_due_overdue_count', value: nextActionDueOverdue, details: `${nextActionDueOverdue} просроченных Next_Action_Due` },
    { metric: 'next_payment_due_overdue_count', value: nextPaymentDueOverdue, details: `${nextPaymentDueOverdue} просроченных Next_Payment_Due` },
    { metric: 'projects_with_overdue_action', value: projectsWithOverdueAction, details: `${projectsWithOverdueAction} проектов с просроченным Next_Action_Due` },
    { metric: 'projects_with_overdue_payment', value: projectsWithOverduePayment, details: `${projectsWithOverduePayment} проектов с просроченным Next_Payment_Due` },
    { metric: 'unmapped_transfers', value: unmappedCount, details: `${unmappedCount} транзакций с UNMAPPED project_id` },
    { metric: 'ambiguous_transfers', value: ambiguousCount, details: `${ambiguousCount} транзакций с AMBIGUOUS project_id` }
  ];

  // Очистить KPI_RAW
  const lastRow = kpiSheet.getLastRow();
  if (lastRow > 1) {
    kpiSheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  }

  // Записать метрики
  const dataRows = metrics.map(m => [m.metric, m.value, m.details]);
  kpiSheet.getRange(2, 1, dataRows.length, 3).setValues(dataRows);

  writeDebugLog({
    run_id,
    module: 'aggregate',
    timestamp: new Date().toISOString(),
    stage: 'buildKpiRaw',
    fundKey: 'SUCCESS',
    kpi_metrics_json: JSON.stringify(metrics)
  });
}

function initializeNewSheets() {
  initializeClickUpSchema();
  initializeClickUpTasks();
  initializeProjectMap();
  initializeAnomalies();
  initializeFactMonthly();
  initializeKpiRaw();
  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'initializeNewSheets',
    fundKey: '',
    details: 'All new sheets initialized'
  });
}

/**
 * Добавляет новые колонки к листу TRANSFERS.
 */
function upgradeTransfersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sheet) return;
  const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headersRange.getValues()[0];
  const newCols = ['fund_account_key', 'asset_code', 'asset_issuer', 'asset_full', 'op_id', 'direction', 'counterparty_type', 'project_id', 'class', 'class_override', 'tags'];
  const missing = newCols.filter(col => headers.indexOf(col) === -1);
  if (missing.length > 0) {
    headersRange.offset(0, headers.length, 1, missing.length).setValues([missing]);
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'upgradeTransfersSheet',
      fundKey: '',
      details: 'Added columns: ' + missing.join(', ')
    });
  }
}

/**
 * Добавляет управленческие колонки к листу RESIDENTS.
 */
function upgradeResidentsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESIDENTS);
  if (!sheet) return;
  const headersRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headersRange.getValues()[0];
  const newCols = ['Curator', 'Case_Status', 'Next_Action', 'Next_Action_Due', 'Next_Payment_Due', 'Last_Payment_Date', 'Last_Payment_Amount', 'Outstanding_EUR'];
  const missing = newCols.filter(col => headers.indexOf(col) === -1);
  if (missing.length > 0) {
    headersRange.offset(0, headers.length, 1, missing.length).setValues([missing]);
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'upgradeResidentsSheet',
      fundKey: '',
      details: 'Added columns: ' + missing.join(', ')
    });
  }
}

/**
 * Обновляет оба существующих листа TRANSFERS и RESIDENTS.
 */
function upgradeExistingSheets() {
  upgradeTransfersSheet();
  upgradeResidentsSheet();
  upgradeDebugLogSheet();
}

function ping() {
  return new Date().toISOString();
}
