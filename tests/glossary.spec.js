// The glossary page, fed a small made-up sheet instead of the live Google Sheet.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { mockSupabase, supabaseLog } = require('./helpers/mock-supabase');

const CSV = fs.readFileSync(path.join(__dirname, 'fixtures', 'glossary.csv'), 'utf8');

// Made-up comments, as the public comments function returns them.
const PUBLIC_COMMENTS = [
    { id: 1, term_id: 'term-cave', body: 'Made-up comment about the cave.', created_at: '2026-11-01T12:00:00Z', edited_at: null, author: 'Pat E.' },
    { id: 2, term_id: 'term-cave', body: 'A second made-up comment.', created_at: '2026-11-02T12:00:00Z', edited_at: null, author: 'Zed A.' },
];

async function servePublicComments(page, rows = [], status = 200) {
    await page.route('**/rest/v1/rpc/glossary_public_comments', (route) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(rows) }));
}

async function serveSheet(page, body = CSV, status = 200) {
    await servePublicComments(page);   // never reach the real database from tests
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

test.describe('comments', () => {
    test('visitors can read comments but not post', async ({ page }) => {
        await serveSheet(page);
        await page.unrouteAll();
        await servePublicComments(page, PUBLIC_COMMENTS);
        await page.route('**/docs.google.com/spreadsheets/**', (route) =>
            route.fulfill({ status: 200, contentType: 'text/csv', body: CSV }));
        let libraryLoaded = false;
        page.on('request', (r) => { if (r.url().includes('supabase-js')) libraryLoaded = true; });
        await page.goto('/glossary.html');

        const cave = page.locator('#term-cave');
        await cave.getByRole('button', { name: '2 comments' }).click();
        await expect(cave.locator('.comment-body')).toHaveText(['Made-up comment about the cave.', 'A second made-up comment.']);
        await expect(cave.locator('.comment-meta strong')).toHaveText(['Pat E.', 'Zed A.']);
        await expect(cave.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', 'members.html');
        await expect(cave.locator('textarea, [data-act="edit"], [data-act="delete"], [data-act="hide"]')).toHaveCount(0);

        // Terms without comments show nothing to visitors.
        await expect(page.locator('#term-check-in .term-comments')).toHaveCount(0);
        await expect(page.locator('.member-bar')).toHaveCount(0);
        expect(libraryLoaded).toBe(false);    // one small request, no sign-in library
    });

    test('the glossary still works if comments can\'t load', async ({ page }) => {
        await serveSheet(page);
        await page.unrouteAll();
        await servePublicComments(page, { message: 'down' }, 500);
        await page.route('**/docs.google.com/spreadsheets/**', (route) =>
            route.fulfill({ status: 200, contentType: 'text/csv', body: CSV }));
        await page.goto('/glossary.html');
        await expect(page.locator('#glossary-count')).toHaveText('4 terms');
        await expect(page.locator('.term-comments')).toHaveCount(0);
    });

    test('signed-in members can post, and are told comments are public', async ({ page }) => {
        await mockSupabase(page, { comments: PUBLIC_COMMENTS.map((c) => ({ ...c, hidden: false, is_mine: false })) });
        let publicCalled = false;
        await page.route('**/rest/v1/rpc/glossary_public_comments', (route) => { publicCalled = true; route.fulfill({ body: '[]' }); });
        await page.route('**/docs.google.com/spreadsheets/**', (route) =>
            route.fulfill({ status: 200, contentType: 'text/csv', body: CSV }));
        await page.goto('/glossary.html');

        await expect(page.locator('.member-bar')).toContainText('Comments are public');
        const checkIn = page.locator('#term-check-in');
        await checkIn.getByRole('button', { name: 'Add a comment' }).click();
        await expect(checkIn.locator('textarea')).toBeVisible();
        await expect(checkIn).toContainText('Comments are public, shown with your first name and last initial.');
        await expect(page.locator('#term-cave').getByRole('button', { name: '2 comments' })).toBeVisible();
        expect((await supabaseLog(page)).some((c) => c[1] === 'glossary_comment_feed')).toBe(true);
        expect(publicCalled).toBe(false);
    });
});
