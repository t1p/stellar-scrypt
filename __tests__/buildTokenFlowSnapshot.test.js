const { buildTokenFlowSnapshot } = require('../clasp/DomainCore');

describe('buildTokenFlowSnapshot', () => {
  it('aggregates token movement edges by project/resident/asset/direction and deduplicates tx_hash', () => {
    const rows = buildTokenFlowSnapshot([
      {
        datetime: '2026-01-01T10:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        asset_code: 'usdc',
        asset_issuer: 'GISS',
        amount: '10',
        tx_hash: 'T1'
      },
      {
        datetime: '2026-01-02T10:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        asset_code: 'USDC',
        asset_issuer: 'GISS',
        amount: '15',
        tx_hash: 'T2'
      },
      {
        datetime: '2026-01-02T11:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        asset_code: 'USDC',
        asset_issuer: 'GISS',
        amount: '5',
        tx_hash: 'T2'
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('P100');
    expect(rows[0].resident_address).toBe('GRES1');
    expect(rows[0].asset_code).toBe('USDC');
    expect(rows[0].tx_count).toBe(2);
    expect(rows[0].total_amount).toBe(30);
    expect(rows[0].first_seen_at.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(rows[0].last_seen_at.toISOString()).toBe('2026-01-02T11:00:00.000Z');
  });

  it('applies maxInputRows and maxOutputRows safeguards', () => {
    const rows = buildTokenFlowSnapshot([
      { datetime: '2026-01-01T00:00:00Z', project_id: 'P1', resident_address: 'R1', from: 'A', to: 'B', direction: 'OUT', asset_code: 'XLM', amount: 1 },
      { datetime: '2026-01-02T00:00:00Z', project_id: 'P2', resident_address: 'R2', from: 'A', to: 'C', direction: 'OUT', asset_code: 'USDC', amount: 2 },
      { datetime: '2026-01-03T00:00:00Z', project_id: 'P3', resident_address: 'R3', from: 'A', to: 'D', direction: 'OUT', asset_code: 'EURC', amount: 3 }
    ], {
      maxInputRows: 2,
      maxOutputRows: 1
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('P1');
  });
});

