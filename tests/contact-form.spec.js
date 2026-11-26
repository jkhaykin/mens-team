// The intake form on the home page is a JotForm in a frame. The form reports
// its height to the page; the page resizes the frame so nothing is cut off.
// JotForm itself is replaced by a blank stand-in page, so these tests never
// contact JotForm.
const { test, expect } = require('@playwright/test');

const FORM_ID = '250927094669066';
const frameSel = `#JotFormIFrame-${FORM_ID}`;

test.beforeEach(async ({ page }) => {
    await page.route('https://form.jotform.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Form</title><p>Form</p>' }));
    await page.goto('/index.html');
    await page.locator(frameSel).scrollIntoViewIfNeeded();   // the frame loads lazily
    await expect.poll(() => page.frames().some((f) => f.url().startsWith('https://form.jotform.com/'))).toBe(true);
});

const fromForm = (page, message) =>
    page.frames().find((f) => f.url().startsWith('https://form.jotform.com/'))
        .evaluate((m) => parent.postMessage(m, '*'), message);

const frameHeight = (page) => page.locator(frameSel).evaluate((el) => el.getBoundingClientRect().height);

test('the home page embeds the intake form, with a title for screen readers', async ({ page }) => {
    const frame = page.locator(frameSel);
    await expect(frame).toHaveAttribute('src', `https://form.jotform.com/${FORM_ID}`);
    await expect(frame).toHaveAttribute('title', /\S/);
    await expect(frame).toBeVisible();
});

test('the frame grows and shrinks to the height the form reports', async ({ page }) => {
    await fromForm(page, `setHeight:1290:${FORM_ID}`);
    await expect.poll(() => frameHeight(page)).toBe(1290);
    await fromForm(page, `setHeight:940:${FORM_ID}`);
    await expect.poll(() => frameHeight(page)).toBe(940);
});

test('height messages from anywhere but the form are ignored', async ({ page }) => {
    const before = await frameHeight(page);
    await page.evaluate((id) => window.postMessage(`setHeight:300:${id}`, '*'), FORM_ID);
    await fromForm(page, 'setHeight:not-a-number:x');
    await page.waitForTimeout(300);
    expect(await frameHeight(page)).toBe(before);
});

test('a "required" error in the form is scrolled into view below the header', async ({ page }) => {
    await fromForm(page, `setHeight:1290:${FORM_ID}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));   // as after clicking Submit
    // JotForm sends this one as an object, not text
    await fromForm(page, { type: 'NVA_VALIDATION_ERROR_POSITION', formId: FORM_ID, validationErrorY: 120 });
    const errorTop = () => page.evaluate((sel) => {
        const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
        return document.querySelector(sel).getBoundingClientRect().top + 120 - header;
    }, frameSel);
    // just below the header, with room above for the field's label
    await expect.poll(errorTop).toBeGreaterThanOrEqual(70);
    expect(await errorTop()).toBeLessThan(150);
});
