const { isFundAddress, isResidentAddress } = require('../clasp/DomainCore');

describe('address classification helpers', () => {
  describe('isFundAddress', () => {
    it('returns true when address exists in fund accounts map', () => {
      const fundAccounts = {
        MABIZ_MAIN: 'GAAA',
        MFBOND: 'GBBB'
      };
      expect(isFundAddress(' GAAA ', fundAccounts)).toBe(true);
    });

    it('returns false when address is not a fund account', () => {
      const fundAccounts = { MABIZ_MAIN: 'GAAA' };
      expect(isFundAddress('GCCC', fundAccounts)).toBe(false);
    });
  });

  describe('isResidentAddress', () => {
    it('returns true when address key exists in residents map', () => {
      const residentsMap = { GRES1: 'Resident 1' };
      expect(isResidentAddress(' GRES1 ', residentsMap)).toBe(true);
    });

    it('returns false when address key is absent', () => {
      const residentsMap = { GRES1: 'Resident 1' };
      expect(isResidentAddress('GRES2', residentsMap)).toBe(false);
    });
  });
});
