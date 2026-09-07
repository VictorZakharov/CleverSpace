import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { startDistServer, openSmokePage } from './smoke/helpers.mjs';
import { auditTutorialStaging, stagingAuditFailures } from './smoke/tutorial-staging.mjs';
import { runTutorialSmoke, collectTutorialFailures } from './smoke/tutorial.mjs';
import { auditTutorialIsolation, isolationFailures } from './smoke/tutorial-isolation.mjs';

const seeds = (process.env.TUTORIAL_SEEDS ?? '1,2,3,7,9,17,42,99,256,1024,65535,2147483647')
  .split(',').map(Number);
const full = process.argv.includes('--full');
const server = await startDistServer(fileURLToPath(new URL('../dist', import.meta.url)), 8138, '/NebReck');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const failures = [];
try {
  for (const seed of seeds) {
    const errors = [];
    const page = await openSmokePage(browser, 'http://localhost:8138', errors, seed);
    try {
      const staging = await auditTutorialStaging(page);
      const issues = stagingAuditFailures(staging);
      const isolation = await auditTutorialIsolation(page);
      issues.push(...isolationFailures(isolation));
      if (full) issues.push(...collectTutorialFailures(await runTutorialSmoke(page)));
      issues.push(...errors);
      console.log(JSON.stringify({ seed, issues, staging, isolation }));
      failures.push(...issues.map((issue) => `${seed}: ${issue}`));
    } catch (error) {
      console.log(JSON.stringify({ seed, error: error.message }));
      failures.push(`${seed}: ${error.message}`);
    } finally { await page.context().close(); }
  }
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
console.log('randomized tutorial:', failures.length ? failures : 'PASS');
process.exitCode = failures.length ? 1 : 0;
