// Glossary page: loads terms live from the published Google Sheet (CSV),
// groups them into sections, links "See:" references, and filters as you type.
(function () {
    'use strict';

    var CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSVqQWktC3WQbPRAFTAhzZ4uEodhJbg56GY1qQwnvuw4ZYhHG6z_1ZKbfBSRjCTQrX3BsFqOVsQMp56/pub?gid=1167775952&single=true&output=csv';

    var SECTIONS = [
        { name: 'Core Terms', intro: 'What you’ll hear at team meetings and Manifest gatherings.' },
        { name: 'Going Deeper', intro: 'Useful once you’re in deeper.' },
        { name: 'Roots and History', intro: 'Where these practices came from.' }
    ];

    var statusEl = document.getElementById('glossary-status');
    var contentEl = document.getElementById('glossary-content');
    var searchEl = document.getElementById('glossary-search');
    var countEl = document.getElementById('glossary-count');
    var jumpEl = document.getElementById('glossary-jump');

    var entries = [];      // { term, meaning, category, id, el, haystack }
    var termIndex = {};    // normalized term -> id

    // Lowercase, straighten curly quotes, collapse spaces.
    function norm(s) {
        return String(s || '')
            .replace(/[‘’‛′]/g, "'")
            .replace(/[“”″]/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function slugify(s) {
        return norm(s)
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .replace(/&/g, ' and ')
            .replace(/'/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'term';
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showError() {
        statusEl.className = 'glossary-status is-error';
        statusEl.innerHTML = 'Sorry, we couldn&rsquo;t load the glossary right now. ' +
            'Please check your connection and <a href="">try again</a> in a moment.';
    }

    // Look up a reference like "Charter & Bylaws" or "cave." in the term index.
    function findTerm(text) {
        var key = norm(text).replace(/^[\s"'(]+|[\s"'.,;:!?)]+$/g, '');
        return termIndex[key] ? key : null;
    }

    // Turn one reference ("cave", "https://...", "from the heart") into HTML.
    function renderRef(piece, selfId) {
        var m = piece.match(/^(\s*)([\s\S]*?)(\s*)$/);
        var lead = m[1], core = m[2], trail = m[3];
        if (!core) return escapeHtml(piece);

        // Keep a leading "Also:" as plain text and link what follows it.
        var prefix = '';
        var pm = core.match(/^(also\s*:\s*)/i);
        if (pm) { prefix = pm[1]; core = core.slice(pm[1].length); }

        // Separate trailing punctuation so it isn't part of the link.
        var punct = '';
        var tm = core.match(/[.,;:!?]+$/);
        if (tm && !/^https?:\/\//i.test(core)) { punct = tm[0]; core = core.slice(0, -punct.length); }
        else if (tm) { // URLs: only strip a final period/comma
            var um = core.match(/[.,;]+$/);
            if (um) { punct = um[0]; core = core.slice(0, -punct.length); }
        }

        var html;
        if (/^https?:\/\/\S+$/i.test(core)) {
            var href = core;
            // Links back to this site stay relative so they work in local previews.
            var local = href.match(/^https?:\/\/(?:www\.)?manifestmensgroup\.org(\/.*)?$/i);
            if (local) href = local[1] || '/';
            html = '<a href="' + escapeHtml(href) + '"' +
                (local ? '' : ' target="_blank" rel="noopener"') + '>' + escapeHtml(core.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) + '</a>';
        } else {
            var key = findTerm(core);
            if (key && termIndex[key] !== selfId) {
                html = '<a class="glossary-ref" href="#' + termIndex[key] + '">' + escapeHtml(core) + '</a>';
            } else {
                html = escapeHtml(core);
            }
        }
        return escapeHtml(lead) + escapeHtml(prefix) + html + escapeHtml(punct) + escapeHtml(trail);
    }

    // Render a meaning, linking the references after a final "See:".
    function renderMeaning(meaning, selfId) {
        var idx = meaning.search(/\bSee:(?![\s\S]*\bSee:)/i);
        if (idx === -1) return escapeHtml(meaning);

        var head = meaning.slice(0, idx);
        var label = meaning.slice(idx, idx + 4);
        var tail = meaning.slice(idx + 4);

        // Split on commas, semicolons and sentence breaks, keeping the separators.
        var parts = tail.split(/(\s*[,;]\s*|\.\s+)/);
        var out = '';
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 1) { out += escapeHtml(parts[i]); continue; }
            out += renderRef(parts[i], selfId);
        }
        return escapeHtml(head) + '<span class="glossary-see">' + escapeHtml(label) + out + '</span>';
    }

    function build(rows) {
        // Clean rows and keep only known categories.
        var byCat = {};
        SECTIONS.forEach(function (s) { byCat[norm(s.name)] = []; });

        var usedIds = {};
        rows.forEach(function (r) {
            var term = String(r.Term || '').trim();
            var meaning = String(r.Meaning || '').trim();
            var cat = norm(r.Category);
            if (!term || !meaning || !byCat[cat]) return;

            var id = 'term-' + slugify(term), n = 2;
            while (usedIds[id]) id = 'term-' + slugify(term) + '-' + (n++);
            usedIds[id] = true;

            var entry = { term: term, meaning: meaning, id: id };
            byCat[cat].push(entry);
            if (!termIndex[norm(term)]) termIndex[norm(term)] = id;
        });

        var total = 0;
        var frag = document.createDocumentFragment();
        var jumpLinks = [];

        SECTIONS.forEach(function (s) {
            var list = byCat[norm(s.name)];
            if (!list.length) return;
            list.sort(function (a, b) {
                return a.term.localeCompare(b.term, 'en', { sensitivity: 'base', ignorePunctuation: true });
            });

            var sectionId = 'section-' + slugify(s.name);
            var section = document.createElement('section');
            section.className = 'glossary-section';
            section.id = sectionId;
            section.innerHTML = '<h2>' + escapeHtml(s.name) + '</h2>' +
                '<p class="glossary-intro">' + escapeHtml(s.intro) + '</p>';

            var dl = document.createElement('dl');
            dl.className = 'glossary-list';
            list.forEach(function (e) {
                var div = document.createElement('div');
                div.className = 'glossary-entry';
                div.id = e.id;
                div.innerHTML = '<dt>' + escapeHtml(e.term) + '</dt>' +
                    '<dd>' + renderMeaning(e.meaning, e.id) + '</dd>';
                dl.appendChild(div);
                entries.push({ el: div, section: section, haystack: norm(e.term + ' ' + e.meaning) });
            });
            section.appendChild(dl);
            frag.appendChild(section);
            total += list.length;
            jumpLinks.push('<a href="#' + sectionId + '">' + escapeHtml(s.name) +
                ' <span>(' + list.length + ')</span></a>');
        });

        if (!total) { showError(); return; }

        contentEl.appendChild(frag);
        jumpEl.innerHTML = jumpLinks.join('');
        jumpEl.hidden = false;
        statusEl.hidden = true;
        searchEl.disabled = false;
        updateCount(total, total, '');

        // Honor a link straight to a term, e.g. glossary.html#term-cave
        if (location.hash) {
            var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (target) {
                setOffset();
                target.scrollIntoView();
                flash(target);
            }
        }

        // Signed-in members also get a comment thread under each term.
        if (window.ManifestComments) window.ManifestComments.start(entries.map(function (e) { return e.el; }));
    }

    function updateCount(shown, total, q) {
        if (!q) {
            countEl.textContent = total + ' terms';
        } else if (!shown) {
            countEl.innerHTML = 'No terms match &ldquo;' + escapeHtml(q) + '&rdquo;.';
        } else {
            countEl.textContent = shown + ' of ' + total + ' terms match';
        }
    }

    function filter() {
        var raw = searchEl.value.trim();
        var q = norm(raw);
        var shown = 0;
        var sectionHits = new Map();
        entries.forEach(function (e) {
            var hit = !q || e.haystack.indexOf(q) !== -1;
            e.el.hidden = !hit;
            if (hit) shown++;
            sectionHits.set(e.section, (sectionHits.get(e.section) || 0) + (hit ? 1 : 0));
        });
        sectionHits.forEach(function (count, section) { section.hidden = count === 0; });
        jumpEl.hidden = !!q;
        updateCount(shown, entries.length, raw);
    }

    function flash(el) {
        el.classList.remove('is-target');
        void el.offsetWidth; // restart the animation
        el.classList.add('is-target');
    }

    // "See:" links and section links: clear a search that hides the target,
    // then scroll to it below the fixed header.
    contentEl.addEventListener('click', followLink);
    jumpEl.addEventListener('click', followLink);
    function followLink(ev) {
        var a = ev.target.closest('a[href^="#"]');
        if (!a) return;
        var target = document.getElementById(a.getAttribute('href').slice(1));
        if (!target) return;
        ev.preventDefault();
        setOffset();
        if (target.hidden || (target.closest('[hidden]'))) {
            searchEl.value = '';
            filter();
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.pushState) history.pushState(null, '', '#' + target.id);
        if (target.classList.contains('glossary-entry')) flash(target);
    }

    // While the bar is pinned, typing jumps back to the top of the results
    // so matches aren't left out of view above the current position.
    var barEl = document.getElementById('glossary-bar');
    var labelEl = document.querySelector('.glossary-label');
    function isStuck() {
        return labelEl.getBoundingClientRect().bottom < barEl.getBoundingClientRect().top - 1;
    }
    // Keep jump targets clear of the fixed header plus the pinned bar.
    function setOffset() {
        var header = document.querySelector('.site-header');
        var bar = document.getElementById('glossary-bar');
        var h = (header ? header.offsetHeight : 86) + bar.offsetHeight + 12;
        document.querySelector('.glossary').style.setProperty('--glossary-offset', h + 'px');
    }
    setOffset();
    window.addEventListener('resize', setOffset);
    window.addEventListener('load', setOffset);

    window.addEventListener('scroll', function () {
        barEl.classList.toggle('is-stuck', isStuck());
    }, { passive: true });

    searchEl.addEventListener('input', function () {
        filter();
        if (isStuck()) {
            var header = document.querySelector('.site-header');
            var top = labelEl.getBoundingClientRect().top + window.pageYOffset -
                (header ? header.offsetHeight : 0) - 10;
            window.scrollTo(0, top);
        }
    });
    searchEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { searchEl.value = ''; searchEl.dispatchEvent(new Event('input')); }
    });

    if (typeof Papa === 'undefined') { showError(); return; }

    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        transformHeader: function (h) { return h.trim(); },
        complete: function (results) {
            if (!results.data || !results.data.length) { showError(); return; }
            build(results.data);
        },
        error: showError
    });
})();
