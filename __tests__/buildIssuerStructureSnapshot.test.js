const { buildIssuerStructureSnapshot } = require('../clasp/DomainCore');

describe('buildIssuerStructureSnapshot', () => {
  it('aggregates directed structure edges with tx de-duplication by tx_hash', () => {
    const rows = buildIssuerStructureSnapshot([
      {
        datetime: '2026-01-01T10:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        fund_address: 'GFUND1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        counterparty_type: 'RESIDENT',
        tx_hash: 'T1'
      },
      {
        datetime: '2026-01-02T10:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        fund_address: 'GFUND1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        counterparty_type: 'RESIDENT',
        tx_hash: 'T2'
      },
      {
        datetime: '2026-01-02T11:00:00Z',
        project_id: 'P100',
        resident_label: 'Resident One',
        resident_address: 'GRES1',
        fund_address: 'GFUND1',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        counterparty_type: 'RESIDENT',
        tx_hash: 'T2'
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('P100');
    expect(rows[0].resident_address).toBe('GRES1');
    expect(rows[0].from).toBe('GFUND1');
    expect(rows[0].to).toBe('GRES1');
    expect(rows[0].direction).toBe('OUT');
    expect(rows[0].counterparty_type).toBe('RESIDENT');
    expect(rows[0].tx_count).toBe(2);
    expect(rows[0].first_seen_at.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(rows[0].last_seen_at.toISOString()).toBe('2026-01-02T11:00:00.000Z');
  });

  it('filters invalid rows and applies output limit', () => {
    const rows = buildIssuerStructureSnapshot([
      { datetime: 'bad-date', project_id: 'P1', resident_address: 'R1', from: 'A', to: 'B' },
      { datetime: '2026-01-01T00:00:00Z', project_id: 'P1', resident_address: 'R1', from: 'A', to: 'B' },
      { datetime: '2026-01-02T00:00:00Z', project_id: 'P2', resident_address: 'R2', from: 'A', to: 'C' }
    ], {
      maxOutputRows: 1
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('P1');
  });
});

