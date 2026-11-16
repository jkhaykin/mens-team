// The glossary page, fed a small made-up sheet instead of the live Google Sheet.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const CSV = fs.readFileSync(path.join(__dirname, 'fixtures', 'glossary.csv'), 'utf8');

async function serveSheet(page, body = CSV, status = 200) {
    await page.route('**/docs.google.com/spreadsheets/**', (route) =>
        route.fulfill({ status, contentType: 'text/csv', body }));
}

test('groups terms into the three sections, in order, A to Z', async ({ page }) => {
    await serveSheet(page);
    await page.goto('/glossary.html');
    await expect(page.locator('.glossary-section h2')).toHaveText(['Core Terms', 'Going Deeper', 'Roots and History']);
    await expect(page.locator('#section-core-terms dt')).toHaveText(['Check-in', 'Clearing']);
    await expect(page.locator('#glossary-count')).toHaveText('4 terms');   // the uncategorized row is skipped
    await expect(page.locator('#glossary-jump a')).toHaveCount(3);
});

test('search filters terms and hides empty sections', async ({ page }) => {
    await serveSheet(page);
    await page.goto('/glossary.html');
    await page.locator('#glossary-search').fill('cave');
    await expect(page.locator('.glossary-entry:visible dt')).toHaveText(['Cave']);
    await expect(page.locator('#section-core-terms')).toBeHidden();
    await expect(page.locator('#glossary-count')).toHaveText('1 of 4 terms match');

    await page.locator('#glossary-search').fill('nothing like this');
    await expect(page.locator('#glossary-count')).toContainText('No terms match');

    await page.locator('#glossary-search').press('Escape');
    await expect(page.locator('#glossary-count')).toHaveText('4 terms');
});

test('"See:" references link to the other term, even from a filtered list', async ({ page }) => {
    await serveSheet(page);
    await page.goto('/glossary.html');
    await page.locator('#glossary-search').fill('short update');   // matches Check-in only
    await expect(page.locator('#term-clearing')).toBeHidden();
    const link = page.locator('#term-check-in .glossary-see a', { hasText: 'Clearing' });
    await expect(link).toHaveAttribute('href', '#term-clearing');
    await link.click();
    await expect(page).toHaveURL(/#term-clearing$/);
    await expect(page.locator('#glossary-search')).toHaveValue('');
    await expect(page.locator('#term-clearing')).toBeInViewport();
});

test('a link straight to a term opens at that term', async ({ page }) => {
    await serveSheet(page);
    await page.goto('/glossary.html#term-lineage');
    await expect(page.locator('#term-lineage')).toBeInViewport();
});

test('shows a friendly message if the sheet can\'t be loaded', async ({ page }) => {
    await page.route('**/docs.google.com/spreadsheets/**', (route) => route.abort());
    await page.goto('/glossary.html');
    await expect(page.locator('#glossary-status')).toContainText('couldn’t load the glossary');
});

test('the search bar stays pinned while scrolling', async ({ page }) => {
    // Enough terms to scroll.
    const rows = Array.from({ length: 60 }, (_, i) => `Term ${i},Meaning ${i},Core Terms`).join('\n');
    await serveSheet(page, 'Term,Meaning,Category\n' + rows);
    await page.goto('/glossary.html');
    await page.mouse.wheel(0, 3000);
    await expect(page.locator('#glossary-bar')).toHaveClass(/is-stuck/);
    await expect(page.locator('#glossary-search')).toBeInViewport();
});
