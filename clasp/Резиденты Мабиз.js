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
const SHEET_RESIDENT_TRACKING = 'RESIDENT_TRACKING';
const SHEET_RESIDENT_TIMELINE = 'RESIDENT_TIMELINE';
const SHEET_TOKEN_FLOWS = 'TOKEN_FLOWS';
const SHEET_ISSUER_STRUCTURE = 'ISSUER_STRUCTURE';
const SHEET_ACCOUNTS_META = 'ACCOUNTS_META';
const SHEET_ACCOUNT_SIGNERS = 'ACCOUNT_SIGNERS';

const SHEET_MAYMUN_EVENTS = 'MAYMUN_EVENTS';
const SHEET_MAYMUN_DECISIONS = 'MAYMUN_DECISIONS';
const SHEET_MAYMUN_ALLOCATIONS = 'MAYMUN_ALLOCATIONS';
const SHEET_MAYMUN_EXPENSES = 'MAYMUN_EXPENSES';
const SHEET_MAYMUN_RUNWAY = 'MAYMUN_RUNWAY';

const MAYMUN_EVENTS_HEADERS = [
  'event_id', 'source_type', 'source_sheet', 'source_row', 'tx_hash', 'op_id', 'transfer_key',
  'source_tx_hash', 'source_op_id', 'event_time', 'gross_amount', 'currency_code',
  'event_type', 'project_id', 'resident_id', 'account_id', 'asset_code', 'asset_issuer', 'amount',
  'direction', 'event_status', 'confidence', 'occurred_at', 'detected_at', 'created_at', 'created_by', 'notes'
];

const MAYMUN_DECISIONS_HEADERS = [
  'decision_id', 'event_id', 'decision_type', 'decision_status', 'policy_version', 'project_id',
  'resident_id', 'amount', 'asset_code', 'requires_owner_go', 'owner_go_status', 'reason', 'created_at',
  'updated_at', 'created_by', 'notes'
];

const MAYMUN_ALLOCATIONS_HEADERS = [
  'allocation_id', 'decision_id', 'event_id', 'project_id', 'resident_id', 'bucket', 'allocation_type',
  'allocation_status', 'asset_code', 'asset_issuer', 'amount', 'confirmed_amount', 'effective_at',
  'created_at', 'updated_at', 'created_by', 'notes'
];

const MAYMUN_EXPENSES_HEADERS = [
  'expense_id', 'source_type', 'source_ref', 'project_id', 'resident_id', 'vendor', 'category',
  'expense_status', 'asset_code', 'amount', 'due_at', 'paid_at', 'recognized_at', 'created_at',
  'updated_at', 'created_by', 'notes'
];

const MAYMUN_RUNWAY_HEADERS = [
  'snapshot_id', 'snapshot_at', 'scope_type', 'scope_id', 'asset_code', 'confirmed_balance', 'planned_inflow',
  'planned_outflow', 'confirmed_expenses', 'net_confirmed_runway', 'forecast_runway', 'runway_days',
  'source_event_ids', 'source_allocation_ids', 'source_expense_ids', 'calculation_version', 'created_by', 'notes'
];

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

function getDomainCore_() {
  return (typeof globalThis !== 'undefined' && globalThis.__domainCore) ? globalThis.__domainCore : {};
}

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
    .addItem('Собрать RESIDENT_TIMELINE', 'buildResidentTimeline')
    .addItem('Собрать TOKEN_FLOWS', 'buildTokenFlows')
    .addItem('Собрать ISSUER_STRUCTURE', 'buildIssuerStructure')
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
    .addItem('MAYMUN: Dry-run init/check листов', 'initializeMaymunAssetLayerSheetsManual')
    .addItem('MAYMUN: Owner-approved manual write profile', 'runMaymunAssetLayerOwnerApprovedWrite')
    .addItem('MAYMUN: Write selected TRANSFER', 'runMaymunAssetLayerWriteSelectedTransfer')
    .addItem('MAYMUN: Create allocation from selected DECISION', 'runMaymunAssetLayerCreateAllocationFromSelectedDecision')
    .addItem('MAYMUN: Create runway snapshot', 'runMaymunAssetLayerCreateRunwaySnapshot')
    .addSeparator()
    .addItem('Обновить Created данные аккаунтов', 'updateAccountCreationDetails')
    .addItem('Обновить метаданные аккаунтов', 'syncAccountsMeta')
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
    const txHash = parseTxHashFromCell_(txCell);
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
  const residentsData = parseResidentsSheet(resSheet);
  const residentsMap = {};
  for (const r of residentsData) {
    if (r.account) residentsMap[r.account] = r.label;
    if (r.asset_issuer) residentsMap[r.asset_issuer] = r.label;
  }
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
      const core = getDomainCore_();
      if (typeof core.evaluateCounterpartyScope === 'function') {
        scopeAllowed = core.evaluateCounterpartyScope(counterpartyScope, {
          fromIsFund,
          toIsFund,
          fromIsRes,
          toIsRes
        }, {
          relaxRoleFilter
        });
      } else if (counterpartyScope === 'FUND_RESIDENT_ONLY') {
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
    if (!memo) {
      const hash = parseTxHashFromCell_(link);
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
    else if (key === 'EXPLORER_TX_URL') config.EXPLORER_TX_URL = strVal;
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

function normalizeExplorerBaseUrl_(baseUrl) {
  let url = String(baseUrl || '').trim();
  url = url.replace(/\/+$/g, '');
  url = url.replace(/\/tx$/i, '').replace(/\/transactions$/i, '');
  return url;
}

function buildExplorerTxUrl_(baseUrl, txHash) {
  if (!txHash) return '';
  const normalized = normalizeExplorerBaseUrl_(baseUrl);
  if (!normalized) return '';
  return `${normalized}/tx/${txHash}`;
}

function shortAccount_(address) {
  const addr = String(address || '').trim();
  if (!addr) return '';
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function getExplorerBaseUrl_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  if (config.EXPLORER_TX_URL) {
    return normalizeExplorerBaseUrl_(config.EXPLORER_TX_URL);
  }
  const horizon = config.HORIZON_URL || DEFAULT_HORIZON_URL;
  return normalizeExplorerBaseUrl_(horizon.replace('/horizon', ''));
}

function getCreationTransactionDetails(accountId, horizonBaseUrl) {
  const account = String(accountId || '').trim();
  if (!account) return null;
  const horizon = horizonBaseUrl || DEFAULT_HORIZON_URL;
  const url = `${horizon}/accounts/${account}/transactions?order=asc&limit=1`;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      if (DEBUG) Logger.log(`[getCreationTransactionDetails] Horizon error ${res.getResponseCode()} for ${account}`);
      return null;
    }
    const json = JSON.parse(res.getContentText());
    const record = json._embedded?.records?.[0];
    if (!record) return null;
    return {
      creator: record.source_account || '',
      createdAt: record.created_at ? new Date(record.created_at) : null,
      txHash: record.hash || ''
    };
  } catch (e) {
    if (DEBUG) Logger.log(`[getCreationTransactionDetails] Error for ${account}: ${e.toString()}`);
    return null;
  }
}

function formatCreationData(details, accountsMap, explorerBaseUrl) {
  if (!details) return { createdBy: '', createdAt: '' };
  const creator = String(details.creator || '').trim();
  const label = accountsMap[creator] || shortAccount_(creator);
  const txUrl = buildExplorerTxUrl_(explorerBaseUrl, details.txHash);
  const link = txUrl ? `=HYPERLINK("${txUrl}"; "${label}")` : label;
  return {
    createdBy: link,
    createdAt: details.createdAt || ''
  };
}

function updateAccountCreationDetails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const accSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!accSheet) {
    SpreadsheetApp.getUi().alert('Лист ACCOUNTS не найден.');
    return;
  }
  const lastRow = accSheet.getLastRow();
  if (lastRow <= 1) return;

  const constSheet = ss.getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const horizon = config.HORIZON_URL || DEFAULT_HORIZON_URL;
  const explorerBaseUrl = getExplorerBaseUrl_();

  const accountsMap = parseAccountsSheet(accSheet);
  const accountValues = accSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const createdByValues = [];
  const createdAtValues = [];

  for (const row of accountValues) {
    const accountId = String(row[0] || '').trim();
    if (!accountId) {
      createdByValues.push(['']);
      createdAtValues.push(['']);
      continue;
    }
    const details = getCreationTransactionDetails(accountId, horizon);
    const formatted = formatCreationData(details, accountsMap, explorerBaseUrl);
    createdByValues.push([formatted.createdBy]);
    createdAtValues.push([formatted.createdAt]);
  }

  accSheet.getRange(2, 5, createdByValues.length, 1).setValues(createdByValues);
  accSheet.getRange(2, 6, createdAtValues.length, 1).setValues(createdAtValues);
  accSheet.getRange('F:F').setNumberFormat('dd-mm-yyyy hh:mm:ss');

  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'updateAccountCreationDetails',
    fundKey: 'ALL',
    details: `Updated ${createdByValues.length} rows in ACCOUNTS`
  });
}

function parseResidentsSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  const residents = [];
  let totalAccounts = 0;
  let totalIssuers = 0;
  let skippedNoLabel = 0;
  const residentCols = resolveResidentsColumnIndexes_(rows[0]);
  // По умолчанию: B=label (1), Q=Account_s (16), R=Asset_issuer (17)
  for (let i = 1; i < rows.length; i++) { // Начинаем с 1, пропуская заголовок
    const row = rows[i];
    const label = (row[residentCols.labelIdx] || '').toString().trim();
    if (!label) {
      skippedNoLabel++;
      continue;
    }

    // Парсим Account_s (Q)
    const accounts = parseStellarAddressList_(row[residentCols.accountsIdx]);

    // Парсим Asset_issuer (R)
    const issuers = parseStellarAddressList_(row[residentCols.issuersIdx]);

    totalAccounts += accounts.length;
    totalIssuers += issuers.length;

    for (const a of accounts) {
      if (a) residents.push({ account: a, asset_issuer: '', label });
    }
    for (const iss of issuers) {
      if (iss) residents.push({ account: '', asset_issuer: iss, label });
    }
  }
  if (DEBUG) {
    Logger.log(`[parseResidentsSheet] rows=${rows.length - 1}, accounts=${totalAccounts}, issuers=${totalIssuers}, skippedNoLabel=${skippedNoLabel}, residents=${residents.length}`);
  }
  return residents;
}

function parseResidentsRecords_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const rows = sheet.getDataRange().getValues();
  const residentCols = resolveResidentsColumnIndexes_(rows[0]);
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const label = String(row[residentCols.labelIdx] || '').trim();
    const accounts = parseStellarAddressList_(row[residentCols.accountsIdx]);
    const issuers = parseStellarAddressList_(row[residentCols.issuersIdx]);

    out.push({
      label,
      accounts,
      issuers
    });
  }

  return out;
}

function normalizeExplorerBaseUrl_(baseUrl) {
  let url = String(baseUrl || '').trim();
  url = url.replace(/\/+$/g, '');
  url = url.replace(/\/tx$/i, '').replace(/\/transactions$/i, '');
  return url;
}

function buildExplorerTxUrl_(baseUrl, txHash) {
  if (!txHash) return '';
  const normalized = normalizeExplorerBaseUrl_(baseUrl);
  if (!normalized) return '';
  return `${normalized}/tx/${txHash}`;
}

function shortAccount_(address) {
  const addr = String(address || '').trim();
  if (!addr) return '';
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function getExplorerBaseUrl_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  if (config.EXPLORER_TX_URL) {
    return normalizeExplorerBaseUrl_(config.EXPLORER_TX_URL);
  }
  const horizon = config.HORIZON_URL || DEFAULT_HORIZON_URL;
  return normalizeExplorerBaseUrl_(horizon.replace('/horizon', ''));
}

function getCreationTransactionDetails(accountId, horizonBaseUrl) {
  const account = String(accountId || '').trim();
  if (!account) return null;
  const horizon = String(horizonBaseUrl || DEFAULT_HORIZON_URL).replace(/\/+$/g, '');
  const url = `${horizon}/accounts/${account}/transactions?order=asc&limit=1`;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      if (DEBUG) Logger.log(`[getCreationTransactionDetails] Horizon error ${res.getResponseCode()} for ${account}`);
      return null;
    }
    const json = JSON.parse(res.getContentText());
    const record = json._embedded?.records?.[0];
    if (!record) return null;
    return {
      creator: record.source_account || '',
      createdAt: record.created_at ? new Date(record.created_at) : null,
      txHash: record.hash || ''
    };
  } catch (e) {
    if (DEBUG) Logger.log(`[getCreationTransactionDetails] Error for ${account}: ${e.toString()}`);
    return null;
  }
}

function formatCreationData_(details, accountsMap, explorerBaseUrl) {
  if (!details) return { createdBy: '', createdAt: '' };
  const creator = String(details.creator || '').trim();
  const label = accountsMap[creator] || shortAccount_(creator);
  const txUrl = buildExplorerTxUrl_(explorerBaseUrl, details.txHash);
  const link = txUrl ? `=HYPERLINK("${txUrl}"; "${label}")` : label;
  return {
    createdBy: link,
    createdAt: details.createdAt || ''
  };
}

