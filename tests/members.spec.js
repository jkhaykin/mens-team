// The member page, against a simulated sign-in and made-up members
// (see tests/helpers/mock-supabase.js). Nothing here touches real member data.
const { test, expect } = require('@playwright/test');
const { mockSupabase, supabaseLog } = require('./helpers/mock-supabase');

const updates = async (page) => (await supabaseLog(page)).filter((c) => c[0] === 'update').map((c) => c[2]);
const rpcCalls = async (page, name) => (await supabaseLog(page)).filter((c) => c[0] === 'rpc' && c[1] === name);

test.describe('signing in', () => {
    test('phone, then texted code, then the member area', async ({ page }) => {
        await mockSupabase(page, { signedIn: false });
        await page.goto('/members.html');
        await expect(page.getByRole('heading', { name: 'Member Sign In' })).toBeVisible();

        await page.getByLabel('Mobile number').fill('(555) 555-0101');
        await page.getByRole('button', { name: 'Text me a code' }).click();
        await expect(page.getByText('We texted a 6-digit code to (555) 555-0101')).toBeVisible();

        await page.getByLabel('6-digit code').fill('111111');   // wrong code
        await expect(page.getByText('That code didn’t work')).toBeVisible();

        await page.getByLabel('6-digit code').fill('123456');
        await expect(page.getByRole('heading', { name: 'Your Details' })).toBeVisible();
    });

    test('asks for a full number', async ({ page }) => {
        await mockSupabase(page, { signedIn: false });
        await page.goto('/members.html');
        await page.getByLabel('Mobile number').fill('555-0101');
        await page.getByRole('button', { name: 'Text me a code' }).click();
        await expect(page.getByText('Please enter a full mobile number')).toBeVisible();
    });
});

test.describe('member directory', () => {
    test('teams A to Z, members A to Z within each, no team last', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        const teams = page.locator('.member-team h3');
        await expect(teams).toHaveText(['Forge (2)', 'Game Changers (1)', 'Lumens (1)', 'No Team Listed (1)']);
        // "forge " and "Forge" are the same team
        await expect(page.locator('.member-team').first().locator('.member-name'))
            .toHaveText([/^Adam Zulu/, /^Zed Alpha/]);
    });

    test('shows Team Lead, Moderator and You tags', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        const zed = page.locator('.member-person', { hasText: 'Zed Alpha' });
        await expect(zed.locator('.member-lead')).toHaveText('Team Lead');
        await expect(zed.locator('.member-mod-tag')).toHaveText('Moderator');
        // Moderator and Team Lead tags look the same.
        const look = (loc) => loc.evaluate((el) => {
            const cs = getComputedStyle(el);
            return [cs.color, cs.backgroundColor, cs.fontSize, cs.borderRadius];
        });
        expect(await look(zed.locator('.member-mod-tag'))).toEqual(await look(zed.locator('.member-lead')));
        await expect(page.locator('.member-person', { hasText: 'Pat Example' }).getByText('You')).toBeVisible();
    });

    test('hides contact details a member chose to hide', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await expect(page.locator('.member-person', { hasText: 'Zed Alpha' }).locator('.member-contact')).toHaveCount(0);
        await expect(page.locator('.member-person', { hasText: 'Al Green' }).locator('a[href^="mailto:"]')).toBeVisible();
    });

    test('search narrows the list and hides empty teams', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByLabel('Search members').fill('forge');
        await expect(page.locator('.member-team:visible h3')).toHaveText(['Forge (2)']);
        await expect(page.locator('#directory-count')).toHaveText('2 of 5 members');
        await page.getByLabel('Search members').fill('carl');
        await expect(page.locator('.member-team:visible h3')).toHaveText(['No Team Listed (1)']);
    });
});

