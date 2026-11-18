// Shared members-only helpers: Supabase connection and phone formatting.
// The URL and publishable key are meant to be public; the database's row-level
// security decides what each signed-in member can see (see supabase/migrations).
(function () {
    'use strict';

    var SUPABASE_URL = 'https://pkzttsktekcjafhbepki.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_mVHl3BNmefZmmzEUgcFRJw_osukXgHX';
    var STORAGE_KEY = 'sb-pkzttsktekcjafhbepki-auth-token';
    var LIB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
    var LIB_SRI = 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';

    var clientPromise = null;

    // True if this browser has a saved sign-in (cheap check, no network).
    function hasStoredSession() {
        try { return !!window.localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
    }

    function loadLibrary() {
        if (window.supabase && window.supabase.createClient) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = LIB_SRC;
            s.integrity = LIB_SRI;
            s.crossOrigin = 'anonymous';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Could not load the sign-in library.')); };
            document.head.appendChild(s);
        });
    }

    // Returns a promise for the shared Supabase client.
    function getClient() {
        if (!clientPromise) {
            clientPromise = loadLibrary().then(function () {
                return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY }
                });
            });
            clientPromise.catch(function () { clientPromise = null; });
        }
        return clientPromise;
    }

    // "(415) 555-1234" / "415.555.1234" / "+1 415 555 1234" -> "+14155551234"
    function normalizePhone(input) {
        var digits = String(input || '').replace(/\D/g, '');
        if (digits.length === 10) digits = '1' + digits;
        if (digits.length < 11 || digits.length > 15) return null;
        return '+' + digits;
    }

    // "14155551234" -> "(415) 555-1234" for US numbers; others as +digits.
    function formatPhone(digits) {
        var d = String(digits || '').replace(/\D/g, '');
        if (d.length === 11 && d.charAt(0) === '1') {
            return '(' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7);
        }
        return d ? '+' + d : '';
    }

    // Calls a database function open to everyone (no sign-in), without loading
    // the sign-in library: one small request.
    function publicRpc(name) {
        return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: '{}'
        }).then(function (res) {
            if (!res.ok) throw new Error('Request failed: ' + res.status);
            return res.json();
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.ManifestMembers = {
        hasStoredSession: hasStoredSession,
        getClient: getClient,
        normalizePhone: normalizePhone,
        formatPhone: formatPhone,
        publicRpc: publicRpc,
        escapeHtml: escapeHtml
    };
})();
