const {
  normalizeTransferEventDedupeKey,
  buildMaymunEventId,
  normalizeConfirmedAmount,
  hasUnconfirmedLiquidityMarkers
} = require('../clasp/DomainCore');

describe('maymun asset layer helpers', () => {
  test('builds deterministic transfer dedupe key', () => {
    expect(normalizeTransferEventDedupeKey('ABC123', '987')).toBe('abc123:987');
    expect(normalizeTransferEventDedupeKey('  AbC123  ', '  987  ')).toBe('abc123:987');
    expect(normalizeTransferEventDedupeKey('  A b C123  ', '  987  ')).toBe('a b c123:987');
    expect(normalizeTransferEventDedupeKey('TX_HASH_MIXED', 'Op-001')).toBe('tx_hash_mixed:op-001');
    expect(normalizeTransferEventDedupeKey('', '987')).toBe('');
  });

  test('builds deterministic event id for transfer-backed events', () => {
    const eventId = buildMaymunEventId({
      source_type: 'transfer',
      tx_hash: 'ABC123',
      op_id: '987'
    });
    expect(eventId).toBe('evt_abc123_987');
  });

  test('normalizes confirmed amount to zero unless allocation is confirmed', () => {
    expect(normalizeConfirmedAmount('proposed', 50)).toBe(0);
    expect(normalizeConfirmedAmount('pending_approval', 50)).toBe(0);
    expect(normalizeConfirmedAmount('confirmed', 50)).toBe(50);
  });

  test('detects unconfirmed liquidity markers in notes', () => {
    expect(hasUnconfirmedLiquidityMarkers('contains pending inflow')).toBe(true);
    expect(hasUnconfirmedLiquidityMarkers('AMBIGUOUS source')).toBe(true);
    expect(hasUnconfirmedLiquidityMarkers('confirmed allocation only')).toBe(false);
  });
});
