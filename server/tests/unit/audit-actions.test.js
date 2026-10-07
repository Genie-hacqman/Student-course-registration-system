import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_CATALOGUE, isKnownAction, actionLabel, actionGroup, SHORT_RETENTION_ACTIONS,
} from '../../src/utils/audit-actions.js';
import { streamOf, STREAMS } from '../../src/utils/audit-integrity.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(full);
  return /\.(js|mjs)$/.test(e.name) ? [full] : [];
});

describe('the action catalogue', () => {
  test('has no duplicates and every entry has a label and a group', () => {
    const seen = new Set();
    for (const e of AUDIT_CATALOGUE) {
      assert.ok(!seen.has(e.action), `duplicate ${e.action}`);
      seen.add(e.action);
      assert.ok(e.label && e.group, `${e.action} needs a label and group`);
      assert.match(e.action, /^[a-z_]+(\.[a-z_]+)+$/, `${e.action} is not <thing>.<what_happened>`);
    }
  });

  test('every action written anywhere in the code is in the catalogue (no drift)', () => {
    // Each `action: ...` expression: quoted literals inside it are actions (covers ternaries and option objects).
    const missing = [];
    for (const file of [...sourceFiles(path.join(root, 'src')), ...sourceFiles(path.join(root, 'scripts'))]) {
      if (file.endsWith('audit-actions.js')) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const [, expr] of text.matchAll(/\baction:\s*([^,\n}]+)/g)) {
        for (const [, literal] of expr.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)) {
          if (!isKnownAction(literal)) missing.push(`${path.relative(root, file)}: ${literal}`);
        }
      }
    }
    assert.deepEqual(missing, [], 'add these to src/utils/audit-actions.js');
  });

  test('actions built from a variable are all catalogued', () => {
    for (const decision of ['approved', 'rejected']) {
      assert.ok(isKnownAction(`registration.${decision}`));
      assert.ok(isKnownAction(`account_request.${decision}`));
    }
    for (const type of ['password_reset', 'name_change']) assert.ok(isKnownAction(`account_request.${type}`));
    for (const status of ['archive', 'activate']) {
      assert.ok(isKnownAction(`department.${status}`));
      assert.ok(isKnownAction(`program.${status}`));
    }
    for (const verb of ['add', 'drop', 'staff_add', 'staff_drop']) assert.ok(isKnownAction(`registration.${verb}`));
    for (const verb of ['assign', 'reassign']) assert.ok(isKnownAction(`lecturer.${verb}`));
    for (const verb of ['activate', 'deactivate']) assert.ok(isKnownAction(`lecturer.${verb}`));
    for (const verb of ['photo_replace', 'photo_upload']) assert.ok(isKnownAction(`application.${verb}`));
  });

  test('labels and groups come from the catalogue, with a fallback for unknown actions', () => {
    assert.equal(actionLabel('course.create'), 'Course created');
    assert.equal(actionLabel('legacy.thing'), 'legacy.thing');
    assert.equal(actionGroup('legacy.thing'), 'Other');
  });
});

describe('retention streams follow the catalogue', () => {
  test('sign-ins and security signals are short-retention; everything else is not', () => {
    assert.ok(SHORT_RETENTION_ACTIONS.includes('auth.login'));
    assert.ok(SHORT_RETENTION_ACTIONS.includes('auth.login_failed'));
    assert.ok(SHORT_RETENTION_ACTIONS.includes('auth.login_locked'));
    assert.ok(SHORT_RETENTION_ACTIONS.every((a) => a.startsWith('auth.login') || a.startsWith('security.')));
    assert.equal(streamOf('security.access_denied'), STREAMS.SIGN_IN);
    assert.equal(streamOf('auth.logout'), STREAMS.MAIN);
    assert.equal(streamOf('course.create'), STREAMS.MAIN);
  });

  test('actions already written before this catalogue stay in the stream they were sealed in', () => {
    // Moving an action between streams would break existing seals. These were all 'main' (or the three sign-in
    // actions) when the first seals were written, so they must not be short-retention.
    for (const e of AUDIT_CATALOGUE.filter((x) => !x.action.startsWith('security.') && !x.action.startsWith('auth.login'))) {
      assert.ok(!e.shortRetention, `${e.action} must not be short-retention`);
    }
  });
});
