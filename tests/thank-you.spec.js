// After the intake form is sent, JotForm loads thank-you.html inside the
// form's frame. The page must take over the whole window, and report the
// Google Ads conversion exactly once (the Ad Grant depends on it).
// Google's tag script is replaced by an empty stand-in, so these tests send
// nothing to Google; the page's gtag() calls collect in window.dataLayer.
const { test, expect } = require('@playwright/test');

const ADS_CONVERSION = 'AW-18497426737/FuNOCLqGn5kdELGqofRE';

test.beforeEach(async ({ page }) => {
    await page.route('https://www.googletagmanager.com/**', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: '' }));
});

// The events the page reported, as [name, details] pairs
const events = (page) => page.evaluate(() =>
    (window.dataLayer || []).map((args) => Array.from(args))
        .filter((args) => args[0] === 'event')
        .map((args) => [args[1], args[2]]));

test('reports the lead and the Google Ads conversion once', async ({ page }) => {
    await page.goto('/thank-you.html');
    const sent = await events(page);
    expect(sent.filter(([name]) => name === 'conversion')).toEqual([['conversion', { send_to: ADS_CONVERSION }]]);
    expect(sent.filter(([name]) => name === 'generate_lead')).toHaveLength(1);
});

test('opened inside the form frame, it takes over the window and counts once', async ({ page }) => {
    await page.route('https://form.jotform.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Form</title>' }));
    await page.goto('/index.html');
    // As JotForm does after a submission: send its own frame to the thank-you page
    await page.locator('#JotFormIFrame-250927094669066').evaluate((frame) => {
        frame.removeAttribute('loading');
        frame.src = '/thank-you.html';
    });
    await expect(page).toHaveURL(/\/thank-you\.html$/);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    const sent = await events(page);
    expect(sent.filter(([name]) => name === 'conversion')).toHaveLength(1);
});
