// A stand-in for the Supabase client, so the member page can be tested
// without a real sign-in or the real member list. It is installed before the
// page loads; member-auth.js sees window.supabase and uses it instead of
// downloading the real library.
//
// Every call the page makes is recorded in window.__supabaseLog, and the
// made-up data lives in window.__mockDb, so tests can check both.

const defaultMembers = [
    { id: 'm-pat', first_name: 'Pat', last_name: 'Example', team: 'Lumens', area: 'Oakland',
      phone: '15555550101', email: 'pat@example.com', is_team_lead: false, is_moderator: false,
      show_phone: true, show_email: true },
    { id: 'm-zed', first_name: 'Zed', last_name: 'Alpha', team: 'Forge', area: null,
      phone: '15555550102', email: null, is_team_lead: true, is_moderator: true,
      show_phone: false, show_email: false },
    { id: 'm-adam', first_name: 'Adam', last_name: 'Zulu', team: 'forge ', area: null,
      phone: '15555550103', email: null, is_team_lead: false, is_moderator: false,
      show_phone: true, show_email: false },
    { id: 'm-al', first_name: 'Al', last_name: 'Green', team: 'Game Changers', area: 'San Rafael',
      phone: '15555550104', email: 'al@example.com', is_team_lead: false, is_moderator: false,
      show_phone: true, show_email: true },
    { id: 'm-carl', first_name: 'Carl', last_name: 'Day', team: null, area: null,
      phone: '15555550105', email: null, is_team_lead: false, is_moderator: false,
      show_phone: true, show_email: true },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ signedIn?: boolean, meId?: string, members?: object[], validCode?: string }} [opts]
 */
async function mockSupabase(page, opts = {}) {
    const config = {
        signedIn: opts.signedIn !== false,
        meId: opts.meId || 'm-pat',
        members: JSON.parse(JSON.stringify(opts.members || defaultMembers)),
        validCode: opts.validCode || '123456',
    };

    await page.addInitScript((cfg) => {
        const db = { members: cfg.members };
        const log = [];
        window.__mockDb = db;
        window.__supabaseLog = log;

        let session = cfg.signedIn ? { user: { phone: '' } } : null;
        let pendingPhoneChange = null;
        const me = () => db.members.find((m) => m.id === cfg.meId);
        const ok = (data) => Promise.resolve({ data: data === undefined ? null : data, error: null });
        const fail = (message, code) => Promise.resolve({ data: null, error: { message, code } });

        // Rows as member_roster() returns them: hidden contact details removed.
        const roster = () => db.members.map((m) => ({
            id: m.id, first_name: m.first_name, last_name: m.last_name, area: m.area, team: m.team,
            phone: m.show_phone || m.id === cfg.meId ? m.phone : null,
            email: m.show_email || m.id === cfg.meId ? m.email : null,
            is_team_lead: m.is_team_lead, is_me: m.id === cfg.meId,
        }));

        // Minimal query builder: from('members').select().eq().single(),
        // from('members').update(patch).eq(...)
        function from(table) {
            const q = { table, filters: {}, patch: null };
            const run = () => {
                if (q.patch) {
                    log.push(['update', table, q.patch]);
                    db.members.filter((m) => m.id === q.filters.id).forEach((m) => Object.assign(m, q.patch));
                    return ok();
                }
                const row = db.members.find((m) => m.id === q.filters.id);
                return ok(row ? { ...row } : null);
            };
            const api = {
                select() { return api; },
                eq(col, val) { q.filters[col] = val; return api; },
                update(patch) { q.patch = patch; return api; },
                single() { return run(); },
                then(res, rej) { return run().then(res, rej); },
            };
            return api;
        }

        const client = {
            from,
            rpc(name, args) {
                log.push(['rpc', name, args || null]);
                if (!session) return fail('not signed in', '42501');
                switch (name) {
                    case 'member_roster': return ok(roster());
                    case 'member_moderators': return ok(db.members.filter((m) => m.is_moderator).map((m) => m.id));
                    case 'is_member': return ok(true);
                    case 'is_moderator': return ok(!!me().is_moderator);
                    case 'phone_available_for_me': {
                        const digits = String(args.new_phone).replace(/\D/g, '');
                        return ok(!db.members.some((m) => m.phone === digits && m.id !== cfg.meId));
                    }
                    case 'set_member_moderator': {
                        if (!me().is_moderator) return fail('Only moderators can change who is a moderator', '42501');
                        if (args.member_id === cfg.meId) return fail('You can\'t change your own moderator status', '42501');
                        db.members.find((m) => m.id === args.member_id).is_moderator = args.make;
                        return ok();
                    }
                    default: return ok();
                }
            },
            auth: {
                getSession: () => ok({ session }),
                signInWithOtp: (args) => { log.push(['signInWithOtp', args]); return ok({}); },
                verifyOtp: (args) => {
                    log.push(['verifyOtp', args]);
                    if (args.token !== cfg.validCode) return fail('Token has expired or is invalid', 'otp_expired');
                    if (args.type === 'phone_change') {
                        me().phone = String(pendingPhoneChange || args.phone).replace(/\D/g, '');
                    }
                    session = { user: { phone: args.phone } };
                    return ok({ session });
                },
                updateUser: (args) => {
                    log.push(['updateUser', args]);
                    pendingPhoneChange = args.phone;
                    return ok({});
                },
                refreshSession: () => ok({ session }),
                signOut: () => { session = null; return ok(); },
            },
        };

        window.supabase = { createClient: () => client };
        // Look signed in to pages that check for a saved session first (the glossary).
        if (cfg.signedIn) {
            try { localStorage.setItem('sb-pkzttsktekcjafhbepki-auth-token', '{"mock":true}'); } catch (e) { /* ignore */ }
        }
    }, config);
}

/** Calls the page made to the simulated Supabase, e.g. [['update','members',{...}], ...] */
async function supabaseLog(page) {
    return page.evaluate(() => window.__supabaseLog);
}

module.exports = { mockSupabase, supabaseLog, defaultMembers };
