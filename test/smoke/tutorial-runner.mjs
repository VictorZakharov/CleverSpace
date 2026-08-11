import { openSmokePage } from './helpers.mjs';
import { collectTutorialFailures, runTutorialSmoke } from './tutorial.mjs';

/** Run the long guided course in an isolated context and return named failures. */
export async function runTutorialSmokeSuite(browser, baseUrl, errors) {
  const page = await openSmokePage(browser, baseUrl, errors);
  try {
    const result = await runTutorialSmoke(page);
    console.log('interactive tutorial:', JSON.stringify(result));
    return collectTutorialFailures(result);
  } finally {
    await page.context().close();
  }
}
