const { evaluateCounterpartyScope } = require('../clasp/DomainCore');

describe('evaluateCounterpartyScope', () => {
  it('allows FUND_RESIDENT_ONLY for resident->fund', () => {
    expect(evaluateCounterpartyScope('FUND_RESIDENT_ONLY', {
      fromIsFund: false,
      toIsFund: true,
      fromIsRes: true,
      toIsRes: false
    }, { relaxRoleFilter: false })).toBe(true);
  });

  it('allows FUND_RESIDENT_ONLY with relaxRoleFilter when one side is fund', () => {
    expect(evaluateCounterpartyScope('FUND_RESIDENT_ONLY', {
      fromIsFund: true,
      toIsFund: false,
      fromIsRes: false,
      toIsRes: false
    }, { relaxRoleFilter: true })).toBe(true);
  });

  it('blocks FUND_FUND when one side is not fund', () => {
    expect(evaluateCounterpartyScope('FUND_FUND', {
      fromIsFund: true,
      toIsFund: false,
      fromIsRes: false,
      toIsRes: false
    }, {})).toBe(false);
  });

  it('allows ALL_RELEVANT when any side is relevant', () => {
    expect(evaluateCounterpartyScope('ALL_RELEVANT', {
      fromIsFund: false,
      toIsFund: false,
      fromIsRes: false,
      toIsRes: true
    }, {})).toBe(true);
  });

  it('uses default behavior as FUND_RESIDENT_ONLY strict', () => {
    expect(evaluateCounterpartyScope('UNKNOWN_SCOPE', {
      fromIsFund: false,
      toIsFund: true,
      fromIsRes: true,
      toIsRes: false
    }, {})).toBe(true);

    expect(evaluateCounterpartyScope('UNKNOWN_SCOPE', {
      fromIsFund: false,
      toIsFund: false,
      fromIsRes: false,
      toIsRes: false
    }, {})).toBe(false);
  });
});