test.describe('your details', () => {
    test('saves name, email, team and area', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByLabel('First name').fill('Patrick');
        await page.getByLabel('Team', { exact: true }).fill('Forge');
        await page.getByLabel('Area', { exact: true }).fill('');
        await page.getByRole('button', { name: 'Save details' }).click();
        await expect(page.getByText('Your details are saved.')).toBeVisible();
        expect(await updates(page)).toContainEqual({
            first_name: 'Patrick', last_name: 'Example', email: 'pat@example.com', team: 'Forge', area: null,
        });
        await expect(page.locator('.member-welcome strong')).toHaveText('Patrick');
        await expect(page.locator('.member-team', { hasText: 'Forge' }).locator('.member-name', { hasText: 'Patrick Example' })).toBeVisible();
    });

    test('requires a name and a sensible email', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByLabel('Last name').fill('');
        await page.getByRole('button', { name: 'Save details' }).click();
        await expect(page.locator('#details-status')).toHaveText('Please enter your first and last name.');
        await page.getByLabel('Last name').fill('Example');
        await page.getByLabel('Email', { exact: true }).fill('not-an-email');
        await page.getByRole('button', { name: 'Save details' }).click();
        await expect(page.locator('#details-status')).toHaveText('Please check your email address.');
        expect(await updates(page)).toEqual([]);
    });

    test('Team Lead box saves the moment it is ticked, and shows its tick', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        const box = page.getByLabel('I’m the Team Lead for my team');
        await expect(box).not.toBeChecked();
        // The browser must draw it as a real checkbox (a form style once hid the tick).
        expect(await box.evaluate((el) => getComputedStyle(el).appearance)).not.toBe('none');

        await box.check();
        await expect(page.getByText('You’re now listed as Team Lead.')).toBeVisible();
        expect(await updates(page)).toContainEqual({ is_team_lead: true });
        await expect(page.getByLabel('I’m the Team Lead for my team')).toBeChecked();
        await expect(page.locator('.member-person', { hasText: 'Pat Example' }).locator('.member-lead')).toBeVisible();
    });

    test('privacy boxes save straight away', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByLabel('Show my email address').uncheck();
        await expect(page.locator('#settings-status')).toHaveText('Saved.');
        expect(await updates(page)).toContainEqual({ show_email: false });
    });
});

test.describe('changing your number', () => {
    test('refuses a number another member already has', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByRole('button', { name: 'Change number' }).click();
        await page.getByLabel('New mobile number').fill('555-555-0102');
        await page.getByRole('button', { name: 'Text a code to this number' }).click();
        await expect(page.locator('#phone-box')).toContainText('already used by another member');
        expect((await supabaseLog(page)).some((c) => c[0] === 'updateUser')).toBe(false);
    });

    test('texts the new number and switches after the right code', async ({ page }) => {
        await mockSupabase(page);
        await page.goto('/members.html');
        await page.getByRole('button', { name: 'Change number' }).click();
        await page.getByLabel('New mobile number').fill('(555) 555-0199');
        await page.getByRole('button', { name: 'Text a code to this number' }).click();
        await expect(page.locator('#phone-box')).toContainText('We texted a 6-digit code to (555) 555-0199');

        await page.locator('#new-code').fill('000000');
        await expect(page.locator('#phone-box')).toContainText('That code didn’t work');

        await page.locator('#new-code').fill('123456');
        await expect(page.getByText('Your number is changed.')).toBeVisible();
        await expect(page.locator('.member-phone-line')).toContainText('(555) 555-0199');
        const verify = (await supabaseLog(page)).filter((c) => c[0] === 'verifyOtp').pop()[1];
        expect(verify).toMatchObject({ phone: '+15555550199', type: 'phone_change' });
    });
});

test.describe('moderators', () => {
    test('a regular member sees no moderator controls', async ({ page }) => {
        await mockSupabase(page, { meId: 'm-pat' });
        await page.goto('/members.html');
        await expect(page.locator('[data-mod-id]')).toHaveCount(0);
    });

    test('a moderator can make another member a moderator, and remove it again', async ({ page }) => {
        await mockSupabase(page, { meId: 'm-zed' });
        page.on('dialog', (d) => d.accept());
        await page.goto('/members.html');

        // No control on his own card.
        await expect(page.locator('.member-person', { hasText: 'Zed Alpha' }).locator('[data-mod-id]')).toHaveCount(0);

        const al = page.locator('.member-person', { hasText: 'Al Green' });
        await al.getByRole('button', { name: 'Make moderator' }).click();
        await expect(al.locator('.member-mod-tag')).toHaveText('Moderator');
        await expect(al.getByRole('button', { name: 'Remove moderator' })).toBeVisible();
        expect((await rpcCalls(page, 'set_member_moderator')).pop()[2]).toEqual({ member_id: 'm-al', make: true });

        await al.getByRole('button', { name: 'Remove moderator' }).click();
        await expect(al.locator('.member-mod-tag')).toHaveCount(0);
        expect((await rpcCalls(page, 'set_member_moderator')).pop()[2]).toEqual({ member_id: 'm-al', make: false });
    });

    test('cancelling the confirmation changes nothing', async ({ page }) => {
        await mockSupabase(page, { meId: 'm-zed' });
        page.on('dialog', (d) => d.dismiss());
        await page.goto('/members.html');
        await page.locator('.member-person', { hasText: 'Al Green' }).getByRole('button', { name: 'Make moderator' }).click();
        expect(await rpcCalls(page, 'set_member_moderator')).toEqual([]);
    });
});

test('signing out returns to the sign-in form', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/members.html');
    await page.locator('.member-welcome').getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('You’re signed out.')).toBeVisible();
});
