'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ASSETS_DIR = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const UNIFIED_JS_PATH = path.join(ASSETS_DIR, 'unified.js');
const INDEX_HTML_PATH = path.join(ASSETS_DIR, 'index.html');

// Loads the real production unified.js in Node by providing the minimal stubs it needs
// before the `.app` element lookup, which causes the script to return early (exactly as it
// would on any page without the Accountant Agent shell). The Drive Mode router is defined and
// exported before that point, so the constants/function under test are the exact production code.
function loadDriveRouter() {
  delete require.cache[require.resolve(UNIFIED_JS_PATH)];
  // Left assigned (not restored) after loading: the Drive Mode read-only commands resolve
  // `document.getElementById(...)` lazily at call time (not just at load time), so these stubs
  // must remain in place for the whole lifetime of the returned functions.
  global.window = {};
  global.document = { querySelector: () => null, getElementById: () => null };
  const mod = require(UNIFIED_JS_PATH);
  if (!mod || typeof mod.routeDriveCommand !== 'function') {
    throw new Error('unified.js did not export routeDriveCommand; Drive Mode router export is missing');
  }
  return mod;
}

// Extracts the exact source text of a top-level `function name(...)` (optionally `async`)
// declaration from a source string, using brace balancing. Used to execute real production
// functions embedded in index.html's inline <script> without re-implementing their logic.
function extractFunctionSource(src, name) {
  const header = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = header.exec(src);
  if (!match) throw new Error('function not found in source: ' + name);
  let i = match.index + match[0].length;
  let depth = 1; // just past the opening '(' of the parameter list
  while (depth > 0) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
    i++;
  }
  while (src[i] !== '{') i++;
  let braceDepth = 0;
  do {
    if (src[i] === '{') braceDepth++;
    else if (src[i] === '}') braceDepth--;
    i++;
  } while (braceDepth > 0);
  return src.slice(match.index, i);
}

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML_PATH, 'utf8');
}

module.exports = { loadDriveRouter, extractFunctionSource, readIndexHtml, UNIFIED_JS_PATH, INDEX_HTML_PATH };
