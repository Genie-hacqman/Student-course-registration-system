import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PERMISSION_CATALOG } from '../../src/utils/constants.js';

test('every permission appears in the roles-editor catalog exactly once', () => {
  const names = PERMISSION_CATALOG.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), Object.values(PERMISSIONS).sort());
});
