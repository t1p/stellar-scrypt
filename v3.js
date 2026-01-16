const DEBUG = true;
const DEBUG_LEVEL = 2;

const SHEET_TRANSFERS = 'TRANSFERS';
const SHEET_MEMO_QUEUE = 'TRANSFERS_MEMO_QUEUE';
const SHEET_DEBUG = 'DEBUG_LOG';
const SHEET_CONST = 'CONST';
const SHEET_RESIDENTS = 'RESIDENTS';
const SHEET_ACCOUNTS = 'ACCOUNTS';
const SHEET_ADDRESS_TRANSACTIONS = 'ADDRESS_TRANSACTIONS';

const MEMO_CACHE_TTL = 21600; // 6 часов
const MAX_MEMO_FETCH_PER_RUN = 300;

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

// ========== Основная синхронизация ==========
function syncStellarTransfers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const constSheet = ss.getSheetByName(SHEET_CONST);
  const resSheet = ss.getSheetByName(SHEET_RESIDENTS);
  const accSheet = ss.getSheetByName(SHEET_ACCOUNTS);
  const transfersSheet = ss.getSheetByName(SHEET_TRANSFERS) || ss.insertSheet(SHEET_TRANSFERS);

  // Создаем заголовки, если лист пуст
  if (transfersSheet.getLastRow() === 0) {
    transfersSheet.appendRow(['section', 'datetime', 'from', 'from_label', 'to', 'to_label', 'asset', 'amount', 'memo', 'tx_hash']);
    transfersSheet.getRange('H:H').setNumberFormat('0,########'); // Формат для Amount
    transfersSheet.getRange('B:B').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Формат для Datetime
  }

  const config = parseConstSheet(constSheet);
  const residentsMap = parseResidentsSheet(resSheet);
  const accountsLabelMap = parseAccountsSheet(accSheet);
  const bsnLabelMap = fetchBSNLabels();
  const fundAccounts = config.fundAccounts;
  const horizon = config.HORIZON_URL;
  const startDate = config.START_DATE ? new Date(`${config.START_DATE}T00:00:00Z`) : null;
  const endDate = config.END_DATE ? new Date(`${config.END_DATE}T23:59:59Z`) : null;

  const props = PropertiesService.getUserProperties();
  const cache = CacheService.getScriptCache();

  const allRows = [];
  const allNewMemoHashes = [];

  for (const fundKey in fundAccounts) {
    const fundAddress = fundAccounts[fundKey];
    const cursorKey = `cursor_payments_${fundKey}`;
    const cursor = props.getProperty(cursorKey);
    const log = {
      timestamp: new Date().toISOString(),
      stage: 'syncStellarTransfers',
      fundKey,
      address: fundAddress,
      cursor: cursor || 'START',
      fetched: 0,
      typeOk: 0,
      nonNative: 0,
      inDate: 0,
      minAmountOk: 0,
      roleOk: 0,
      uniqueTx: 0,
      rowsPrepared: 0,
      rowsWritten: 0,
      memoCacheHit: 0,
      memoFetched: 0,
      memoQueued: 0,
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
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по типу: ${rec.type}`);
        continue;
      }
      log.typeOk++;

      if (rec.asset_type === 'native') {
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен native asset: ${rec.asset_type}`);
        continue;
      }
      log.nonNative++;

      const dt = new Date(rec.created_at);
      if ((startDate && dt < startDate) || (endDate && dt > endDate)) {
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по дате: ${rec.created_at}`);
        // Если order=asc и мы вышли за END_DATE, можно прекращать чтение
        if (endDate && dt > endDate) break;
        continue;
      }
      log.inDate++;

      const amountFloat = parseFloat(rec.amount);
      if (amountFloat < 0.01) {
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по сумме: ${rec.amount}`);
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

      let section = '';
      if (fromIsRes && toIsFund) section = 'IN';
      else if (fromIsFund && toIsRes) section = 'OUT';
      else {
        if (DEBUG && DEBUG_LEVEL >= 2) Logger.log(`[${fundKey}] Пропущен по ролям: from=${from}, to=${to}`);
        continue;
      }
      log.roleOk++;

      const txHash = rec.transaction_hash;
      if (!txHash || txHashes.has(txHash)) continue;
      txHashes.add(txHash);
      log.uniqueTx++;

      const assetCode = rec.asset_code || rec.asset_type;
      const amount = amountFloat;

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
        `=HYPERLINK("${horizon.replace('/horizon', '')}/transactions/${txHash}"; "${txHash}")`
      ];
      rows.push(row);
    }

    log.rowsPrepared = rows.length;
    allRows.push(...rows);

    // Запись курсора
    props.setProperty(cursorKey, newCursor);

    // Запись лога. Если rowsWritten == 0, лог должен явно вывести главную причину
    if (log.rowsPrepared === 0 && log.fetched > 0) {
      if (log.roleOk === 0) log.details = 'Главная причина: roleOk (фонд↔резидент) = 0';
      else if (log.minAmountOk === 0) log.details = 'Главная причина: minAmountOk (<0.01) = 0';
      else if (log.inDate === 0) log.details = 'Главная причина: inDate = 0';
      else if (log.nonNative === 0) log.details = 'Главная причина: nonNative (XLM) = 0';
      else log.details = 'Неизвестная причина обнуления выборки.';
    } else if (log.rowsPrepared > 0) {
      log.details = `Успешно подготовлено ${log.rowsPrepared} строк.`;
    } else if (log.fetched === 0) {
      log.details = `Не получено ни одной записи из Horizon. Проверьте адрес фонда ${fundAddress} и HORIZON_URL.`;
    }
    writeDebugLog(log);
  }

  // Запись всех строк в TRANSFERS
  if (allRows.length > 0) {
    const lastRow = transfersSheet.getLastRow();
    // Очистка диапазона A2:J(lastRow) перед записью
    if (lastRow > 1) {
      transfersSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
    }
    
    transfersSheet.getRange(2, 1, allRows.length, 10).setValues(allRows);
    
    // Форматирование столбцов
    transfersSheet.getRange('H:H').setNumberFormat('0,########'); // Amount
    transfersSheet.getRange('B:B').setNumberFormat('dd-mm-yyyy hh:mm:ss'); // Datetime
    
    // Обновляем счетчик rowsWritten в последнем логе
    const lastLog = readLastDebugLog();
    if (lastLog) {
      lastLog.rowsWritten = allRows.length;
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
  for (const [key, val] of rows) {
    if (!key) continue;
    const strVal = String(val).trim();
    if (key === 'HORIZON_URL') config.HORIZON_URL = strVal;
    else if (key === 'START_DATE') config.START_DATE = strVal;
    else if (key === 'END_DATE') config.END_DATE = strVal;
    else if (strVal && strVal.startsWith('G')) config.fundAccounts[key] = strVal;
  }
  return config;
}

function parseResidentsSheet(sheet) {
  const rows = sheet.getDataRange().getValues();
  const map = {};
  // Предполагаем, что B=label (индекс 1), Q=Account_s (индекс 16), R=Asset_issuer (индекс 17)
  for (let i = 1; i < rows.length; i++) { // Начинаем с 1, пропуская заголовок
    const row = rows[i];
    const label = (row[1] || '').toString().trim();
    if (!label) continue;
    
    // Парсим Account_s (Q)
    const accounts = (row[16] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));
    
    // Парсим Asset_issuer (R)
    const issuers = (row[17] || '').toString().split(/[,;]/).map(a => a.trim()).filter(a => a.startsWith('G'));
    
    for (const a of [...accounts, ...issuers]) {
      if (a) map[a] = label;
    }
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

function writeDebugLog(logObj, overwriteLast = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DEBUG) || ss.insertSheet(SHEET_DEBUG);
  
  // Создаем заголовки, если лист пуст
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'stage', 'fundKey', 'details_json']);
  }
  
  const logArray = [logObj.timestamp, logObj.stage, logObj.fundKey, JSON.stringify(logObj)];
  
  if (overwriteLast && sheet.getLastRow() > 0) {
    sheet.getRange(sheet.getLastRow(), 1, 1, logArray.length).setValues([logArray]);
  } else {
    sheet.appendRow(logArray);
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

    filteredPayments.push({
      datetime: dt,
      from,
      to,
      asset: recAssetCode,
      amount: parseFloat(rec.amount),
      memo: rec.memo || '',
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
  const fromAddr = 'GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4A'; // Binance USDC hot wallet
  const toAddr = 'GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BRO5W3GR6WRL2E5PBJDZ4A6E'; // Known USDC holder
  const assetCode = 'USDC';
  const assetIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA7'; // Centre issuer
  const startDate = new Date('2023-01-01T00:00:00Z');
  const endDate = new Date('2024-01-01T23:59:59Z');

  try {
    fetchTransactionsBetweenAddresses(fromAddr, toAddr, assetCode, assetIssuer, startDate, endDate);
    Logger.log('Тест завершен успешно.');
  } catch (e) {
    Logger.log('Ошибка в тесте: ' + e.toString());
  }
}