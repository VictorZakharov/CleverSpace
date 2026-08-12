import { openSmokePage } from './helpers.mjs';
import { collectTutorialFailures, runTutorialSmoke } from './tutorial.mjs';
import { auditTutorialStaging, stagingAuditFailures } from './tutorial-staging.mjs';

/** Run the long guided course in an isolated context and return named failures. */
export async function runTutorialSmokeSuite(browser, baseUrl, errors) {
  const page = await openSmokePage(browser, baseUrl, errors);
  try {
    const staging = await auditTutorialStaging(page);
    const result = await runTutorialSmoke(page);
    result.staging = staging;
    console.log('interactive tutorial:', JSON.stringify(result));
    const failures = collectTutorialFailures(result);
    const stagingFailures = stagingAuditFailures(staging);
    if (stagingFailures.length) failures.push(`tutorial staging (${stagingFailures.join(', ')})`);
    return failures;
  } finally {
    await page.context().close();
  }
}
