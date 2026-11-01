#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { mapProjectIdForTransfer } = require('../clasp/DomainCore');

const projectMapIndex = {
  tokenToProjectIds: { TOC: ['M45171'], TIC: ['M13118'] },
  assetCodeToProjectIds: { TOC: ['M45171'], TIC: ['M13118'] },
  projectById: {
    M45171: { token_symbol: 'TOC' },
    M13118: { token_symbol: 'TIC' }
  }
};
const mabizIndexes = {
  residentsIndex: {
    accountToProjectIds: { SHARED_ACCOUNT: ['M45171', 'M13118'] },
    issuerToProjectIds: { SHARED_ISSUER: ['M45171', 'M13118'] }
  },
  projectMapIndex
};

const tests = [
  ['TOC memo narrows shared candidates', () => {
    assert.deepEqual(mapProjectIdForTransfer({ from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'TOC divs' }, mabizIndexes), {
      project_id: 'M45171', mapping_method: 'MEMO_TOKEN', candidates: ['M45171'], anomaly: null
    });
  }],
  ['TIC memo resolves to TIC, never TOC', () => {
    const result = mapProjectIdForTransfer({ from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TIC', memo: 'TIC dividends' }, mabizIndexes);
    assert.equal(result.project_id, 'M13118');
    assert.equal(result.mapping_method, 'MEMO_TOKEN');
  }],
  ['conflicting token and asset signals stay AMBIGUOUS', () => {
    const result = mapProjectIdForTransfer({ from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'TIC dividends' }, mabizIndexes);
    assert.equal(result.project_id, 'AMBIGUOUS');
  }],
  ['historical shared transfer stays AMBIGUOUS', () => {
    const result = mapProjectIdForTransfer({ from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'OTHER', memo: 'historical transfer' }, mabizIndexes);
    assert.equal(result.project_id, 'AMBIGUOUS');
  }],
  ['partial TOCXYZ does not match TOC', () => {
    const result = mapProjectIdForTransfer({ from: 'UNKNOWN', to: 'OTHER', asset_issuer: 'UNKNOWN', memo: 'TOCXYZ divs' }, mabizIndexes);
    assert.equal(result.project_id, 'UNMAPPED');
  }],
  ['known memo project ID resolves UNMAPPED', () => {
    const result = mapProjectIdForTransfer({ from: 'UNKNOWN', to: 'OTHER', asset_issuer: 'UNKNOWN', memo: 'settlement M45171' }, mabizIndexes);
    assert.equal(result.project_id, 'M45171');
    assert.equal(result.mapping_method, 'MEMO_PROJECT_ID');
  }],
  ['asset_code alone resolves deterministically', () => {
    const result = mapProjectIdForTransfer({ from: 'SHARED_ACCOUNT', to: 'GOTHER', asset_issuer: 'SHARED_ISSUER', asset_code: 'TOC', memo: 'divs' }, mabizIndexes);
    assert.deepEqual(result, { project_id: 'M45171', mapping_method: 'ASSET_CODE', candidates: ['M45171'], anomaly: null });
  }],
  ['configured memo pattern uses boundaries', () => {
    const indexes = { residentsIndex: { accountToProjectIds: {}, issuerToProjectIds: {} }, projectMapIndex: { projectMemoPatterns: { M45171: ['TOC coupon'] } } };
    assert.equal(mapProjectIdForTransfer({ memo: 'TOC coupon paid' }, indexes).project_id, 'M45171');
    assert.equal(mapProjectIdForTransfer({ memo: 'TOC coupons' }, indexes).project_id, 'UNMAPPED');
  }],
  ['legacy P-prefixed memo ID remains supported', () => {
    const indexes = { residentsIndex: { accountToProjectIds: {}, issuerToProjectIds: {} } };
    const result = mapProjectIdForTransfer({ memo: 'Payment for P123 project' }, indexes, { projectIdRegex: /\bP?\d{3,6}\b/, isProjectIdKnown: id => id === '123' });
    assert.equal(result.project_id, '123');
    assert.equal(result.mapping_method, 'MEMO_PROJECT_ID');
  }]
];

let passed = 0;
for (const [name, test] of tests) {
  test();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}
console.log(`1..${tests.length}`);
console.log(`# passed ${passed}/${tests.length}`);
