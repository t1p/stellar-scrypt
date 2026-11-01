const {
  parseTradeAsset,
  mapOfferTrade,
  offerTradeDedupeKey,
  reconcileOfferTrades
} = require('../clasp/DomainCore');

const FUND = 'GDW4TABB2J4Y4V3C4SAVY7D3NVF2QZ5K6KLJ4WQZQ2YV3M2DZAGXIC';
const SELLER = 'GAQ5ERJV7ZM5K4M4VQ7WJ6M2W3QZ5K6KLJ4WQZQ2YV3M2DAUOMABIZ';
const OTHER = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
const fundAccounts = { MABIZ_FUND: FUND };

// Регрессия из реальных данных: два трейда EURMTL/IMTabak, суммы 250/250.
const imtabakTrade = {
  trade_id: '276298037880643585-0',
  paging_token: '276298037880643585-0',
  ledger: 64330650,
  ledger_close_time: '2026-01-10T09:00:00Z',
  trade_type: 'orderbook',
  base_asset: { asset_type: 'credit_alphanum4', asset_code: 'EURMTL', asset_issuer: OTHER },
  base_amount: '250.0000000',
  base_account: FUND,
  quote_asset: { asset_type: 'credit_alphanum4', asset_code: 'IMTabak', asset_issuer: OTHER },
  quote_amount: '250.0000000',
  quote_account: SELLER,
  base_offer_id: '111',
  counter_offer_id: '222'
};

const imtabakTradeSecond = Object.assign({}, imtabakTrade, {
  trade_id: '278237954349006849-0',
  paging_token: '278237954349006849-0',
  ledger: 64782322,
  ledger_close_time: '2026-01-20T09:00:00Z'
});

describe('parseTradeAsset', () => {
  it('parses Horizon asset objects and XLM', () => {
    expect(parseTradeAsset({ asset_type: 'credit_alphanum4', asset_code: 'IMTabak', asset_issuer: OTHER }))
      .toEqual({ code: 'IMTabak', issuer: OTHER });
    expect(parseTradeAsset({ asset_type: 'native' })).toEqual({ code: 'XLM', issuer: '' });
  });

  it('parses string form CODE:ISSUER', () => {
    expect(parseTradeAsset('EURMTL:' + OTHER)).toEqual({ code: 'EURMTL', issuer: OTHER });
    expect(parseTradeAsset('XLM')).toEqual({ code: 'XLM', issuer: '' });
    expect(parseTradeAsset('')).toEqual({ code: '', issuer: '' });
  });
});

describe('mapOfferTrade', () => {
  it('maps imtabak regression trade with fund on base side', () => {
    const row = mapOfferTrade(imtabakTrade, { fundAccounts });

    expect(row.trade_id).toBe('276298037880643585-0');
    expect(row.ledger).toBe('64330650');
    expect(row.base_asset).toBe('EURMTL');
    expect(row.quote_asset).toBe('IMTabak');
    expect(row.base_amount).toBe(250);
    expect(row.quote_amount).toBe(250);
    expect(row.fund_account).toBe(FUND);
    expect(row.fund_side).toBe('base');
    expect(row.counterparty_account).toBe(SELLER);
    expect(row.direction).toBe('OUT');
    expect(row.in_scope).toBe(true);
    expect(row.price).toBe(1);
    expect(row.closed_at.toISOString()).toBe('2026-01-10T09:00:00.000Z');
  });

  it('marks trade out of scope when no fund account participates', () => {
    const row = mapOfferTrade({
      trade_id: 'x-1',
      base_asset: 'USDC:' + OTHER,
      base_amount: '1',
      base_account: SELLER,
      quote_asset: 'EURC:' + OTHER,
      quote_amount: '2',
      quote_account: OTHER
    }, { fundAccounts });

    expect(row.in_scope).toBe(false);
    expect(row.fund_account).toBe('');
    expect(row.direction).toBe('');
  });

  it('detects fund on quote side', () => {
    const row = mapOfferTrade(Object.assign({}, imtabakTrade, {
      trade_id: 'quote-side-1',
      base_account: SELLER,
      quote_account: FUND
    }), { fundAccounts });

    expect(row.fund_side).toBe('quote');
    expect(row.direction).toBe('IN');
    expect(row.counterparty_account).toBe(SELLER);
  });

  it('maps partial fill amounts without rounding', () => {
    const row = mapOfferTrade(Object.assign({}, imtabakTrade, {
      trade_id: 'partial-1',
      base_amount: '100.0000000',
      quote_amount: '37.5'
    }), { fundAccounts });

    expect(row.base_amount).toBe(100);
    expect(row.quote_amount).toBe(37.5);
    expect(row.price).toBeCloseTo(0.375, 6);
  });
});

describe('offerTradeDedupeKey', () => {
  it('uses trade_id when present', () => {
    expect(offerTradeDedupeKey({ trade_id: '278237954349006849-0' })).toBe('278237954349006849-0');
  });

  it('falls back to composite key when trade_id missing', () => {
    const key = offerTradeDedupeKey({
      ledger: 100,
      base_account: FUND,
      quote_account: SELLER,
      base_asset: 'EURMTL',
      base_amount: 250,
      quote_asset: 'IMTabak',
      quote_amount: 250
    });
    expect(key.startsWith('fallback:')).toBe(true);
    expect(offerTradeDedupeKey({})).toBe('');
  });
});

describe('reconcileOfferTrades', () => {
  it('appends both imtabak trades on first run', () => {
    const result = reconcileOfferTrades([], [imtabakTrade, imtabakTradeSecond], { fundAccounts });

    expect(result.fresh).toHaveLength(2);
    expect(result.skipped).toBe(0);
    expect(result.fresh.map(r => r.trade_id)).toEqual([
      '276298037880643585-0',
      '278237954349006849-0'
    ]);
    expect(result.fresh[0].dedupe_key).toBe('276298037880643585-0');
  });

  it('is idempotent on repeated sync with same payload', () => {
    const first = reconcileOfferTrades([], [imtabakTrade, imtabakTradeSecond], { fundAccounts });
    const second = reconcileOfferTrades(first.fresh, [imtabakTrade, imtabakTradeSecond], { fundAccounts });

    expect(second.fresh).toHaveLength(0);
    expect(second.skipped).toBe(2);
    expect(second.appended).toBe(0);
  });

  it('skips duplicates inside a single incoming batch', () => {
    const result = reconcileOfferTrades([], [imtabakTrade, imtabakTrade], { fundAccounts });

    expect(result.fresh).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('accepts existing rows read from sheet as string keys', () => {
    const result = reconcileOfferTrades(['276298037880643585-0'], [imtabakTrade, imtabakTradeSecond], { fundAccounts });

    expect(result.fresh).toHaveLength(1);
    expect(result.fresh[0].trade_id).toBe('278237954349006849-0');
    expect(result.skipped).toBe(1);
  });

  it('returns empty result when there are no trades', () => {
    const result = reconcileOfferTrades([], [], { fundAccounts });

    expect(result.fresh).toHaveLength(0);
    expect(result.appended).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('recreates full history from empty sheet (recreate scenario)', () => {
    const result = reconcileOfferTrades([], [imtabakTradeSecond, imtabakTrade], { fundAccounts });

    expect(result.fresh).toHaveLength(2);
    expect(result.fresh.map(r => r.ledger)).toEqual([64330650, 64782322]);
  });
});
