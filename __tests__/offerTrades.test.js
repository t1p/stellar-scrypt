const {
  parseTradeAsset,
  parseTradePrice,
  deriveLedgerFromTradeId,
  normalizeHorizonTradeRecord,
  offerTradeOperationId,
  buildLinkedTransferKey,
  mapOfferTrade,
  offerTradeDedupeKey,
  reconcileOfferTrades,
  buildOfferTradeWritePlan,
  planTradeCursorUpdates,
  shouldContinueTradePagination
} = require('../clasp/DomainCore');

const FUND = 'GDW4TABBRHOPN4QP6QMCC3EK34FP477V2XPHIL2TREXKOMCD7DZAGXIC';
const COUNTER = 'GAQ5ERJVI6IW5UVNPEVXUUVMXH3GCDHJ4BJAXMAAKPR5VBWWAUOMABIZ';
const EURMTL_ISSUER = 'GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V';
const IMTABAK_ISSUER = 'GAKGV47MQO7IXHWJDWYBJY6T2O65SXHIFFE5M5OIAT46OTAUTIUZGTBK';
const OTHER = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
const fundAccounts = { MABIZ_FUND: FUND };

const TX_A = '12010b56a1c5fe7d2f8dd0d0a2b7f9ba1a2f5b8d3cd0e3f5c7b9a26f7d0e4c1a';
const TX_B = 'a00bebb5f5d7b1e9c3a2d4f6b8e0c2a4d6f8b0e2c4a6d8f0b2e4c6a8d0f2b4e6';

// Реальный ответ GET /accounts/{id}/trades: counter_*, без ledger и tx_hash, price = {n,d}.
const horizonTradeA = {
  id: '276298037880643585-0',
  paging_token: '276298037880643585-0',
  ledger_close_time: '2026-09-08T10:55:05Z',
  trade_type: 'orderbook',
  base_offer_id: '4887984056308031489',
  base_account: FUND,
  base_amount: '250.0000000',
  base_asset_type: 'credit_alphanum4',
  base_asset_code: 'EURMTL',
  base_asset_issuer: EURMTL_ISSUER,
  counter_offer_id: '1849698980',
  counter_account: COUNTER,
  counter_amount: '250.0000000',
  counter_asset_type: 'credit_alphanum4',
  counter_asset_code: 'IMTabak',
  counter_asset_issuer: IMTABAK_ISSUER,
  base_is_seller: false,
  price: { n: '1', d: '1' }
};

const horizonTradeB = Object.assign({}, horizonTradeA, {
  id: '278237954349006849-0',
  paging_token: '278237954349006849-0',
  ledger_close_time: '2026-10-05T10:49:52Z',
  base_offer_id: '4889923972776394753',
  counter_offer_id: '1849842391'
});

const mapA = () => normalizeHorizonTradeRecord(horizonTradeA);
const mapB = () => normalizeHorizonTradeRecord(horizonTradeB);

describe('parseTradePrice / deriveLedgerFromTradeId', () => {
  it('converts Horizon {n,d} price', () => {
    expect(parseTradePrice({ n: '1', d: '1' })).toBe(1);
    expect(parseTradePrice({ n: '3', d: '4' })).toBe(0.75);
    expect(parseTradePrice(2.5)).toBe(2.5);
    expect(parseTradePrice('')).toBeNull();
    expect(parseTradePrice({ n: 1, d: 0 })).toBeNull();
  });

  it('derives ledger from operation id', () => {
    expect(deriveLedgerFromTradeId('276298037880643585-0')).toBe(64330650);
    expect(deriveLedgerFromTradeId('278237954349006849-0')).toBe(64782322);
    expect(deriveLedgerFromTradeId('')).toBe('');
    expect(deriveLedgerFromTradeId('abc-1')).toBe('');
  });

  it('extracts operation id and builds linked transfer key', () => {
    expect(offerTradeOperationId('276298037880643585-0')).toBe('276298037880643585');
    expect(offerTradeOperationId('')).toBe('');
    expect(buildLinkedTransferKey(TX_A, '276298037880643585-0')).toBe(TX_A + ':276298037880643585');
    expect(buildLinkedTransferKey('', '276298037880643585-0')).toBe('');
  });
});

describe('normalizeHorizonTradeRecord', () => {
  it('reads counter_* as quote and derives ledger', () => {
    const rec = mapA();
    expect(rec.trade_id).toBe('276298037880643585-0');
    expect(rec.ledger).toBe(64330650);
    expect(rec.base_asset.asset_code).toBe('EURMTL');
    expect(rec.base_asset.asset_issuer).toBe(EURMTL_ISSUER);
    expect(rec.quote_asset.asset_code).toBe('IMTabak');
    expect(rec.quote_asset.asset_issuer).toBe(IMTABAK_ISSUER);
    expect(rec.quote_amount).toBe('250.0000000');
    expect(rec.quote_account).toBe(COUNTER);
    expect(rec.base_is_seller).toBe(false);
    expect(rec.counter_offer_id).toBe('1849698980');
  });

  it('keeps native asset as XLM through mapping', () => {
    const row = mapOfferTrade(normalizeHorizonTradeRecord(Object.assign({}, horizonTradeA, {
      id: '280000000000000001-0',
      base_amount: '10.0000000',
      base_asset_type: 'native',
      base_asset_code: undefined,
      base_asset_issuer: undefined
    })), { fundAccounts });
    expect(row.base_asset).toBe('XLM');
    expect(row.base_asset_issuer).toBe('');
  });
});