function updateAccountCreationDetails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const accSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!accSheet) {
    SpreadsheetApp.getUi().alert('Лист ACCOUNTS не найден.');
    return;
  }

  const lastRow = accSheet.getLastRow();
  if (lastRow <= 1) return;

  // В ACCOUNTS по контракту обновляем только E/F:
  // E = Created by, F = Created data.
  // Никакие другие колонки (в т.ч. C/D) не должны затрагиваться.
  const accountCol = 1;
  const labelCol = 2;
  const createdByCol = 5;
  const createdAtCol = 6;

  const constSheet = ss.getSheetByName(SHEET_CONST);
  const config = parseConstSheet(constSheet);
  const horizon = String(config.HORIZON_URL || DEFAULT_HORIZON_URL).replace(/\/+$/g, '');
  const explorerBaseUrl = getExplorerBaseUrl_();

  const rowsCount = lastRow - 1;
  const accounts = accSheet.getRange(2, accountCol, rowsCount, 1).getValues().flat().map(v => String(v || '').trim());
  const labels = accSheet.getRange(2, labelCol, rowsCount, 1).getValues().flat().map(v => String(v || '').trim());
  const accountMap = {};
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i]) accountMap[accounts[i]] = labels[i] || '';
  }

  const createdByValues = [];
  const createdAtValues = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (!account) {
      createdByValues.push(['']);
      createdAtValues.push(['']);
      continue;
    }
    const details = getCreationTransactionDetails(account, horizon);
    const formatted = formatCreationData_(details, accountMap, explorerBaseUrl);
    createdByValues.push([formatted.createdBy]);
    createdAtValues.push([formatted.createdAt]);
    Utilities.sleep(350);
  }

  accSheet.getRange(2, createdByCol, rowsCount, 1).setValues(createdByValues);
  accSheet.getRange(2, createdAtCol, rowsCount, 1).setValues(createdAtValues);
  accSheet.getRange(2, createdAtCol, rowsCount, 1).setNumberFormat('dd-mm-yyyy hh:mm:ss');

  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'updateAccountCreationDetails',
    fundKey: 'ALL',
    details: `Updated creation metadata for ${accounts.filter(Boolean).length} accounts in ACCOUNTS`
  });
}

function initializeAccountsMetaSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMeta = ss.getSheetByName(SHEET_ACCOUNTS_META) || ss.insertSheet(SHEET_ACCOUNTS_META);
  const sheetSigners = ss.getSheetByName(SHEET_ACCOUNT_SIGNERS) || ss.insertSheet(SHEET_ACCOUNT_SIGNERS);

  sheetMeta.clearContents();
  sheetSigners.clearContents();

  sheetMeta.appendRow([
    'category',
    'section',
    'account',
    'created_by',
    'created_at',
    'low_threshold',
    'med_threshold',
    'high_threshold'
  ]);

  sheetSigners.appendRow([
    'account',
    'account_label',
    'signer',
    'signer_label',
    'weight',
    'type'
  ]);

  return { sheetMeta, sheetSigners };
}

function syncAccountsMeta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const residentsSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const accountsSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!constSheet || !residentsSheet) {
    writeDebugLog({
      timestamp: new Date().toISOString(),
      stage: 'syncAccountsMeta',
      fundKey: 'ERROR',
      details: 'Missing CONST or RESIDENTS sheet'
    });
    return;
  }

  const config = parseConstSheet(constSheet);
  const horizon = String(config.HORIZON_URL || DEFAULT_HORIZON_URL).replace(/\/+$/g, '');
  const residentRecords = parseResidentsRecords_(residentsSheet);
  const accountLabels = parseAccountsSheet(accountsSheet);

  const fallbackLabels = {};
  for (const [key, val] of Object.entries(config.fundAccounts || {})) {
    if (typeof val === 'string' && val.startsWith('G')) {
      fallbackLabels[val.trim()] = key.trim();
    }
  }
  residentRecords.forEach((r) => {
    const label = String(r.label || '').trim();
    if (!label) return;
    (r.accounts || []).forEach((a) => { fallbackLabels[a] = label; });
    (r.issuers || []).forEach((a) => { fallbackLabels[a] = label; });
  });

  function getLabel(account) {
    return accountLabels[account] || fallbackLabels[account] || '';
  }

  const { sheetMeta, sheetSigners } = initializeAccountsMetaSheets_();
  const accounts = [];
  const seen = new Set();

  Object.entries(config.fundAccounts || {}).forEach(([key, val]) => {
    const account = String(val || '').trim();
    if (!account || !account.startsWith('G')) return;
    if (seen.has(account)) return;
    seen.add(account);
    accounts.push({ category: 'FUND', section: String(key || '').trim(), account });
  });

  residentRecords.forEach((r) => {
    const section = String(r.label || '').trim();
    (r.accounts || []).forEach((account) => {
      if (!account || seen.has(account)) return;
      seen.add(account);
      accounts.push({ category: 'RESIDENT', section, account });
    });
  });

  const metaRows = [];
  const signerRows = [];
  for (const acc of accounts) {
    const account = acc.account;
    let accData = null;
    try {
      const accResp = UrlFetchApp.fetch(`${horizon}/accounts/${account}`, {
        headers: { Accept: 'application/json' },
        muteHttpExceptions: true
      });
      if (accResp.getResponseCode() !== 200) {
        Utilities.sleep(300);
        continue;
      }
      accData = JSON.parse(accResp.getContentText());
    } catch (e) {
      Utilities.sleep(300);
      continue;
    }

    const th = accData.thresholds || {};
    const signers = Array.isArray(accData.signers) ? accData.signers : [];
    for (const s of signers) {
      signerRows.push([
        account,
        getLabel(account),
        s.key || '',
        getLabel(String(s.key || '').trim()),
        s.weight || 0,
        s.type || ''
      ]);
    }

    const details = getCreationTransactionDetails(account, horizon);
    metaRows.push([
      acc.category,
      acc.section,
      account,
      details?.creator || '',
      details?.createdAt || '',
      th.low_threshold || 0,
      th.med_threshold || 0,
      th.high_threshold || 0
    ]);

    Utilities.sleep(350);
  }

  if (metaRows.length > 0) {
    sheetMeta.getRange(2, 1, metaRows.length, metaRows[0].length).setValues(metaRows);
    sheetMeta.getRange('E:E').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }
  if (signerRows.length > 0) {
    sheetSigners.getRange(2, 1, signerRows.length, signerRows[0].length).setValues(signerRows);
  }

  writeDebugLog({
    timestamp: new Date().toISOString(),
    stage: 'syncAccountsMeta',
    fundKey: 'SUCCESS',
    details: `Accounts processed=${accounts.length}, ACCOUNTS_META rows=${metaRows.length}, ACCOUNT_SIGNERS rows=${signerRows.length}`
  });
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
  const residentCols = resolveResidentsColumnIndexes_(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // По умолчанию: Q=Account_s (16), R=Asset_issuer (17)
    const accounts = parseStellarAddressList_(row[residentCols.accountsIdx]);
    const issuers = parseStellarAddressList_(row[residentCols.issuersIdx]);

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
  const core = getDomainCore_();
  if (typeof core.mapProjectIdForTransfer === 'function') {
    const regex = PROJECT_ID_REGEX || /\bP?\d{3,6}\b/;
    return core.mapProjectIdForTransfer(transfer, indexes, {
      projectIdRegex: regex,
      isProjectIdKnown: function (projectId) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const projectMap = parseProjectMapSheet(ss.getSheetByName(SHEET_PROJECT_MAP));
        return Boolean(projectMap[projectId]);
      }
    });
  }

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
  const memoMatch = String(memo || '').match(regex);
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
  const core = getDomainCore_();
  if (typeof core.classifyTransfer === 'function') {
    return core.classifyTransfer(transfer, rules, CLASSIFY_ENABLE);
  }

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

  Logger.log(`Переклассификация завершена. Обновлено строк: ${count}`);
  
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

    const txHash = parseTxHashFromCell_(row[txHashIdx]);

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

  Logger.log(`Ремаппинг завершен. Обновлено строк: ${count}`);

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
  const residentsData = parseResidentsSheet(resSheet);
  const residentsMap = {};
  for (const r of residentsData) {
    if (r.account) residentsMap[r.account] = r.label;
    if (r.asset_issuer) residentsMap[r.asset_issuer] = r.label;
  }
  if (residentsMap[addr]) return residentsMap[addr];

  // 4. BSN JSON
  const bsnLabelMap = fetchBSNLabels();
  if (bsnLabelMap[addr]) return bsnLabelMap[addr];

  return '';
}

function isFund(addr, fundAccounts) {
  const core = getDomainCore_();
  if (typeof core.isFundAddress === 'function') {
    return core.isFundAddress(addr, fundAccounts);
  }
  return Object.values(fundAccounts || {}).includes(String(addr || '').trim());
}

function isResident(addr, residentsMap) {
  const core = getDomainCore_();
  if (typeof core.isResidentAddress === 'function') {
    return core.isResidentAddress(addr, residentsMap);
  }
  return String(addr || '').trim() in (residentsMap || {});
}

function normalizeTokenPart(value) {
  const core = getDomainCore_();
  if (typeof core.normalizeTokenPart === 'function') {
    return core.normalizeTokenPart(value);
  }
  return String(value || '').trim().toUpperCase();
}

function normalizeAssetKey_(value) {
  const core = getDomainCore_();
  if (typeof core.normalizeAssetKey === 'function') {
    return core.normalizeAssetKey(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/[\s/|]/g, ':').toUpperCase();
  const parts = normalized.split(':').filter(Boolean);
  const code = parts[0] || '';
  const issuer = parts[1] || '';
  return `${code}:${issuer}`;
}

function parseTokenFilter(rawValue) {
  const core = getDomainCore_();
  if (typeof core.parseTokenFilter === 'function') {
    return core.parseTokenFilter(rawValue);
  }

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

function parseTxHashFromCell_(txCellValue) {
  const core = getDomainCore_();
  if (typeof core.parseTxHashFromCell === 'function') {
    return core.parseTxHashFromCell(txCellValue);
  }

  const txCell = String(txCellValue || '');
  const txHashMatch = txCell.match(/transactions\/(\w+)/) || txCell.match(/"([A-Z0-9]+)"\s*\)?$/i);
  let txHash = txHashMatch ? txHashMatch[1] : '';
  if (!txHash && /^[A-Z0-9]{10,}$/i.test(txCell)) {
    txHash = txCell;
  }
  return txHash;
}

function parseStellarAddressList_(value) {
  const core = getDomainCore_();
  if (typeof core.parseStellarAddressList === 'function') {
    return core.parseStellarAddressList(value);
  }

  return String(value || '')
    .split(/[,;]/)
    .map(function (item) { return String(item || '').trim(); })
    .filter(function (item) { return item.startsWith('G'); });
}

function resolveResidentsColumnIndexes_(headers) {
  const fallback = { labelIdx: 1, accountsIdx: 16, issuersIdx: 17 };
  const core = getDomainCore_();
  if (typeof core.resolveResidentsColumnIndexes === 'function') {
    return core.resolveResidentsColumnIndexes(headers, fallback);
  }
  return fallback;
}

function addressListContains_(value, targetAddress) {
  const core = getDomainCore_();
  if (typeof core.addressListContains === 'function') {
    return core.addressListContains(value, targetAddress);
  }
  const target = String(targetAddress || '').trim();
  if (!target) return false;
  return parseStellarAddressList_(value).includes(target);
}

function buildResidentTrackingDataset_(transfers, options) {
  const core = getDomainCore_();
  if (typeof core.buildResidentTrackingDataset === 'function') {
    return core.buildResidentTrackingDataset(transfers, options);
  }

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
    const datetime = new Date(t.datetime);
    if (isNaN(datetime.getTime())) continue;

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

    const fromIsFund = isFund(from, fundAccounts);
    const toIsFund = isFund(to, fundAccounts);
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
      tx_hash: parseTxHashFromCell_(t.tx_hash || ''),
      is_first_contact: false
    });
  }

  rows.sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const firstSeen = {};
  rows.forEach((row) => {
    const key = `${row.project_id}|${row.resident_address}`;
    if (!firstSeen[key]) {
      row.is_first_contact = true;
      firstSeen[key] = true;
    }
  });

  return rows;
}

function buildResidentTimelineReadModel_(trackingRows, options) {
  const core = getDomainCore_();
  if (typeof core.buildResidentTimelineReadModel === 'function') {
    return core.buildResidentTimelineReadModel(trackingRows, options);
  }
  return [];
}

function buildTokenFlowSnapshot_(trackingRows, options) {
  const core = getDomainCore_();
  if (typeof core.buildTokenFlowSnapshot === 'function') {
    return core.buildTokenFlowSnapshot(trackingRows, options);
  }
  return [];
}

function buildIssuerStructureSnapshot_(trackingRows, options) {
  const core = getDomainCore_();
  if (typeof core.buildIssuerStructureSnapshot === 'function') {
    return core.buildIssuerStructureSnapshot(trackingRows, options);
  }
  return [];
}

function readTransfersRowsAsObjects_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const entry = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      entry[headers[c]] = row[c];
    }
    rows.push(entry);
  }
  return rows;
}

function validateSheetHeaders_(headers, requiredHeaders) {
  const missing = [];
  const list = Array.isArray(headers) ? headers : [];
  const required = Array.isArray(requiredHeaders) ? requiredHeaders : [];
  const normalized = list.map(normalizeHeaderKey_);
  for (let i = 0; i < required.length; i++) {
    if (normalized.indexOf(normalizeHeaderKey_(required[i])) === -1) {
      missing.push(required[i]);
    }
  }
  return missing;
}

function normalizeHeaderKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

let MAYMUN_OWNER_WRITE_CONTEXT_DEPTH = 0;

function enterMaymunOwnerApprovedWriteContext_() {
  MAYMUN_OWNER_WRITE_CONTEXT_DEPTH += 1;
}

function exitMaymunOwnerApprovedWriteContext_() {
  MAYMUN_OWNER_WRITE_CONTEXT_DEPTH = Math.max(0, MAYMUN_OWNER_WRITE_CONTEXT_DEPTH - 1);
}

function isMaymunOwnerApprovedWriteContextActive_() {
  return MAYMUN_OWNER_WRITE_CONTEXT_DEPTH > 0;
}

function normalizeOptions_(options) {
  const opts = options || {};
  const requestedOwnerApprovedWrite = Boolean(opts.__ownerApprovedWrite);
  const requestedDryRun = Boolean(opts.dryRun);
  const runId = String(opts.runId || newRunId_());

  if (requestedOwnerApprovedWrite) {
    assertManualUiContext_();
    if (!isMaymunOwnerApprovedWriteContextActive_()) {
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: stableNowIso_(),
        stage: 'maymunWriteLock',
        fundKey: 'WRITE_LOCK',
        details: 'Owner-approved write flag rejected outside protected manual entrypoint context.'
      });
      throw new Error('Owner-approved MAYMUN write is allowed only inside protected manual entrypoint context');
    }
  }

  const ownerApprovedWrite = requestedOwnerApprovedWrite && isMaymunOwnerApprovedWriteContextActive_();
  const dryRun = ownerApprovedWrite ? false : true;

  if (!requestedDryRun && !ownerApprovedWrite) {
    writeDebugLog({
      run_id: runId,
      module: 'maymun_asset_layer',
      timestamp: stableNowIso_(),
      stage: 'maymunWriteLock',
      fundKey: 'WRITE_LOCK',
      details: 'Non-dry-run request blocked. MAYMUN_* writes are disabled by hard guardrail.'
    });
  }

  return {
    dryRun: dryRun,
    actor: String(opts.actor || 'stellar-scrypt'),
    runId: runId
  };
}

