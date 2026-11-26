// Monthly health check of the intake form on the LIVE site.
//
// 1. The form loads on the home page, the page sizes its frame to fit, and
//    an empty submission shows "required" errors with Submit still reachable.
//    (Nothing is sent: the form refuses empty submissions.)
// 2. Only when SUBMIT_TEST_ENTRY=1: send one clearly labelled test entry and
//    check the visitor lands on the thank-you page. This creates a real entry
//    in JotForm and sends the usual notification email; that email arriving
//    is itself part of the check.
//
// Google's tracking is blocked throughout, so a test entry is never counted
// as a Google Ads conversion (Ad Grant rules require real conversions).
const { test, expect } = require('@playwright/test');

const FORM_ID = '250927094669066';
const frameSel = `#JotFormIFrame-${FORM_ID}`;

const TRACKERS = [
    /googletagmanager\.com/, /google-analytics\.com/, /googleadservices\.com/,
    /doubleclick\.net/, /googlesyndication\.com/, /google\.com\/(pagead|ccm)\//,
];

test.beforeEach(async ({ context }) => {
    // Covers the page, the form's frame, and the thank-you page
    await context.route((url) => TRACKERS.some((re) => re.test(url.href)), (route) => route.abort());
});

async function openForm(page) {
    await page.goto('/');
    const frame = page.locator(frameSel);
    await frame.scrollIntoViewIfNeeded();
    const form = page.frameLocator(frameSel);
    await expect(form.getByRole('button', { name: /submit/i })).toBeVisible({ timeout: 30_000 });
    return { frame, form };
}

// Is the button fully inside the frame (not cut off)?
const insideFrame = (button) => button.evaluate((b) => b.getBoundingClientRect().bottom <= window.innerHeight);

test('the form loads, fits its frame, and shows errors for an empty submission', async ({ page }) => {
    let sent = false;
    page.on('request', (r) => { if (r.method() === 'POST' && /jotform/.test(r.url())) sent = true; });

    const { frame, form } = await openForm(page);
    const submit = form.getByRole('button', { name: /submit/i });

    // The page resized the frame to the form's own height (not the 1120px fallback)
    await expect.poll(() => frame.evaluate((f) => f.style.height), { timeout: 15_000 }).toMatch(/^\d+px$/);
    expect(await insideFrame(submit)).toBe(true);

    await submit.click();
    await expect(form.getByText(/this field is required/i).first()).toBeVisible();
    await expect.poll(() => insideFrame(submit)).toBe(true);
    expect(sent).toBe(false);
});

test.describe('test submission', () => {
  // Never retried: a retry would send a second entry and email
  test.describe.configure({ retries: 0 });

  test('a test submission reaches the thank-you page', async ({ page }) => {
    test.skip(process.env.SUBMIT_TEST_ENTRY !== '1', 'Set SUBMIT_TEST_ENTRY=1 to send a test entry');
    test.info().annotations.push({ type: 'note', description: 'Creates one JotForm entry and one notification email' });

    const { form } = await openForm(page);
    const month = new Date().toISOString().slice(0, 7);
    await form.locator('#first_3').fill('Automated');
    await form.locator('#last_3').fill('Website Check');
    await form.locator('#input_4').fill('website-check@example.com');
    await form.locator('#input_6_city').fill('San Rafael, CA');
    await form.locator('#input_7').fill('Automated monthly website check');
    await form.locator('#input_5').fill(
        `AUTOMATED TEST (${month}) - please ignore and delete. ` +
        'This monthly check from the website confirms the intake form still submits ' +
        'and reaches the thank-you page. If this email arrived, notifications work too.');
    await form.getByRole('button', { name: /submit/i }).click();

    // JotForm sends its frame to thank-you.html, which takes over the window
    await expect(page).toHaveURL('https://www.manifestmensgroup.org/thank-you.html', { timeout: 30_000 });
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});