describe('mapOfferTrade', () => {
  it('maps regression trade with fund on base side', () => {
    const row = mapOfferTrade(mapA(), { fundAccounts });

    expect(row.trade_id).toBe('276298037880643585-0');
    expect(row.ledger).toBe('64330650');
    expect(row.base_asset).toBe('EURMTL');
    expect(row.quote_asset).toBe('IMTabak');
    expect(row.base_amount).toBe(250);
    expect(row.quote_amount).toBe(250);
    expect(row.fund_account).toBe(FUND);
    expect(row.fund_side).toBe('base');
    expect(row.counterparty_account).toBe(COUNTER);
    expect(row.direction).toBe('OUT');
    expect(row.in_scope).toBe(true);
    expect(row.price).toBe(1);
    expect(row.closed_at.toISOString()).toBe('2026-09-08T10:55:05.000Z');
  });

  it('keeps base_is_seller as reference column even when fund sold base asset', () => {
    // Реальные данные: base_is_seller=false, но фонд фактически списал EURMTL (effects).
    // Поэтому direction берём из fund_side, а base_is_seller — только справка.
    const row = mapOfferTrade(mapA(), { fundAccounts });
    expect(row.base_is_seller).toBe(false);
    expect(row.direction).toBe('OUT');
  });

  it('marks trade out of scope when no fund account participates', () => {
    const row = mapOfferTrade({
      trade_id: 'x-1',
      base_asset: 'USDC:' + OTHER,
      base_amount: '1',
      base_account: OTHER,
      quote_asset: 'EURC:' + OTHER,
      quote_amount: '2',
      quote_account: OTHER
    }, { fundAccounts });

    expect(row.in_scope).toBe(false);
    expect(row.fund_account).toBe('');
    expect(row.direction).toBe('');
  });

  it('detects fund on counter side', () => {
    const row = mapOfferTrade(normalizeHorizonTradeRecord(Object.assign({}, horizonTradeA, {
      id: '280000000000000002-1',
      base_account: COUNTER,
      counter_account: FUND
    })), { fundAccounts });

    expect(row.fund_side).toBe('quote');
    expect(row.direction).toBe('IN');
    expect(row.counterparty_account).toBe(COUNTER);
  });

  it('keeps partial fill amounts without rounding', () => {
    const row = mapOfferTrade(normalizeHorizonTradeRecord(Object.assign({}, horizonTradeA, {
      id: '280000000000000003-0',
      base_amount: '100.0000000',
      counter_amount: '37.5',
      price: { n: '3', d: '8' }
    })), { fundAccounts });

    expect(row.base_amount).toBe(100);
    expect(row.quote_amount).toBe(37.5);
    expect(row.price).toBeCloseTo(0.375, 6);
  });

  it('handles zero base amount without division by zero', () => {
    const row = mapOfferTrade(normalizeHorizonTradeRecord(Object.assign({}, horizonTradeA, {
      id: '280000000000000004-0',
      base_amount: '0.0000000',
      counter_amount: '0.0000000',
      price: undefined
    })), { fundAccounts });

    expect(row.base_amount).toBe(0);
    expect(row.quote_amount).toBe(0);
    expect(row.price).toBe(0);
  });
});

describe('offerTradeDedupeKey', () => {
  it('uses trade_id when present', () => {
    expect(offerTradeDedupeKey({ trade_id: '278237954349006849-0' })).toBe('278237954349006849-0');
  });

  it('returns empty key when no identifier at all', () => {
    expect(offerTradeDedupeKey({})).toBe('');
    expect(offerTradeDedupeKey({ base_amount: 1, quote_amount: 1 })).toBe('');
  });

  it('builds fallback key from distinguishing fields', () => {
    const key = offerTradeDedupeKey({
      id: '276298037880643585-0',
      ledger: 64330650,
      base_account: FUND,
      quote_account: COUNTER,
      base_asset: 'EURMTL',
      base_amount: 250,
      quote_asset: 'IMTabak',
      quote_amount: 250,
      counter_offer_id: '1849698980',
      base_is_seller: false,
      tx_hash: TX_A
    });
    expect(key.startsWith('fallback:')).toBe(true);
    expect(key).toContain('1849698980');
    expect(key).toContain(TX_A);
  });
});

