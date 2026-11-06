// T49: which installer smoke-test reports pass.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUST_PASS, reportProblems } from './report.mjs';

const expect = { version: '0.1.0', schema: 5, seeded: true };

function good(extra = {}) {
  return {
    version: '0.1.0',
    os: 'linux',
    arch: 'x86_64',
    frontend: true,
    dataDir: '/tmp/x',
    schemaVersion: 5,
    stories: 1,
    saves: 1,
    seededStory: 's1',
    seedKept: true,
    restoreCheck: { stories: 1, routes: 1, images: 0 },
    checks: [
      ...MUST_PASS.map((id) => ({ id, status: 'PASS', summary: 'ok' })),
      { id: 'SECRETS', status: 'WARN', summary: 'no keyring' },
      { id: 'AI_CONNECTION', status: 'SKIPPED', summary: 'none' },
    ],
    errors: [],
    ...extra,
  };
}

test('a first run that seeded, and a later run that kept it, pass', () => {
  assert.deepEqual(reportProblems(good(), expect), []);
  assert.deepEqual(reportProblems(good({ seededStory: null }), { ...expect, seeded: false }), []);
});

test('anything a release must not ship with fails', () => {
  const cases = [
    [good({ version: '0.0.9' }), 'version 0.0.9 (expected 0.1.0)'],
    [good({ frontend: false }), 'the interface did not load'],
    [good({ schemaVersion: 4 }), 'database schema v4 (expected v5)'],
    [good({ errors: ['seed: locked'] }), 'seed: locked'],
    [good({ seedKept: false }), 'the test story and its save are missing'],
    [good({ seededStory: null }), 'the test story was not created'],
    [good({ restoreCheck: null }), 'no backup and restore check'],
    [
      good({ restoreCheck: { stories: 0, routes: 0, images: 0 } }),
      'the backup holds 0 stories, the app 1',
    ],
  ];
  for (const [report, problem] of cases) {
    assert.deepEqual(reportProblems(report, expect), [problem]);
  }
  const failing = good();
  failing.checks[2] = { id: 'DATABASE', status: 'FAIL', summary: 'corrupt' };
  failing.checks.push({ id: 'ASSETS', status: 'FAIL', summary: 'missing files' });
  assert.deepEqual(reportProblems(failing, expect), [
    'DATABASE is FAIL: corrupt',
    'ASSETS is FAIL: missing files',
  ]);
  assert.deepEqual(reportProblems(good({ checks: [] }), expect).length, MUST_PASS.length);
  assert.deepEqual(reportProblems(null, expect), ['no report']);
});