function sanitizeForId_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function stableNowIso_() {
  return new Date().toISOString();
}

function getSheetByHeaderMap_(sheet) {
  const headers = (sheet && sheet.getLastRow() > 0)
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim(); })
    : [];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeaderKey_(headers[i]);
    if (normalized && map[normalized] === undefined) map[normalized] = i;
  }
  return { headers: headers, headerMap: map };
}

function mapObjectToRowByHeader_(obj, headers) {
  const row = [];
  const source = obj || {};
  for (let i = 0; i < headers.length; i++) {
    row.push(source[headers[i]] !== undefined ? source[headers[i]] : '');
  }
  return row;
}

function ensureHeaders_(sheet, requiredHeaders, options) {
  const opts = normalizeOptions_(options);
  const shape = getSheetByHeaderMap_(sheet);
  const missing = validateSheetHeaders_(shape.headers, requiredHeaders);
  if (!missing.length) return { action: 'noop', missingHeaders: [] };

  if (!opts.dryRun) {
    const startCol = shape.headers.length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  }

  writeDebugLog({
    run_id: opts.runId,
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'ensureMaymunHeaders',
    fundKey: sheet.getName(),
    details: (opts.dryRun ? '[DRY_RUN] ' : '') + 'Missing headers: ' + missing.join(', ')
  });
  return { action: opts.dryRun ? 'dry_run_upgrade' : 'upgraded', missingHeaders: missing };
}

function ensureSheetWithHeaders_(sheetName, requiredHeaders, options) {
  const opts = normalizeOptions_(options);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  let created = false;

  if (!sheet) {
    created = true;
    if (!opts.dryRun) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(requiredHeaders);
    }
    writeDebugLog({
      run_id: opts.runId,
      module: 'maymun_asset_layer',
      timestamp: stableNowIso_(),
      stage: 'ensureMaymunSheet',
      fundKey: sheetName,
      details: (opts.dryRun ? '[DRY_RUN] ' : '') + (created ? 'Create sheet with required headers' : 'No-op')
    });
  }

  if (!sheet) {
    return { sheetName: sheetName, created: created, action: opts.dryRun ? 'dry_run_create' : 'created', missingHeaders: requiredHeaders.slice() };
  }

  const headerResult = ensureHeaders_(sheet, requiredHeaders, opts);
  return { sheetName: sheetName, created: created, action: created ? (opts.dryRun ? 'dry_run_create' : 'created') : headerResult.action, missingHeaders: headerResult.missingHeaders || [] };
}

function ensureMaymunEventsSheet_(options) {
  return ensureSheetWithHeaders_(SHEET_MAYMUN_EVENTS, MAYMUN_EVENTS_HEADERS, options);
}

function ensureMaymunDecisionsSheet_(options) {
  return ensureSheetWithHeaders_(SHEET_MAYMUN_DECISIONS, MAYMUN_DECISIONS_HEADERS, options);
}

function ensureMaymunAllocationsSheet_(options) {
  return ensureSheetWithHeaders_(SHEET_MAYMUN_ALLOCATIONS, MAYMUN_ALLOCATIONS_HEADERS, options);
}

function ensureMaymunExpensesSheet_(options) {
  return ensureSheetWithHeaders_(SHEET_MAYMUN_EXPENSES, MAYMUN_EXPENSES_HEADERS, options);
}

function ensureMaymunRunwaySheet_(options) {
  return ensureSheetWithHeaders_(SHEET_MAYMUN_RUNWAY, MAYMUN_RUNWAY_HEADERS, options);
}

function ensureMaymunAssetLayerSheets(options) {
  const opts = normalizeOptions_(options);
  const results = [
    ensureMaymunEventsSheet_(opts),
    ensureMaymunDecisionsSheet_(opts),
    ensureMaymunAllocationsSheet_(opts),
    ensureMaymunExpensesSheet_(opts),
    ensureMaymunRunwaySheet_(opts)
  ];

  writeDebugLog({
    run_id: opts.runId,
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'ensureMaymunAssetLayerSheets',
    fundKey: 'ALL',
    details: (opts.dryRun ? '[DRY_RUN] ' : '') + JSON.stringify(results)
  });

  return {
    dryRun: opts.dryRun,
    runId: opts.runId,
    results: results
  };
}

function ensureMaymunAssetLayerSheetsDryRun() {
  return ensureMaymunAssetLayerSheets({ dryRun: true, actor: 'manual' });
}

function runMaymunAssetLayerDryRunHarness() {
  const runId = newRunId_();
  const now = stableNowIso_();
  const outputs = [];

  outputs.push(ensureMaymunAssetLayerSheets({ dryRun: true, actor: 'manual_harness', runId: runId }));
  outputs.push(appendMaymunEvent({
    source_type: 'transfer',
    source_sheet: SHEET_TRANSFERS,
    source_row: '0',
    tx_hash: 'HARNESS_TX_HASH_001',
    op_id: '123456',
    transfer_key: 'HARNESS_TX_HASH_001:123456',
    event_type: 'funding_received',
    project_id: 'UNMAPPED',
    resident_id: '',
    account_id: '',
    asset_code: 'USDC',
    asset_issuer: '',
    amount: '10',
    direction: 'in',
    event_status: 'manual_review',
    confidence: 'low',
    occurred_at: now,
    detected_at: now,
    created_by: 'manual_harness',
    notes: 'Dry-run harness sample event'
  }, { dryRun: true, actor: 'manual_harness', runId: runId }));

  outputs.push(upsertMaymunDecision({
    event_id: 'evt_harness_tx_hash_001_123456',
    decision_type: 'manual_review',
    decision_status: 'pending_approval',
    policy_version: 'mvp_v1',
    project_id: 'UNMAPPED',
    resident_id: '',
    amount: '10',
    asset_code: 'USDC',
    requires_owner_go: 'TRUE',
    owner_go_status: 'pending',
    reason: 'Harness dry-run decision',
    notes: 'Dry-run only'
  }, { dryRun: true, actor: 'manual_harness', runId: runId }));

  outputs.push(upsertMaymunAllocation({
    decision_id: 'dec_evt_harness_tx_hash_001_123456_manual_review_mvp_v1',
    event_id: 'evt_harness_tx_hash_001_123456',
    project_id: 'UNMAPPED',
    resident_id: '',
    bucket: 'runway',
    allocation_type: 'planned_outflow',
    allocation_status: 'pending_approval',
    asset_code: 'USDC',
    asset_issuer: '',
    amount: '10',
    confirmed_amount: '5',
    effective_at: now,
    notes: 'Dry-run allocation should normalize confirmed_amount to 0'
  }, { dryRun: true, actor: 'manual_harness', runId: runId }));

  outputs.push(appendMaymunExpense({
    source_type: 'manual',
    source_ref: 'HARNESS_EXPENSE_001',
    project_id: 'UNMAPPED',
    resident_id: '',
    vendor: 'Harness Vendor',
    category: 'ops',
    expense_status: 'planned',
    asset_code: 'USDC',
    amount: '3',
    due_at: now,
    paid_at: '',
    recognized_at: now,
    notes: 'Dry-run expense append'
  }, { dryRun: true, actor: 'manual_harness', runId: runId }));

  outputs.push(appendMaymunRunwaySnapshot({
    snapshot_at: now,
    scope_type: 'global',
    scope_id: '',
    asset_code: 'USDC',
    confirmed_balance: '100',
    planned_inflow: '0',
    planned_outflow: '10',
    confirmed_expenses: '0',
    net_confirmed_runway: '100',
    forecast_runway: '90',
    runway_days: '',
    source_event_ids: 'evt_harness_tx_hash_001_123456',
    source_allocation_ids: 'alloc_dec_evt_harness_tx_hash_001_123456_manual_review_mvp_v1_runway_planned_outflow',
    source_expense_ids: 'exp_manual_harness_expense_001_' + sanitizeForId_(now),
    calculation_version: 'mvp_v1',
    notes: 'Dry-run runway snapshot'
  }, { dryRun: true, actor: 'manual_harness', runId: runId }));

  writeDebugLog({
    run_id: runId,
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'runMaymunAssetLayerDryRunHarness',
    fundKey: 'ALL',
    details: '[DRY_RUN] completed manual harness scenarios'
  });

  return {
    runId: runId,
    dryRun: true,
    outputs: outputs
  };
}

function getMaymunAssetLayerRowCounts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = [
    SHEET_MAYMUN_EVENTS,
    SHEET_MAYMUN_DECISIONS,
    SHEET_MAYMUN_ALLOCATIONS,
    SHEET_MAYMUN_EXPENSES,
    SHEET_MAYMUN_RUNWAY
  ];
  const counts = {};

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      counts[name] = 0;
      continue;
    }
    counts[name] = Math.max(0, sheet.getLastRow() - 1);
  }

  return counts;
}

function computeMaymunRowCountDelta(before, after) {
  const b = before || {};
  const a = after || {};
  const allKeys = {};
  Object.keys(b).forEach(function (k) { allKeys[k] = true; });
  Object.keys(a).forEach(function (k) { allKeys[k] = true; });

  const delta = {};
  Object.keys(allKeys).forEach(function (k) {
    const beforeCount = Number(b[k] || 0);
    const afterCount = Number(a[k] || 0);
    delta[k] = {
      before: beforeCount,
      after: afterCount,
      delta: afterCount - beforeCount
    };
  });
  return delta;
}

function getMaymunAssetLayerStatusSummary() {
  return 'MAYMUN asset layer status: dry-run mode active; guardrails engaged (manual-only, write lock enforced)';
}

function getMaymunSheetSpecs_() {
  return [
    { sheetName: SHEET_MAYMUN_EVENTS, requiredHeaders: MAYMUN_EVENTS_HEADERS },
    { sheetName: SHEET_MAYMUN_DECISIONS, requiredHeaders: MAYMUN_DECISIONS_HEADERS },
    { sheetName: SHEET_MAYMUN_ALLOCATIONS, requiredHeaders: MAYMUN_ALLOCATIONS_HEADERS },
    { sheetName: SHEET_MAYMUN_EXPENSES, requiredHeaders: MAYMUN_EXPENSES_HEADERS },
    { sheetName: SHEET_MAYMUN_RUNWAY, requiredHeaders: MAYMUN_RUNWAY_HEADERS }
  ];
}

function assertManualUiContext_() {
  // v2 (2026-04-24T22:49:00Z): Simplified check - only verify active user, not UI availability
  // Reason: SpreadsheetApp.getUi() throws in editor context; Session.getActiveUser() is sufficient
  // to block cron/triggers (where user is empty) while allowing editor + sheet menu execution
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail || userEmail.trim() === '') {
      throw new Error('No active user detected');
    }
  } catch (err) {
    throw new Error('Owner-approved MAYMUN write profile is allowed only from Apps Script UI/manual operator context');
  }
}

function validateMaymunSheetReadiness_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const specs = getMaymunSheetSpecs_();
  const issues = [];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const sheet = ss.getSheetByName(spec.sheetName);
    if (!sheet) {
      issues.push({ sheet: spec.sheetName, issue: 'missing_sheet' });
      continue;
    }
    const shape = getSheetByHeaderMap_(sheet);
    const missingHeaders = validateSheetHeaders_(shape.headers, spec.requiredHeaders);
    if (missingHeaders.length) {
      issues.push({ sheet: spec.sheetName, issue: 'missing_headers', missing: missingHeaders });
    }
  }

  return {
    ok: issues.length === 0,
    issues: issues
  };
}

function listDebugLogRowsByRunId_(runId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DEBUG);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const shape = getSheetByHeaderMap_(sheet);
  const runIdIdx = shape.headerMap['run_id'];
  const stageIdx = shape.headerMap['stage'];
  const detailsIdx = shape.headerMap['details'] !== undefined ? shape.headerMap['details'] : shape.headerMap['details_json'];
  if (runIdIdx === undefined) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][runIdIdx] || '').trim() !== String(runId || '').trim()) continue;
    rows.push({
      stage: stageIdx !== undefined ? String(data[i][stageIdx] || '') : '',
      details: detailsIdx !== undefined ? String(data[i][detailsIdx] || '') : ''
    });
  }
  return rows;
}