describe('reconcileOfferTrades', () => {
  it('appends both trades on first run, sorted by ledger', () => {
    const result = reconcileOfferTrades([], [mapB(), mapA()], { fundAccounts });

    expect(result.fresh).toHaveLength(2);
    expect(result.skipped).toBe(0);
    expect(result.rejected_no_key).toBe(0);
    expect(result.fresh.map(r => r.trade_id)).toEqual([
      '276298037880643585-0',
      '278237954349006849-0'
    ]);
    expect(result.fresh.map(r => Number(r.ledger))).toEqual([64330650, 64782322]);
  });

  it('is idempotent on repeated sync with same payload', () => {
    const first = reconcileOfferTrades([], [mapA(), mapB()], { fundAccounts });
    const second = reconcileOfferTrades(first.fresh, [mapA(), mapB()], { fundAccounts });

    expect(second.fresh).toHaveLength(0);
    expect(second.skipped).toBe(2);
    expect(second.appended).toBe(0);
  });

  it('does not double count when the same trade comes twice in one batch', () => {
    // Пейджинг и повторный прогон не должны удваивать сумму, даже если tx_hash совпадает.
    const result = reconcileOfferTrades([], [mapA(), mapA()], { fundAccounts });
    expect(result.fresh).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('keeps several trades from one transaction as separate rows', () => {
    const secondInTx = Object.assign({}, horizonTradeA, { id: '276298037880643585-1' });
    const rows = [mapA(), normalizeHorizonTradeRecord(secondInTx)];
    const result = reconcileOfferTrades([], rows, { fundAccounts });

    expect(result.fresh).toHaveLength(2);
    expect(result.fresh.every(r => buildLinkedTransferKey(TX_A, r.trade_id) === TX_A + ':276298037880643585')).toBe(true);
  });

  it('rejects rows without any identifier', () => {
    const result = reconcileOfferTrades([], [{ base_amount: '1', quote_amount: '1' }], { fundAccounts });

    expect(result.fresh).toHaveLength(0);
    expect(result.rejected_no_key).toBe(1);
  });

  it('accepts existing sheet rows as string keys', () => {
    const result = reconcileOfferTrades(['276298037880643585-0'], [mapA(), mapB()], { fundAccounts });

    expect(result.fresh).toHaveLength(1);
    expect(result.fresh[0].trade_id).toBe('278237954349006849-0');
    expect(result.skipped).toBe(1);
  });

  it('returns empty result when there are no trades', () => {
    const result = reconcileOfferTrades([], [], { fundAccounts });
    expect(result.fresh).toHaveLength(0);
    expect(result.appended).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rejected_no_key).toBe(0);
  });
});

describe('buildOfferTradeWritePlan', () => {
  it('keeps only in-scope rows with identifier', () => {
    const fresh = [
      Object.assign(mapOfferTrade(mapA(), { fundAccounts }), { trade_id: '276298037880643585-0' }),
      Object.assign(mapOfferTrade(mapA(), { fundAccounts }), { trade_id: '280000000000000005-0', in_scope: false }),
      Object.assign(mapOfferTrade(mapA(), { fundAccounts }), { trade_id: '' })
    ];
    const plan = buildOfferTradeWritePlan(fresh, { dryRun: true });

    expect(plan.dryRun).toBe(true);
    expect(plan.rows).toHaveLength(1);
    expect(plan.wouldAppend).toBe(1);
    expect(plan.byAccount[FUND]).toBe(1);
  });
});

describe('planTradeCursorUpdates', () => {
  it('skips accounts with errors', () => {
    const plan = planTradeCursorUpdates([
      { fundKey: 'MABIZ_FUND', cursorKey: 'cursor_offer_trades_MABIZ_FUND', lastCursor: '278237954349006849-0', error: '' },
      { fundKey: 'BROKEN', cursorKey: 'cursor_offer_trades_BROKEN', lastCursor: '1-0', error: 'Horizon /trades 500' }
    ]);

    expect(plan.updates).toEqual([{ key: 'cursor_offer_trades_MABIZ_FUND', value: '278237954349006849-0' }]);
    expect(plan.errors[0]).toContain('BROKEN');
  });

  it('produces no updates when nothing fetched', () => {
    expect(planTradeCursorUpdates([{ fundKey: 'X', cursorKey: 'cursor_offer_trades_X', lastCursor: '' }]).updates).toEqual([]);
  });
});

describe('shouldContinueTradePagination', () => {
  it('stops on page limit and on deadline', () => {
    expect(shouldContinueTradePagination({ pages: 0, maxPages: 3, deadline: 0, now: 0 })).toBe(true);
    expect(shouldContinueTradePagination({ pages: 3, maxPages: 3, deadline: 0, now: 0 })).toBe(false);
    expect(shouldContinueTradePagination({ pages: 1, maxPages: 3, deadline: 1000, now: 1500 })).toBe(false);
    expect(shouldContinueTradePagination({})).toBe(true);
  });
});
