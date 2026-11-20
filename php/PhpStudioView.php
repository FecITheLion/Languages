<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

/**
 * Pure static HTML template for the zero-install native PHP Studio workbench.
 * All dynamic values (title, theme-color, base attributes, manifest/icon hrefs,
 * and language <option> elements) are populated exclusively through PHP DOMDocument
 * in render_api_html() (php/TemplateEngine.php).
 */
function php_studio_document_template(): string {
    return <<<'HTML'
<!doctype html>
<html lang="en" data-runtime="php-native">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#2563eb" />
  <link rel="manifest" data-template-href="manifestHref" href="manifest.webmanifest" />
  <link rel="icon" data-template-href="iconHref" href="icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" data-template-href="appleIconHref" href="icons/icon-192.png" />
  <title>Grammar2JSON Studio</title>
  <style>
    :root {
      --bg: #0b1120; --surface: #111827; --panel: #161f33; --border: #243047;
      --text: #e2e8f0; --muted: #94a3b8; --accent: var(--theme-color, #2563eb); --accent-soft: rgba(37,99,235,.16);
      --ok: #22c55e; --err: #ef4444; --warn: #f59e0b;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; }
    .wb { display: grid; grid-template-rows: 48px 1fr 28px; height: 100vh; }
    .wb-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px; background: var(--surface); border-bottom: 1px solid var(--border); min-width: 0; overflow: hidden; }
    .wb-brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; flex-shrink: 0; white-space: nowrap; }
    .wb-badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: var(--accent-soft); color: #93c5fd; border: 1px solid rgba(59,130,246,.35); }
    .wb-nav { display: flex; gap: 4px; flex-wrap: nowrap; min-width: 0; flex: 1; overflow-x: auto; scrollbar-width: none; }
    .wb-nav::-webkit-scrollbar { display: none; }
    .wb-tab { flex-shrink: 0; white-space: nowrap; background: transparent; color: var(--muted); border: 1px solid transparent; padding: 6px 11px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .wb-tab:hover { color: var(--text); background: rgba(255,255,255,.04); }
    .wb-tab.active { color: #fff; background: var(--accent-soft); border-color: rgba(59,130,246,.45); }
    .wb-body { display: grid; grid-template-columns: 260px 1fr; min-height: 0; overflow: auto; }
    .wb-body > .pane:nth-child(3) { grid-column: 1 / -1; border-right: none; border-top: 1px solid var(--border); }
    @media (max-width: 1024px) { .wb-body { grid-template-columns: 1fr; overflow: auto; } }
    .pane { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--surface); }
    .pane:last-child { border-right: none; }
    .pane-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: rgba(0,0,0,.15); }
    .pane-scroll { flex: 1; overflow: auto; padding: 12px; }
    .wb-center { background: var(--bg); }
    .wb-status { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 12px; font-size: 12px; color: var(--muted); background: #090e1a; border-top: 1px solid var(--border); }
    .status-group { display: flex; align-items: center; gap: 14px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); margin-right: 5px; }
    .dot.err { background: var(--err); }
    .btn { background: var(--panel); color: var(--text); border: 1px solid var(--border); padding: 6px 11px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; }
    .btn:hover { border-color: #475569; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { filter: brightness(1.08); }
    .btn-danger { color: #fca5a5; border-color: rgba(239,68,68,.35); }
    .input, .select, .textarea { width: 100%; background: #0f172a; color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; font-family: inherit; font-size: 13px; }
    .textarea, pre.code { font-family: var(--mono); font-size: 12.5px; line-height: 1.5; }
    .textarea { resize: vertical; min-height: 96px; }
    pre.code { margin: 0; padding: 10px; background: #090e1a; border: 1px solid var(--border); border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-word; max-height: 460px; }
    .list-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; margin-bottom: 4px; }
    .list-item:hover { background: rgba(255,255,255,.04); }
    .list-item.selected { background: var(--accent-soft); border-color: rgba(59,130,246,.45); }
    .item-sub { font-size: 11px; color: var(--muted); font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row { display: flex; gap: 8px; align-items: center; }
    .col { display: flex; flex-direction: column; gap: 8px; }
    .section { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .section h3 { margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #f8fafc; }
    .label { display: block; font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .pill { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(148,163,184,.14); color: var(--muted); font-family: var(--mono); }
    .pill.ok { background: rgba(34,197,94,.16); color: #86efac; }
    .pill.err { background: rgba(239,68,68,.16); color: #fca5a5; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
<div class="wb">
  <header class="wb-header">
    <div class="wb-brand">
      <span data-template-text="brandTitle">Grammar2JSON Studio</span>
      <span class="wb-badge">PHP DOM</span>
    </div>
    <nav class="wb-nav" id="mainNav">
      <button class="wb-tab active" data-view="dialect" title="Dialect &amp; Grammar">Dialect</button>
      <button class="wb-tab" data-view="logic" title="Logic &amp; Lambda">Logic</button>
      <button class="wb-tab" data-view="export" title="22-Language Export">Export</button>
      <button class="wb-tab" data-view="history" title="Workspaces &amp; Histolog">Hist</button>
      <button class="wb-tab" data-view="api" title="REST &amp; MCP API">API</button>
    </nav>
    <div class="row">
      <button class="btn" id="btnRefresh">Refresh</button>
      <button class="btn btn-primary" id="btnRunAction">Evaluate</button>
    </div>
  </header>

  <div class="wb-body">
    <aside class="pane">
      <div class="pane-head">
        <span id="navTitle">Rules &amp; Symbols</span>
        <span class="pill" id="navCount">0</span>
      </div>
      <div class="pane-scroll">
        <div class="col" style="margin-bottom:10px;">
          <input class="input" id="navFilter" placeholder="Filter items..." />
        </div>
        <div id="navList">Loading...</div>
      </div>
    </aside>

    <main class="pane wb-center">
      <div class="pane-head">
        <span id="centerTitle">Dialect &amp; Grammar Workbench</span>
        <span class="pill" id="centerMeta">PHP 8 Native</span>
      </div>
      <div class="pane-scroll">
        <div id="view-dialect">
          <div class="section">
            <h3>Active Rule Editor</h3>
            <div class="col">
              <div class="row">
                <div style="flex:1;">
                  <label class="label" for="ruleName">Rule Name</label>
                  <input class="input" id="ruleName" placeholder="e.g. quantity" />
                </div>
                <div style="width:120px;">
                  <label class="label">&#160;</label>
                  <button class="btn btn-primary" style="width:100%;" id="btnSaveRule">Save Rule</button>
                </div>
                <div style="width:90px;">
                  <label class="label">&#160;</label>
                  <button class="btn btn-danger" style="width:100%;" id="btnDeleteRule">Delete</button>
                </div>
              </div>
              <div>
                <label class="label" for="ruleExpr">Expression</label>
                <textarea class="textarea" id="ruleExpr" rows="3" placeholder="digit+"></textarea>
              </div>
            </div>
          </div>

          <div class="section">
            <h3>Grammar Payload Evaluator</h3>
            <div class="col">
              <div class="row">
                <div style="flex:1;">
                  <label class="label" for="evalRule">Target Rule (optional, defaults to root)</label>
                  <input class="input" id="evalRule" placeholder="Leave blank for start rule" />
                </div>
                <div style="flex:2;">
                  <label class="label" for="evalPayload">Input Payload</label>
                  <input class="input" id="evalPayload" value="42" />
                </div>
                <div style="width:110px;">
                  <label class="label">&#160;</label>
                  <button class="btn btn-primary" style="width:100%;" id="btnEvalGrammar">Evaluate</button>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <h3>Active Grammar Source</h3>
            <pre class="code" id="grammarSource">Loading grammar...</pre>
          </div>
        </div>

        <div id="view-logic" class="hidden">
          <div class="section">
            <h3>Logic &amp; Lambda Statement</h3>
            <div class="col">
              <label class="label" for="logicStmt">Statement</label>
              <textarea class="textarea" id="logicStmt" rows="3"></textarea>
              <div class="row">
                <button class="btn btn-primary" id="btnEvalLogic">Evaluate Statement</button>
                <button class="btn" id="btnSaveLogic">Save State</button>
                <button class="btn" id="btnEvalCauchy">Run Cauchy Sequence</button>
              </div>
            </div>
          </div>
          <div class="section">
            <h3>Labels &amp; Bindings</h3>
            <pre class="code" id="logicLabelsJson">[]</pre>
          </div>
        </div>

        <div id="view-export" class="hidden">
          <div class="section">
            <h3>Export Active Workspace</h3>
            <div class="row" style="margin-bottom:10px;">
              <select class="select" id="exportLang" data-template-options="languages" style="max-width:260px;">
                <option value="grammar">Grammar Source</option>
              </select>
              <button class="btn btn-primary" id="btnRunExport">Generate Export</button>
            </div>
            <pre class="code" id="exportOutput">Select a target language and click Generate Export.</pre>
          </div>
        </div>

        <div id="view-history" class="hidden">
          <div class="section">
            <h3>Workspaces &amp; Checkpoints</h3>
            <div class="row" style="margin-bottom:10px;">
              <input class="input" id="checkpointSummary" placeholder="Checkpoint description..." />
              <button class="btn btn-primary" id="btnCheckpoint" style="white-space:nowrap;">Create Checkpoint</button>
            </div>
            <pre class="code" id="historyOutput">Loading histolog...</pre>
          </div>
        </div>

        <div id="view-api" class="hidden">
          <div class="section">
            <h3>Live PHP API Request Tester</h3>
            <div class="row" style="margin-bottom:8px;">
              <select class="select" id="apiMethod" style="width:110px;">
                <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
              </select>
              <input class="input" id="apiPath" value="/api" />
              <button class="btn btn-primary" id="btnSendApi">Send</button>
            </div>
            <label class="label" for="apiBody">JSON Body (for POST/PUT/PATCH)</label>
            <textarea class="textarea" id="apiBody" rows="4" placeholder='{"payload":"42"}'></textarea>
          </div>
          <div class="section">
            <h3>Discovered Endpoints</h3>
            <pre class="code" id="apiDiscovery">Loading...</pre>
          </div>
        </div>
      </div>
    </main>

    <aside class="pane">
      <div class="pane-head">
        <span>Inspector Output</span>
        <span class="pill ok" id="inspectorStatus">Ready</span>
      </div>
      <div class="pane-scroll">
        <pre class="code" id="inspectorOutput">Select a rule, run an evaluation, or query an API endpoint to inspect live engine output.</pre>
      </div>
    </aside>
  </div>

  <footer class="wb-status">
    <div class="status-group">
      <span><span class="dot" id="healthDot"></span><span id="healthText">Checking PHP engine...</span></span>
      <span id="statusRules">0 rules</span>
      <span id="statusSymbols">0 symbols</span>
    </div>
    <div class="status-group">
      <span>Base: <code data-template-text="appBase">/</code></span>
      <span>API: <code data-template-text="apiEndpoint">/api</code></span>
    </div>
  </footer>
</div>

<script>
(() => {
  const apiBase = (document.documentElement.dataset.apiBase || '').replace(/\/+$/, '');
  const apiUrl = (path) => apiBase + (path.startsWith('/') ? path : '/' + path);
  let state = { view: 'dialect', rules: [], symbols: [], logic: null, selectedRule: null };

  const $ = (id) => document.getElementById(id);
  const setInspector = (data, ok = true, label = null) => {
    const pill = $('inspectorStatus');
    pill.textContent = label || (ok ? 'OK' : 'Error');
    pill.className = 'pill ' + (ok ? 'ok' : 'err');
    $('inspectorOutput').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  };

  async function apiFetch(path, options = {}) {
    const res = await fetch(apiUrl(path), options);
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data: parsed };
  }

  function renderNav() {
    const q = ($('navFilter').value || '').toLowerCase();
    const list = $('navList');
    list.innerHTML = '';
    if (state.view === 'dialect' || state.view === 'export') {
      $('navTitle').textContent = 'Grammar Rules';
      const items = state.rules.filter(r => !q || r.name.toLowerCase().includes(q) || (r.expression || '').toLowerCase().includes(q));
      $('navCount').textContent = String(items.length);
      for (const rule of items) {
        const div = document.createElement('div');
        div.className = 'list-item' + (state.selectedRule === rule.name ? ' selected' : '');
        div.innerHTML = '<div style="min-width:0;flex:1;"><div style="font-weight:600;"></div><div class="item-sub"></div></div>';
        div.children[0].children[0].textContent = rule.name;
        div.children[0].children[1].textContent = rule.expression || '';
        div.onclick = () => {
          state.selectedRule = rule.name;
          $('ruleName').value = rule.name;
          $('ruleExpr').value = rule.expression || '';
          $('evalRule').value = rule.name;
          renderNav();
          setInspector(rule, true, 'Rule: ' + rule.name);
        };
        list.appendChild(div);
      }
    } else if (state.view === 'logic') {
      $('navTitle').textContent = 'Logic Labels';
      const labels = (state.logic && state.logic.labels) || [];
      const items = labels.filter(l => !q || (l.name || '').toLowerCase().includes(q));
      $('navCount').textContent = String(items.length);
      for (const lbl of items) {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = '<div style="min-width:0;flex:1;"><div style="font-weight:600;"></div><div class="item-sub"></div></div>';
        div.children[0].children[0].textContent = lbl.name + ' (' + lbl.kind + ')';
        div.children[0].children[1].textContent = lbl.value;
        div.onclick = () => setInspector(lbl, true, 'Label: ' + lbl.name);
        list.appendChild(div);
      }
    } else {
      $('navTitle').textContent = 'Quick Endpoints';
      const eps = ['/api', '/api/rules', '/api/symbols', '/api/nodes', '/api/logic', '/api/workspaces', '/api/histolog', '/api/languages', '/api/templates', '/api/mcp/servers'];
      $('navCount').textContent = String(eps.length);
      for (const ep of eps.filter(e => !q || e.includes(q))) {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = ep;
        div.onclick = async () => {
          $('apiPath').value = ep;
          const r = await apiFetch(ep);
          setInspector(r.data, r.ok, 'GET ' + r.status);
        };
        list.appendChild(div);
      }
    }
  }

  async function loadAll() {
    const [health, rulesRes, symbolsRes, grammarRes, logicRes, apiRes, histRes] = await Promise.all([
      apiFetch('/healthz'),
      apiFetch('/api/rules'),
      apiFetch('/api/symbols'),
      apiFetch('/api/export/grammar'),
      apiFetch('/api/logic'),
      apiFetch('/api'),
      apiFetch('/api/histolog'),
    ]);
    if (health.ok) {
      $('healthDot').className = 'dot';
      $('healthText').textContent = 'PHP Engine Online';
    } else {
      $('healthDot').className = 'dot err';
      $('healthText').textContent = 'Engine Error (' + health.status + ')';
    }
    state.rules = (rulesRes.data && rulesRes.data._embedded && rulesRes.data._embedded.rules) || [];
    state.symbols = (symbolsRes.data && symbolsRes.data._embedded && symbolsRes.data._embedded.symbols) || [];
    $('statusRules').textContent = state.rules.length + ' rules';
    $('statusSymbols').textContent = state.symbols.length + ' symbols';
    $('grammarSource').textContent = typeof grammarRes.data === 'string'
      ? grammarRes.data
      : (grammarRes.data && (grammarRes.data.code || grammarRes.data.content || grammarRes.data.grammarText)) || JSON.stringify(grammarRes.data, null, 2);
    if (logicRes.ok && logicRes.data) {
      state.logic = logicRes.data;
      $('logicStmt').value = logicRes.data.statement || '';
      $('logicLabelsJson').textContent = JSON.stringify(logicRes.data.labels || [], null, 2);
    }
    $('apiDiscovery').textContent = JSON.stringify(apiRes.data, null, 2);
    $('historyOutput').textContent = JSON.stringify(histRes.data, null, 2);
    renderNav();
  }

  document.querySelectorAll('#mainNav .wb-tab').forEach(btn => {
    btn.onclick = () => {
      state.view = btn.dataset.view;
      document.querySelectorAll('#mainNav .wb-tab').forEach(b => b.classList.toggle('active', b === btn));
      ['dialect', 'logic', 'export', 'history', 'api'].forEach(v => $('view-' + v).classList.toggle('hidden', v !== state.view));
      $('centerTitle').textContent = btn.textContent + ' Workbench';
      renderNav();
    };
  });

  $('navFilter').oninput = renderNav;
  $('btnRefresh').onclick = loadAll;

  $('btnSaveRule').onclick = async () => {
    const name = $('ruleName').value.trim();
    const expression = $('ruleExpr').value.trim();
    if (!name || !expression) return setInspector({ error: 'Rule name and expression are required.' }, false, '400');
    const exists = state.rules.some(r => r.name === name);
    const res = exists
      ? await apiFetch('/api/rules/' + encodeURIComponent(name), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expression }) })
      : await apiFetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, expression }) });
    setInspector(res.data, res.ok, (exists ? 'PUT ' : 'POST ') + res.status);
    if (res.ok) await loadAll();
  };

  $('btnDeleteRule').onclick = async () => {
    const name = $('ruleName').value.trim();
    if (!name) return;
    const res = await apiFetch('/api/rules/' + encodeURIComponent(name), { method: 'DELETE' });
    setInspector(res.data, res.ok, 'DELETE ' + res.status);
    if (res.ok) await loadAll();
  };

  $('btnEvalGrammar').onclick = async () => {
    const body = { payload: $('evalPayload').value };
    if ($('evalRule').value.trim()) body.rule = $('evalRule').value.trim();
    const res = await apiFetch('/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setInspector(res.data, res.ok, 'Eval ' + res.status);
  };

  $('btnEvalLogic').onclick = async () => {
    const res = await apiFetch('/api/logic/evaluate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: $('logicStmt').value }),
    });
    setInspector(res.data, res.ok, 'Logic ' + res.status);
  };

  $('btnSaveLogic').onclick = async () => {
    const res = await apiFetch('/api/logic', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: $('logicStmt').value }),
    });
    setInspector(res.data, res.ok, 'PATCH ' + res.status);
    if (res.ok) await loadAll();
  };

  $('btnEvalCauchy').onclick = async () => {
    const res = await apiFetch('/api/logic/cauchy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setInspector(res.data, res.ok, 'Cauchy ' + res.status);
  };

  $('btnRunExport').onclick = async () => {
    const lang = $('exportLang').value;
    const res = await apiFetch('/api/export/' + encodeURIComponent(lang));
    const text = typeof res.data === 'string' ? res.data : (res.data.code || res.data.content || JSON.stringify(res.data, null, 2));
    $('exportOutput').textContent = text;
    setInspector(res.data, res.ok, 'Export ' + lang);
  };

  $('btnCheckpoint').onclick = async () => {
    const summary = $('checkpointSummary').value.trim() || 'Manual PHP Studio checkpoint';
    const res = await apiFetch('/api/histolog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary }) });
    setInspector(res.data, res.ok, 'Checkpoint ' + res.status);
    if (res.ok) await loadAll();
  };

  $('btnSendApi').onclick = async () => {
    const method = $('apiMethod').value;
    const path = $('apiPath').value.trim() || '/api';
    const opts = { method };
    if (['POST', 'PUT', 'PATCH'].includes(method) && $('apiBody').value.trim()) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = $('apiBody').value;
    }
    const res = await apiFetch(path, opts);
    setInspector(res.data, res.ok, method + ' ' + res.status);
  };

  $('btnRunAction').onclick = () => {
    if (state.view === 'logic') $('btnEvalLogic').click();
    else if (state.view === 'export') $('btnRunExport').click();
    else if (state.view === 'api') $('btnSendApi').click();
    else $('btnEvalGrammar').click();
  };

  loadAll();
})();
</script>
</body>
</html>
HTML;
}

