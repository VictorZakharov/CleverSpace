import { openSmokePage } from './helpers.mjs';
import { collectTutorialFailures, runTutorialSmoke } from './tutorial.mjs';
import { auditTutorialStaging, stagingAuditFailures } from './tutorial-staging.mjs';
import { auditTutorialRecovery, recoveryFailures } from './tutorial-recovery.mjs';
import { auditTutorialIsolation, isolationFailures } from './tutorial-isolation.mjs';

/** Run the long guided course in an isolated context and return named failures. */
export async function runTutorialSmokeSuite(browser, baseUrl, errors) {
  const page = await openSmokePage(browser, baseUrl, errors);
  try {
    const isolation = await auditTutorialIsolation(page);
    console.log('tutorial isolation:', JSON.stringify(isolation));
    const recovery = await auditTutorialRecovery(page);
    console.log('tutorial recovery:', JSON.stringify(recovery));
    const staging = await auditTutorialStaging(page);
    const result = await runTutorialSmoke(page);
    result.staging = staging;
    console.log('interactive tutorial:', JSON.stringify(result));
    const failures = collectTutorialFailures(result);
    failures.push(...recoveryFailures(recovery));
    failures.push(...isolationFailures(isolation));
    const stagingFailures = stagingAuditFailures(staging);
    if (stagingFailures.length) failures.push(`tutorial staging (${stagingFailures.join(', ')})`);
    return failures;
  } finally {
    await page.context().close();
  }
}
