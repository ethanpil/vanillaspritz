'use strict';
// Builds dist/ from rsvp-reader.js:
//   dist/rsvp-reader.min.js  - minified source
//   dist/bookmarklet.txt     - single-line javascript: URL for the bookmarks bar
//   dist/extension/          - unpacked Chrome extension (MV3)
// Also refreshes the bookmarklet embedded in README.md and the draggable
// install link in docs/index.html (the GitHub Pages site).
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function build() {
  const src = fs.readFileSync(path.join(__dirname, 'rsvp-reader.js'), 'utf8');
  const result = await minify(src, { compress: true, mangle: true });
  if (!result.code) { throw new Error('terser produced no output'); }

  const dist = path.join(__dirname, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'extension'), { recursive: true });

  fs.writeFileSync(path.join(dist, 'rsvp-reader.min.js'), result.code);

  // Percent signs must be encoded so browsers don't treat them as URL escapes.
  const bookmarklet = 'javascript:' + result.code.replace(/%/g, '%25');
  fs.writeFileSync(path.join(dist, 'bookmarklet.txt'), bookmarklet);

  fs.cpSync(path.join(__dirname, 'extension'), path.join(dist, 'extension'), { recursive: true });
  fs.copyFileSync(path.join(dist, 'rsvp-reader.min.js'), path.join(dist, 'extension', 'rsvp-reader.js'));

  // Keep the copy/pastable bookmarklet in the README in sync with the build.
  const readmePath = path.join(__dirname, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const START = '<!-- BOOKMARKLET:START -->';
  const END = '<!-- BOOKMARKLET:END -->';
  if (readme.includes(START) && readme.includes(END)) {
    // Replacer function so $-sequences in the minified code are inserted
    // literally instead of being treated as replacement patterns.
    const updated = readme.replace(
      new RegExp(`${START}[\\s\\S]*?${END}`),
      () => `${START}\n\`\`\`\n${bookmarklet}\n\`\`\`\n${END}`
    );
    fs.writeFileSync(readmePath, updated);
    console.log('Updated bookmarklet in README.md');
  }

  // Keep the draggable install link on the GitHub Pages site in sync.
  const pagePath = path.join(__dirname, 'docs', 'index.html');
  if (fs.existsSync(pagePath)) {
    const page = fs.readFileSync(pagePath, 'utf8');
    const LINK_START = '<!-- BOOKMARKLET-LINK:START -->';
    const LINK_END = '<!-- BOOKMARKLET-LINK:END -->';
    if (page.includes(LINK_START) && page.includes(LINK_END)) {
      // The code contains both quote types, so the href must be entity-escaped.
      const href = bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const updatedPage = page.replace(
        new RegExp(`${LINK_START}[\\s\\S]*?${LINK_END}`),
        () => `${LINK_START}<a class="bookmarklet" href="${href}">&#128214; RSVP Reader</a>${LINK_END}`
      );
      fs.writeFileSync(pagePath, updatedPage);
      console.log('Updated bookmarklet link in docs/index.html');
    }
  }

  console.log(`Built dist/: bookmarklet ${bookmarklet.length} chars, extension ${fs.readdirSync(path.join(dist, 'extension')).join(', ')}`);
}

build().catch((err) => { console.error(err); process.exit(1); });
