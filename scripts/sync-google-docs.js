#!/usr/bin/env node
// Copies published Google Docs into site pages.
//
// Each page listed in DOCS has a pair of marker comments:
//     <!-- google-doc:start --> ... <!-- google-doc:end -->
// Everything between them is replaced by the Doc's text, cleaned down to plain,
// safe HTML (headings, paragraphs, lists, bold, italic, links) so it takes on the
// site's own look. The page is only rewritten when the text actually changed.
//
// Run by .github/workflows/sync-google-docs.yml every hour, or by hand:
//     node scripts/sync-google-docs.js
// Edit the Doc in Google Docs, not the page: the page is overwritten on each sync.

const fs = require('fs');
const path = require('path');

const DOCS = [
    {
        page: 'team-tools.html',
        url: 'https://docs.google.com/document/d/e/2PACX-1vThdVyhKotE3oONJL2n5bOZIVhErKtKcmo4eccQtJyuLxY6qguFgI-T0MrB1p6uLITSe1zxeyhHuPKn/pub',
        // Shorter link addresses for some headings (menus link to these):
        // address made from the heading text -> address to use instead.
        ids: {
            'team-meeting-best-practices': 'meeting-best-practices',
        },
    },
];

const START = '<!-- google-doc:start -->';
const END = '<!-- google-doc:end -->';

const BLOCK_TAGS = new Set(['h2', 'h3', 'h4', 'h5', 'h6', 'p', 'table', 'hr']);
const TABLE_TAGS = new Set(['table', 'tbody', 'tr', 'td', 'th']);

function decodeEntities(s) {
    return s
        .replace(/&nbsp;|&#160;|\u00a0/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function escapeText(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(attrs, name) {
    const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
    return m ? decodeEntities(m[1]) : '';
}

// Google wraps outside links as https://www.google.com/url?q=REAL&sa=...
function cleanHref(href) {
    try {
        const u = new URL(href);
        if (u.hostname === 'www.google.com' && u.pathname === '/url' && u.searchParams.get('q')) {
            return cleanHref(u.searchParams.get('q'));
        }
        return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : '';
    } catch {
        return '';
    }
}

// Which CSS classes in the Doc mean bold or italic.
function styleClasses(html) {
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join(' ');
    const bold = new Set();
    const italic = new Set();
    for (const m of css.matchAll(/\.(c\d+)\{([^}]*)\}/g)) {
        if (/font-weight:\s*(700|bold)/.test(m[2])) bold.add(m[1]);
        if (/font-style:\s*italic/.test(m[2])) italic.add(m[1]);
    }
    return { bold, italic };
}