/**
 * Structured DOM template values passed to render_api_html().
 */
function php_studio_document_values(string $effectiveBase, string $templateName = 'studio'): array {
    $mw = middleware_active_config();
    $validTemplate = isset($mw['templates'][$templateName]) ? $templateName : 'studio';
    $cfg = $mw['templates'][$validTemplate];
    $apiBase = is_string($GLOBALS['APP_API_BASE'] ?? null) ? $GLOBALS['APP_API_BASE'] : rtrim($effectiveBase, '/');
    $basePrefix = rtrim($effectiveBase, '/') . '/';
    $languages = [];
    foreach (API_LANGUAGES as [$id, $exportId, $label]) {
        $languages[] = [$exportId, $label];
    }
    return [
        'brandTitle' => (string)($cfg['title'] ?? 'Grammar2JSON Studio'),
        'appBase' => $effectiveBase,
        'apiEndpoint' => $apiBase . '/api',
        'manifestHref' => $basePrefix . 'manifest.webmanifest',
        'iconHref' => $basePrefix . 'icon.svg',
        'appleIconHref' => $basePrefix . 'icons/icon-192.png',
        'languages' => $languages,
    ];
}

function render_php_studio_document(string $effectiveBase, string $templateName = 'studio'): string {
    return render_api_html(
        $templateName,
        'document',
        php_studio_document_values($effectiveBase, $templateName),
        php_studio_document_template()
    );
}
