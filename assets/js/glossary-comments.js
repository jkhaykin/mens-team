// Comment threads under each glossary term. Everyone can read them; only
// signed-in members can post. Visitors get the comments with one small request
// (no sign-in library); members get the full threads with posting and editing.
(function () {
    'use strict';

    var M = window.ManifestMembers;
    if (!M) return;
    var esc = M.escapeHtml;

    var client = null;
    var isMember = false;     // false: read-only view for visitors
    var isModerator = false;
    var entryEls = [];
    var byTerm = {};          // term id -> [comments]
    var openTerms = {};       // term id -> true when the thread is expanded
    var editing = null;       // comment id being edited

    var dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    function start(els) {
        entryEls = els;
        if (!M.hasStoredSession()) { startPublic(); return; }
        M.getClient().then(function (c) {
            client = c;
            return client.auth.getSession();
        }).then(function (res) {
            if (!res || !res.data || !res.data.session) return null;
            return Promise.all([client.rpc('is_member'), client.rpc('is_moderator')]);
        }).then(function (r) {
            if (!r || r[0].error || !r[0].data) { startPublic(); return; } // not an active member
            isMember = true;
            isModerator = !!r[1].data;
            showMemberBar();
            return refresh();
        }).catch(startPublic);
    }

    // Visitors: read the visible comments, no posting.
    function startPublic() {
        isMember = false;
        isModerator = false;
        M.publicRpc('glossary_public_comments').then(function (rows) {
            group(rows);
            entryEls.forEach(renderThread);
        }).catch(function () { /* comments are optional; the glossary still works */ });
    }

    function group(rows) {
        byTerm = {};
        (rows || []).forEach(function (c) {
            (byTerm[c.term_id] = byTerm[c.term_id] || []).push(c);
        });
    }

    function showMemberBar() {
        var bar = document.createElement('p');
        bar.className = 'member-bar';
        bar.innerHTML = 'Signed in as a member: you can comment on any term. Comments are public. ' +
            '<a href="members.html">Member area</a> &middot; ' +
            '<button type="button" class="link-button" id="glossary-sign-out">Sign out</button>';
        var anchor = document.getElementById('glossary-jump');
        anchor.parentNode.insertBefore(bar, anchor);
        document.getElementById('glossary-sign-out').addEventListener('click', function () {
            client.auth.signOut().finally(function () { location.reload(); });
        });
    }

    function refresh() {
        return client.rpc('glossary_comment_feed').then(function (res) {
            if (res.error) throw res.error;
            group(res.data);
            entryEls.forEach(renderThread);
        });
    }

    function countLabel(n) {
        return n ? n + (n === 1 ? ' comment' : ' comments') : 'Add a comment';
    }

    // Visitors: only terms that have comments get a thread, and no form.
    var SIGN_IN_NOTE = '<p class="member-fineprint">Members can <a href="members.html">sign in</a> to comment.</p>';

    function commentHtml(c) {
        var meta = '<strong>' + esc(c.author) + '</strong> &middot; ' +
            esc(dateFmt.format(new Date(c.created_at))) +
            (c.edited_at ? ' &middot; edited' : '') +
            (c.hidden ? ' &middot; <span class="comment-hidden-tag">Hidden</span>' : '');
        var actions = [];
        if (c.is_mine) {
            actions.push('<button type="button" class="link-button" data-act="edit" data-id="' + c.id + '">Edit</button>');
        }
        if (c.is_mine || isModerator) {
            actions.push('<button type="button" class="link-button" data-act="delete" data-id="' + c.id + '">Delete</button>');
        }
        if (isModerator) {
            actions.push('<button type="button" class="link-button" data-act="' + (c.hidden ? 'unhide' : 'hide') +
                '" data-id="' + c.id + '">' + (c.hidden ? 'Unhide' : 'Hide') + '</button>');
        }
        var body = editing === c.id
            ? '<form class="comment-edit" data-id="' + c.id + '">' +
              '<textarea maxlength="2000" rows="3" aria-label="Edit your comment">' + esc(c.body) + '</textarea>' +
              '<p class="comment-actions"><button type="submit" class="btn btn-small">Save</button>' +
              '<button type="button" class="link-button" data-act="cancel">Cancel</button></p></form>'
            : '<p class="comment-body">' + esc(c.body) + '</p>' +
              (actions.length ? '<p class="comment-actions">' + actions.join('') + '</p>' : '');
        return '<li class="comment' + (c.hidden ? ' is-hidden' : '') + '">' +
            '<p class="comment-meta">' + meta + '</p>' + body + '</li>';
    }

    function renderThread(entryEl) {
        var termId = entryEl.id;
        var list = byTerm[termId] || [];
        var open = !!openTerms[termId];
        var box = entryEl.querySelector('.term-comments');
        if (!isMember && !list.length) {
            if (box) box.remove();
            return;
        }
        if (!box) {
            box = document.createElement('div');
            box.className = 'term-comments';
            entryEl.appendChild(box);
            box.addEventListener('click', onClick);
            box.addEventListener('submit', onSubmit);
        }
        var visible = list.filter(function (c) { return !c.hidden; }).length;
        box.innerHTML =
            '<button type="button" class="term-comments-toggle" aria-expanded="' + open + '" data-act="toggle">' +
            esc(countLabel(isModerator ? list.length : visible)) + '</button>' +
            (open && !isMember
                ? '<div class="term-comments-panel"><ul class="comment-list">' +
                  list.map(commentHtml).join('') + '</ul>' + SIGN_IN_NOTE + '</div>'
                : '') +
            (open && isMember
                ? '<div class="term-comments-panel">' +
                  (list.length ? '<ul class="comment-list">' + list.map(commentHtml).join('') + '</ul>' : '') +
                  '<form class="comment-form">' +
                  '<label for="c-' + termId + '" class="glossary-label">Add a comment</label>' +
                  '<textarea id="c-' + termId + '" maxlength="2000" rows="3" ' +
                  'placeholder="Your thoughts on this term&hellip;"></textarea>' +
                  '<p class="comment-actions"><button type="submit" class="btn btn-small">Post</button></p>' +
                  '<p class="member-fineprint">Comments are public, shown with your first name and last initial. ' +
                  'Share your own experience, never another man&rsquo;s.</p>' +
                  '<p class="member-fineprint comment-error" role="alert" hidden></p>' +
                  '</form></div>'
                : '');
    }

    function entryOf(el) { return el.closest('.glossary-entry'); }

    function fail(entryEl, msg) {
        var err = entryEl.querySelector('.comment-error');
        if (err) { err.textContent = msg; err.hidden = false; }
        else window.alert(msg);
    }

    function onClick(ev) {
        var btn = ev.target.closest('[data-act]');
        if (!btn) return;
        var entryEl = entryOf(btn);
        var act = btn.getAttribute('data-act');
        var id = Number(btn.getAttribute('data-id'));

        if (act === 'toggle') {
            openTerms[entryEl.id] = !openTerms[entryEl.id];
            renderThread(entryEl);
            if (openTerms[entryEl.id]) {
                var ta = entryEl.querySelector('.comment-form textarea');
                if (ta) ta.focus({ preventScroll: true });
            }
            return;
        }
        if (act === 'edit') { editing = id; renderThread(entryEl); return; }
        if (act === 'cancel') { editing = null; renderThread(entryEl); return; }

        var op;
        if (act === 'delete') {
            if (!window.confirm('Delete this comment? This can’t be undone.')) return;
            op = client.from('glossary_comments').delete().eq('id', id);
        } else if (act === 'hide' || act === 'unhide') {
            op = client.rpc('set_comment_hidden', { comment_id: id, hide: act === 'hide' });
        } else {
            return;
        }
        btn.disabled = true;
        op.then(function (res) {
            if (res.error) throw res.error;
            return refresh();
        }).catch(function () {
            btn.disabled = false;
            fail(entryEl, 'That didn’t work. Please try again.');
        });
    }

    function onSubmit(ev) {
        ev.preventDefault();
        var form = ev.target;
        var entryEl = entryOf(form);
        var ta = form.querySelector('textarea');
        var body = ta.value.trim();
        if (!body) { ta.focus(); return; }
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;

        var op = form.classList.contains('comment-edit')
            ? client.from('glossary_comments')
                .update({ body: body, edited_at: new Date().toISOString() })
                .eq('id', Number(form.getAttribute('data-id')))
            : client.from('glossary_comments').insert({ term_id: entryEl.id, body: body });

        op.then(function (res) {
            if (res.error) throw res.error;
            editing = null;
            return refresh();
        }).catch(function () {
            btn.disabled = false;
            fail(entryEl, 'Your comment couldn’t be saved. Please try again.');
        });
    }

    window.ManifestComments = { start: start };
})();
