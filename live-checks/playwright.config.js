// Checks of the LIVE website and the real JotForm intake form. Run monthly by
// .github/workflows/intake-form-check.yml, or by hand with `npm run check:live`
// (add SUBMIT_TEST_ENTRY=1 to also send a test submission).
//
// Kept apart from the regular tests (./tests), which never touch the live
// site or JotForm.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: '.',
    fullyParallel: false,
    workers: 1,
    retries: 1,                 // the live internet can hiccup; retry once before failing
    timeout: 60_000,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : [['list']],
    use: {
        baseURL: 'https://www.manifestmensgroup.org',
        channel: 'chrome',
        trace: 'retain-on-failure',
    },
});
