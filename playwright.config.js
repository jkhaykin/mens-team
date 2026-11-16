// Browser tests for the Manifest website. Run with `npm test`, or from the
// Testing panel in VS Code (Playwright Test for VS Code extension).
//
// The tests never touch the real member database: the member page is tested
// against a simulated sign-in (tests/helpers/mock-supabase.js), and the
// glossary against a small made-up sheet (tests/fixtures/glossary.csv).
const { defineConfig } = require('@playwright/test');

const PORT = 4321;

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        channel: 'chrome',          // the installed Google Chrome, no extra download
        viewport: { width: 1400, height: 900 },
        trace: 'retain-on-failure',
    },
    webServer: {
        command: `python3 -m http.server ${PORT}`,
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'ignore',
    },
});
