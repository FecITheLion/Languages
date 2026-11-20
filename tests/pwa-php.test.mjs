import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import vm from 'node:vm';
import { LOGIC_CALCULATOR_PRESETS, DEFAULT_CAUCHY_CONFIG, evaluateLogicStatement, evaluateCauchySequence, getLogicBindingDiagnostics } from '../src/engine/logicLambdaEngine.ts';
import { normalizeLogicEvaluationInput, logicInputDiagnostic } from '../src/engine/logicInputNormalizer.ts';
import { SUPPORTED_LANGUAGES } from '../src/types/studio.ts';

const project = process.cwd();
const php = (...args) => spawnSync('php', args, { encoding: 'utf8' });

test('installer validates build, base and empty target; PHP routes SPA and rejects API', async () => {
  const work = mkdtempSync(`${project}/tests/.pwa-check-`);
  const source = `${work}/source`, target = `${work}/target`, state = `${work}/state`;
  let server;
  try {
    mkdirSync(`${source}/dist/assets`, { recursive: true });
    mkdirSync(target);
    mkdirSync(state, { mode: 0o700 });
    for (const file of ['index.php', 'install.php', 'api.php', 'slug_controller.php']) copyFileSync(`${project}/${file}`, `${source}/${file}`);
    cpSync(`${project}/public`, `${source}/dist`, { recursive: true });
    writeFileSync(`${source}/dist/index.html`, '<!doctype html><script type="module" src="/studio/assets/app-abcdefgh.js"></script>');
    writeFileSync(`${source}/dist/assets/app-abcdefgh.js`, '/* fixture */');
    assert.notEqual(php(`${source}/install.php`, target, '/wrong/').status, 0);
    assert.notEqual(php(`${source}/install.php`, target, '/../').status, 0);
    assert.equal(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.equal(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.match(readFileSync(`${target}/.htaccess`, 'utf8'), /RewriteRule \^\(\[a-z0-9\]\[a-z0-9-\]\*\)\/\?\$ index\.php\?slug=\$1/);
    const rewriteRules = readFileSync(`${target}/.htaccess`, 'utf8');
    assert.match(rewriteRules, /RewriteRule \^nodes\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\/members\/\(\[\^\/\]\+\)\/\?\$ index\.php\?slug=nodes/);
    assert.match(rewriteRules, /RewriteRule \^members\/\(\[\^\/\]\+\)\/\?\$ index\.php\?slug=members/);
    assert.match(rewriteRules, /RewriteRule \^template\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\/\?\$ index\.php\?template_route=/);
    writeFileSync(`${target}/assets/app-abcdefgh.js`, 'modified installation');
    assert.notEqual(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.equal(readFileSync(`${target}/assets/app-abcdefgh.js`, 'utf8'), 'modified installation');
    copyFileSync(`${source}/dist/assets/app-abcdefgh.js`, `${target}/assets/app-abcdefgh.js`);
    const port = await new Promise((resolve, reject) => {
      const listener = createServer();
      listener.on('error', reject);
      listener.listen(0, '127.0.0.1', () => { const p = listener.address().port; listener.close(() => resolve(p)); });
    });
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: state },
    });
    const root = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { await fetch(`${root}/studio/`); break; } catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    let response = await fetch(`${root}/studio/deep/link`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /app-abcdefgh/);
    response = await fetch(`${root}/studio/?slug=help`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Guided help/);
    response = await fetch(`${root}/studio/?slug=unknown`);
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/?slug=nodes/rule/quantity/members/expression`, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/api/nodes/rule/quantity/members/expression');
    response = await fetch(`${root}/studio/?slug=members/expression&node=rule%2Fquantity`, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/api/nodes/rule/quantity/members/expression');
    response = await fetch(`${root}/studio/?slug=members/expression`, { redirect: 'manual' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/?template=unknown`);
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/assets/app-abcdefgh.js`);
    assert.match(response.headers.get('content-type'), /javascript/);
    response = await fetch(`${root}/studio/api/rules`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /json/);
    response = await fetch(`${root}/studio/api/rules`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(`${root}/studio/healthz`);
    assert.deepEqual(await response.json(), { ok: true, service: 'grammar2json-studio' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(`${root}/studio/api`);
    const discovery = await response.json();
    assert.equal(discovery.partial, true);
    assert.equal(discovery._links.languages.href, `${root}/studio/api/languages`);
    response = await fetch(`${root}/studio/api/languages`);
    const languages = await response.json();
    assert.equal(languages.count, SUPPORTED_LANGUAGES.length);
    assert.deepEqual(languages.languages.map(({ _links, ...language }) => language), SUPPORTED_LANGUAGES);
    assert(languages.languages.every(language => language._links.exportLogic.available === false && language._links.exportWorkspace.available === false));
    response = await fetch(`${root}/studio/api`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    response = await fetch(`${root}/studio/api/templates`);
    assert.deepEqual((await response.json()).templates, ['studio', 'compact']);
    response = await fetch(`${root}/studio/api/templates/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'compact', fragment: 'notice', values: { title: '<script>', message: '<img src=x>' } }),
    });
    const renderedNotice = await response.text();
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(renderedNotice, /&lt;script&gt;/);
    assert.match(renderedNotice, /&lt;img src=x&gt;/);
    response = await fetch(`${root}/studio/api/templates/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'missing', fragment: 'notice', values: {} }),
    });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/?template_route=studio/notice`, { headers: { Accept: 'text/plain' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), '<aside role="status"><strong data-template-text="title">Notice</strong><p data-template-text="message"></p></aside>');
    response = await fetch(`${root}/studio/?template_route=studio/notice&title=%3Cimg%3E&message=hello`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await response.text(), /&lt;img&gt;/);
    response = await fetch(`${root}/studio/?template_route=compact/notice`, {
      method: 'POST', headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'From JSON', message: '<b>safe</b>' }),
    });
    const dynamicTemplate = await response.text();
    assert.match(dynamicTemplate, /From JSON/);
    assert.match(dynamicTemplate, /&lt;b&gt;safe&lt;\/b&gt;/);
    response = await fetch(`${root}/studio/?template_route=studio/notice`, { headers: { Accept: 'application/json' } });
    assert.equal(response.status, 406);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const defaults = LOGIC_CALCULATOR_PRESETS[0];
    const cases = [
      [null, 'application/json'],
      ['price=60 tax=9', 'text/plain'],
      [[60, 9], 'application/json'],
      [[60, 9, 3], 'application/json'],
      [{ logic_statement: '_3 + price', logic_labels: '10 4 3' }, 'application/json'],
      [{ values: [50, 8] }, 'application/json'],
      [{ logic_statement: 'price * 2 + tax', logic_labels: '10 4' }, 'application/json'],
      [['price + tax', 'price=12 tax=7'], 'application/json'],
      [{ input: JSON.stringify({ statement: 'double(price) / tax', labels: { price: 18, tax: 3 } }) }, 'application/json'],
      [{ statement: '∀x. x ∨ ¬x', labels: [{ id: 'b', name: 'b', kind: 'boolean', value: 'false' }] }, 'application/json'],
      [{ statement: '(λx. x * x)(5)', labels: [] }, 'application/json'],
      [{ statement: '(8 - 3 - 1) + 2 ^ 3 ^ 2' }, 'application/json'],
      [{ statement: '(true implies false implies false) iff true' }, 'application/json'],
      [{ statement: 'inc(square(price))', labels: { inc: { kind: 'lambda', value: 'λx. x + 1' }, square: { kind: 'lambda', value: 'λx. x * x' }, price: 4 } }, 'application/json'],
      [{ statement: 'enabled and (derived > 4)', labels: [{ id: 'a', name: 'n', kind: 'number', value: '3' }, { id: 'b', name: 'derived', kind: 'number', value: 'n * 2' }, { id: 'c', name: 'enabled', kind: 'boolean', value: 'derived > 4' }] }, 'application/json'],
      [{ statement: '7 / 3' }, 'application/json'],
      [{ statement: '-7 % 4' }, 'application/json'],
      [{ statement: 'price + 1', labels: { price: 0.0000001 } }, 'application/json'],
      [{ statement: 'price', labels: { price: 100000000000000.1 } }, 'application/json'],
      [{ statement: 'price / 0' }, 'application/json'],
      [{ statement: 'unknown + 1' }, 'application/json'],
      [{ statement: 'offset(x, hours) > 100' }, 'application/json'],
      [{ statement: 'price', logic_statement: 'tax' }, 'application/json'],
      [{ labels: { price: 'bad' } }, 'application/json'],
    ];
    for (const [input, type] of cases) {
      const expected = normalizeLogicEvaluationInput(input, { statement: defaults.statement, labels: defaults.labels });
      response = await fetch(`${root}/studio/api/logic/evaluate`, {
        method: 'POST', headers: { 'Content-Type': type }, body: type === 'text/plain' ? input : JSON.stringify(input),
      });
      const actual = await response.json();
      assert.equal(response.status, expected.ok ? 200 : 400, JSON.stringify(actual));
      assert.match(response.headers.get('content-type'), /application\/hal\+json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('link'), /rel="self"/);
      if (!expected.ok) {
        assert.equal(actual.error, expected.error);
        assert.deepEqual(actual.diagnostics, [logicInputDiagnostic(expected.error)]);
      }
      else {
        const oracle = evaluateLogicStatement(expected.input.statement, expected.input.labels);
        assert.deepEqual({ statement: actual.statement, ok: actual.ok, displayValue: actual.displayValue, valueType: actual.valueType, trace: actual.trace, error: actual.error },
          { statement: expected.input.statement, ok: oracle.ok, displayValue: oracle.displayValue, valueType: oracle.valueType, trace: oracle.trace, error: oracle.error });
        assert.deepEqual(actual.diagnostics, getLogicBindingDiagnostics(oracle, expected.input.labels));
      }
    }
    for (const input of [{}, { seedValues: '1', recurrenceExpr: '(_1 + 2 / _1) / 2', maxIterations: 6 }, { seedValues: '' }, { recurrenceExpr: '' }, { recurrenceExpr: 'unknown + 1' }]) {
      response = await fetch(`${root}/studio/api/logic/cauchy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const actual = await response.json();
      assert.equal(response.status, 200, JSON.stringify(actual));
      const config = { ...DEFAULT_CAUCHY_CONFIG, enabled: true, ...input };
      assert.deepEqual(actual.config, config);
      delete actual.config;
      delete actual._links;
      assert.deepEqual(actual, evaluateCauchySequence(config, defaults.labels));
    }
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '1 @ 2' });
    assert.equal(response.status, 503);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '(-1) ^ 0.5' });
    assert.equal(response.status, 503);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'price + extra', cauchyConfig: { seedValues: 'price', recurrenceExpr: 'right', maxIterations: 1 } }) });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/logic/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'extra', kind: 'number', value: '7' }) });
    assert.equal(response.status, 201);
    const newLabel = (await response.json()).label;
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`);
    assert.equal((await response.json()).label.name, 'extra');
    response = await fetch(`${root}/studio/api/callbacks`);
    assert.equal((await response.json()).count, 3);
    response = await fetch(`${root}/studio/api/callbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'combine', lambdaExpr: 'λx. λy. x + y', description: 'Combine values' }) });
    assert.equal(response.status, 201);
    const callback = (await response.json()).callback;
    assert.deepEqual(callback.params, ['x', 'y']);
    assert.equal(callback.body, 'x + y');
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lambdaExpr: 'λx. x * 3' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).callback.id, callback.id);
    response = await fetch(`${root}/studio/api/callbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad', lambdaExpr: '42' }) });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
    assert.equal((await response.json()).displayValue, '52');
    response = await fetch(`${root}/studio/api/logic/cauchy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await response.json()).steps[0].value, 45);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"labels":[1]}' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic`);
    const persisted = await response.json();
    assert.equal(persisted.statement, 'price + extra');
    assert(persisted.labels.some(label => label.id === newLabel.id));
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: state },
    });
    for (let i = 0; ; i++) {
      try { response = await fetch(`${root}/studio/api/logic`); break; }
      catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    assert.equal((await response.json()).statement, 'price + extra');
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`);
    assert.equal((await response.json()).lambdaExpr, 'λx. x * 3');
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'GET' });
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`, { method: 'DELETE' });
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
    assert.equal((await response.json()).diagnostics[0].label, 'extra');
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: '1', labels: [{ id: 'a', name: 'a', kind: 'number', value: '1' }, { id: 'a', name: 'b', kind: 'number', value: '2' }] }) });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic`);
    assert.equal((await response.json()).statement, 'price + extra');
    assert.equal((await fetch(`${root}/studio/api.php`)).status, 404);
    assert.equal((await fetch(`${root}/studio/missing.js`)).status, 404);
    assert.equal((await fetch(`${root}/studio/%252eenv`)).status, 400);
    assert.equal((await fetch(`${root}/other/`)).status, 404);
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: '' },
    });
    for (let i = 0; ; i++) {
      try { response = await fetch(`${root}/studio/api/logic`); break; }
      catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    assert.equal((await response.json()).statement, defaults.statement);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"statement":"1"}' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GRAMMAR2JSON_STATE_DIR/);
  } finally {
    if (server) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    rmSync(work, { recursive: true, force: true });
  }
});

test('worker caches only public shell and hashed assets, never API or private responses', async () => {
  const handlers = {}, saved = new Map(), calls = [];
  let offline = false, privateAsset = false, htmlAsset = false;
  const basic = (body, options = {}) => {
    const response = new Response(body, options);
    Object.defineProperty(response, 'type', { value: 'basic' });
    const clone = response.clone.bind(response);
    response.clone = () => { const copy = clone(); Object.defineProperty(copy, 'type', { value: 'basic' }); return copy; };
    return response;
  };
  const cache = {
    match: async key => saved.get(typeof key === 'string' ? key : key.url),
    put: async (key, value) => saved.set(typeof key === 'string' ? key : key.url, value),
    keys: async () => [...saved.keys()].map(url => ({ url })),
    delete: async key => saved.delete(key.url),
  };
  const scope = 'https://example.test/studio/';
  const cacheNames = ['grammar2json-shell-v1:/studio/', 'grammar2json-shell-v1:/other/', 'unrelated:/studio/'];
  const context = {
    URL, Response, caches: {
      open: async () => cache,
      keys: async () => cacheNames,
      delete: async name => { cacheNames.splice(cacheNames.indexOf(name), 1); return true; },
    },
    self: { registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async (input, options) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push([url, options]);
      if (offline) throw Error('offline');
      if (url.endsWith('index.html')) return basic('<script src="/studio/assets/app-abcdefgh.js"></script>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } });
      return basic('asset', { headers: htmlAsset ? { 'Content-Type': 'text/html' } : privateAsset ? { 'Cache-Control': 'private' } : {} });
    },
  };
  vm.runInNewContext(readFileSync(`${project}/public/sw.js`, 'utf8'), context);
  let install;
  handlers.install({ waitUntil: p => { install = p; } });
  await install;
  let activation;
  handlers.activate({ waitUntil: p => { activation = p; } });
  await activation;
  assert.deepEqual(cacheNames, ['grammar2json-shell-v1:/other/', 'unrelated:/studio/']);
  assert(saved.has(`${scope}index.html`));
  assert(saved.has(`${scope}assets/app-abcdefgh.js`));
  const dispatch = (url, mode = 'navigate', method = 'GET') => {
    let result, pending;
    handlers.fetch({ request: { url, mode, method, headers: new Headers() }, respondWith: p => { result = p; }, waitUntil: p => { pending = p; } });
    return { result, pending };
  };
  assert.equal(dispatch(`${scope}api/rules`).result, undefined);
  assert.equal(dispatch('https://example.test/api/rules').result, undefined);
  assert.equal(dispatch(`${scope}api%2Frules`).result, undefined);
  assert.equal(dispatch(`${scope}api/rules`, 'cors', 'POST').result, undefined);
  offline = true;
  const nav = dispatch(`${scope}deep`);
  assert.match(await (await nav.result).text(), /app-abcdefgh/);
  await nav.pending;
  saved.delete(`${scope}index.html`);
  const missingShell = dispatch(`${scope}deep`);
  assert.equal((await missingShell.result).type, 'error');
  await missingShell.pending;
  offline = false; privateAsset = true;
  const asset = dispatch(`${scope}assets/other-abcdefgh.js`, 'cors');
  await asset.result;
  assert(!saved.has(`${scope}assets/other-abcdefgh.js`));
  assert.equal(calls.at(-1)[1].credentials, 'omit');
  privateAsset = false; htmlAsset = true;
  await dispatch(`${scope}assets/missing-abcdefgh.js`, 'cors').result;
  assert(!saved.has(`${scope}assets/missing-abcdefgh.js`));
});
