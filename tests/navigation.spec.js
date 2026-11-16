// The header menu: four dropdowns on wide screens, a hamburger on phones.
const { test, expect } = require('@playwright/test');

const PAGES = [
    '/index.html', '/charter.html', '/glossary.html', '/members.html', '/privacy.html',
    '/processes.html', '/tools.html', '/team-tools.html', '/thank-you.html',
    '/process-gratitude.html', '/process-internal-compass.html',
    '/process-what-is-love.html', '/process-what-would-that-look-like.html',
];

const MENUS = {
    'Who We Are': ['Mission', 'What We Do'],
    'About': ['About Us', 'Locations', 'Charter & Bylaws'],
    'Contact': ['Contact Us', 'Get Involved'],
    'Resources': ['Processes', 'Men’s Work Tools', 'Glossary', 'Team Tools'],
};

// Menus inside a dropdown.
const INNER = {
    'Team Tools': ['Best Practices'],
};

const toggle = (page, name) => page.locator('.submenu-toggle').filter({ hasText: new RegExp(`^${name}$`) });
const submenuOf = (page, name) => page.locator('.has-submenu').filter({ has: page.locator(':scope > .submenu-toggle').filter({ hasText: new RegExp(`^${name}$`) }) }).locator(':scope > .submenu');
const topToggles = (page) => page.locator('#main-nav > ul > li > .submenu-toggle');
// The entries of a dropdown: its links and the toggles of menus inside it.
const entries = (page, name) => submenuOf(page, name).locator(':scope > li > :is(a, .submenu-toggle)');

test.describe('menu structure', () => {
    for (const path of PAGES) {
        test(`same menus on ${path}`, async ({ page }) => {
            await page.goto(path);
            await expect(topToggles(page)).toHaveText(Object.keys(MENUS));
            for (const [menu, items] of Object.entries(MENUS)) {
                await expect(entries(page, menu)).toHaveText(items);
            }
            for (const [menu, items] of Object.entries(INNER)) {
                await expect(submenuOf(page, menu).locator('a')).toHaveText(items);
            }
            await expect(page.locator('#main-nav a[href="members.html"]')).toHaveText('Member Login');
            await expect(page.locator('footer a[href="members.html"]')).toHaveText('Member Login');
        });
    }
});

