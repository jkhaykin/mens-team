// The Google Doc copier (scripts/sync-google-docs.js), fed a small made-up Doc
// shaped like Google's "Publish to web" page. No network.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { convert, insert } = require('../scripts/sync-google-docs');

const DOC = `<html><head><style>.c4{font-weight:700}.c9{font-style:italic}.c2{color:#000}</style></head><body>
<div id="banners">Published using Google Docs</div>
<div id="contents"><style>.lst-kix_a-0>li:before{content:"x"}</style><div class="doc-content">
<h1 class="c1"><span class="c4">Manifest Men&rsquo;s Group</span></h1>
<h2 class="c3"><span class="c4">Meeting Basics</span></h2>
<h2 class="c3"><span class="c4"></span></h2>
<p class="c5"><span class="c4">Bold lead.</span><span class="c2">&nbsp;Plain text with </span><span class="c9">italics</span><span class="c2"> &amp; a </span><span class="c2"><a href="https://www.google.com/url?q=https://example.com/page&amp;sa=D">link</a></span>.</p>
<p class="c5"><span class="c2"></span></p>
<ol class="c6 lst-kix_n-0 start" start="1"><li class="c7"><span class="c2">First</span></li></ol>
<ul class="c6 lst-kix_b-1 start"><li class="c7"><span class="c2">Nested under first</span></li></ul>
<ol class="c6 lst-kix_n-0" start="2"><li class="c7"><span class="c2">Second</span></li></ol>
<p><span class="c2"><a href="javascript:alert(1)">bad link</a> and &lt;script&gt;text&lt;/script&gt;</span><img src="https://x/y.png"></p>
</div></div>
<div id="footer">Report abuse</div><script>evil()</script></body></html>`;

test('keeps headings, paragraphs, bold, italics and links; drops Google styling', () => {
    const html = convert(DOC);
    expect(html).not.toContain('Manifest Men');          // the Doc's title (h1) is left out
    expect(html).toContain('<h2>Meeting Basics</h2>');    // no <strong> inside headings
    expect(html).not.toMatch(/<h2><\/h2>/);              // empty heading dropped
    expect(html).not.toMatch(/<p><\/p>/);                // empty paragraph dropped
    expect(html).toContain('<p><strong>Bold lead.</strong> Plain text with <em>italics</em> &amp; a <a href="https://example.com/page" target="_blank" rel="noopener">link</a>.</p>');
    expect(html).not.toMatch(/class=|style=|Published using|Report abuse/);
});

test('rebuilds nested lists from Google\'s flat ones', () => {
    const html = convert(DOC).replace(/\n/g, '');
    expect(html).toContain('<ol><li>First<ul><li>Nested under first</li></ul></li><li>Second</li></ol>');
});

test('never lets scripts or unsafe links through', () => {
    const html = convert(DOC);
    expect(html).not.toMatch(/<script|<img|javascript:|evil\(\)/i);
    expect(html).toContain('bad link and &lt;script&gt;text&lt;/script&gt;');
});

test('refuses a page that is not a published Doc', () => {
    expect(() => convert('<html><body>Sign in</body></html>')).toThrow(/published/);
});

test('replaces only the text between the markers', () => {
    const page = '<main>\n    <!-- google-doc:start -->\n    old\n    <!-- google-doc:end -->\n</main>';
    expect(insert(page, '<p>New</p>\n<p>Two</p>'))
        .toBe('<main>\n    <!-- google-doc:start -->\n    <p>New</p>\n    <p>Two</p>\n    <!-- google-doc:end -->\n</main>');
    expect(insert('<main></main>', '<p>x</p>')).toBeNull();
});

test('the Team Tools page has its markers and content', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'team-tools.html'), 'utf8');
    expect(page).toMatch(/<!-- google-doc:start -->[\s\S]*<h2>[\s\S]*<!-- google-doc:end -->/);
});
