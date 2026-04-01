const { buildResidentTimelineReadModel } = require('../clasp/DomainCore');

describe('buildResidentTimelineReadModel', () => {
  it('builds ordered timeline and calculates entry point/event index for each resident interaction', () => {
    const rows = buildResidentTimelineReadModel([
      {
        datetime: '2026-01-03T10:00:00Z',
        project_id: 'P100',
        resident_address: 'GRES1',
        resident_label: 'Resident One',
        fund_address: 'GFUND1',
        direction: 'OUT',
        from: 'GFUND1',
        to: 'GRES1',
        asset_code: 'USDC',
        amount: '100',
        is_first_contact: false
      },
      {
        datetime: '2026-01-02T10:00:00Z',
        project_id: 'P100',
        resident_address: 'GRES1',
        resident_label: 'Resident One',
        fund_address: 'GFUND1',
        direction: 'IN',
        from: 'GRES1',
        to: 'GFUND1',
        asset_code: 'USDC',
        amount: '50',
        is_first_contact: true
      },
      {
        datetime: '2026-01-05T12:00:00Z',
        project_id: 'P200',
        resident_address: 'GRES2',
        resident_label: 'Resident Two',
        fund_address: 'GFUND1',
        direction: 'OUT',
        from: 'GFUND1',
        to: 'GRES2',
        asset_code: 'EURC',
        amount: '10'
      }
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].datetime.toISOString()).toBe('2026-01-02T10:00:00.000Z');
    expect(rows[0].interaction_key).toBe('P100|GRES1');
    expect(rows[0].is_entry_point).toBe(true);
    expect(rows[0].event_index).toBe(1);
    expect(rows[0].days_since_entry_point).toBe(0);

    expect(rows[1].interaction_key).toBe('P100|GRES1');
    expect(rows[1].is_entry_point).toBe(false);
    expect(rows[1].event_index).toBe(2);
    expect(rows[1].days_since_entry_point).toBe(1);

    expect(rows[2].interaction_key).toBe('P200|GRES2');
    expect(rows[2].is_entry_point).toBe(true);
    expect(rows[2].event_index).toBe(1);
  });

  it('drops invalid rows and supports maxRows safeguard', () => {
    const rows = buildResidentTimelineReadModel([
      { datetime: 'invalid', project_id: 'P1', resident_address: 'G1' },
      { datetime: '2026-01-01T00:00:00Z', project_id: '', resident_address: 'G1' },
      { datetime: '2026-01-01T00:00:00Z', project_id: 'P1', resident_address: '' },
      { datetime: '2026-01-01T00:00:00Z', project_id: 'P1', resident_address: 'G1' },
      { datetime: '2026-01-02T00:00:00Z', project_id: 'P1', resident_address: 'G1' }
    ], { maxRows: 1 });

    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('P1');
    expect(rows[0].resident_address).toBe('G1');
  });
});

