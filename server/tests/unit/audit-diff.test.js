import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, diffFields, summariseEntries } from '../../src/utils/audit-diff.js';

const fakeRecord = (values) => ({
  values: { ...values },
  get() { return { ...this.values }; },
  update(data) { Object.assign(this.values, data); },
});

describe('snapshot', () => {
  test('copies only the requested fields, normalising dates', () => {
    const record = fakeRecord({ title: 'A', startDate: new Date('2026-01-01T00:00:00.000Z'), other: 1 });
    assert.deepEqual(snapshot(record, ['title', 'startDate', 'missing']), { title: 'A', startDate: '2026-01-01T00:00:00.000Z' });
  });

  test('is taken before the write: the copy survives the record being overwritten', () => {
    const record = fakeRecord({ title: 'Old' });
    const before = snapshot(record, ['title']);
    record.update({ title: 'New' });
    assert.equal(before.title, 'Old');
    assert.deepEqual(diffFields(before, snapshot(record, ['title'])), { changes: { title: { from: 'Old', to: 'New' } } });
  });
});

describe('diffFields', () => {
  test('lists only fields that really changed', () => {
    assert.deepEqual(
      diffFields({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null }),
      { changes: { b: { from: 'x', to: 'y' } } },
    );
  });

  test('returns nothing when nothing changed (a save of identical values)', () => {
    assert.deepEqual(diffFields({ a: 1 }, { a: 1 }), {});
  });

  test('treats null and undefined alike and compares arrays and objects by value', () => {
    assert.deepEqual(diffFields({ a: undefined, l: [1, 2], o: { x: 1 } }, { a: null, l: [1, 2], o: { x: 1 } }), {});
    assert.deepEqual(diffFields({ l: [1, 2] }, { l: [1, 3] }), { changes: { l: { from: [1, 2], to: [1, 3] } } });
  });

  test('omitted fields are reported as changed without their values', () => {
    const out = diffFields({ body: 'secret text', title: 'a' }, { body: 'other', title: 'b' }, { omitValues: ['body'] });
    assert.deepEqual(out, { changes: { body: { changed: true }, title: { from: 'a', to: 'b' } } });
  });

  test('long strings are clipped', () => {
    const out = diffFields({ t: '' }, { t: 'x'.repeat(500) });
    assert.equal(out.changes.t.to.length, 201);
  });

  test('does not mutate its inputs', () => {
    const before = { a: 1 };
    const after = { a: 2 };
    diffFields(before, after);
    assert.deepEqual(before, { a: 1 });
    assert.deepEqual(after, { a: 2 });
  });
});

describe('summariseEntries', () => {
  test('keeps everything below the cap', () => {
    assert.deepEqual(summariseEntries([{ id: 1 }]), { changed: 1, entries: [{ id: 1 }] });
  });

  test('caps at 50 with the true count and a truncated flag', () => {
    const list = Array.from({ length: 120 }, (_, i) => ({ id: i }));
    const out = summariseEntries(list);
    assert.equal(out.changed, 120);
    assert.equal(out.entries.length, 50);
    assert.equal(out.truncated, true);
  });
});
