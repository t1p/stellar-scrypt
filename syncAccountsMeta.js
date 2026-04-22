function syncAccountsMeta() {
  const ss = SpreadsheetApp.getActive();
  const consts = loadConsts_(ss);
  const residents = loadResidents_(ss);
  const horizon = mustGet_(consts, 'HORIZON_URL').replace(/\/+$/, '');

  // ===============================
  // 1. Загружаем справочник лейблов
  // ===============================

  // ACCOUNTS: account → label (приоритет №1)
  const accountLabels = loadAccountLabels_(ss); // { G... : 'LABEL' }

  // fallback-лейблы из CONST и RESIDENTS
  const fallbackLabels = {};

  // из CONST (фонды)
  for (const [key, val] of Object.entries(consts)) {
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

  const sheetMeta = getOrCreateSheet_(ss, 'ACCOUNTS_META');
  const sheetSigners = getOrCreateSheet_(ss, 'ACCOUNT_SIGNERS');

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
  for (const [key, val] of Object.entries(consts)) {
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
      `${horizon}/accounts/${account}/operations?order=asc&limit=20`,
      { headers: { Accept: 'application/json' }, muteHttpExceptions: true }
    );

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
