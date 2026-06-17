import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUnix } from '../../shared/time.js';

test('toUnix: secondes telles quelles', () => {
  assert.equal(toUnix(1718614800), 1718614800);
});

test('toUnix: millisecondes (>1e12) → secondes', () => {
  assert.equal(toUnix(1718614800000), 1718614800);
});

test('toUnix: ISO string → secondes UTC', () => {
  // 2024-06-17T10:00:00Z = 1718618400
  assert.equal(toUnix('2024-06-17T10:00:00.000Z'), 1718618400);
});

test('toUnix: null/undefined/chaîne invalide → null', () => {
  assert.equal(toUnix(null), null);
  assert.equal(toUnix(undefined), null);
  assert.equal(toUnix('pas-une-date'), null);
});
