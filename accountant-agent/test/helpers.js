'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ASSETS_DIR = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const UNIFIED_JS_PATH = path.join(ASSETS_DIR, 'unified.js');
const INDEX_HTML_PATH = path.join(ASSETS_DIR, 'index.html');

// Loads the real production unified.js in an isolated vm context, providing the minimal `window`/
// `document` stubs it needs before the `.app` element lookup, which causes the script to return
// early (exactly as it would on any page without the Accountant Agent shell). The Drive Mode
// router is defined and exported (via CommonJS `module.exports`) before that point, so the
// constants/function under test are the exact production code. Running in a dedicated vm context
// (rather than mutating process globals) means nothing here can leak into other tests, even if
// test files run concurrently.
function loadDriveRouter() {
  const source = fs.readFileSync(UNIFIED_JS_PATH, 'utf8');
  const sandboxModule = { exports: {} };
  const context = {
    window: {},
    document: { querySelector: () => null, getElementById: () => null },
    module: sandboxModule,
    exports: sandboxModule.exports,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: UNIFIED_JS_PATH });
  const mod = sandboxModule.exports;
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