function buildMaymunOwnerApprovedPayload_(actor, now) {
  const confirmedEvent = {
    source_type: 'transfer',
    source_sheet: SHEET_TRANSFERS,
    source_row: '1',
    tx_hash: 'OWNER_APPROVED_CONFIRMED_TX_001',
    op_id: '1',
    transfer_key: 'OWNER_APPROVED_CONFIRMED_TX_001:1',
    event_type: 'funding_received',
    project_id: 'P1001',
    resident_id: 'RESIDENT_P1001',
    account_id: 'ACC_P1001',
    asset_code: 'USDC',
    asset_issuer: '',
    amount: '100',
    direction: 'in',
    event_status: 'confirmed',
    confidence: 'high',
    occurred_at: now,
    detected_at: now,
    created_by: actor,
    notes: 'Owner-approved manual write profile: confirmed transfer-backed event'
  };

  const ambiguousEvent = {
    source_type: 'transfer',
    source_sheet: SHEET_TRANSFERS,
    source_row: '2',
    tx_hash: 'OWNER_APPROVED_AMBIGUOUS_TX_001',
    op_id: '1',
    transfer_key: 'OWNER_APPROVED_AMBIGUOUS_TX_001:1',
    event_type: 'funding_received',
    project_id: 'AMBIGUOUS',
    resident_id: '',
    account_id: '',
    asset_code: 'USDC',
    asset_issuer: '',
    amount: '40',
    direction: 'in',
    event_status: 'manual_review',
    confidence: 'low',
    occurred_at: now,
    detected_at: now,
    created_by: actor,
    notes: 'Owner-approved manual write profile: ambiguous case routed to manual review'
  };

  const confirmedEventId = buildMaymunEventId_(confirmedEvent);
  const ambiguousEventId = buildMaymunEventId_(ambiguousEvent);

  return {
    confirmedEvent: confirmedEvent,
    ambiguousEvent: ambiguousEvent,
    decision: {
      event_id: ambiguousEventId,
      decision_type: 'manual_review',
      decision_status: 'approved',
      policy_version: 'mvp_v1',
      project_id: 'AMBIGUOUS',
      resident_id: '',
      amount: ambiguousEvent.amount,
      asset_code: ambiguousEvent.asset_code,
      requires_owner_go: 'TRUE',
      owner_go_status: 'approved',
      reason: 'Owner-approved manual review decision for ambiguous event',
      notes: 'Owner GO marker required in DEBUG_LOG'
    },
    allocation: {
      decision_id: `dec_${sanitizeForId_(ambiguousEventId)}_manual_review_mvp_v1`,
      event_id: ambiguousEventId,
      project_id: 'AMBIGUOUS',
      resident_id: '',
      bucket: 'runway',
      allocation_type: 'planned_outflow',
      allocation_status: 'confirmed',
      asset_code: 'USDC',
      asset_issuer: '',
      amount: '40',
      confirmed_amount: '40',
      effective_at: now,
      notes: 'Owner-approved confirmed allocation from manual path'
    },
    expense: {
      source_type: 'manual',
      source_ref: 'OWNER_APPROVED_EXPENSE_001',
      project_id: 'P1001',
      resident_id: 'RESIDENT_P1001',
      vendor: 'Manual Operator',
      category: 'ops',
      expense_status: 'planned',
      asset_code: 'USDC',
      amount: '5',
      due_at: now,
      paid_at: '',
      recognized_at: now,
      notes: 'Owner-approved manual expense write profile'
    },
    runway: {
      snapshot_at: now,
      scope_type: 'global',
      scope_id: 'owner_manual_profile',
      asset_code: 'USDC',
      confirmed_balance: '100',
      planned_inflow: '0',
      planned_outflow: '45',
      confirmed_expenses: '5',
      net_confirmed_runway: '95',
      forecast_runway: '55',
      runway_days: '',
      source_event_ids: [confirmedEventId, ambiguousEventId].join(','),
      source_allocation_ids: `alloc_${sanitizeForId_(`dec_${sanitizeForId_(ambiguousEventId)}_manual_review_mvp_v1`)}_runway_planned_outflow`,
      source_expense_ids: `exp_manual_owner_approved_expense_001_${sanitizeForId_(now)}`,
      calculation_version: 'mvp_v1',
      notes: 'Owner-approved runway snapshot using confirmed fields only'
    }
  };
}

function executeMaymunOwnerApprovedProfile_(payload, writeOpts) {
  const outputs = [];
  outputs.push(appendMaymunEvent(payload.confirmedEvent, writeOpts));
  outputs.push(appendMaymunEvent(payload.ambiguousEvent, writeOpts));
  outputs.push(upsertMaymunDecision(payload.decision, writeOpts));
  outputs.push(upsertMaymunAllocation(payload.allocation, writeOpts));
  outputs.push(appendMaymunExpense(payload.expense, writeOpts));
  outputs.push(appendMaymunRunwaySnapshot(payload.runway, writeOpts));
  return outputs;
}

function runMaymunAssetLayerOwnerApprovedWrite(options) {
  assertManualUiContext_();

  const opts = Object.assign({}, options || {});
  const runId = String(opts.runId || newRunId_());
  const actor = String(opts.actor || 'owner_manual_operator');
  const ownerGoMarker = String(opts.ownerGoMarker || 'OWNER_GO: approved manual MAYMUN_* write profile (variant B)');
  const now = stableNowIso_();

  writeDebugLog({
    run_id: runId,
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'runMaymunAssetLayerOwnerApprovedWrite.owner_marker',
    fundKey: 'OWNER_GO',
    details: ownerGoMarker
  });

  const before = getMaymunAssetLayerRowCounts();
  const readiness = validateMaymunSheetReadiness_();
  const payload = buildMaymunOwnerApprovedPayload_(actor, now);
  const previewRunId = `${runId}_precheck_preview`;
  const previewOpts = { dryRun: true, actor: actor, runId: previewRunId };
  const dryRunPreview = executeMaymunOwnerApprovedProfile_(payload, previewOpts);

  const precheck = {
    rowCountsBefore: before,
    sheetReadiness: readiness,
    dryRunPreview: dryRunPreview,
    manualEntrypointConfirmed: true
  };

  writeDebugLog({
    run_id: runId,
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'runMaymunAssetLayerOwnerApprovedWrite.precheck',
    fundKey: readiness.ok ? 'OK' : 'ERROR',
    details: JSON.stringify(precheck)
  });

  if (!readiness.ok) {
    throw new Error('Owner-approved write precheck failed: missing MAYMUN_* sheets or headers. See DEBUG_LOG for details.');
  }

  const writeOpts = {
    dryRun: false,
    actor: actor,
    runId: runId,
    __ownerApprovedWrite: true
  };

  enterMaymunOwnerApprovedWriteContext_();
  try {
    const outputs = executeMaymunOwnerApprovedProfile_(payload, writeOpts);

    const repeatCheck = appendMaymunEvent(payload.confirmedEvent, writeOpts);
    const after = getMaymunAssetLayerRowCounts();
    const delta = computeMaymunRowCountDelta(before, after);
    const debugRows = listDebugLogRowsByRunId_(runId);

    const postcheck = {
      rowCountsAfter: after,
      rowDelta: delta,
      addedOrUpdated: outputs,
      repeatCheck: repeatCheck,
      debugLogRows: debugRows.length
    };

    writeDebugLog({
      run_id: runId,
      module: 'maymun_asset_layer',
      timestamp: stableNowIso_(),
      stage: 'runMaymunAssetLayerOwnerApprovedWrite.postcheck',
      fundKey: 'ALL',
      details: JSON.stringify(postcheck)
    });

    return {
      runId: runId,
      dryRun: false,
      ownerMarker: ownerGoMarker,
      precheck: precheck,
      postcheck: postcheck
    };
  } finally {
    exitMaymunOwnerApprovedWriteContext_();
  }
}

function runMaymunAssetLayerLimitedNonDryRun(options) {
  const summary = getMaymunAssetLayerStatusSummary();
  writeDebugLog({
    run_id: newRunId_(),
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'runMaymunAssetLayerLimitedNonDryRun.deprecated',
    fundKey: 'HOLD',
    details: summary + '; use runMaymunAssetLayerOwnerApprovedWrite() for owner-approved manual writes'
  });
  return runMaymunAssetLayerDryRunHarness();
}

function runMaymunAssetLayerLimitedDryRun() {
  return runMaymunAssetLayerDryRunHarness();
}

function runMaymunAssetLayerLimitedNonDryRunGuarded() {
  return runMaymunAssetLayerOwnerApprovedWrite({
    actor: 'owner_guarded_runner',
    ownerGoMarker: 'OWNER_GO: approved manual MAYMUN_* write profile via guarded alias'
  });
}

function normalizeTransferEventDedupeKey_(txHash, opId) {
  const tx = sanitizeForId_(txHash);
  const op = sanitizeForId_(opId);
  return tx && op ? `${tx}:${op}` : '';
}

function buildMaymunEventId_(event) {
  const sourceType = String((event || {}).source_type || '').trim().toLowerCase();
  if (sourceType === 'transfer') {
    const tx = sanitizeForId_((event || {}).tx_hash);
    const op = sanitizeForId_((event || {}).op_id);
    if (tx && op) return `evt_${tx}_${op}`;
  }
  const seed = sanitizeForId_((event || {}).transfer_key || (event || {}).source_ref || Utilities.getUuid());
  return `evt_${seed || Utilities.getUuid()}`;
}

function appendMaymunEvent(event, options) {
  const opts = normalizeOptions_(options);
  ensureMaymunEventsSheet_(opts);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MAYMUN_EVENTS);
  if (!sheet) throw new Error('MAYMUN_EVENTS sheet is unavailable');

  const payload = Object.assign({}, event || {});
  payload.source_type = String(payload.source_type || '').trim().toLowerCase();
  payload.source_sheet = String(payload.source_sheet || SHEET_TRANSFERS).trim();
  payload.event_status = String(payload.event_status || 'detected').trim();
  payload.confidence = String(payload.confidence || 'medium').trim();
  payload.detected_at = String(payload.detected_at || stableNowIso_());
  payload.created_by = String(payload.created_by || opts.actor);
  payload.event_id = String(payload.event_id || buildMaymunEventId_(payload));

  const required = ['event_id', 'source_type', 'event_type', 'asset_code', 'amount', 'direction', 'event_status', 'confidence', 'occurred_at', 'detected_at', 'created_by'];
  if (payload.source_type === 'transfer') {
    required.push('tx_hash', 'op_id', 'transfer_key');
  }

  const missing = required.filter(function (key) {
    return payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === '';
  });
  if (missing.length) {
    writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunEvent', fundKey: 'ERROR', details: 'Validation failed, missing: ' + missing.join(', ') });
    throw new Error('appendMaymunEvent validation failed: ' + missing.join(', '));
  }

  if (payload.source_type === 'transfer') {
    const dedupeKey = normalizeTransferEventDedupeKey_(payload.tx_hash, payload.op_id);
    const shape = getSheetByHeaderMap_(sheet);
    const txIdx = shape.headerMap['tx_hash'];
    const opIdx = shape.headerMap['op_id'];
    if (txIdx !== undefined && opIdx !== undefined && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      for (let i = 0; i < data.length; i++) {
        const existingKey = normalizeTransferEventDedupeKey_(data[i][txIdx], data[i][opIdx]);
        if (existingKey && dedupeKey && existingKey === dedupeKey) {
          writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunEvent', fundKey: SHEET_MAYMUN_EVENTS, details: (opts.dryRun ? '[DRY_RUN] ' : '') + 'duplicate_skipped tx_hash+op_id=' + dedupeKey });
          return { action: 'duplicate_skipped', dedupeKey: dedupeKey, event_id: payload.event_id };
        }
      }
    }
  }

  const headers = getSheetByHeaderMap_(sheet).headers;
  const row = mapObjectToRowByHeader_(payload, headers);
  if (!opts.dryRun) {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }

  writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunEvent', fundKey: SHEET_MAYMUN_EVENTS, details: (opts.dryRun ? '[DRY_RUN] ' : '') + 'append event_id=' + payload.event_id });
  return { action: opts.dryRun ? 'dry_run_append' : 'appended', event_id: payload.event_id };
}

function findRowByKey_(sheet, keyBuilder) {
  if (!sheet || sheet.getLastRow() <= 1) return -1;
  const shape = getSheetByHeaderMap_(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (keyBuilder(data[i], shape.headerMap) === true) return i + 2;
  }
  return -1;
}

function upsertMaymunDecision(decision, options) {
  const opts = normalizeOptions_(options);
  ensureMaymunDecisionsSheet_(opts);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAYMUN_DECISIONS);
  if (!sheet) throw new Error('MAYMUN_DECISIONS sheet is unavailable');

  const payload = Object.assign({}, decision || {});
  payload.created_by = String(payload.created_by || opts.actor);
  payload.created_at = String(payload.created_at || stableNowIso_());
  payload.updated_at = stableNowIso_();
  payload.owner_go_status = String(payload.owner_go_status || 'not_required');
  payload.requires_owner_go = String(payload.requires_owner_go || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
  if (!payload.decision_id) {
    const eid = sanitizeForId_(payload.event_id);
    const type = sanitizeForId_(payload.decision_type);
    const policy = sanitizeForId_(payload.policy_version);
    payload.decision_id = `dec_${eid}_${type}_${policy}`;
  }

  const required = ['decision_id', 'event_id', 'decision_type', 'decision_status', 'policy_version', 'amount', 'asset_code', 'requires_owner_go', 'owner_go_status', 'reason', 'created_at', 'updated_at', 'created_by'];
  const missing = required.filter(function (key) { return payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === ''; });
  if (missing.length) throw new Error('upsertMaymunDecision validation failed: ' + missing.join(', '));

  const shape = getSheetByHeaderMap_(sheet);
  const rowIndex = findRowByKey_(sheet, function (row, map) {
    return String(row[map['event_id']] || '').trim() === String(payload.event_id).trim() &&
      String(row[map['decision_type']] || '').trim() === String(payload.decision_type).trim() &&
      String(row[map['policy_version']] || '').trim() === String(payload.policy_version).trim();
  });

  if (rowIndex > 0 && shape.headerMap['created_at'] !== undefined) {
    payload.created_at = String(sheet.getRange(rowIndex, shape.headerMap['created_at'] + 1).getValue() || payload.created_at);
  }

  const row = mapObjectToRowByHeader_(payload, shape.headers);
  if (!opts.dryRun) {
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }

  writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'upsertMaymunDecision', fundKey: SHEET_MAYMUN_DECISIONS, details: (opts.dryRun ? '[DRY_RUN] ' : '') + (rowIndex > 0 ? 'update ' : 'insert ') + payload.decision_id });
  return { action: rowIndex > 0 ? (opts.dryRun ? 'dry_run_update' : 'updated') : (opts.dryRun ? 'dry_run_insert' : 'inserted'), decision_id: payload.decision_id };
}

