// Members page: sign in with a texted code, then the member directory.
(function () {
    'use strict';

    var M = window.ManifestMembers;
    var esc = M.escapeHtml;
    var root = document.getElementById('members-app');
    var client = null;
    var pendingPhone = null;

    function show(html) { root.innerHTML = html; }

    function statusHtml(msg, isError) {
        return '<p class="member-status' + (isError ? ' is-error' : '') + '" role="' +
            (isError ? 'alert' : 'status') + '">' + msg + '</p>';
    }

    // Map Supabase Auth errors (by error code first, then message) to plain language.
    function friendlyError(err) {
        var msg = (err && (err.message || err.error_description)) || '';
        var code = (err && err.code) || '';
        var status = err && err.status;
        if (/not on the Manifest member list/i.test(msg) || code === 'signup_disabled' ||
            /signups? not allowed/i.test(msg)) {
            return 'That number isn&rsquo;t on the Manifest member list. If you&rsquo;re a member, ' +
                'please <a href="/#contact">contact us</a> to update your number.';
        }
        if (status === 429 || /rate_limit/.test(code) || /rate limit|too many|security purposes/i.test(msg)) {
            return 'Please wait a minute before requesting another code.';
        }
        if (code === 'sms_send_failed' || /sending .*otp|sms/i.test(msg)) {
            return 'We couldn&rsquo;t send a text right now. Please try again later, or ' +
                '<a href="/#contact">contact us</a> if it keeps happening.';
        }
        if (code === 'otp_expired' || /expired|invalid.*(token|otp|code)|token/i.test(msg)) {
            return 'That code didn&rsquo;t work. Check it and try again, or request a new code.';
        }
        return 'Something went wrong. Please try again in a moment.';
    }

    // --- Step 1: phone number -------------------------------------------
    function renderPhoneStep(message, isError) {
        show(
            '<div class="member-card">' +
            '<h2>Member Sign In</h2>' +
            '<p>Enter the mobile number Manifest has on file. We&rsquo;ll text you a 6-digit code.</p>' +
            '<form id="phone-form" class="member-form" novalidate>' +
            '<label for="member-phone">Mobile number</label>' +
            '<input id="member-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(415) 555-1234" required>' +
            '<button type="submit" class="btn">Text me a code</button>' +
            '</form>' +
            (message ? statusHtml(message, isError) : '') +
            '<p class="member-fineprint">Members only. Message and data rates may apply. ' +
            'See our <a href="privacy.html">privacy policy</a>.</p>' +
            '</div>'
        );
        var form = document.getElementById('phone-form');
        var input = document.getElementById('member-phone');
        if (pendingPhone) input.value = M.formatPhone(pendingPhone);
        input.focus();
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var phone = M.normalizePhone(input.value);
            if (!phone) {
                renderPhoneStep('Please enter a full mobile number, including area code.', true);
                return;
            }
            var btn = form.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Sending…';
            client.auth.signInWithOtp({ phone: phone }).then(function (res) {
                if (res.error) throw res.error;
                pendingPhone = phone.slice(1);
                renderCodeStep();
            }).catch(function (err) {
                pendingPhone = phone.slice(1);
                renderPhoneStep(friendlyError(err), true);
            });
        });
    }

    // --- Step 2: the texted code ----------------------------------------
    function renderCodeStep(message, isError) {
        show(
            '<div class="member-card">' +
            '<h2>Enter Your Code</h2>' +
            '<p>We texted a 6-digit code to <strong>' + esc(M.formatPhone(pendingPhone)) + '</strong>.</p>' +
            '<form id="code-form" class="member-form" novalidate>' +
            '<label for="member-code">6-digit code</label>' +
            '<input id="member-code" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
            'pattern="[0-9]{6}" maxlength="6" placeholder="123456" required>' +
            '<button type="submit" class="btn">Sign in</button>' +
            '</form>' +
            (message ? statusHtml(message, isError) : '') +
            '<p class="member-fineprint"><button type="button" class="link-button" id="change-number">' +
            'Use a different number</button> &middot; <button type="button" class="link-button" id="resend-code">' +
            'Send a new code</button></p>' +
            '</div>'
        );
        var form = document.getElementById('code-form');
        var input = document.getElementById('member-code');
        input.focus();
        input.addEventListener('input', function () {
            input.value = input.value.replace(/\D/g, '').slice(0, 6);
            if (input.value.length === 6) form.requestSubmit ? form.requestSubmit() : form.submit();
        });
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var code = input.value.replace(/\D/g, '');
            if (code.length !== 6) { renderCodeStep('Please enter all 6 digits.', true); return; }
            var btn = form.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Checking…';
            client.auth.verifyOtp({ phone: '+' + pendingPhone, token: code, type: 'sms' }).then(function (res) {
                if (res.error) throw res.error;
                loadMemberArea();
            }).catch(function (err) {
                renderCodeStep(friendlyError(err), true);
            });
        });
        document.getElementById('change-number').addEventListener('click', function () { renderPhoneStep(); });
        document.getElementById('resend-code').addEventListener('click', function () {
            client.auth.signInWithOtp({ phone: '+' + pendingPhone }).then(function (res) {
                if (res.error) throw res.error;
                renderCodeStep('A new code is on its way.');
            }).catch(function (err) { renderCodeStep(friendlyError(err), true); });
        });
    }

    // --- Signed in --------------------------------------------------------
    function signOut() {
        client.auth.signOut().finally(function () {
            pendingPhone = null;
            renderPhoneStep('You&rsquo;re signed out.');
        });
    }

    function loadMemberArea() {
        show(statusHtml('Loading the member directory&hellip;'));
        client.rpc('member_directory').then(function (res) {
            if (res.error) throw res.error;
            var rows = res.data || [];
            var me = rows.filter(function (r) { return r.is_me; })[0];
            if (!me) {
                // Signed in, but not (or no longer) an active member.
                show('<div class="member-card"><h2>Membership Not Active</h2>' +
                    '<p>This number isn&rsquo;t on the active Manifest member list. If that&rsquo;s a mistake, ' +
                    'please <a href="/#contact">contact us</a>.</p>' +
                    '<button type="button" class="btn" id="sign-out">Sign out</button></div>');
                document.getElementById('sign-out').addEventListener('click', signOut);
                return;
            }
            return client.from('members').select('show_phone, show_email, is_moderator')
                .eq('id', me.id).single().then(function (own) {
                    if (own.error) throw own.error;
                    renderMemberArea(rows, me, own.data);
                });
        }).catch(function () {
            show(statusHtml('Sorry, we couldn&rsquo;t load the member area. Please try again in a moment.', true) +
                '<p class="center"><button type="button" class="btn" id="sign-out">Sign out</button></p>');
            document.getElementById('sign-out').addEventListener('click', signOut);
        });
    }

    function personHtml(r) {
        var contact = [];
        if (r.phone) contact.push('<a href="tel:+' + esc(r.phone) + '">' + esc(M.formatPhone(r.phone)) + '</a>');
        if (r.email) contact.push('<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>');
        var where = [r.area, r.team].filter(Boolean).map(esc).join(' &middot; ');
        return '<li class="member-person" data-search="' +
            esc([r.first_name, r.last_name, r.area, r.team, r.email].join(' ').toLowerCase()) + '">' +
            '<span class="member-name">' + esc(r.first_name + ' ' + r.last_name) +
            (r.is_me ? ' <span class="member-you">You</span>' : '') + '</span>' +
            (where ? '<span class="member-where">' + where + '</span>' : '') +
            (contact.length ? '<span class="member-contact">' + contact.join('') + '</span>' : '') +
            '</li>';
    }

    function renderMemberArea(rows, me, own) {
        show(
            '<div class="member-welcome">' +
            '<p>Welcome, <strong>' + esc(me.first_name) + '</strong>' +
            (own.is_moderator ? ' <span class="member-you">Moderator</span>' : '') + '</p>' +
            '<button type="button" class="link-button" id="sign-out">Sign out</button>' +
            '</div>' +

            '<div class="member-card member-settings">' +
            '<h2>Your Directory Listing</h2>' +
            '<p>Other members see your name and area. Choose what else they can see:</p>' +
            '<label class="member-toggle"><input type="checkbox" id="show-phone"' + (own.show_phone ? ' checked' : '') +
            '> Show my phone number</label>' +
            '<label class="member-toggle"><input type="checkbox" id="show-email"' + (own.show_email ? ' checked' : '') +
            '> Show my email address</label>' +
            '<p class="member-fineprint" id="settings-status" aria-live="polite"></p>' +
            '</div>' +

            '<h2 class="member-heading">Member Directory</h2>' +
            '<p class="member-fineprint">For members only. Please don&rsquo;t share this information outside Manifest.</p>' +
            '<label class="glossary-label" for="directory-search">Search members</label>' +
            '<input type="search" id="directory-search" class="member-search" placeholder="Name, area or team&hellip;" autocomplete="off">' +
            '<p class="glossary-count" id="directory-count">' + rows.length + ' members</p>' +
            '<ul class="member-list" id="directory-list">' + rows.map(personHtml).join('') + '</ul>' +

            '<div class="member-card">' +
            '<h2>Discuss the Glossary</h2>' +
            '<p>While you&rsquo;re signed in, each term on the <a href="glossary.html">glossary</a> has a members-only comment thread.</p>' +
            '</div>'
        );

        document.getElementById('sign-out').addEventListener('click', signOut);

        var statusEl = document.getElementById('settings-status');
        ['show-phone', 'show-email'].forEach(function (id) {
            var box = document.getElementById(id);
            box.addEventListener('change', function () {
                var patch = {};
                patch[id === 'show-phone' ? 'show_phone' : 'show_email'] = box.checked;
                statusEl.textContent = 'Saving…';
                client.from('members').update(patch).eq('id', me.id).then(function (res) {
                    if (res.error) throw res.error;
                    statusEl.textContent = 'Saved.';
                }).catch(function () {
                    box.checked = !box.checked;
                    statusEl.textContent = 'Couldn’t save. Please try again.';
                });
            });
        });

        var search = document.getElementById('directory-search');
        var list = document.getElementById('directory-list');
        var count = document.getElementById('directory-count');
        search.addEventListener('input', function () {
            var q = search.value.trim().toLowerCase();
            var shown = 0;
            Array.prototype.forEach.call(list.children, function (li) {
                var hit = !q || li.getAttribute('data-search').indexOf(q) !== -1;
                li.hidden = !hit;
                if (hit) shown++;
            });
            count.textContent = q ? shown + ' of ' + rows.length + ' members' : rows.length + ' members';
        });
    }

    // --- Start ------------------------------------------------------------
    M.getClient().then(function (c) {
        client = c;
        return client.auth.getSession();
    }).then(function (res) {
        if (res && res.data && res.data.session) loadMemberArea();
        else renderPhoneStep();
    }).catch(function () {
        show(statusHtml('Sorry, member sign-in isn&rsquo;t available right now. Please try again later.', true));
    });
})();
