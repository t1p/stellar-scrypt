const { buildResidentTrackingDataset } = require('../clasp/DomainCore');

describe('buildResidentTrackingDataset', () => {
  it('builds resident-centric rows, sorts by datetime and marks first contact per project+resident', () => {
    const transfers = [
      {
        datetime: '2026-01-03T10:00:00Z',
        from: 'GFUND1',
        to: 'GRES1',
        direction: 'OUT',
        counterparty_type: 'RESIDENT',
        fund_account_key: 'FUND_MAIN',
        project_id: 'P100',
        asset_code: 'USDC',
        asset_issuer: 'GISS',
        amount: '100',
        class: 'Funding',
        memo: 'first',
        tx_hash: '=HYPERLINK("https://stellar.expert/explorer/public/tx/ABC"; "ABC")'
      },
      {
        datetime: '2026-01-02T10:00:00Z',
        from: 'GRES1',
        to: 'GFUND1',
        direction: 'IN',
        counterparty_type: 'RESIDENT',
        fund_account_key: 'FUND_MAIN',
        project_id: 'P100',
        asset_code: 'USDC',
        asset_issuer: 'GISS',
        amount: '50',
        class: 'Repayment',
        memo: 'second',
        tx_hash: 'TXHASH2000'
      },
      {
        datetime: '2026-01-04T10:00:00Z',
        from: 'GEXT',
        to: 'GFUND1',
        direction: 'IN',
        counterparty_type: 'EXTERNAL',
        project_id: 'P100'
      }
    ];

    const rows = buildResidentTrackingDataset(transfers, {
      residentsMap: {
        GRES1: 'Resident One'
      },
      fundAccounts: {
        FUND_MAIN: 'GFUND1'
      }
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].datetime.toISOString()).toBe('2026-01-02T10:00:00.000Z');
    expect(rows[1].datetime.toISOString()).toBe('2026-01-03T10:00:00.000Z');
    expect(rows[0].resident_address).toBe('GRES1');
    expect(rows[0].resident_label).toBe('Resident One');
    expect(rows[0].tx_hash).toBe('TXHASH2000');
    expect(rows[0].is_first_contact).toBe(true);
    expect(rows[1].is_first_contact).toBe(false);
  });

  it('handles counterparty_type=RESIDENT even if residents map has no label', () => {
    const rows = buildResidentTrackingDataset([
      {
        datetime: '2026-01-01T00:00:00Z',
        from: 'GRES_UNKNOWN',
        to: 'GFUND1',
        direction: 'IN',
        counterparty_type: 'RESIDENT',
        project_id: 'P200',
        tx_hash: 'RAW_HASH'
      }
    ], {
      residentsMap: {},
      fundAccounts: {
        FUND_MAIN: 'GFUND1'
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].resident_address).toBe('GRES_UNKNOWN');
    expect(rows[0].resident_label).toBe('');
    expect(rows[0].fund_address).toBe('GFUND1');
    expect(rows[0].is_first_contact).toBe(true);
  });
});
