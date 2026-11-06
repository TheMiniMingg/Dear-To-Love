// What a passing installer smoke-test report looks like (T49). The app
// writes the report (`--smoke-test`); this decides whether it passed.

/** Checks that must pass on every system, with or without network or keys. */
export const MUST_PASS = ['APP_VERSION', 'DATA_DIR', 'DATABASE', 'TIMELINE_REPLAY', 'USAGE_LEDGER'];

/**
 * Everything wrong with one run's report, empty when it passed.
 * @param {object} r the report
 * @param {{version: string, schema: number, seeded: boolean}} expect
 *   `seeded`: this run was asked to add the test story.
 */
export function reportProblems(r, expect) {
  const problems = [];
  if (!r || typeof r !== 'object') return ['no report'];
  if (r.version !== expect.version) {
    problems.push(`version ${r.version} (expected ${expect.version})`);
  }
  if (r.frontend !== true) problems.push('the interface did not load');
  if (r.schemaVersion !== expect.schema) {
    problems.push(`database schema v${r.schemaVersion} (expected v${expect.schema})`);
  }
  for (const e of r.errors ?? []) problems.push(e);
  const checks = new Map((r.checks ?? []).map((c) => [c.id, c]));
  for (const id of MUST_PASS) {
    const c = checks.get(id);
    if (c?.status !== 'PASS') {
      problems.push(`${id} is ${c ? `${c.status}: ${c.summary}` : 'missing'}`);
    }
  }
  for (const c of checks.values()) {
    if (c.status === 'FAIL' && !MUST_PASS.includes(c.id)) {
      problems.push(`${c.id} is FAIL: ${c.summary}`);
    }
  }
  if (expect.seeded && !r.seededStory) problems.push('the test story was not created');
  if (!expect.seeded && r.seededStory) problems.push('a story was created without --smoke-seed');
  if (!r.seedKept) problems.push('the test story and its save are missing');
  if (!r.restoreCheck) {
    problems.push('no backup and restore check');
  } else if (r.restoreCheck.stories !== r.stories) {
    problems.push(`the backup holds ${r.restoreCheck.stories} stories, the app ${r.stories}`);
  }
  return problems;
}