function upsertMaymunAllocation(allocation, options) {
  const opts = normalizeOptions_(options);
  ensureMaymunAllocationsSheet_(opts);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAYMUN_ALLOCATIONS);
  if (!sheet) throw new Error('MAYMUN_ALLOCATIONS sheet is unavailable');

  const payload = Object.assign({}, allocation || {});
  payload.created_by = String(payload.created_by || opts.actor);
  payload.created_at = String(payload.created_at || stableNowIso_());
  payload.updated_at = stableNowIso_();
  payload.allocation_status = String(payload.allocation_status || 'proposed').trim();
  if (!payload.allocation_id) {
    payload.allocation_id = `alloc_${sanitizeForId_(payload.decision_id)}_${sanitizeForId_(payload.bucket)}_${sanitizeForId_(payload.allocation_type)}`;
  }

  const isConfirmed = String(payload.allocation_status).trim() === 'confirmed';
  const confirmedAmount = Number(payload.confirmed_amount || 0);
  if (!isConfirmed && confirmedAmount !== 0) {
    payload.confirmed_amount = 0;
    writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'upsertMaymunAllocation', fundKey: SHEET_MAYMUN_ALLOCATIONS, details: 'normalized confirmed_amount to 0 for non-confirmed allocation' });
  }

  const required = ['allocation_id', 'decision_id', 'event_id', 'bucket', 'allocation_type', 'allocation_status', 'asset_code', 'amount', 'confirmed_amount', 'effective_at', 'created_at', 'updated_at', 'created_by'];
  const missing = required.filter(function (key) { return payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === ''; });
  if (missing.length) throw new Error('upsertMaymunAllocation validation failed: ' + missing.join(', '));

  const shape = getSheetByHeaderMap_(sheet);
  const rowIndex = findRowByKey_(sheet, function (row, map) {
    return String(row[map['decision_id']] || '').trim() === String(payload.decision_id).trim() &&
      String(row[map['bucket']] || '').trim() === String(payload.bucket).trim() &&
      String(row[map['allocation_type']] || '').trim() === String(payload.allocation_type).trim();
  });

  if (rowIndex > 0 && shape.headerMap['created_at'] !== undefined) {
    payload.created_at = String(sheet.getRange(rowIndex, shape.headerMap['created_at'] + 1).getValue() || payload.created_at);
  }

  const row = mapObjectToRowByHeader_(payload, shape.headers);
  if (!opts.dryRun) {
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }

  writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'upsertMaymunAllocation', fundKey: SHEET_MAYMUN_ALLOCATIONS, details: (opts.dryRun ? '[DRY_RUN] ' : '') + (rowIndex > 0 ? 'update ' : 'insert ') + payload.allocation_id });
  return { action: rowIndex > 0 ? (opts.dryRun ? 'dry_run_update' : 'updated') : (opts.dryRun ? 'dry_run_insert' : 'inserted'), allocation_id: payload.allocation_id };
}

function appendMaymunExpense(expense, options) {
  const opts = normalizeOptions_(options);
  ensureMaymunExpensesSheet_(opts);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAYMUN_EXPENSES);
  if (!sheet) throw new Error('MAYMUN_EXPENSES sheet is unavailable');

  const payload = Object.assign({}, expense || {});
  payload.created_by = String(payload.created_by || opts.actor);
  payload.created_at = String(payload.created_at || stableNowIso_());
  payload.updated_at = String(payload.updated_at || payload.created_at);
  if (!payload.expense_id) {
    const key = `${sanitizeForId_(payload.source_type)}_${sanitizeForId_(payload.source_ref)}_${sanitizeForId_(payload.recognized_at)}`;
    payload.expense_id = 'exp_' + (key.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || Utilities.getUuid());
  }

  const required = ['expense_id', 'source_type', 'category', 'expense_status', 'asset_code', 'amount', 'recognized_at', 'created_at', 'updated_at', 'created_by'];
  const missing = required.filter(function (key) { return payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === ''; });
  if (missing.length) throw new Error('appendMaymunExpense validation failed: ' + missing.join(', '));

  const row = mapObjectToRowByHeader_(payload, getSheetByHeaderMap_(sheet).headers);
  if (!opts.dryRun) sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunExpense', fundKey: SHEET_MAYMUN_EXPENSES, details: (opts.dryRun ? '[DRY_RUN] ' : '') + 'append expense_id=' + payload.expense_id });
  return { action: opts.dryRun ? 'dry_run_append' : 'appended', expense_id: payload.expense_id };
}

function appendMaymunRunwaySnapshot(snapshot, options) {
  const opts = normalizeOptions_(options);
  ensureMaymunRunwaySheet_(opts);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MAYMUN_RUNWAY);
  if (!sheet) throw new Error('MAYMUN_RUNWAY sheet is unavailable');

  const payload = Object.assign({}, snapshot || {});
  payload.created_by = String(payload.created_by || opts.actor);
  payload.snapshot_at = String(payload.snapshot_at || stableNowIso_());
  if (!payload.snapshot_id) {
    payload.snapshot_id = `runway_${sanitizeForId_(payload.snapshot_at)}_${sanitizeForId_(payload.scope_type)}_${sanitizeForId_(payload.scope_id)}_${sanitizeForId_(payload.asset_code)}`;
  }

  const required = ['snapshot_id', 'snapshot_at', 'scope_type', 'asset_code', 'confirmed_balance', 'planned_inflow', 'planned_outflow', 'confirmed_expenses', 'net_confirmed_runway', 'forecast_runway', 'calculation_version', 'created_by'];
  const missing = required.filter(function (key) { return payload[key] === undefined || payload[key] === null || String(payload[key]).trim() === ''; });
  if (missing.length) throw new Error('appendMaymunRunwaySnapshot validation failed: ' + missing.join(', '));

  const note = String(payload.notes || '');
  if (/pending|unconfirmed|ambiguous/i.test(note)) {
    writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunRunwaySnapshot', fundKey: 'ERROR', details: 'Rejected snapshot: notes indicate unconfirmed liquidity' });
    throw new Error('appendMaymunRunwaySnapshot rejected: notes indicate unconfirmed liquidity in confirmed fields');
  }

  const row = mapObjectToRowByHeader_(payload, getSheetByHeaderMap_(sheet).headers);
  if (!opts.dryRun) sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  writeDebugLog({ run_id: opts.runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'appendMaymunRunwaySnapshot', fundKey: SHEET_MAYMUN_RUNWAY, details: (opts.dryRun ? '[DRY_RUN] ' : '') + 'append snapshot_id=' + payload.snapshot_id });
  return { action: opts.dryRun ? 'dry_run_append' : 'appended', snapshot_id: payload.snapshot_id };
}

function readSheetRowsAsObjects_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const entry = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      entry[headers[c]] = row[c];
    }
    rows.push(entry);
  }
  return rows;
}

/**
 * Первый resident-tracking use-case:
 * строит resident-centric dataset взаимодействий на основе TRANSFERS+RESIDENTS
 * и сохраняет snapshot в RESIDENT_TRACKING.
 */
function syncResidentTracking() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS);
  const residentsSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const trackingSheet = ss.getSheetByName(SHEET_RESIDENT_TRACKING) || ss.insertSheet(SHEET_RESIDENT_TRACKING);

  const headers = [
    'datetime',
    'project_id',
    'resident_label',
    'resident_address',
    'fund_account_key',
    'fund_address',
    'direction',
    'counterparty_type',
    'from',
    'to',
    'asset_code',
    'asset_issuer',
    'amount',
    'class',
    'memo',
    'tx_hash',
    'is_first_contact'
  ];

  if (!transfersSheet || transfersSheet.getLastRow() <= 1 || !residentsSheet || !constSheet) {
    if (trackingSheet.getLastRow() === 0) {
      trackingSheet.appendRow(headers);
    }
    writeDebugLog({
      run_id,
      module: 'resident_tracking',
      timestamp: new Date().toISOString(),
      stage: 'syncResidentTracking',
      fundKey: 'ERROR',
      details: 'Missing required sheets or empty TRANSFERS'
    });
    return;
  }

  const residentsMap = parseResidentsSheet(residentsSheet);
  const fundAccounts = parseConstSheet(constSheet).fundAccounts || {};
  const transfers = readTransfersRowsAsObjects_(transfersSheet);
  const dataset = buildResidentTrackingDataset_(transfers, {
    residentsMap,
    fundAccounts
  }).filter(row => row.project_id && row.project_id !== 'UNMAPPED' && row.project_id !== 'AMBIGUOUS');

  trackingSheet.clearContents();
  trackingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (dataset.length > 0) {
    const rows = dataset.map((row) => [
      row.datetime,
      row.project_id,
      row.resident_label,
      row.resident_address,
      row.fund_account_key,
      row.fund_address,
      row.direction,
      row.counterparty_type,
      row.from,
      row.to,
      row.asset_code,
      row.asset_issuer,
      row.amount,
      row.class,
      row.memo,
      row.tx_hash,
      row.is_first_contact
    ]);
    trackingSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    trackingSheet.getRange('A:A').setNumberFormat('dd-mm-yyyy hh:mm:ss');
    trackingSheet.getRange('M:M').setNumberFormat('0,########');
  }

  const firstContacts = dataset.filter(r => r.is_first_contact).length;
  writeDebugLog({
    run_id,
    module: 'resident_tracking',
    timestamp: new Date().toISOString(),
    stage: 'syncResidentTracking',
    fundKey: 'SUCCESS',
    rows_read_transfers: transfers.length,
    rows_written_tracking: dataset.length,
    first_contacts_count: firstContacts,
    details: `Resident tracking snapshot built: ${dataset.length} rows, ${firstContacts} first contacts`
  });
}

function initializeResidentTimeline() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RESIDENT_TIMELINE) || ss.insertSheet(SHEET_RESIDENT_TIMELINE);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'datetime',
      'entry_point_at',
      'days_since_entry_point',
      'event_index',
      'is_entry_point',
      'source_is_first_contact',
      'interaction_key',
      'project_id',
      'resident_label',
      'resident_address',
      'fund_account_key',
      'fund_address',
      'direction',
      'counterparty_type',
      'from',
      'to',
      'asset_code',
      'asset_issuer',
      'amount',
      'class',
      'memo',
      'tx_hash'
    ]);
    sheet.getRange('A:B').setNumberFormat('dd-mm-yyyy hh:mm:ss');
    sheet.getRange('S:S').setNumberFormat('0,########');
  }
}

function buildResidentTimeline() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trackingSheet = ss.getSheetByName(SHEET_RESIDENT_TRACKING);
  const timelineSheet = ss.getSheetByName(SHEET_RESIDENT_TIMELINE) || ss.insertSheet(SHEET_RESIDENT_TIMELINE);

  initializeResidentTimeline();

  if (!trackingSheet || trackingSheet.getLastRow() <= 1) {
    writeDebugLog({
      run_id,
      module: 'resident_timeline',
      timestamp: new Date().toISOString(),
      stage: 'buildResidentTimeline',
      fundKey: 'ERROR',
      details: 'RESIDENT_TRACKING sheet is empty or not found'
    });
    return;
  }

  const trackingHeaders = trackingSheet.getRange(1, 1, 1, trackingSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const requiredHeaders = ['datetime', 'project_id', 'resident_address', 'fund_address', 'direction', 'from', 'to', 'asset_code', 'asset_issuer', 'amount', 'class', 'memo', 'tx_hash'];
  const missing = validateSheetHeaders_(trackingHeaders, requiredHeaders);
  if (missing.length > 0) {
    writeDebugLog({
      run_id,
      module: 'resident_timeline',
      timestamp: new Date().toISOString(),
      stage: 'buildResidentTimeline',
      fundKey: 'ERROR',
      details: `Missing required columns in RESIDENT_TRACKING: ${missing.join(', ')}`
    });
    return;
  }

  const sourceRows = readSheetRowsAsObjects_(trackingSheet);
  const timelineRows = buildResidentTimelineReadModel_(sourceRows, {
    maxRows: 100000
  });

  timelineSheet.clearContents();
  initializeResidentTimeline();

  if (timelineRows.length > 0) {
    const rows = timelineRows.map((row) => [
      row.datetime,
      row.entry_point_at,
      row.days_since_entry_point,
      row.event_index,
      row.is_entry_point,
      row.source_is_first_contact,
      row.interaction_key,
      row.project_id,
      row.resident_label,
      row.resident_address,
      row.fund_account_key,
      row.fund_address,
      row.direction,
      row.counterparty_type,
      row.from,
      row.to,
      row.asset_code,
      row.asset_issuer,
      row.amount,
      row.class,
      row.memo,
      row.tx_hash
    ]);
    timelineSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  writeDebugLog({
    run_id,
    module: 'resident_timeline',
    timestamp: new Date().toISOString(),
    stage: 'buildResidentTimeline',
    fundKey: 'SUCCESS',
    rows_read_tracking: sourceRows.length,
    rows_written_timeline: timelineRows.length,
    details: `Resident timeline built: ${timelineRows.length} rows`
  });
}

function initializeTokenFlows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TOKEN_FLOWS) || ss.insertSheet(SHEET_TOKEN_FLOWS);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'project_id',
      'resident_label',
      'resident_address',
      'asset_code',
      'asset_issuer',
      'direction',
      'from',
      'to',
      'tx_count',
      'total_amount',
      'first_seen_at',
      'last_seen_at'
    ]);
    sheet.getRange('J:J').setNumberFormat('0,########');
    sheet.getRange('K:L').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }
}

function buildTokenFlows() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trackingSheet = ss.getSheetByName(SHEET_RESIDENT_TRACKING);
  const tokenFlowsSheet = ss.getSheetByName(SHEET_TOKEN_FLOWS) || ss.insertSheet(SHEET_TOKEN_FLOWS);

  initializeTokenFlows();

  if (!trackingSheet || trackingSheet.getLastRow() <= 1) {
    writeDebugLog({
      run_id,
      module: 'token_flow',
      timestamp: new Date().toISOString(),
      stage: 'buildTokenFlows',
      fundKey: 'ERROR',
      details: 'RESIDENT_TRACKING sheet is empty or not found'
    });
    return;
  }

  const trackingHeaders = trackingSheet.getRange(1, 1, 1, trackingSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const requiredHeaders = ['datetime', 'project_id', 'resident_address', 'from', 'to', 'asset_code', 'asset_issuer', 'amount', 'direction', 'tx_hash'];
  const missing = validateSheetHeaders_(trackingHeaders, requiredHeaders);
  if (missing.length > 0) {
    writeDebugLog({
      run_id,
      module: 'token_flow',
      timestamp: new Date().toISOString(),
      stage: 'buildTokenFlows',
      fundKey: 'ERROR',
      details: `Missing required columns in RESIDENT_TRACKING: ${missing.join(', ')}`
    });
    return;
  }

  const sourceRows = readSheetRowsAsObjects_(trackingSheet);
  const flowRows = buildTokenFlowSnapshot_(sourceRows, {
    maxInputRows: 100000,
    maxOutputRows: 50000
  });

  tokenFlowsSheet.clearContents();
  initializeTokenFlows();

  if (flowRows.length > 0) {
    const rows = flowRows.map((row) => [
      row.project_id,
      row.resident_label,
      row.resident_address,
      row.asset_code,
      row.asset_issuer,
      row.direction,
      row.from,
      row.to,
      row.tx_count,
      row.total_amount,
      row.first_seen_at,
      row.last_seen_at
    ]);
    tokenFlowsSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  writeDebugLog({
    run_id,
    module: 'token_flow',
    timestamp: new Date().toISOString(),
    stage: 'buildTokenFlows',
    fundKey: 'SUCCESS',
    rows_read_tracking: sourceRows.length,
    rows_written_token_flows: flowRows.length,
    details: `Token flows snapshot built: ${flowRows.length} rows`
  });
}

function initializeIssuerStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ISSUER_STRUCTURE) || ss.insertSheet(SHEET_ISSUER_STRUCTURE);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'project_id',
      'resident_label',
      'resident_address',
      'fund_address',
      'from',
      'to',
      'direction',
      'counterparty_type',
      'tx_count',
      'first_seen_at',
      'last_seen_at'
    ]);
    sheet.getRange('J:K').setNumberFormat('dd-mm-yyyy hh:mm:ss');
  }
}