test.describe('wide screen', () => {
    test('dropdowns open on hover and close when the pointer leaves', async ({ page }) => {
        await page.goto('/index.html');
        for (const menu of Object.keys(MENUS)) {
            await expect(submenuOf(page, menu)).toBeHidden();
            await toggle(page, menu).hover();
            await expect(submenuOf(page, menu)).toBeVisible();
            await page.mouse.move(5, 850);
            await expect(submenuOf(page, menu)).toBeHidden();
        }
    });

    test('click opens a dropdown, Escape and clicking elsewhere close it', async ({ page }) => {
        await page.goto('/index.html');
        const about = toggle(page, 'About');
        await about.click();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'About')).toBeVisible();
        await expect(about).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Escape');
        await expect(submenuOf(page, 'About')).toBeHidden();
        await expect(about).toBeFocused();

        await about.click();
        await page.mouse.click(5, 850);
        await expect(submenuOf(page, 'About')).toBeHidden();
    });

    test('opening one dropdown closes the other', async ({ page }) => {
        await page.goto('/index.html');
        await toggle(page, 'About').click();
        await toggle(page, 'Contact').click();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'Contact')).toBeVisible();
        await expect(submenuOf(page, 'About')).toBeHidden();
    });

    test('Team Tools flies out from Resources on hover and click', async ({ page }) => {
        await page.goto('/index.html');
        await toggle(page, 'Resources').hover();
        await expect(submenuOf(page, 'Team Tools')).toBeHidden();      // not opened along with Resources
        await toggle(page, 'Team Tools').hover();
        await expect(submenuOf(page, 'Team Tools')).toBeVisible();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'Resources')).toBeHidden();

        // Click open, then Escape closes the inner menu first, then Resources.
        await toggle(page, 'Resources').click();
        await toggle(page, 'Team Tools').click();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'Team Tools')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(submenuOf(page, 'Team Tools')).toBeHidden();
        await expect(submenuOf(page, 'Resources')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(submenuOf(page, 'Resources')).toBeHidden();

        // Reopening Resources doesn't bring Team Tools back open.
        await toggle(page, 'Resources').click();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'Team Tools')).toBeHidden();
    });

    test('Best Practices opens that section', async ({ page }) => {
        await page.goto('/index.html');
        await toggle(page, 'Resources').hover();
        await toggle(page, 'Team Tools').hover();
        await submenuOf(page, 'Team Tools').getByRole('link', { name: 'Best Practices' }).click();
        await expect(page).toHaveURL(/\/team-tools\.html#meeting-best-practices$/);
        await expect(page.locator('#meeting-best-practices')).toBeInViewport();
    });

    test('dropdowns stay on screen just above the hamburger width', async ({ page }) => {
        await page.setViewportSize({ width: 1101, height: 900 });
        await page.goto('/index.html');
        for (const menu of Object.keys(MENUS)) {
            await toggle(page, menu).click();
            await page.mouse.move(5, 850);
            const box = await submenuOf(page, menu).boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(1101);
            await page.keyboard.press('Escape');
        }
        await toggle(page, 'Resources').click();
        await toggle(page, 'Team Tools').click();
        await page.mouse.move(5, 850);
        const fly = await submenuOf(page, 'Team Tools').boundingBox();
        expect(fly.x).toBeGreaterThanOrEqual(0);
        expect(fly.x + fly.width).toBeLessThanOrEqual(1101);
    });

    test('a section link scrolls the home page and closes the menu', async ({ page }) => {
        await page.goto('/index.html');
        await toggle(page, 'Contact').click();
        await submenuOf(page, 'Contact').getByRole('link', { name: 'Get Involved' }).click();
        await page.mouse.move(5, 850);
        await expect(submenuOf(page, 'Contact')).toBeHidden();
        await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('join').getBoundingClientRect().top)))
            .toBeLessThan(150);
    });

    test('the menu holding the current page is highlighted', async ({ page }) => {
        const cases = { '/processes.html': 'Resources', '/team-tools.html': 'Resources', '/glossary.html': 'Resources', '/charter.html': 'About' };
        for (const [path, menu] of Object.entries(cases)) {
            await page.goto(path);
            await expect(toggle(page, menu)).toHaveClass(/current/);
            await expect(topToggles(page).and(page.locator('.current'))).toHaveCount(1);
        }
        await expect(toggle(page, 'Team Tools')).not.toHaveClass(/current/);
        await page.goto('/team-tools.html');
        await expect(toggle(page, 'Team Tools')).toHaveClass(/current/);
        await page.goto('/index.html');
        await expect(page.locator('.submenu-toggle.current')).toHaveCount(0);
    });
});

test.describe('phone (hamburger menu)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('shows only the menu names until one is tapped', async ({ page }) => {
        await page.goto('/index.html');
        await page.locator('.hamburger').tap();
        const visible = page.locator('#main-nav > ul > li:visible > :is(a, button)');
        await expect(visible).toHaveText(['Who We Are', 'About', 'Contact', 'Resources', 'Member Login']);
        for (const menu of Object.keys(MENUS)) await expect(submenuOf(page, menu)).toBeHidden();
    });

    test('tapping a menu opens it; another tap closes it; menus open independently', async ({ page }) => {
        await page.goto('/index.html');
        await page.locator('.hamburger').tap();
        await toggle(page, 'About').tap();
        await expect(submenuOf(page, 'About')).toBeVisible();
        await toggle(page, 'Resources').tap();
        await expect(submenuOf(page, 'Resources')).toBeVisible();
        await expect(submenuOf(page, 'About')).toBeVisible();
        await toggle(page, 'About').tap();
        await expect(submenuOf(page, 'About')).toBeHidden();
    });

    test('a submenu link navigates', async ({ page }) => {
        await page.goto('/index.html');
        await page.locator('.hamburger').tap();
        await toggle(page, 'Resources').tap();
        await submenuOf(page, 'Resources').getByRole('link', { name: 'Men’s Work Tools' }).tap();
        await expect(page).toHaveURL(/\/tools\.html$/);
        await page.locator('.hamburger').tap();
        await toggle(page, 'Resources').tap();
        await toggle(page, 'Team Tools').tap();
        await expect(submenuOf(page, 'Team Tools')).toBeVisible();
        await submenuOf(page, 'Team Tools').getByRole('link', { name: 'Best Practices' }).tap();
        await expect(page).toHaveURL(/\/team-tools\.html#meeting-best-practices$/);
        await expect(page.getByRole('heading', { name: 'Team Meeting Best Practices' })).toBeVisible();
    });
});

test('no script errors on any page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const path of PAGES) await page.goto(path);
    expect(errors).toEqual([]);
});