// Gives each heading an id from its text, e.g. "Team Meeting Best Practices"
// -> id="team-meeting-best-practices", so menus can link straight to a section.
function slugify(text) {
    return decodeEntities(text.replace(/<[^>]+>/g, ''))
        .toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['\u2018\u2019]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
}

function addHeadingIds(html, renames = {}) {
    const seen = new Map();
    return html.replace(/<(h[2-6])>([\s\S]*?)<\/\1>/g, (_, tag, inner) => {
        const slug = slugify(inner);
        const base = renames[slug] || slug;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return `<${tag} id="${n === 1 ? base : `${base}-${n}`}">${inner}</${tag}>`;
    });
}

// Turns a published Google Doc (the whole /pub page) into clean HTML.
function convert(html, { ids = {} } = {}) {
    const start = html.indexOf('<div id="contents">');
    if (start === -1) throw new Error('No document contents found. Is the Doc still published to the web?');
    let body = html.slice(start);
    const end = body.search(/<div id="footer"|<script/);
    if (end !== -1) body = body.slice(0, end);
    body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    const { bold, italic } = styleClasses(html);
    const out = [];
    const lists = [];          // open lists, outermost first: { tag, liOpen }
    const inline = [];         // per <span>: the tags it opened, to close in reverse
    let block = null;          // current heading/paragraph tag, for dropping empty ones
    let blockStart = 0;
    let inHeading = false;
    let inTable = false;
    let inLink = false;

    const closeListsTo = (depth) => {
        while (lists.length > depth) {
            const l = lists.pop();
            if (l.liOpen) out.push('</li>');
            out.push(`</${l.tag}>`);
        }
    };

    for (const m of body.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
        if (m[4] !== undefined) {
            const text = decodeEntities(m[4]);
            if (block || lists.length || inTable) out.push(escapeText(text));
            continue;
        }
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const attrs = m[3] || '';

        if (tag === 'ul' || tag === 'ol') {
            if (closing) continue;   // closed lazily, so Google's flat lists can nest
            const level = Number((attr(attrs, 'class').match(/lst-kix_\w+-(\d+)/) || [])[1] || 0);
            const depth = level + 1;
            closeListsTo(depth);
            if (lists.length === depth && lists[depth - 1].tag !== tag) closeListsTo(depth - 1);
            while (lists.length < depth) {
                const startAt = tag === 'ol' && lists.length === depth - 1 ? Number(attr(attrs, 'start')) : 0;
                out.push(startAt > 1 ? `<${tag} start="${startAt}">` : `<${tag}>`);
                lists.push({ tag, liOpen: false });
            }
            continue;
        }
        if (tag === 'li') {
            if (closing || !lists.length) continue;
            const l = lists[lists.length - 1];
            if (l.liOpen) out.push('</li>');
            out.push('<li>');
            l.liOpen = true;
            continue;
        }

        if (tag === 'h1') continue;   // the Doc's own title; the page has its own heading

        if (BLOCK_TAGS.has(tag) && !inTable) {
            if (!closing) {
                closeListsTo(0);
                if (tag === 'hr') { out.push('<hr>'); continue; }
                if (tag === 'table') { inTable = true; out.push('<table>'); continue; }
                block = tag;
                blockStart = out.length;
                inHeading = tag[0] === 'h';
                out.push(`<${tag}>`);
            } else if (tag === block) {
                const inner = out.slice(blockStart + 1).join('');
                if (!inner.replace(/<[^>]+>/g, '').trim()) out.length = blockStart;   // drop empty
                else out.push(`</${tag}>`);
                block = null;
                inHeading = false;
            }
            continue;
        }
        if (TABLE_TAGS.has(tag) && inTable) {
            if (tag === 'table' && closing) inTable = false;
            if (tag !== 'tbody') out.push(closing ? `</${tag}>` : `<${tag}>`);
            continue;
        }
        if (tag === 'p' && inTable) continue;   // cell paragraphs: keep only their text

        if (tag === 'span') {
            if (closing) {
                const opened = inline.pop() || [];
                for (const t of [...opened].reverse()) out.push(`</${t}>`);
            } else {
                const classes = attr(attrs, 'class').split(/\s+/);
                const opened = [];
                if (!inHeading && classes.some((c) => bold.has(c))) opened.push('strong');
                if (classes.some((c) => italic.has(c))) opened.push('em');
                for (const t of opened) out.push(`<${t}>`);
                inline.push(opened);
            }
            continue;
        }
        if (tag === 'a') {
            if (closing) {
                if (inLink) out.push('</a>');
                inLink = false;
            } else {
                const href = cleanHref(attr(attrs, 'href'));
                if (href) {
                    const external = !href.startsWith('mailto:');
                    out.push(`<a href="${escapeText(href).replace(/"/g, '&quot;')}"${external ? ' target="_blank" rel="noopener"' : ''}>`);
                    inLink = true;
                }
            }
            continue;
        }
        if (tag === 'br' && !closing) { out.push('<br>'); continue; }
        // Anything else (div, img, sup, script...) is dropped; its text is kept.
    }
    closeListsTo(0);

    return addHeadingIds(out.join(''), ids)
        .replace(/<(strong|em)><\/\1>/g, '')
        .replace(/<\/strong><strong>/g, '')
        .replace(/<\/em><em>/g, '')
        .replace(/ +/g, ' ')
        .replace(/<(li|p|h\d)> /g, '<$1>')
        .replace(/ <\/(li|p|h\d)>/g, '</$1>')
        .replace(/<\/(h\d|p|ul|ol|li|table|tr|hr)>|<hr>|<(ul|ol)( start="\d+")?>|<table>/g, (t) => `${t}\n`)
        .replace(/ <\/(strong|em)>/g, '</$1> ')
        .replace(/ +/g, ' ')
        .trim();
}

function indent(html, spaces) {
    const pad = ' '.repeat(spaces);
    return html.split('\n').map((line) => pad + line).join('\n');
}

// Replaces the text between the markers; returns null if the page has no markers.
function insert(page, content) {
    const a = page.indexOf(START);
    const b = page.indexOf(END);
    if (a === -1 || b === -1 || b < a) return null;
    const lineStart = page.lastIndexOf('\n', a) + 1;
    const pad = a - lineStart;
    return page.slice(0, a + START.length) + '\n' + indent(content, pad) + '\n' + ' '.repeat(pad) + page.slice(b);
}

async function main() {
    const root = path.join(__dirname, '..');
    let failed = false;
    for (const { page, url, ids } of DOCS) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'manifest-site-sync' } });
            if (!res.ok) throw new Error(`Google returned ${res.status}`);
            const content = convert(await res.text(), { ids });
            if (content.replace(/<[^>]+>/g, '').trim().length < 50) {
                throw new Error('The Doc came back (nearly) empty; leaving the page as it is.');
            }
            const file = path.join(root, page);
            const before = fs.readFileSync(file, 'utf8');
            const after = insert(before, content);
            if (after === null) throw new Error(`${page} is missing the google-doc markers.`);
            if (after === before) {
                console.log(`${page}: no change`);
            } else {
                fs.writeFileSync(file, after);
                console.log(`${page}: updated`);
            }
        } catch (err) {
            failed = true;
            console.error(`${page}: ${err.message}`);
        }
    }
    if (failed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { convert, insert, cleanHref, slugify };
