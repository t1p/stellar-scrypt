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