function buildIssuerStructure() {
  const run_id = newRunId_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trackingSheet = ss.getSheetByName(SHEET_RESIDENT_TRACKING);
  const structureSheet = ss.getSheetByName(SHEET_ISSUER_STRUCTURE) || ss.insertSheet(SHEET_ISSUER_STRUCTURE);

  initializeIssuerStructure();

  if (!trackingSheet || trackingSheet.getLastRow() <= 1) {
    writeDebugLog({
      run_id,
      module: 'issuer_structure',
      timestamp: new Date().toISOString(),
      stage: 'buildIssuerStructure',
      fundKey: 'ERROR',
      details: 'RESIDENT_TRACKING sheet is empty or not found'
    });
    return;
  }

  const trackingHeaders = trackingSheet.getRange(1, 1, 1, trackingSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const requiredHeaders = ['datetime', 'project_id', 'resident_address', 'fund_address', 'from', 'to', 'direction', 'counterparty_type', 'tx_hash'];
  const missing = validateSheetHeaders_(trackingHeaders, requiredHeaders);
  if (missing.length > 0) {
    writeDebugLog({
      run_id,
      module: 'issuer_structure',
      timestamp: new Date().toISOString(),
      stage: 'buildIssuerStructure',
      fundKey: 'ERROR',
      details: `Missing required columns in RESIDENT_TRACKING: ${missing.join(', ')}`
    });
    return;
  }

  const sourceRows = readSheetRowsAsObjects_(trackingSheet);
  const structureRows = buildIssuerStructureSnapshot_(sourceRows, {
    maxInputRows: 100000,
    maxOutputRows: 50000
  });

  structureSheet.clearContents();
  initializeIssuerStructure();

  if (structureRows.length > 0) {
    const rows = structureRows.map((row) => [
      row.project_id,
      row.resident_label,
      row.resident_address,
      row.fund_address,
      row.from,
      row.to,
      row.direction,
      row.counterparty_type,
      row.tx_count,
      row.first_seen_at,
      row.last_seen_at
    ]);
    structureSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  writeDebugLog({
    run_id,
    module: 'issuer_structure',
    timestamp: new Date().toISOString(),
    stage: 'buildIssuerStructure',
    fundKey: 'SUCCESS',
    rows_read_tracking: sourceRows.length,
    rows_written_issuer_structure: structureRows.length,
    details: `Issuer structure snapshot built: ${structureRows.length} rows`
  });
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

  // Добавлено для отладки
  Logger.log(`[callClickUpAPI] apiKey length: ${apiKey.length}, starts with: ${apiKey.substring(0, 10)}...`);

  const baseUrl = 'https://api.clickup.com/api/v2';
  const url = `${baseUrl}${endpoint}`;

  const defaultHeaders = {
    'Authorization': apiKey.startsWith('pk_') ? apiKey : `Bearer ${apiKey}`,
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
      let query = `page=${page}&archived=false&include_closed=true`;

      if (lastUpdated) {
        query += `&date_updated_gt=${Math.floor(new Date(lastUpdated).getTime() / 1000)}`;
      }

      const response = callClickUpAPI(`/list/${listId}/task?${query}`);
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
  const run_id = newRunId_();
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
      if (accountColIdx !== -1 && addressListContains_(row[accountColIdx], mapping.stellar_account)) {
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
      nextAction: customFields['Next_Action'] || task.due_date || task.name,
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
  const fromAddr = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const toAddr = 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
  const assetCode = 'EURMTL';
  const assetIssuer = 'GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
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

const directionIdx = headers.indexOf('direction');

  if (datetimeIdx === -1 || amountIdx === -1 || fundAccountKeyIdx === -1 || assetCodeIdx === -1 || assetIssuerIdx === -1 || projectIdIdx === -1 || classIdx === -1 || tagsIdx === -1 || directionIdx === -1) {
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

const direction = String(row[directionIdx] || '').trim();

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

    aggregates[key].amount_asset += (direction === 'OUT' ? -amount : amount);
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
  initializeResidentTimeline();
  initializeTokenFlows();
  initializeIssuerStructure();
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
  initializeResidentTimeline();
  initializeTokenFlows();
  initializeIssuerStructure();
}

function initializeMaymunAssetLayerSheetsManual() {
  const summary = getMaymunAssetLayerStatusSummary();
  writeDebugLog({
    run_id: newRunId_(),
    module: 'maymun_asset_layer',
    timestamp: stableNowIso_(),
    stage: 'initializeMaymunAssetLayerSheetsManual.status',
    fundKey: 'ALL',
    details: summary
  });
  Logger.log(summary);

  return ensureMaymunAssetLayerSheets({ dryRun: true, actor: 'manual_entrypoint' });
}

function syncAccountsMeta() {
  const ss = SpreadsheetApp.getActive();
  const config = parseConstSheet(ss.getSheetByName(SHEET_CONST));
  const residents = parseResidentsSheet(ss.getSheetByName(SHEET_RESIDENTS));
  const horizon = (config.HORIZON_URL || DEFAULT_HORIZON_URL).replace(/\/+$/, '');

  // ===============================
  // 1. Загружаем справочник лейблов
  // ===============================

  // ACCOUNTS: account → label (приоритет №1)
  const accountLabels = parseAccountsSheet(ss.getSheetByName(SHEET_ACCOUNTS)); // { G... : 'LABEL' }

  // fallback-лейблы из CONST и RESIDENTS
  const fallbackLabels = {};

  // из CONST (фонды)
  for (const [key, val] of Object.entries(config.fundAccounts)) {
    if (typeof val === 'string' && val.startsWith('G')) {
      fallbackLabels[val.trim()] = key.trim();
    }
  }

  // из RESIDENTS (label из B)
  for (const r of residents) {
    if (r.account && r.label) {
      fallbackLabels[r.account.trim()] = r.label.trim();
    }
    if (r.asset_issuer && r.label) {
      fallbackLabels[r.asset_issuer.trim()] = r.label.trim();
    }
  }

  // универсальный резолвер лейблов
  function getLabel(account) {
    return (
      accountLabels[account] ||
      fallbackLabels[account] ||
      ''
    );
  }

  // ===============================
  // 2. Подготавливаем листы
  // ===============================

  const sheetMeta = ss.getSheetByName('ACCOUNTS_META') || ss.insertSheet('ACCOUNTS_META');
  const sheetSigners = ss.getSheetByName('ACCOUNT_SIGNERS') || ss.insertSheet('ACCOUNT_SIGNERS');

  sheetMeta.clear();
  sheetSigners.clear();

  sheetMeta.appendRow([
    'category',        // FUND / RESIDENT
    'section',         // ключ CONST или label резидента
    'account',
    'created_by',
    'created_at',
    'low_threshold',
    'med_threshold',
    'high_threshold'
  ]);

  sheetSigners.appendRow([
    'account',
    'account_label',
    'signer',
    'signer_label',
    'weight',
    'type'
  ]);

  // ===============================
  // 3. Формируем список аккаунтов
  // ===============================

  const accounts = [];

  // фондовые аккаунты
  for (const [key, val] of Object.entries(config.fundAccounts)) {
    if (typeof val === 'string' && val.startsWith('G')) {
      accounts.push({
        category: 'FUND',
        section: key.trim(),
        account: val.trim()
      });
    }
  }

  // аккаунты резидентов
  for (const r of residents) {
    if (!r.account) continue;
    accounts.push({
      category: 'RESIDENT',
      section: r.label || '',
      account: r.account.trim()
    });
  }

  // ===============================
  // 4. Основной цикл по аккаунтам
  // ===============================

  for (const acc of accounts) {
    const account = acc.account;

    // ---- 4.1 Загружаем account info ----
    const accResp = UrlFetchApp.fetch(
      `${horizon}/accounts/${account}`,
      { headers: { Accept: 'application/json' }, muteHttpExceptions: true }
    );

    Utilities.sleep(1000);

    if (accResp.getResponseCode() !== 200) {
      // аккаунт может быть архивный/удалённый — просто пропускаем
      continue;
    }

    const accData = JSON.parse(accResp.getContentText());
    const th = accData.thresholds || {};

    // ---- 4.2 Подписанты ----
    for (const s of accData.signers || []) {
      sheetSigners.appendRow([
        account,
        getLabel(account),   // account_label
        s.key,
        getLabel(s.key),     // signer_label (через ACCOUNTS → CONST → RESIDENTS)
        s.weight,
        s.type
      ]);
    }

    // ---- 4.3 Кто создал аккаунт и когда ----
    let createdBy = '';
    let createdAt = '';

    const opsResp = UrlFetchApp.fetch(
      `${horizon}/accounts/${account}/operations?order=asc&limit=1`,
      { headers: { Accept: 'application/json' }, muteHttpExceptions: true }
    );

    // Добавляем задержку после запроса операций для соблюдения rate limits
    Utilities.sleep(1000);

    if (opsResp.getResponseCode() === 200) {
      const ops = JSON.parse(opsResp.getContentText())._embedded?.records || [];
      const createOp = ops.find(o => o.type === 'create_account');
      if (createOp) {
        createdBy = createOp.source_account || '';
        createdAt = createOp.created_at || '';
      }
    }

    // ---- 4.4 Запись в ACCOUNTS_META ----
    sheetMeta.appendRow([
      acc.category,
      acc.section,
      account,
      createdBy,
      createdAt,
      th.low_threshold || 0,
      th.med_threshold || 0,
      th.high_threshold || 0
    ]);
  }
}

// Manual operator scenario (v1.2, 2026-04-25T10:10:00Z): MAYMUN_DECISIONS -> MAYMUN_ALLOCATIONS
function runMaymunAssetLayerCreateAllocationFromSelectedDecision() {
  const runId = newRunId_();
  const ui = SpreadsheetApp.getUi();
  const result = {
    run_id: runId,
    allocation_id: '',
    action: 'blocked',
    row_delta: {},
    debug_log_stages: []
  };

  assertManualUiContext_();
  enterMaymunOwnerApprovedWriteContext_();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    if (!sheet || sheet.getName() !== SHEET_MAYMUN_DECISIONS) {
      const msg = `Run from ${SHEET_MAYMUN_DECISIONS} only.`;
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'allocation_from_decision.invalid_sheet', fundKey: SHEET_MAYMUN_DECISIONS, details: msg });
      ui.alert(msg);
      result.debug_log_stages.push('allocation_from_decision.invalid_sheet');
      Logger.log(result);
      return result;
    }

    const range = sheet.getActiveRange();
    const row = range ? range.getRow() : 0;
    if (!range || range.getNumRows() !== 1 || row <= 1) {
      const msg = 'Select exactly one data row in MAYMUN_DECISIONS.';
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'allocation_from_decision.invalid_selection', fundKey: SHEET_MAYMUN_DECISIONS, details: msg });
      ui.alert(msg);
      result.debug_log_stages.push('allocation_from_decision.invalid_selection');
      Logger.log(result);
      return result;
    }

    const shape = getSheetByHeaderMap_(sheet);
    const missingHeaders = validateSheetHeaders_(shape.headers, MAYMUN_DECISIONS_HEADERS);
    if (missingHeaders.length) {
      const msg = 'Missing headers in MAYMUN_DECISIONS: ' + missingHeaders.join(', ');
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'allocation_from_decision.missing_headers', fundKey: SHEET_MAYMUN_DECISIONS, details: msg });
      ui.alert(msg);
      result.debug_log_stages.push('allocation_from_decision.missing_headers');
      Logger.log(result);
      return result;
    }

    const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const decision = {};
    for (let i = 0; i < shape.headers.length; i++) {
      decision[shape.headers[i]] = rowData[i];
    }

    const required = ['decision_id', 'event_id', 'decision_type', 'decision_status', 'project_id', 'amount', 'asset_code', 'owner_go_status'];
    const missing = required.filter(function (key) {
      return decision[key] === undefined || decision[key] === null || String(decision[key]).trim() === '';
    });
    if (missing.length) {
      const msg = 'Missing required fields in selected decision: ' + missing.join(', ');
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'allocation_from_decision.missing_required_fields', fundKey: SHEET_MAYMUN_DECISIONS, details: msg });
      ui.alert(msg);
      result.debug_log_stages.push('allocation_from_decision.missing_required_fields');
      Logger.log(result);
      return result;
    }

    const decisionStatus = String(decision.decision_status || '').trim().toLowerCase();
    const ownerGoStatus = String(decision.owner_go_status || '').trim().toLowerCase();
    if (decisionStatus !== 'approved' || ownerGoStatus !== 'approved') {
      const msg = 'Allocation blocked: decision is not approved by decision_status/owner_go_status.';
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'allocation_blocked_pending_approval', fundKey: SHEET_MAYMUN_DECISIONS, details: msg + ` decision_status=${decisionStatus}, owner_go_status=${ownerGoStatus}` });
      ui.alert('Decision is not approved. Allocation was not created.');
      result.debug_log_stages.push('allocation_blocked_pending_approval');
      Logger.log(result);
      return result;
    }

    const amount = Number(decision.amount || 0);

    // v1.3 (2026-04-25T10:18:30Z): prefer linked event semantics over decision_type-only heuristic
    // and block conflicting opposite allocation_type for same decision+bucket.
    const eventsSheet = ss.getSheetByName(SHEET_MAYMUN_EVENTS);
    let linkedEventType = '';
    let linkedDirection = '';
    if (eventsSheet && eventsSheet.getLastRow() > 1) {
      const eventsShape = getSheetByHeaderMap_(eventsSheet);
      const eventIdIdx = eventsShape.headerMap['event_id'];
      if (eventIdIdx !== undefined) {
        const eventsData = eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, eventsSheet.getLastColumn()).getValues();
        const targetEventId = String(decision.event_id || '').trim();
        for (let i = 0; i < eventsData.length; i++) {
          if (String(eventsData[i][eventIdIdx] || '').trim() === targetEventId) {
            const typeIdx = eventsShape.headerMap['event_type'];
            const dirIdx = eventsShape.headerMap['direction'];
            linkedEventType = typeIdx !== undefined ? String(eventsData[i][typeIdx] || '').trim().toLowerCase() : '';
            linkedDirection = dirIdx !== undefined ? String(eventsData[i][dirIdx] || '').trim().toLowerCase() : '';
            break;
          }
        }
      }
    }

    let allocationType = 'planned_outflow';
    const decisionType = String(decision.decision_type || '').trim().toLowerCase();
    if (linkedEventType === 'dividend_received' || linkedEventType === 'funding_received' || linkedDirection === 'in') {
      allocationType = 'planned_inflow';
    } else if (decisionType === 'record_income') {
      allocationType = 'planned_inflow';
    }

    if (!String(decision.approved_by || '').trim() || !String(decision.approved_at || '').trim()) {
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: stableNowIso_(),
        stage: 'allocation_from_decision.approval_audit_missing',
        fundKey: SHEET_MAYMUN_DECISIONS,
        details: 'approved_by and/or approved_at is empty; allocation proceeds with warning'
      });
    }

    // Block creating opposite allocation_type for the same decision+bucket.
    // This prevents dual active inflow/outflow rows for a single decision.
    const allocationsSheet = ss.getSheetByName(SHEET_MAYMUN_ALLOCATIONS);
    if (allocationsSheet && allocationsSheet.getLastRow() > 1) {
      const allocShape = getSheetByHeaderMap_(allocationsSheet);
      const decisionIdx = allocShape.headerMap['decision_id'];
      const bucketIdx = allocShape.headerMap['bucket'];
      const typeIdx = allocShape.headerMap['allocation_type'];
      const allocIdIdx = allocShape.headerMap['allocation_id'];
      if (decisionIdx !== undefined && bucketIdx !== undefined && typeIdx !== undefined) {
        const allocData = allocationsSheet.getRange(2, 1, allocationsSheet.getLastRow() - 1, allocationsSheet.getLastColumn()).getValues();
        const targetDecisionId = String(decision.decision_id || '').trim();
        const targetBucket = 'runway';
        const conflictingIds = [];
        for (let i = 0; i < allocData.length; i++) {
          const d = String(allocData[i][decisionIdx] || '').trim();
          const b = String(allocData[i][bucketIdx] || '').trim();
          const t = String(allocData[i][typeIdx] || '').trim();
          if (d === targetDecisionId && b === targetBucket && t && t !== allocationType) {
            conflictingIds.push(allocIdIdx !== undefined ? String(allocData[i][allocIdIdx] || '').trim() : `row_${i + 2}`);
          }
        }
        if (conflictingIds.length) {
          const msg = 'Allocation blocked: conflicting allocation_type exists for the same decision/bucket. Resolve old row first.';
          writeDebugLog({
            run_id: runId,
            module: 'maymun_asset_layer',
            timestamp: stableNowIso_(),
            stage: 'allocation_blocked_conflicting_allocation_type',
            fundKey: SHEET_MAYMUN_ALLOCATIONS,
            details: `${msg} decision_id=${targetDecisionId}, expected_type=${allocationType}, conflicting_ids=${conflictingIds.join(',')}`
          });
          ui.alert('Allocation blocked: conflicting allocation type already exists for this decision. Resolve previous allocation row first.');
          result.debug_log_stages.push('allocation_blocked_conflicting_allocation_type');
          Logger.log(result);
          return result;
        }
      }
    }

    const before = getMaymunAssetLayerRowCounts();

    const upsert = upsertMaymunAllocation({
      decision_id: String(decision.decision_id).trim(),
      event_id: String(decision.event_id).trim(),
      project_id: String(decision.project_id || '').trim(),
      resident_id: String(decision.resident_id || '').trim(),
      bucket: 'runway',
      allocation_type: allocationType,
      allocation_status: 'confirmed',
      asset_code: String(decision.asset_code || '').trim(),
      asset_issuer: '',
      amount: amount,
      confirmed_amount: amount,
      effective_at: stableNowIso_(),
      created_by: 'selected_decision_manual_operator',
      notes: 'Created from selected MAYMUN_DECISIONS row'
    }, {
      runId: runId,
      actor: 'selected_decision_manual_operator',
      __ownerApprovedWrite: true
    });

    const after = getMaymunAssetLayerRowCounts();
    const delta = computeMaymunRowCountDelta(before, after);

    result.allocation_id = upsert.allocation_id;
    result.action = upsert.action;
    result.row_delta = delta;
    result.debug_log_stages.push('upsertMaymunAllocation');

    const message = [
      'Allocation created from selected decision.',
      '',
      `Run ID: ${runId}`,
      `Decision: ${String(decision.decision_id).trim()}`,
      `Allocation: ${upsert.action}`,
      `Delta: ${SHEET_MAYMUN_ALLOCATIONS} ${delta[SHEET_MAYMUN_ALLOCATIONS] ? (delta[SHEET_MAYMUN_ALLOCATIONS].delta >= 0 ? '+' : '') + delta[SHEET_MAYMUN_ALLOCATIONS].delta : '+0'}`
    ].join('\n');

    ui.alert(message);
    Logger.log(result);
    return result;
  } finally {
    exitMaymunOwnerApprovedWriteContext_();
  }
}

