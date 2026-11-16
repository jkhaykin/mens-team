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
        if (code === 'phone_exists' || /already (been )?registered|already belongs/i.test(msg)) {
            return 'That number is already used by another member&rsquo;s sign-in. Please ' +
                '<a href="/#contact">contact us</a> if it should be yours.';
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

    function loadMemberArea(notice) {
        show(statusHtml('Loading the member directory&hellip;'));
        Promise.all([client.rpc('member_roster'), client.rpc('member_moderators')]).then(function (both) {
            var res = both[0];
            if (res.error) throw res.error;
            var rows = res.data || [];
            // The moderator tags are a nice-to-have: if that call fails, show none.
            var mods = {};
            (both[1].error ? [] : both[1].data || []).forEach(function (id) { mods[id] = true; });
            rows.forEach(function (r) { r.is_moderator = !!mods[r.id]; });
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
            return client.from('members')
                .select('first_name, last_name, email, team, area, phone, is_team_lead, show_phone, show_email, is_moderator')
                .eq('id', me.id).single().then(function (own) {
                    if (own.error) throw own.error;
                    renderMemberArea(rows, me, own.data, notice);
                });
        }).catch(function () {
            show(statusHtml('Sorry, we couldn&rsquo;t load the member area. Please try again in a moment.', true) +
                '<p class="center"><button type="button" class="btn" id="sign-out">Sign out</button></p>');
            document.getElementById('sign-out').addEventListener('click', signOut);
        });
    }

    function personHtml(r, canManage) {
        var contact = [];
        if (r.phone) contact.push('<a href="tel:+' + esc(r.phone) + '">' + esc(M.formatPhone(r.phone)) + '</a>');
        if (r.email) contact.push('<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>');
        var where = r.area ? esc(r.area) : '';
        return '<li class="member-person" data-search="' +
            esc([r.first_name, r.last_name, r.area, r.team, r.email].join(' ').toLowerCase()) + '">' +
            '<span class="member-name">' + esc(r.first_name + ' ' + r.last_name) +
            (r.is_team_lead ? ' <span class="member-you member-lead">Team Lead</span>' : '') +
            (r.is_moderator ? ' <span class="member-you member-mod-tag">Moderator</span>' : '') +
            (r.is_me ? ' <span class="member-you">You</span>' : '') + '</span>' +
            (where ? '<span class="member-where">' + where + '</span>' : '') +
            (contact.length ? '<span class="member-contact">' + contact.join('') + '</span>' : '') +
            // Moderators can give or take away the moderator role (not their own).
            (canManage && !r.is_me
                ? '<span class="member-manage"><button type="button" class="link-button" data-mod-id="' + esc(r.id) +
                  '" data-mod-make="' + !r.is_moderator + '" data-mod-name="' + esc(r.first_name + ' ' + r.last_name) + '">' +
                  (r.is_moderator ? 'Remove moderator' : 'Make moderator') + '</button></span>'
                : '') +
            '</li>';
    }

    function field(id, label, value, attrs) {
        return '<label for="' + id + '">' + label + '</label>' +
            '<input id="' + id + '" value="' + esc(value || '') + '" ' + (attrs || 'type="text"') + '>';
    }

    // Group the directory by team (A to Z), members A to Z within each team.
    // Teams match regardless of capitals or extra spaces; members with no
    // team listed come last.
    function directoryHtml(rows, canManage) {
        var byName = function (a, b) {
            return (a.first_name + ' ' + a.last_name).localeCompare(b.first_name + ' ' + b.last_name, 'en', { sensitivity: 'base' });
        };
        var groups = {};
        rows.forEach(function (r) {
            var name = String(r.team || '').trim().replace(/\s+/g, ' ');
            var key = name.toLowerCase();
            (groups[key] = groups[key] || { name: name || 'No Team Listed', members: [] }).members.push(r);
        });
        return Object.keys(groups).sort(function (a, b) {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b, 'en', { sensitivity: 'base' });
        }).map(function (key) {
            var g = groups[key];
            return '<section class="member-team">' +
                '<h3>' + esc(g.name) + ' <span class="member-team-count">(' + g.members.length + ')</span></h3>' +
                '<ul class="member-list">' + g.members.sort(byName).map(function (r) { return personHtml(r, canManage); }).join('') + '</ul>' +
                '</section>';
        }).join('');
    }

    function renderMemberArea(rows, me, own, notice) {
        show(
            '<div class="member-welcome">' +
            '<p>Welcome, <strong>' + esc(own.first_name) + '</strong>' +
            (own.is_moderator ? ' <span class="member-you member-mod-tag">Moderator</span>' : '') + '</p>' +
            '<button type="button" class="link-button" id="sign-out">Sign out</button>' +
            '</div>' +

            '<div class="member-card member-settings">' +
            '<h2>Your Details</h2>' +
            (notice ? statusHtml(notice) : '') +
            '<form id="details-form" class="member-form member-details" novalidate>' +
            '<div class="member-fields">' +
            '<div>' + field('d-first', 'First name', own.first_name, 'type="text" autocomplete="given-name" maxlength="80" required') + '</div>' +
            '<div>' + field('d-last', 'Last name', own.last_name, 'type="text" autocomplete="family-name" maxlength="80" required') + '</div>' +
            '<div>' + field('d-email', 'Email', own.email, 'type="email" autocomplete="email" maxlength="200"') + '</div>' +
            '<div>' + field('d-team', 'Team', own.team, 'type="text" maxlength="80"') + '</div>' +
            '<div>' + field('d-area', 'Area', own.area, 'type="text" maxlength="80" placeholder="e.g. San Rafael"') + '</div>' +
            '</div>' +
            '<label class="member-toggle"><input type="checkbox" id="d-lead"' + (own.is_team_lead ? ' checked' : '') +
            '> I&rsquo;m the Team Lead for my team</label>' +
            '<p class="member-fineprint" id="lead-status" role="status" aria-live="polite"></p>' +
            '<button type="submit" class="btn">Save details</button>' +
            '<p class="member-fineprint" id="details-status" role="status" aria-live="polite"></p>' +
            '</form>' +

            '<div class="member-phone" id="phone-box"></div>' +

            '<h3>Directory privacy</h3>' +
            '<p>Other members see your name, team and area. Choose what else they can see:</p>' +
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
            '<div id="directory-list">' + directoryHtml(rows, own.is_moderator) + '</div>' +

            '<div class="member-card">' +
            '<h2>Discuss the Glossary</h2>' +
            '<p>While you&rsquo;re signed in, each term on the <a href="glossary.html">glossary</a> has a members-only comment thread.</p>' +
            '</div>'
        );

        document.getElementById('sign-out').addEventListener('click', signOut);
        setupDetails(me, own);

        // Team Lead saves the moment it's ticked, like the privacy boxes.
        var lead = document.getElementById('d-lead');
        var leadStatus = document.getElementById('lead-status');
        lead.addEventListener('change', function () {
            lead.disabled = true;
            leadStatus.textContent = 'Saving…';
            client.from('members').update({ is_team_lead: lead.checked }).eq('id', me.id).then(function (res) {
                if (res.error) throw res.error;
                loadMemberArea(lead.checked ? 'You&rsquo;re now listed as Team Lead.' : 'You&rsquo;re no longer listed as Team Lead.');
            }).catch(function () {
                lead.checked = !lead.checked;
                lead.disabled = false;
                leadStatus.textContent = 'Couldn’t save. Please try again.';
            });
        });
        renderPhoneBox(me, own);

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

        if (own.is_moderator) {
            document.getElementById('directory-list').addEventListener('click', function (ev) {
                var btn = ev.target.closest('[data-mod-id]');
                if (!btn) return;
                var make = btn.getAttribute('data-mod-make') === 'true';
                var name = btn.getAttribute('data-mod-name');
                var question = make
                    ? 'Make ' + name + ' a moderator? Moderators can hide glossary comments and manage other moderators.'
                    : 'Remove ' + name + ' as a moderator?';
                if (!window.confirm(question)) return;
                btn.disabled = true;
                client.rpc('set_member_moderator', { member_id: btn.getAttribute('data-mod-id'), make: make }).then(function (res) {
                    if (res.error) throw res.error;
                    // Update this card in place so the page doesn't jump.
                    var nameEl = btn.closest('.member-person').querySelector('.member-name');
                    var tag = nameEl.querySelector('.member-mod-tag');
                    if (make && !tag) {
                        tag = document.createElement('span');
                        tag.className = 'member-you member-mod-tag';
                        tag.textContent = 'Moderator';
                        var lead = nameEl.querySelector('.member-lead');
                        nameEl.insertBefore(document.createTextNode(' '), lead ? lead.nextSibling : null);
                        nameEl.insertBefore(tag, lead ? lead.nextSibling.nextSibling : null);
                    } else if (!make && tag) {
                        tag.remove();
                    }
                    btn.setAttribute('data-mod-make', String(!make));
                    btn.textContent = make ? 'Remove moderator' : 'Make moderator';
                    btn.disabled = false;
                }).catch(function () {
                    btn.disabled = false;
                    btn.textContent = 'Couldn’t save. Try again';
                });
            });
        }

        var search = document.getElementById('directory-search');
        var list = document.getElementById('directory-list');
        var count = document.getElementById('directory-count');
        search.addEventListener('input', function () {
            var q = search.value.trim().toLowerCase();
            var shown = 0;
            Array.prototype.forEach.call(list.querySelectorAll('.member-team'), function (section) {
                var inTeam = 0;
                Array.prototype.forEach.call(section.querySelectorAll('.member-person'), function (li) {
                    var hit = !q || li.getAttribute('data-search').indexOf(q) !== -1;
                    li.hidden = !hit;
                    if (hit) inTeam++;
                });
                section.hidden = !inTeam;
                shown += inTeam;
            });
            count.textContent = q ? shown + ' of ' + rows.length + ' members' : rows.length + ' members';
        });
    }

    // --- Editing your own details ------------------------------------------
    function setupDetails(me, own) {
        var form = document.getElementById('details-form');
        var statusEl = document.getElementById('details-status');
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var val = function (id) { return document.getElementById(id).value.trim(); };
            var patch = {
                first_name: val('d-first'),
                last_name: val('d-last'),
                email: val('d-email') || null,
                team: val('d-team') || null,
                area: val('d-area') || null
            };
            if (!patch.first_name || !patch.last_name) {
                statusEl.textContent = 'Please enter your first and last name.';
                return;
            }
            if (patch.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email)) {
                statusEl.textContent = 'Please check your email address.';
                return;
            }
            var btn = form.querySelector('button');
            btn.disabled = true;
            statusEl.textContent = 'Saving…';
            client.from('members').update(patch).eq('id', me.id).then(function (res) {
                if (res.error) throw res.error;
                loadMemberArea('Your details are saved.');
            }).catch(function () {
                btn.disabled = false;
                statusEl.textContent = 'Couldn’t save. Please try again.';
            });
        });
    }

    // Changing the sign-in number: the new number gets its own texted code.
    function renderPhoneBox(me, own, step, message, isError, newPhone) {
        var box = document.getElementById('phone-box');
        var msg = message ? statusHtml(message, isError) : '';
        if (step === 'enter') {
            box.innerHTML =
                '<form id="newphone-form" class="member-form" novalidate>' +
                '<label for="new-phone">New mobile number</label>' +
                '<input id="new-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(415) 555-1234"' +
                (newPhone ? ' value="' + esc(M.formatPhone(newPhone)) + '"' : '') + '>' +
                '<button type="submit" class="btn">Text a code to this number</button> ' +
                '<button type="button" class="link-button" id="phone-cancel">Cancel</button>' +
                '</form>' + msg +
                '<p class="member-fineprint">You&rsquo;ll sign in with the new number from then on.</p>';
            var input = document.getElementById('new-phone');
            input.focus();
            document.getElementById('phone-cancel').addEventListener('click', function () { renderPhoneBox(me, own); });
            document.getElementById('newphone-form').addEventListener('submit', function (ev) {
                ev.preventDefault();
                var phone = M.normalizePhone(input.value);
                if (!phone) { renderPhoneBox(me, own, 'enter', 'Please enter a full mobile number, including area code.', true); return; }
                if (phone.slice(1) === own.phone) { renderPhoneBox(me, own, 'enter', 'That&rsquo;s already your number.', true); return; }
                var btn = ev.target.querySelector('button[type="submit"]');
                btn.disabled = true;
                btn.textContent = 'Sending…';
                client.rpc('phone_available_for_me', { new_phone: phone }).then(function (res) {
                    if (res.error) throw res.error;
                    if (!res.data) {
                        var e = new Error('already belongs'); throw e;
                    }
                    return client.auth.updateUser({ phone: phone });
                }).then(function (res) {
                    if (res.error) throw res.error;
                    renderPhoneBox(me, own, 'code', null, false, phone.slice(1));
                }).catch(function (err) {
                    renderPhoneBox(me, own, 'enter', friendlyError(err), true, phone.slice(1));
                });
            });
            return;
        }
        if (step === 'code') {
            box.innerHTML =
                '<form id="newcode-form" class="member-form" novalidate>' +
                '<p>We texted a 6-digit code to <strong>' + esc(M.formatPhone(newPhone)) + '</strong>.</p>' +
                '<label for="new-code">6-digit code</label>' +
                '<input id="new-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">' +
                '<button type="submit" class="btn">Confirm new number</button> ' +
                '<button type="button" class="link-button" id="phone-cancel">Cancel</button>' +
                '</form>' + msg;
            var codeInput = document.getElementById('new-code');
            var codeForm = document.getElementById('newcode-form');
            codeInput.focus();
            document.getElementById('phone-cancel').addEventListener('click', function () { renderPhoneBox(me, own); });
            codeInput.addEventListener('input', function () {
                codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
                if (codeInput.value.length === 6) codeForm.requestSubmit ? codeForm.requestSubmit() : codeForm.submit();
            });
            codeForm.addEventListener('submit', function (ev) {
                ev.preventDefault();
                var code = codeInput.value.replace(/\D/g, '');
                if (code.length !== 6) { renderPhoneBox(me, own, 'code', 'Please enter all 6 digits.', true, newPhone); return; }
                var btn = codeForm.querySelector('button[type="submit"]');
                btn.disabled = true;
                btn.textContent = 'Checking…';
                client.auth.verifyOtp({ phone: '+' + newPhone, token: code, type: 'phone_change' }).then(function (res) {
                    if (res.error) throw res.error;
                    return client.auth.refreshSession();
                }).then(function () {
                    loadMemberArea('Your number is changed. Use ' + esc(M.formatPhone(newPhone)) + ' to sign in from now on.');
                }).catch(function (err) {
                    renderPhoneBox(me, own, 'code', friendlyError(err), true, newPhone);
                });
            });
            return;
        }
        box.innerHTML =
            '<p class="member-phone-line"><span><strong>Mobile number</strong> (used to sign in): ' +
            esc(M.formatPhone(own.phone)) + '</span> ' +
            '<button type="button" class="link-button" id="phone-change">Change number</button></p>';
        document.getElementById('phone-change').addEventListener('click', function () {
            renderPhoneBox(me, own, 'enter');
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
