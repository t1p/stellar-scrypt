/**
 * Unit tests for classifyTransfer_ function
 * This test file contains pure function tests extracted from Apps Script
 */

// Copy of the classifyTransfer_ function for testing
const MEMO_PATTERNS_REPAY = 'repay|return|погаш|возврат|refund';
const MEMO_PATTERNS_DIVIDEND = 'dividend|дивиденд|profit|прибыль';
const MEMO_PATTERNS_OPEX = 'opex|опекс|fee|комиссия';
const CLASSIFY_ENABLE = true;

function classifyTransfer_(transfer, rules) {
  const { direction, counterpartyType, memo, class_override } = transfer;

  // Приоритет: class_override всегда имеет приоритет
  if (class_override && class_override.trim()) {
    return { class: class_override.trim(), class_reason: 'OVERRIDE' };
  }

  if (!CLASSIFY_ENABLE) {
    return { class: '', class_reason: 'DISABLED' };
  }

  const memoLower = (memo || '').toLowerCase();

  if (direction === 'OUT') {
    // OUT из fund_account → чаще Funding (если контрагент = RESIDENT)
    if (counterpartyType === 'RESIDENT') {
      return { class: 'Funding', class_reason: 'OUT_TO_RESIDENT' };
    } else {
      return { class: 'Funding', class_reason: 'OUT_DEFAULT' };
    }
  } else if (direction === 'IN') {
    // IN в fund_account от RESIDENT → Dividend или Repayment
    if (counterpartyType === 'RESIDENT') {
      // Repayment отличать через memo-паттерны (repay/return/погаш/возврат и т.п.)
      const repayPatterns = (rules.MEMO_PATTERNS_REPAY || '').split('|').filter(Boolean);
      if (repayPatterns.some(p => memoLower.includes(p.toLowerCase()))) {
        return { class: 'Repayment', class_reason: 'IN_FROM_RESIDENT_REPAY_MEMO' };
      }
      // Dividend отличать через memo-паттерны
      const dividendPatterns = (rules.MEMO_PATTERNS_DIVIDEND || '').split('|').filter(Boolean);
      if (dividendPatterns.some(p => memoLower.includes(p.toLowerCase()))) {
        return { class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DIVIDEND_MEMO' };
      }
      // По умолчанию Dividend для входящих от резидентов
      return { class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DEFAULT' };
    } else {
      return { class: 'Dividend', class_reason: 'IN_DEFAULT' };
    }
  }

  return { class: '', class_reason: 'UNKNOWN_DIRECTION' };
}

const rules = {
  MEMO_PATTERNS_REPAY: MEMO_PATTERNS_REPAY,
  MEMO_PATTERNS_DIVIDEND: MEMO_PATTERNS_DIVIDEND,
  MEMO_PATTERNS_OPEX: MEMO_PATTERNS_OPEX
};

describe('classifyTransfer_', () => {
  describe('Override priority', () => {
    it('should return override class when class_override is provided', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: 'dividend payment',
        class_override: 'CustomClass'
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'CustomClass', class_reason: 'OVERRIDE' });
    });

    it('should ignore override if empty', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: 'dividend payment',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result.class).toBe('Dividend');
    });
  });

  describe('OUT direction', () => {
    it('should classify OUT to RESIDENT as Funding', () => {
      const transfer = {
        direction: 'OUT',
        counterpartyType: 'RESIDENT',
        memo: '',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Funding', class_reason: 'OUT_TO_RESIDENT' });
    });

    it('should classify OUT to EXTERNAL as Funding', () => {
      const transfer = {
        direction: 'OUT',
        counterpartyType: 'EXTERNAL',
        memo: '',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Funding', class_reason: 'OUT_DEFAULT' });
    });
  });

  describe('IN direction', () => {
    it('should classify IN from RESIDENT with repay memo as Repayment', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: 'repay loan',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Repayment', class_reason: 'IN_FROM_RESIDENT_REPAY_MEMO' });
    });

    it('should classify IN from RESIDENT with dividend memo as Dividend', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: 'dividend payment',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DIVIDEND_MEMO' });
    });

    it('should classify IN from RESIDENT with no specific memo as Dividend', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: 'regular payment',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Dividend', class_reason: 'IN_FROM_RESIDENT_DEFAULT' });
    });

    it('should classify IN from EXTERNAL as Dividend', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'EXTERNAL',
        memo: '',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: 'Dividend', class_reason: 'IN_DEFAULT' });
    });
  });

  describe('Edge cases', () => {
    it('should handle unknown direction', () => {
      const transfer = {
        direction: 'UNKNOWN',
        counterpartyType: 'RESIDENT',
        memo: '',
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result).toEqual({ class: '', class_reason: 'UNKNOWN_DIRECTION' });
    });

    it('should handle null/undefined memo', () => {
      const transfer = {
        direction: 'IN',
        counterpartyType: 'RESIDENT',
        memo: null,
        class_override: ''
      };
      const result = classifyTransfer_(transfer, rules);
      expect(result.class).toBe('Dividend');
    });
  });
});