// Manual operator scenario (v1.3, 2026-04-25T10:27:00Z): selected MAYMUN_ALLOCATIONS row scopes MAYMUN_RUNWAY snapshot asset.
function runMaymunAssetLayerCreateRunwaySnapshot() {
  const runId = newRunId_();
  const ui = SpreadsheetApp.getUi();
  const result = {
    run_id: runId,
    snapshot_id: '',
    action: 'blocked',
    row_delta: {},
    asset_code: '',
    debug_log_stages: []
  };

  assertManualUiContext_();
  enterMaymunOwnerApprovedWriteContext_();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventsSheet = ss.getSheetByName(SHEET_MAYMUN_EVENTS);
    const allocationsSheet = ss.getSheetByName(SHEET_MAYMUN_ALLOCATIONS);
    const expensesSheet = ss.getSheetByName(SHEET_MAYMUN_EXPENSES);
    const runwaySheet = ss.getSheetByName(SHEET_MAYMUN_RUNWAY);

    const missingSheets = [];
    if (!eventsSheet) missingSheets.push(SHEET_MAYMUN_EVENTS);
    if (!allocationsSheet) missingSheets.push(SHEET_MAYMUN_ALLOCATIONS);
    if (!expensesSheet) missingSheets.push(SHEET_MAYMUN_EXPENSES);
    if (!runwaySheet) missingSheets.push(SHEET_MAYMUN_RUNWAY);
    if (missingSheets.length) {
      const msg = 'Missing sheets: ' + missingSheets.join(', ');
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.missing_sheets', fundKey: 'ERROR', details: msg });
      result.debug_log_stages.push('runway_snapshot.missing_sheets');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const missingHeaders = [];
    const eventsShape = getSheetByHeaderMap_(eventsSheet);
    const allocationsShape = getSheetByHeaderMap_(allocationsSheet);
    const expensesShape = getSheetByHeaderMap_(expensesSheet);
    const runwayShape = getSheetByHeaderMap_(runwaySheet);

    const eventsMissing = validateSheetHeaders_(eventsShape.headers, MAYMUN_EVENTS_HEADERS);
    const allocationsMissing = validateSheetHeaders_(allocationsShape.headers, MAYMUN_ALLOCATIONS_HEADERS);
    const expensesMissing = validateSheetHeaders_(expensesShape.headers, MAYMUN_EXPENSES_HEADERS);
    const runwayMissing = validateSheetHeaders_(runwayShape.headers, MAYMUN_RUNWAY_HEADERS);
    if (eventsMissing.length) missingHeaders.push(`${SHEET_MAYMUN_EVENTS}: ${eventsMissing.join(', ')}`);
    if (allocationsMissing.length) missingHeaders.push(`${SHEET_MAYMUN_ALLOCATIONS}: ${allocationsMissing.join(', ')}`);
    if (expensesMissing.length) missingHeaders.push(`${SHEET_MAYMUN_EXPENSES}: ${expensesMissing.join(', ')}`);
    if (runwayMissing.length) missingHeaders.push(`${SHEET_MAYMUN_RUNWAY}: ${runwayMissing.join(', ')}`);

    if (missingHeaders.length) {
      const msg = 'Missing required headers. ' + missingHeaders.join(' | ');
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.missing_headers', fundKey: 'ERROR', details: msg });
      result.debug_log_stages.push('runway_snapshot.missing_headers');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const activeSheet = ss.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== SHEET_MAYMUN_ALLOCATIONS) {
      const msg = `Runway snapshot is blocked: select one data row on ${SHEET_MAYMUN_ALLOCATIONS}. Active sheet: ${activeSheet ? activeSheet.getName() : '<none>'}.`;
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.invalid_selection', fundKey: 'ERROR', details: msg });
      result.debug_log_stages.push('runway_snapshot.invalid_selection');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const selectedRange = activeSheet.getActiveRange();
    if (!selectedRange || selectedRange.getNumRows() !== 1 || selectedRange.getRow() === 1) {
      const msg = `Runway snapshot is blocked: select exactly one data row on ${SHEET_MAYMUN_ALLOCATIONS} (header row is not allowed).`;
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.invalid_selection', fundKey: 'ERROR', details: msg });
      result.debug_log_stages.push('runway_snapshot.invalid_selection');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const selectedRow = selectedRange.getRow();
    const allocationHeaders = activeSheet.getRange(1, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    const allocationHeaderMap = {};
    for (let i = 0; i < allocationHeaders.length; i++) {
      const normalized = normalizeHeaderKey_(allocationHeaders[i]);
      if (normalized) allocationHeaderMap[normalized] = i;
    }
    const selectedRowValues = activeSheet.getRange(selectedRow, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    const selectedAllocationStatus = String(selectedRowValues[allocationHeaderMap['allocation_status']] || '').trim().toLowerCase();
    const selectedAssetCode = String(selectedRowValues[allocationHeaderMap['asset_code']] || '').trim();

    if (selectedAllocationStatus !== 'confirmed') {
      const msg = `Runway snapshot is blocked: selected allocation must be confirmed. Asset: ${selectedAssetCode || '<empty>'}, allocation_status: ${selectedAllocationStatus || '<empty>'}.`;
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.invalid_selection', fundKey: 'ERROR', details: msg });
      result.debug_log_stages.push('runway_snapshot.invalid_selection');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    if (!selectedAssetCode) {
      const msg = 'Runway snapshot is blocked: selected allocation has empty asset_code.';
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.asset_code_missing', fundKey: SHEET_MAYMUN_ALLOCATIONS, details: msg });
      result.debug_log_stages.push('runway_snapshot.asset_code_missing');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const allocationRows = readSheetRowsAsObjects_(allocationsSheet);
    const expenseRows = readSheetRowsAsObjects_(expensesSheet);

    const confirmedAllocations = allocationRows.filter(function (row) {
      return String(row.allocation_status || '').trim().toLowerCase() === 'confirmed' && String(row.asset_code || '').trim() === selectedAssetCode;
    });

    if (!confirmedAllocations.length) {
      const msg = `No confirmed allocations found for selected asset. Asset: ${selectedAssetCode}. Snapshot was not created.`;
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.no_confirmed_allocations', fundKey: SHEET_MAYMUN_ALLOCATIONS, details: msg });
      result.debug_log_stages.push('runway_snapshot.no_confirmed_allocations');
      ui.alert(msg);
      Logger.log(result);
      return result;
    }

    const paidOrConfirmedExpenses = expenseRows.filter(function (row) {
      const status = String(row.expense_status || '').trim().toLowerCase();
      return (status === 'paid' || status === 'confirmed') && String(row.asset_code || '').trim() === selectedAssetCode;
    });

    const ambiguousAllocations = allocationRows.filter(function (row) {
      const st = String(row.allocation_status || '').trim().toLowerCase();
      return st === 'pending' || st === 'manual_review' || st === 'proposed' || st === 'pending_approval' || st === 'ambiguous';
    }).length;
    const ambiguousExpenses = expenseRows.filter(function (row) {
      const st = String(row.expense_status || '').trim().toLowerCase();
      return st === 'pending' || st === 'manual_review' || st === 'proposed' || st === 'pending_approval' || st === 'ambiguous';
    }).length;
    if (ambiguousAllocations + ambiguousExpenses > 0) {
      writeDebugLog({ run_id: runId, module: 'maymun_asset_layer', timestamp: stableNowIso_(), stage: 'runway_snapshot.unconfirmed_rows_ignored', fundKey: 'WARN', details: `ignored allocations=${ambiguousAllocations}, expenses=${ambiguousExpenses}` });
      result.debug_log_stages.push('runway_snapshot.unconfirmed_rows_ignored');
    }

    let plannedInflow = 0;
    let plannedOutflow = 0;
    const sourceAllocationIds = [];
    const sourceEventIdsMap = {};
    for (let i = 0; i < confirmedAllocations.length; i++) {
      const row = confirmedAllocations[i];
      const allocationType = String(row.allocation_type || '').trim().toLowerCase();
      const confirmedAmount = Number(row.confirmed_amount || 0);
      if (allocationType === 'planned_inflow') plannedInflow += confirmedAmount;
      if (allocationType === 'planned_outflow') plannedOutflow += confirmedAmount;
      const allocationId = String(row.allocation_id || '').trim();
      if (allocationId) sourceAllocationIds.push(allocationId);
      const eventId = String(row.event_id || '').trim();
      if (eventId) sourceEventIdsMap[eventId] = true;
    }

    let confirmedExpenses = 0;
    const sourceExpenseIds = [];
    for (let i = 0; i < paidOrConfirmedExpenses.length; i++) {
      const row = paidOrConfirmedExpenses[i];
      confirmedExpenses += Number(row.amount || 0);
      const expenseId = String(row.expense_id || '').trim();
      if (expenseId) sourceExpenseIds.push(expenseId);
    }

    const confirmedBalance = plannedInflow;
    const netConfirmedRunway = confirmedBalance - plannedOutflow - confirmedExpenses;
    const forecastRunway = confirmedBalance - plannedOutflow;
    const now = stableNowIso_();

    const before = getMaymunAssetLayerRowCounts();
    const appended = appendMaymunRunwaySnapshot({
      snapshot_id: `runway_${sanitizeForId_(now)}_${sanitizeForId_(selectedAssetCode)}`,
      snapshot_at: now,
      scope_type: 'global',
      scope_id: 'manual_snapshot',
      asset_code: selectedAssetCode,
      confirmed_balance: confirmedBalance,
      planned_inflow: plannedInflow,
      planned_outflow: plannedOutflow,
      confirmed_expenses: confirmedExpenses,
      net_confirmed_runway: netConfirmedRunway,
      forecast_runway: forecastRunway,
      runway_days: '',
      source_event_ids: Object.keys(sourceEventIdsMap).join(','),
      source_allocation_ids: sourceAllocationIds.join(','),
      source_expense_ids: sourceExpenseIds.join(','),
      calculation_version: 'mvp_manual_runway_v1',
      created_by: 'runway_manual_operator',
      notes: 'Manual runway snapshot from confirmed MAYMUN_* rows'
    }, {
      runId: runId,
      actor: 'runway_manual_operator',
      __ownerApprovedWrite: true
    });

    const after = getMaymunAssetLayerRowCounts();
    const delta = computeMaymunRowCountDelta(before, after);

    result.snapshot_id = appended.snapshot_id;
    result.asset_code = selectedAssetCode;
    result.action = appended.action;
    result.row_delta = delta;
    result.debug_log_stages.push('appendMaymunRunwaySnapshot');

    const message = [
      'Runway snapshot created.',
      '',
      `Run ID: ${runId}`,
      `Asset: ${selectedAssetCode}`,
      `Confirmed balance: ${confirmedBalance}`,
      `Planned outflow: ${plannedOutflow}`,
      `Confirmed expenses: ${confirmedExpenses}`,
      `Net runway: ${netConfirmedRunway}`
    ].join('\n');

    ui.alert(message);
    Logger.log(result);
    return result;
  } finally {
    exitMaymunOwnerApprovedWriteContext_();
  }
}

function isUnresolvedProjectId_(projectId) {
  const normalized = String(projectId || '').trim().toUpperCase();
  if (!normalized) return true;
  const unresolved = {
    'UNMAPPED': true,
    'UNKNOWN': true,
    'AMBIGUOUS': true,
    'UNASSIGNED': true,
    'N/A': true,
    'NA': true,
    'NULL': true,
    'NONE': true
  };
  return !!unresolved[normalized];
}

// Selected transfer flow update (v1.2, 2026-04-25T09:37:00Z): unresolved project_id is a manual blocker.
function runMaymunAssetLayerWriteSelectedTransfer() {
  assertManualUiContext_();
  
  const runId = newRunId_();
  const now = stableNowIso_();
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // ========== PRECONDITIONS ==========
    
    // 1. Проверить активный лист
    const activeSheet = ss.getActiveSheet();
    if (activeSheet.getName() !== SHEET_TRANSFERS) {
      const msg = `Ошибка: активный лист должен быть "${SHEET_TRANSFERS}", а не "${activeSheet.getName()}"`;
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.precondition',
        fundKey: 'ERROR',
        details: 'validation_failed: ' + msg
      });
      ui.alert(msg);
      return { runId, success: false, error: msg };
    }
    
    // 2. Проверить выбранный диапазон
    const range = activeSheet.getActiveRange();
    if (!range || range.getNumRows() !== 1) {
      const msg = 'Ошибка: выберите ровно одну строку данных (не header)';
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.precondition',
        fundKey: 'ERROR',
        details: 'validation_failed: ' + msg
      });
      ui.alert(msg);
      return { runId, success: false, error: msg };
    }
    
    const selectedRow = range.getRow();
    if (selectedRow === 1) {
      const msg = 'Ошибка: выбрана строка header. Выберите строку данных.';
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.precondition',
        fundKey: 'ERROR',
        details: 'validation_failed: ' + msg
      });
      ui.alert(msg);
      return { runId, success: false, error: msg };
    }
    
    // 3. Прочитать header и построить map колонок
    const headerRow = activeSheet.getRange(1, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    const headerMap = {};
    for (let i = 0; i < headerRow.length; i++) {
      const normalized = normalizeHeaderKey_(headerRow[i]);
      if (normalized) headerMap[normalized] = i;
    }
    
    // 4. Прочитать выбранную строку
    const dataRow = activeSheet.getRange(selectedRow, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    
    // 5. Проверить обязательные поля
    const requiredFields = ['tx_hash', 'op_id', 'amount', 'asset_code', 'direction', 'project_id', 'fund_account_key', 'class', 'datetime'];
    const missingFields = [];
    const transferData = {};
    
    for (const field of requiredFields) {
      const normalized = normalizeHeaderKey_(field);
      const colIdx = headerMap[normalized];
      if (colIdx === undefined) {
        missingFields.push(field);
        continue;
      }
      const value = dataRow[colIdx];
      if (value === undefined || value === null || String(value).trim() === '') {
        missingFields.push(field);
      } else {
        transferData[field] = value;
      }
    }
    
    if (missingFields.length > 0) {
      const msg = `Ошибка: отсутствуют обязательные поля: ${missingFields.join(', ')}`;
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.precondition',
        fundKey: 'ERROR',
        details: 'validation_failed: ' + msg
      });
      ui.alert(msg);
      return { runId, success: false, error: msg };
    }
    
    // ========== MAPPING ==========
    
    // Прочитать дополнительные поля (опциональные)
    const optionalFields = ['asset_issuer', 'from_label', 'to_label', 'memo'];
    for (const field of optionalFields) {
      const normalized = normalizeHeaderKey_(field);
      const colIdx = headerMap[normalized];
      if (colIdx !== undefined) {
        transferData[field] = dataRow[colIdx] || '';
      } else {
        transferData[field] = '';
      }
    }
    
    // Построить event_type по direction/class
    const direction = String(transferData.direction || '').trim().toUpperCase();
    const transferClass = String(transferData.class || '').trim();
    const projectId = String(transferData.project_id || '').trim();
    const isProjectMappingRequired = isUnresolvedProjectId_(projectId);
    
    let eventType = 'transfer_detected';
    let eventStatus = 'manual_review';
    let confidence = 'low';
    
    if (direction === 'IN' && transferClass === 'Dividend') {
      eventType = 'dividend_received';
      eventStatus = 'confirmed';
      confidence = 'high';
    } else if (direction === 'IN' && transferClass === 'Funding') {
      eventType = 'funding_received';
      eventStatus = 'manual_review';
      confidence = 'medium';
    } else if (direction === 'OUT') {
      eventType = 'outgoing_transfer';
      eventStatus = 'manual_review';
      confidence = 'medium';
    }

    if (isProjectMappingRequired) {
      eventStatus = 'manual_review';
      confidence = 'low';
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'selectedTransfer.project_mapping_required',
        fundKey: 'BLOCKER',
        details: `project_id=${projectId || '<empty>'}; class=${transferClass}; direction=${direction}; forcing manual_review`
      });
    }
    
    // Построить event object
    const event = {
      source_type: 'transfer',
      source_sheet: SHEET_TRANSFERS,
      source_row: String(selectedRow),
      tx_hash: String(transferData.tx_hash || '').trim(),
      op_id: String(transferData.op_id || '').trim(),
      transfer_key: `${String(transferData.tx_hash || '').trim()}:${String(transferData.op_id || '').trim()}`,
      event_type: eventType,
      source_tx_hash: String(transferData.tx_hash || '').trim(),
      source_op_id: String(transferData.op_id || '').trim(),
      event_time: String(transferData.datetime || '').trim(),
      gross_amount: String(transferData.amount || '').trim(),
      currency_code: String(transferData.asset_code || '').trim(),
      project_id: projectId,
      resident_id: '',
      account_id: String(transferData.fund_account_key || '').trim(),
      asset_code: String(transferData.asset_code || '').trim(),
      asset_issuer: String(transferData.asset_issuer || '').trim(),
      amount: String(transferData.amount || '').trim(),
      direction: direction.toLowerCase(),
      event_status: eventStatus,
      confidence: confidence,
      occurred_at: String(transferData.datetime || '').trim(),
      detected_at: now,
      created_at: now,
      created_by: 'selected_transfer_manual_operator',
      notes: `from_label=${transferData.from_label || ''}, to_label=${transferData.to_label || ''}, memo=${transferData.memo || ''}, class=${transferClass}${isProjectMappingRequired ? ', reason=project_mapping_required' : ''}`
    };
    
    // ========== PRECHECK ==========
    
    const before = getMaymunAssetLayerRowCounts();
    const readiness = validateMaymunSheetReadiness_();
    
    if (!readiness.ok) {
      const msg = `Ошибка: MAYMUN листы не готовы. ${JSON.stringify(readiness.issues)}`;
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.precheck',
        fundKey: 'ERROR',
        details: msg
      });
      ui.alert(msg);
      return { runId, success: false, error: msg };
    }
    
    // Dry-run preview
    const previewRunId = `${runId}_preview`;
    const previewOpts = { dryRun: true, actor: 'selected_transfer_manual_operator', runId: previewRunId };
    const previewEvent = appendMaymunEvent(event, previewOpts);
    
    writeDebugLog({
      run_id: runId,
      module: 'maymun_asset_layer',
      timestamp: now,
      stage: 'runMaymunAssetLayerWriteSelectedTransfer.precheck',
      fundKey: 'OK',
      details: `Precheck passed. Event preview: ${JSON.stringify(previewEvent)}`
    });
    
    // ========== WRITE ==========
    
    const writeOpts = {
      dryRun: false,
      actor: 'selected_transfer_manual_operator',
      runId: runId,
      __ownerApprovedWrite: true
    };
    
    enterMaymunOwnerApprovedWriteContext_();
    try {
      const eventResult = appendMaymunEvent(event, writeOpts);
      
      // Если событие создано (не дубликат), проверить нужна ли DECISION
      let decisionResult = { action: 'skipped', reason: 'not_required' };
      if (eventResult.action === 'appended' && eventStatus === 'manual_review') {
        const decisionReason = isProjectMappingRequired ? 'project_mapping_required' : 'manual_review_required';
        const decisionNotes = isProjectMappingRequired
          ? `project_mapping_required: project_id=${event.project_id || '<empty>'}; map transfer to a RESIDENTS project before approval; ${event.notes}`
          : event.notes;

        const decision = {
          event_id: eventResult.event_id,
          decision_type: 'manual_review',
          decision_status: 'pending_approval',
          policy_version: 'mvp_selected_transfer_v1',
          rule_version: 'mvp_selected_transfer_v1',
          project_id: event.project_id,
          resident_id: '',
          amount: event.amount,
          gross_amount: event.amount,
          asset_code: event.asset_code,
          success_fee_percent: '',
          success_fee_amount: '',
          requires_owner_go: 'TRUE',
          owner_go_status: 'pending',
          reason: decisionReason,
          reason_code: decisionReason,
          comment: decisionNotes,
          notes: decisionNotes
        };
        decisionResult = upsertMaymunDecision(decision, writeOpts);
      }
      
      // ========== POSTCHECK ==========
      
      const after = getMaymunAssetLayerRowCounts();
      const delta = computeMaymunRowCountDelta(before, after);
      
      writeDebugLog({
        run_id: runId,
        module: 'maymun_asset_layer',
        timestamp: now,
        stage: 'runMaymunAssetLayerWriteSelectedTransfer.postcheck',
        fundKey: 'SUCCESS',
        details: JSON.stringify({
          event_action: eventResult.action,
          event_id: eventResult.event_id,
          decision_action: decisionResult.action,
          decision_id: decisionResult.decision_id,
          delta: delta
        })
      });
      
      // ========== OPERATOR FEEDBACK ==========
      
      const alertMsg = `MAYMUN selected transfer processed.

Run ID: ${runId}
Event: ${eventResult.action}
Decision: ${decisionResult.action}
Delta:
MAYMUN_EVENTS ${delta[SHEET_MAYMUN_EVENTS]?.delta >= 0 ? '+' : ''}${delta[SHEET_MAYMUN_EVENTS]?.delta || 0}
MAYMUN_DECISIONS ${delta[SHEET_MAYMUN_DECISIONS]?.delta >= 0 ? '+' : ''}${delta[SHEET_MAYMUN_DECISIONS]?.delta || 0}`;
      
      Logger.log(alertMsg);
      ui.alert(alertMsg);
      
      return {
        runId: runId,
        success: true,
        eventResult: eventResult,
        decisionResult: decisionResult,
        delta: delta
      };
      
    } finally {
      exitMaymunOwnerApprovedWriteContext_();
    }
    
  } catch (e) {
    const errorMsg = `Критическая ошибка: ${e.toString()}`;
    writeDebugLog({
      run_id: runId,
      module: 'maymun_asset_layer',
      timestamp: now,
      stage: 'runMaymunAssetLayerWriteSelectedTransfer.error',
      fundKey: 'ERROR',
      details: errorMsg
    });
    Logger.log(errorMsg);
    ui.alert(errorMsg);
    return { runId, success: false, error: errorMsg };
  }
}

function ping() {
  return new Date().toISOString();
}
