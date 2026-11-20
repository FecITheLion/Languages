import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatRfc8288LinkHeader,
  RestHateoasEngineStore,
  type HateoasLink,
} from './src/engine/hateoasEngine.ts';
import {
  evaluateCauchySequence,
  evaluateLogicStatement,
  getLogicBindingDiagnostics,
  getLogicExportUnsupportedReason,
  type CauchySequenceConfig,
  type LogicExportTarget,
  type LogicLabelBinding,
} from './src/engine/logicLambdaEngine.ts';
import { logicInputDiagnostic, normalizeLogicEvaluationInput } from './src/engine/logicInputNormalizer.ts';
import {
  generateMcpClientConfig,
  generateMcpExportForClient,
  McpLazyServerRegistry,
  VALID_MCP_SERVER_IDS,
  type McpClientExportTarget,
  type McpWorkspaceContext,
} from './src/engine/mcpServerEngine.ts';
import {
  SUPPORTED_LANGUAGES,
  type EngineSectionKey,
  type ExportLanguage,
  type McpJsonRpcRequest,
  type McpServerId,
} from './src/types/studio.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const isCloudRun = Boolean(process.env.K_SERVICE || process.env.K_REVISION);
const isProd =
  isCloudRun ||
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && fs.existsSync(path.join(distDir, 'index.html')));
const PORT = Number(process.env.PORT) || 3000;

function getOrigin(req: express.Request): string {
  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}

function sendHal(
  res: express.Response,
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): void {
  res.setHeader('Content-Type', 'application/hal+json; charset=utf-8');
  const links = body._links as Record<string, HateoasLink> | undefined;
  if (links && typeof links === 'object') {
    const linkHeader = formatRfc8288LinkHeader(links);
    if (linkHeader) res.setHeader('Link', linkHeader);
  }
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.status(status).json(body);
}

async function startServer() {
  const app = express();
  app.use('/api/logic/evaluate', express.text({ type: 'text/plain', limit: '5mb' }));
  app.use('/api/logic/evaluate', express.json({ strict: false, limit: '5mb' }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, service: 'grammar2json-studio' });
  });

  // Single lazy MCP registry + stateful REST/CRUD/HATEOAS store kept in sync
  const mcpRegistry = new McpLazyServerRegistry();
  const restStore = new RestHateoasEngineStore();

  const syncRestToMcp = () => {
    mcpRegistry.updateContext({
      grammarText: restStore.workspace.grammarText,
      dialect: restStore.workspace.dialect,
      schemaConfig: restStore.workspace.schemaConfig,
      mutationPolicy: restStore.workspace.mutationPolicy,
      mutations: restStore.workspace.mutations,
      ruleConfigs: restStore.workspace.ruleConfigs,
      evalRule: restStore.workspace.evalRule,
      evalPayload: restStore.workspace.evalPayload,
      logicStatement: restStore.workspace.logicStatement,
      logicLabels: restStore.workspace.logicLabels,
      dslSource: restStore.workspace.dslSource,
    });
  };

  // Global API CORS + HATEOAS discovery headers
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Link, Location, Allow');
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
      res.status(204).end();
      return;
    }
    next();
  });

  /* ==========================================================================
   * 1. HATEOAS ROOT DISCOVERY & NODE / MEMBER-LEVEL REST CRUD ENDPOINTS
   * ======================================================================== */

  app.get('/api', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, restStore.buildRootDocument(origin));
  });

  // List all addressable nodes across the engine (each with mutable & non-mutable members)
  app.get('/api/nodes', (req, res) => {
    const origin = getOrigin(req);
    const kindFilter = typeof req.query.kind === 'string' ? req.query.kind : '';
    const allNodes = restStore.listAddressableNodes(origin);
    const filtered = kindFilter ? allNodes.filter((n) => n.kind === kindFilter) : allNodes;
    sendHal(res, 200, {
      count: filtered.length,
      kinds: Array.from(new Set(allNodes.map((n) => n.kind))),
      _embedded: {
        nodes: filtered.map((n) => ({
          kind: n.kind,
          id: n.id,
          label: n.label,
          mutableCount: n.mutableCount,
          immutableCount: n.immutableCount,
          memberNames: Object.keys(n.members),
          _links: n._links,
          _actions: n._actions,
        })),
      },
      _links: {
        self: { href: `${origin}/api/nodes`, method: 'GET', title: 'All addressable nodes' },
        root: { href: `${origin}/api`, method: 'GET', title: 'API Root' },
        nodeTemplate: { href: `${origin}/api/nodes/{kind}/{nodeId}`, method: 'GET', templated: true },
        memberTemplate: { href: `${origin}/api/nodes/{kind}/{nodeId}/members/{member}`, method: 'GET', templated: true },
      },
    });
  });

  // Inspect a single node with full mutable & immutable member map
  app.get('/api/nodes/:kind/:nodeId', (req, res) => {
    const origin = getOrigin(req);
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin);
    if (!node) {
      sendHal(res, 404, {
        error: `Node '${req.params.kind}/${req.params.nodeId}' not found.`,
        _links: { nodes: { href: `${origin}/api/nodes`, method: 'GET' } },
      });
      return;
    }
    sendHal(res, 200, node as unknown as Record<string, unknown>);
  });

  // List all members (mutable and non-mutable) on a specific node
  app.get('/api/nodes/:kind/:nodeId/members', (req, res) => {
    const origin = getOrigin(req);
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin);
    if (!node) {
      sendHal(res, 404, {
        error: `Node '${req.params.kind}/${req.params.nodeId}' not found.`,
        _links: { nodes: { href: `${origin}/api/nodes`, method: 'GET' } },
      });
      return;
    }
    sendHal(res, 200, {
      node: `${node.kind}/${node.id}`,
      label: node.label,
      mutableCount: node.mutableCount,
      immutableCount: node.immutableCount,
      members: node.members,
      _links: {
        self: { href: `${node.href}/members`, method: 'GET' },
        node: { href: node.href, method: 'GET' },
        nodes: { href: `${origin}/api/nodes`, method: 'GET' },
      },
    });
  });

  // Read any mutable or non-mutable member at a node
  app.get('/api/nodes/:kind/:nodeId/members/:member', (req, res) => {
    const origin = getOrigin(req);
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin);
    if (!node) {
      sendHal(res, 404, {
        error: `Node '${req.params.kind}/${req.params.nodeId}' not found.`,
        _links: { nodes: { href: `${origin}/api/nodes`, method: 'GET' } },
      });
      return;
    }
    const member = node.members[req.params.member];
    if (!member) {
      sendHal(res, 404, {
        error: `Member '${req.params.member}' not found on '${node.kind}/${node.id}'.`,
        availableMembers: Object.keys(node.members),
        _links: { node: { href: node.href, method: 'GET' }, members: { href: `${node.href}/members`, method: 'GET' } },
      });
      return;
    }
    sendHal(
      res,
      200,
      {
        node: `${node.kind}/${node.id}`,
        ...member,
      },
      { Allow: member.allowedMethods.join(', ') }
    );
  });

  // Mutate (PUT / PATCH) a node member — enforces mutable vs non-mutable (405 / 423) with HATEOAS links
  const handleNodeMemberMutate = (req: express.Request, res: express.Response) => {
    const origin = getOrigin(req);
    const val = req.body && Object.prototype.hasOwnProperty.call(req.body, 'value') ? req.body.value : req.body;
    const outcome = restStore.mutateNodeMember(req.params.kind, req.params.nodeId, req.params.member, 'update', val, origin);
    if (outcome.status === 200) syncRestToMcp();
    sendHal(res, outcome.status, outcome.body, 'allow' in outcome && outcome.allow ? { Allow: outcome.allow } : undefined);
  };
  app.put('/api/nodes/:kind/:nodeId/members/:member', handleNodeMemberMutate);
  app.patch('/api/nodes/:kind/:nodeId/members/:member', handleNodeMemberMutate);

  // Reset / clear (DELETE) a mutable member — returns 405 on non-mutable members
  app.delete('/api/nodes/:kind/:nodeId/members/:member', (req, res) => {
    const origin = getOrigin(req);
    const outcome = restStore.mutateNodeMember(req.params.kind, req.params.nodeId, req.params.member, 'delete', null, origin);
    if (outcome.status === 200) syncRestToMcp();
    sendHal(res, outcome.status, outcome.body, 'allow' in outcome && outcome.allow ? { Allow: outcome.allow } : undefined);
  });

  /* ==========================================================================
   * 2. GRAMMAR RULES REST / CRUD + EXTENDED DAG SYMBOLS CRUD
   * ======================================================================== */

  app.get('/api/rules', (req, res) => {
    const origin = getOrigin(req);
    const rules = restStore.getRules();
    const graph = restStore.getGraph();
    sendHal(res, 200, {
      count: rules.length,
      dialect: restStore.workspace.dialect,
      _embedded: {
        rules: rules.map((r) => {
          const gNode = graph.nodes.find((n) => n.name === r.name);
          const selfHref = `${origin}/api/rules/${encodeURIComponent(r.name)}`;
          return {
            ...r,
            usedOperators: gNode?.usedOperators || [],
            config: restStore.workspace.ruleConfigs[r.name] || null,
            mutation: restStore.workspace.mutations[r.name] || null,
            _links: {
              self: { href: selfHref, method: 'GET' },
              node: { href: `${origin}/api/nodes/rule/${encodeURIComponent(r.name)}`, method: 'GET' },
              members: { href: `${origin}/api/nodes/rule/${encodeURIComponent(r.name)}/members`, method: 'GET' },
              update: { href: selfHref, method: 'PUT' },
              delete: { href: selfHref, method: 'DELETE' },
            },
          };
        }),
      },
      _links: {
        self: { href: `${origin}/api/rules`, method: 'GET' },
        root: { href: `${origin}/api`, method: 'GET' },
        symbols: { href: `${origin}/api/symbols`, method: 'GET' },
        evaluate: { href: `${origin}/api/evaluate`, method: 'POST' },
      },
      _actions: {
        create: {
          name: 'create',
          title: 'Create Grammar Rule',
          href: `${origin}/api/rules`,
          method: 'POST',
          contentType: 'application/json',
          fields: [
            { name: 'name', type: 'string', required: true, example: 'promo_code' },
            { name: 'expression', type: 'string', required: true, example: "'PROMO-' digit+" },
          ],
        },
      },
    });
  });

  app.get('/api/rules/:name', (req, res) => {
    const origin = getOrigin(req);
    const rule = restStore.getRules().find((r) => r.name === req.params.name);
    if (!rule) {
      sendHal(res, 404, {
        error: `Rule '${req.params.name}' not found.`,
        _links: { collection: { href: `${origin}/api/rules`, method: 'GET' } },
      });
      return;
    }
    const node = restStore.getAddressableNode('rule', rule.name, origin);
    const selfHref = `${origin}/api/rules/${encodeURIComponent(rule.name)}`;
    sendHal(res, 200, {
      ...rule,
      config: restStore.workspace.ruleConfigs[rule.name] || null,
      mutation: restStore.workspace.mutations[rule.name] || null,
      members: node?.members || {},
      _links: {
        self: { href: selfHref, method: 'GET' },
        collection: { href: `${origin}/api/rules`, method: 'GET' },
        node: { href: `${origin}/api/nodes/rule/${encodeURIComponent(rule.name)}`, method: 'GET' },
        members: { href: `${origin}/api/nodes/rule/${encodeURIComponent(rule.name)}/members`, method: 'GET' },
      },
      _actions: {
        update: {
          name: 'update',
          title: `Update <${rule.name}>`,
          href: selfHref,
          method: 'PUT',
          contentType: 'application/json',
          fields: [{ name: 'expression', type: 'string', required: true, example: rule.expression }],
        },
        delete: {
          name: 'delete',
          title: `Delete <${rule.name}>`,
          href: selfHref,
          method: 'DELETE',
        },
      },
    });
  });

  app.post('/api/rules', (req, res) => {
    const origin = getOrigin(req);
    const name = String(req.body?.name || '').trim();
    const expression = String(req.body?.expression || '').trim();
    if (!name || !expression) {
      sendHal(res, 400, {
        error: 'Both "name" and "expression" are required to create a grammar rule.',
        _links: { collection: { href: `${origin}/api/rules`, method: 'GET' } },
      });
      return;
    }
    const created = restStore.createRule(name, expression);
    if (!created.ok) {
      sendHal(res, 400, { error: created.error, _links: { collection: { href: `${origin}/api/rules`, method: 'GET' } } });
      return;
    }
    syncRestToMcp();
    const selfHref = `${origin}/api/rules/${encodeURIComponent(name)}`;
    sendHal(
      res,
      201,
      {
        ok: true,
        name,
        expression,
        grammarText: created.grammar,
        _links: {
          self: { href: selfHref, method: 'GET' },
          node: { href: `${origin}/api/nodes/rule/${encodeURIComponent(name)}`, method: 'GET' },
          collection: { href: `${origin}/api/rules`, method: 'GET' },
        },
      },
      { Location: selfHref }
    );
  });

  const handleRuleUpdate = (req: express.Request, res: express.Response) => {
    const origin = getOrigin(req);
    const updated = restStore.updateRule(req.params.name, {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      expression: typeof req.body?.expression === 'string' ? req.body.expression : undefined,
    });
    if (!updated.ok) {
      sendHal(res, 400, { error: updated.error, _links: { collection: { href: `${origin}/api/rules`, method: 'GET' } } });
      return;
    }
    syncRestToMcp();
    const selfHref = `${origin}/api/rules/${encodeURIComponent(updated.nextName)}`;
    sendHal(res, 200, {
      ok: true,
      name: updated.nextName,
      grammarText: updated.grammar,
      _links: {
        self: { href: selfHref, method: 'GET' },
        node: { href: `${origin}/api/nodes/rule/${encodeURIComponent(updated.nextName)}`, method: 'GET' },
        collection: { href: `${origin}/api/rules`, method: 'GET' },
      },
    });
  };
  app.put('/api/rules/:name', handleRuleUpdate);
  app.patch('/api/rules/:name', handleRuleUpdate);

  app.delete('/api/rules/:name', (req, res) => {
    const origin = getOrigin(req);
    const deleted = restStore.deleteRule(req.params.name);
    if (!deleted.ok) {
      sendHal(res, 404, { error: deleted.error, _links: { collection: { href: `${origin}/api/rules`, method: 'GET' } } });
      return;
    }
    syncRestToMcp();
    sendHal(res, 200, {
      ok: true,
      deleted: req.params.name,
      grammarText: deleted.grammar,
      _links: {
        collection: { href: `${origin}/api/rules`, method: 'GET' },
        root: { href: `${origin}/api`, method: 'GET' },
      },
    });
  });

  // Extended DAG Symbols CRUD
  app.get('/api/symbols', (req, res) => {
    const origin = getOrigin(req);
    const graph = restStore.getGraph();
    const symRegistry = graph.symbolRegistry ?? [];
    sendHal(res, 200, {
      count: symRegistry.length,
      enabledCount: symRegistry.filter((s) => s.enabled).length,
      _embedded: {
        symbols: symRegistry.map((s) => ({
          ...s,
          _links: {
            self: { href: `${origin}/api/symbols/${encodeURIComponent(s.key)}`, method: 'GET' },
            node: { href: `${origin}/api/nodes/symbol/${encodeURIComponent(s.key)}`, method: 'GET' },
            update: { href: `${origin}/api/symbols/${encodeURIComponent(s.key)}`, method: 'PUT' },
            disable: { href: `${origin}/api/symbols/${encodeURIComponent(s.key)}`, method: 'DELETE' },
          },
        })),
      },
      _links: {
        self: { href: `${origin}/api/symbols`, method: 'GET' },
        root: { href: `${origin}/api`, method: 'GET' },
      },
    });
  });

  app.get('/api/symbols/:key', (req, res) => {
    const origin = getOrigin(req);
    const sym = (restStore.getGraph().symbolRegistry ?? []).find((s) => s.key === req.params.key);
    if (!sym) {
      sendHal(res, 404, { error: `Symbol '${req.params.key}' not found.`, _links: { collection: { href: `${origin}/api/symbols`, method: 'GET' } } });
      return;
    }
    sendHal(res, 200, {
      ...sym,
      _links: {
        self: { href: `${origin}/api/symbols/${encodeURIComponent(sym.key)}`, method: 'GET' },
        node: { href: `${origin}/api/nodes/symbol/${encodeURIComponent(sym.key)}`, method: 'GET' },
        collection: { href: `${origin}/api/symbols`, method: 'GET' },
      },
    });
  });

  app.put('/api/symbols/:key', (req, res) => {
    const origin = getOrigin(req);
    const outcome = restStore.mutateNodeMember('symbol', req.params.key, 'value', 'update', req.body?.value ?? '', origin);
    if (outcome.status === 200) syncRestToMcp();
    sendHal(res, outcome.status, outcome.body);
  });

  app.delete('/api/symbols/:key', (req, res) => {
    const origin = getOrigin(req);
    const outcome = restStore.mutateNodeMember('symbol', req.params.key, 'value', 'delete', '', origin);
    if (outcome.status === 200) syncRestToMcp();
    sendHal(res, outcome.status, outcome.body);
  });

  /* ==========================================================================
   * 3. GLOBAL CALLBACKS CRUD + LOGIC / LABELS / CAUCHY SEQUENCING CRUD
   * ======================================================================== */

  app.get('/api/callbacks', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      count: restStore.callbacks.length,
      _embedded: {
        callbacks: restStore.callbacks.map((c) => ({
          ...c,
          _links: {
            self: { href: `${origin}/api/callbacks/${encodeURIComponent(c.id)}`, method: 'GET' },
            node: { href: `${origin}/api/nodes/callback/${encodeURIComponent(c.id)}`, method: 'GET' },
            delete: { href: `${origin}/api/callbacks/${encodeURIComponent(c.id)}`, method: 'DELETE' },
          },
        })),
      },
      _links: { self: { href: `${origin}/api/callbacks`, method: 'GET' }, root: { href: `${origin}/api`, method: 'GET' } },
      _actions: {
        create: {
          name: 'create',
          title: 'Create Global Callback',
          href: `${origin}/api/callbacks`,
          method: 'POST',
          contentType: 'application/json',
          fields: [
            { name: 'name', type: 'string', required: true, example: 'scale_bonus' },
            { name: 'lambdaExpr', type: 'string', required: true, example: 'λx. x * 1.15' },
            { name: 'description', type: 'string', required: false, example: 'Add 15% bonus' },
          ],
        },
      },
    });
  });

  app.get('/api/callbacks/:id', (req, res) => {
    const origin = getOrigin(req);
    const cb = restStore.callbacks.find((c) => c.id === req.params.id || c.name === req.params.id);
    if (!cb) {
      sendHal(res, 404, { error: `Callback '${req.params.id}' not found.`, _links: { collection: { href: `${origin}/api/callbacks`, method: 'GET' } } });
      return;
    }
    sendHal(res, 200, {
      ...cb,
      _links: {
        self: { href: `${origin}/api/callbacks/${encodeURIComponent(cb.id)}`, method: 'GET' },
        node: { href: `${origin}/api/nodes/callback/${encodeURIComponent(cb.id)}`, method: 'GET' },
        collection: { href: `${origin}/api/callbacks`, method: 'GET' },
      },
    });
  });

  app.post('/api/callbacks', (req, res) => {
    const origin = getOrigin(req);
    const name = String(req.body?.name || '').trim();
    const lambdaExpr = String(req.body?.lambdaExpr || '').trim();
    if (!name || !lambdaExpr) {
      sendHal(res, 400, { error: 'Both "name" and "lambdaExpr" are required.' });
      return;
    }
    const created = restStore.upsertCallback({ name, lambdaExpr, description: String(req.body?.description || '') });
    const selfHref = `${origin}/api/callbacks/${encodeURIComponent(created.id)}`;
    sendHal(
      res,
      201,
      {
        ok: true,
        callback: created,
        _links: { self: { href: selfHref, method: 'GET' }, collection: { href: `${origin}/api/callbacks`, method: 'GET' } },
      },
      { Location: selfHref }
    );
  });

  app.put('/api/callbacks/:id', (req, res) => {
    const origin = getOrigin(req);
    const existing = restStore.callbacks.find((c) => c.id === req.params.id || c.name === req.params.id);
    const updated = restStore.upsertCallback({
      name: String(req.body?.name || existing?.name || req.params.id),
      lambdaExpr: String(req.body?.lambdaExpr || existing?.lambdaExpr || 'λx. x'),
      description: typeof req.body?.description === 'string' ? req.body.description : existing?.description,
    });
    sendHal(res, 200, {
      ok: true,
      callback: updated,
      _links: { self: { href: `${origin}/api/callbacks/${encodeURIComponent(updated.id)}`, method: 'GET' } },
    });
  });

  app.delete('/api/callbacks/:id', (req, res) => {
    const origin = getOrigin(req);
    const removed = restStore.deleteCallback(req.params.id);
    if (!removed) {
      sendHal(res, 404, { error: `Callback '${req.params.id}' not found.` });
      return;
    }
    sendHal(res, 200, { ok: true, deleted: req.params.id, _links: { collection: { href: `${origin}/api/callbacks`, method: 'GET' } } });
  });

  app.get('/api/logic', (req, res) => {
    const origin = getOrigin(req);
    const evalRes = evaluateLogicStatement(restStore.workspace.logicStatement, restStore.workspace.logicLabels);
    const cauchyRes = evaluateCauchySequence(restStore.workspace.cauchyConfig, restStore.workspace.logicLabels);
    sendHal(res, 200, {
      statement: restStore.workspace.logicStatement,
      labels: restStore.workspace.logicLabels,
      evaluation: { ok: evalRes.ok, displayValue: evalRes.displayValue, valueType: evalRes.valueType, error: evalRes.error },
      cauchyConfig: restStore.workspace.cauchyConfig,
      cauchyEvaluation: {
        ok: cauchyRes.ok,
        converged: cauchyRes.converged,
        cauchyIndexN: cauchyRes.cauchyIndexN,
        limitEstimate: cauchyRes.limitEstimate,
        resolvedParamNames: cauchyRes.resolvedParamNames,
      },
      _links: {
        self: { href: `${origin}/api/logic`, method: 'GET' },
        node: { href: `${origin}/api/nodes/logic/active`, method: 'GET' },
        labels: { href: `${origin}/api/logic/labels`, method: 'GET' },
        evaluate: { href: `${origin}/api/logic/evaluate`, method: 'POST' },
        cauchy: { href: `${origin}/api/logic/cauchy`, method: 'POST' },
        exportPython: { href: `${origin}/api/logic/export/python`, method: 'GET' },
      },
    });
  });

  const handleLogicUpdate = (req: express.Request, res: express.Response) => {
    const origin = getOrigin(req);
    if (typeof req.body?.statement === 'string') restStore.workspace.logicStatement = req.body.statement;
    if (Array.isArray(req.body?.labels)) restStore.workspace.logicLabels = req.body.labels as LogicLabelBinding[];
    if (req.body?.cauchyConfig && typeof req.body.cauchyConfig === 'object') {
      restStore.workspace.cauchyConfig = { ...restStore.workspace.cauchyConfig, ...req.body.cauchyConfig };
    }
    syncRestToMcp();
    restStore.recordHistolog('rest_logic_update', 'Updated logic / Cauchy configuration');
    const evalRes = evaluateLogicStatement(restStore.workspace.logicStatement, restStore.workspace.logicLabels);
    sendHal(res, 200, {
      ok: true,
      statement: restStore.workspace.logicStatement,
      labels: restStore.workspace.logicLabels,
      displayValue: evalRes.displayValue,
      _links: { self: { href: `${origin}/api/logic`, method: 'GET' } },
    });
  };
  app.put('/api/logic', handleLogicUpdate);
  app.patch('/api/logic', handleLogicUpdate);

  app.get('/api/logic/labels', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      count: restStore.workspace.logicLabels.length,
      labels: restStore.workspace.logicLabels,
      _links: { self: { href: `${origin}/api/logic/labels`, method: 'GET' }, logic: { href: `${origin}/api/logic`, method: 'GET' } },
    });
  });

  app.post('/api/logic/labels', (req, res) => {
    const origin = getOrigin(req);
    const name = String(req.body?.name || '').trim();
    if (!name) {
      sendHal(res, 400, { error: '"name" is required.' });
      return;
    }
    const lbl: LogicLabelBinding = {
      id: `lbl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      kind: req.body?.kind === 'boolean' || req.body?.kind === 'lambda' ? req.body.kind : 'number',
      value: String(req.body?.value ?? '0'),
    };
    restStore.workspace.logicLabels = [...restStore.workspace.logicLabels.filter((l) => l.name !== name), lbl];
    syncRestToMcp();
    sendHal(res, 201, {
      ok: true,
      label: lbl,
      _links: { self: { href: `${origin}/api/logic/labels/${encodeURIComponent(lbl.id)}`, method: 'GET' }, collection: { href: `${origin}/api/logic/labels`, method: 'GET' } },
    });
  });

  app.delete('/api/logic/labels/:id', (req, res) => {
    const origin = getOrigin(req);
    const before = restStore.workspace.logicLabels.length;
    restStore.workspace.logicLabels = restStore.workspace.logicLabels.filter(
      (l) => l.id !== req.params.id && l.name !== req.params.id
    );
    if (restStore.workspace.logicLabels.length === before) {
      sendHal(res, 404, { error: `Label '${req.params.id}' not found.` });
      return;
    }
    syncRestToMcp();
    sendHal(res, 200, { ok: true, deleted: req.params.id, _links: { collection: { href: `${origin}/api/logic/labels`, method: 'GET' } } });
  });

  app.post('/api/logic/evaluate', (req, res) => {
    const origin = getOrigin(req);
    const normalized = normalizeLogicEvaluationInput(req.body, {
      statement: restStore.workspace.logicStatement,
      labels: restStore.workspace.logicLabels,
    });
    if (!normalized.ok) {
      sendHal(res, 400, {
        ok: false,
        error: normalized.error,
        diagnostics: [logicInputDiagnostic(normalized.error)],
        _links: { self: { href: `${origin}/api/logic/evaluate`, method: 'POST' }, logic: { href: `${origin}/api/logic`, method: 'GET' } },
      });
      return;
    }
    const { statement: stmt, labels } = normalized.input;
    const evalRes = evaluateLogicStatement(stmt, labels);
    sendHal(res, 200, {
      statement: stmt,
      ok: evalRes.ok,
      displayValue: evalRes.displayValue,
      valueType: evalRes.valueType,
      trace: evalRes.trace,
      error: evalRes.error,
      diagnostics: getLogicBindingDiagnostics(evalRes, labels),
      _links: { self: { href: `${origin}/api/logic/evaluate`, method: 'POST' }, logic: { href: `${origin}/api/logic`, method: 'GET' } },
    });
  });

  app.post('/api/logic/cauchy', (req, res) => {
    const origin = getOrigin(req);
    const cfg: CauchySequenceConfig = {
      ...restStore.workspace.cauchyConfig,
      enabled: true,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    };
    const result = evaluateCauchySequence(cfg, restStore.workspace.logicLabels);
    sendHal(res, 200, {
      config: cfg,
      ...result,
      _links: { self: { href: `${origin}/api/logic/cauchy`, method: 'POST' }, logic: { href: `${origin}/api/logic`, method: 'GET' } },
    });
  });

  /* ==========================================================================
   * 4. HISTOLOG GENERATIONS, DIFF, RESTORE & ENGINE CLEAR ENDPOINTS
   * ======================================================================== */

  app.get('/api/histolog', (req, res) => {
    const origin = getOrigin(req);
    const index = restStore.getHistologIndex();
    sendHal(res, 200, {
      index,
      _embedded: {
        generations: restStore.histolog.map((h) => ({
          generation: h.generation,
          parentGeneration: h.parentGeneration,
          timestamp: h.timestamp,
          source: h.source,
          summary: h.summary,
          fingerprint: h.fingerprint,
          changedFields: h.changedFields,
          touchedSymbols: h.touchedSymbols,
          additions: h.additions,
          deletions: h.deletions,
          _links: {
            self: { href: `${origin}/api/histolog/${h.generation}`, method: 'GET' },
            restore: { href: `${origin}/api/histolog/${h.generation}/restore`, method: 'POST' },
            node: { href: `${origin}/api/nodes/histolog/${h.generation}`, method: 'GET' },
          },
        })),
      },
      _links: {
        self: { href: `${origin}/api/histolog`, method: 'GET' },
        diff: { href: `${origin}/api/histolog/diff?from=0&to=${restStore.histolog[restStore.histolog.length - 1]?.generation ?? 0}`, method: 'GET' },
        clearEngine: { href: `${origin}/api/engine/clear`, method: 'POST' },
      },
    });
  });

  app.get('/api/histolog/diff', (req, res) => {
    const origin = getOrigin(req);
    const fromGen = Number(req.query.from ?? 0);
    const toGen = Number(req.query.to ?? restStore.histolog[restStore.histolog.length - 1]?.generation ?? 0);
    const diff = restStore.getHistologDiff(fromGen, toGen);
    if (!diff) {
      sendHal(res, 404, { error: 'Not enough generations to compute diff.' });
      return;
    }
    sendHal(res, 200, {
      ...diff,
      _links: {
        self: { href: `${origin}/api/histolog/diff?from=${diff.fromGen}&to=${diff.toGen}`, method: 'GET' },
        collection: { href: `${origin}/api/histolog`, method: 'GET' },
      },
    });
  });

  app.get('/api/histolog/:gen', (req, res) => {
    const origin = getOrigin(req);
    const gen = Number(req.params.gen);
    const entry = restStore.histolog.find((h) => h.generation === gen);
    if (!entry) {
      sendHal(res, 404, { error: `Generation G${req.params.gen} not found.` });
      return;
    }
    sendHal(res, 200, {
      ...entry,
      _links: {
        self: { href: `${origin}/api/histolog/${entry.generation}`, method: 'GET' },
        restore: { href: `${origin}/api/histolog/${entry.generation}/restore`, method: 'POST' },
        collection: { href: `${origin}/api/histolog`, method: 'GET' },
      },
    });
  });

  app.post('/api/histolog', (req, res) => {
    const origin = getOrigin(req);
    const summary = String(req.body?.summary || 'Manual API checkpoint');
    const entry = restStore.recordHistolog('api_checkpoint', summary);
    sendHal(res, 201, {
      ok: true,
      generation: entry.generation,
      fingerprint: entry.fingerprint,
      summary: entry.summary,
      _links: { self: { href: `${origin}/api/histolog/${entry.generation}`, method: 'GET' } },
    });
  });

  app.post('/api/histolog/:gen/restore', (req, res) => {
    const origin = getOrigin(req);
    const gen = Number(req.params.gen);
    const section = (req.body?.section || 'all') as EngineSectionKey;
    const restored = restStore.restoreGeneration(gen, section);
    if (!restored.ok) {
      sendHal(res, 404, { error: restored.error });
      return;
    }
    syncRestToMcp();
    sendHal(res, 200, {
      ok: true,
      restoredFrom: gen,
      section,
      newGeneration: restored.entry.generation,
      _links: {
        histolog: { href: `${origin}/api/histolog`, method: 'GET' },
        rules: { href: `${origin}/api/rules`, method: 'GET' },
      },
    });
  });

  app.post('/api/engine/clear', (req, res) => {
    const origin = getOrigin(req);
    const section = (req.body?.section || 'all') as EngineSectionKey;
    const result = restStore.clearSection(section);
    syncRestToMcp();
    sendHal(res, 200, {
      ok: true,
      ...result,
      _links: {
        root: { href: `${origin}/api`, method: 'GET' },
        histolog: { href: `${origin}/api/histolog`, method: 'GET' },
      },
    });
  });

  /* ==========================================================================
   * 5. WORKSPACES CRUD, MULTI-LANGUAGE EXPORTS & PAYLOAD EVALUATOR
   * ======================================================================== */

  app.get('/api/workspaces', (req, res) => {
    const origin = getOrigin(req);
    const list = Array.from(restStore.workspaces.values());
    sendHal(res, 200, {
      count: list.length,
      _embedded: {
        workspaces: list.map((w) => ({
          id: w.id,
          name: w.name,
          updatedAt: w.updatedAt,
          dialectPreset: w.dialect.preset,
          _links: {
            self: { href: `${origin}/api/workspaces/${encodeURIComponent(w.id)}`, method: 'GET' },
            rules: { href: `${origin}/api/rules`, method: 'GET' },
          },
        })),
      },
      _links: { self: { href: `${origin}/api/workspaces`, method: 'GET' }, root: { href: `${origin}/api`, method: 'GET' } },
    });
  });

  app.get('/api/workspaces/:id', (req, res) => {
    const origin = getOrigin(req);
    const ws = restStore.workspaces.get(req.params.id);
    if (!ws) {
      sendHal(res, 404, { error: `Workspace '${req.params.id}' not found.` });
      return;
    }
    sendHal(res, 200, {
      ...ws,
      _links: {
        self: { href: `${origin}/api/workspaces/${encodeURIComponent(ws.id)}`, method: 'GET' },
        collection: { href: `${origin}/api/workspaces`, method: 'GET' },
        rules: { href: `${origin}/api/rules`, method: 'GET' },
      },
    });
  });

  app.post('/api/workspaces', (req, res) => {
    const origin = getOrigin(req);
    const id = String(req.body?.id || `ws_${Date.now()}`).trim();
    const copy = {
      ...restStore.workspace,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      id,
      name: String(req.body?.name || id),
      updatedAt: new Date().toISOString(),
    };
    restStore.workspaces.set(id, copy);
    const selfHref = `${origin}/api/workspaces/${encodeURIComponent(id)}`;
    sendHal(res, 201, { ok: true, workspace: copy, _links: { self: { href: selfHref, method: 'GET' } } }, { Location: selfHref });
  });

  app.delete('/api/workspaces/:id', (req, res) => {
    const origin = getOrigin(req);
    if (req.params.id === 'default') {
      const cleared = restStore.clearSection('all');
      syncRestToMcp();
      sendHal(res, 200, { ok: true, clearedDefault: true, ...cleared, _links: { collection: { href: `${origin}/api/workspaces`, method: 'GET' } } });
      return;
    }
    const existed = restStore.workspaces.delete(req.params.id);
    if (!existed) {
      sendHal(res, 404, { error: `Workspace '${req.params.id}' not found.` });
      return;
    }
    sendHal(res, 200, { ok: true, deleted: req.params.id, _links: { collection: { href: `${origin}/api/workspaces`, method: 'GET' } } });
  });

  app.get('/api/languages', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      count: SUPPORTED_LANGUAGES.length,
      languages: SUPPORTED_LANGUAGES.map((l) => ({
        ...l,
        _links: {
          exportWorkspace: { href: `${origin}/api/export/${l.exportId}`, method: 'GET', title: `Export workspace as ${l.label}` },
          exportLogic: { href: `${origin}/api/logic/export/${l.exportId}`, method: 'GET', title: `Export logic as ${l.label}` },
        },
      })),
      _links: { self: { href: `${origin}/api/languages`, method: 'GET' }, root: { href: `${origin}/api`, method: 'GET' } },
    });
  });

  app.get('/api/export/:language', (req, res) => {
    const origin = getOrigin(req);
    const lang = req.params.language as ExportLanguage;
    const exported = restStore.exportWorkspace(lang);
    sendHal(res, 200, {
      language: lang,
      ...exported,
      _links: {
        self: { href: `${origin}/api/export/${encodeURIComponent(lang)}`, method: 'GET' },
        languages: { href: `${origin}/api/languages`, method: 'GET' },
        rules: { href: `${origin}/api/rules`, method: 'GET' },
      },
    });
  });

  app.get('/api/logic/export/:language', (req, res) => {
    const origin = getOrigin(req);
    const lang = req.params.language as LogicExportTarget;
    const self = { href: `${origin}/api/logic/export/${encodeURIComponent(lang)}`, method: 'GET' };
    const links = { self, logic: { href: `${origin}/api/logic`, method: 'GET' } };
    const unsupportedReason = getLogicExportUnsupportedReason(lang, restStore.workspace.cauchyConfig);
    if (unsupportedReason) {
      sendHal(res, 422, {
        ok: false,
        code: 'unsupported_cauchy_export',
        language: lang,
        error: unsupportedReason,
        _links: links,
      });
      return;
    }
    try {
      const exported = restStore.exportLogic(lang);
      sendHal(res, 200, {
        language: lang,
        filename: exported.filename,
        mime: exported.mime,
        content: exported.content,
        _links: links,
      });
    } catch (error) {
      sendHal(res, 500, {
        ok: false,
        code: 'logic_export_failed',
        language: lang,
        error: error instanceof Error ? error.message : 'Logic export failed.',
        _links: links,
      });
    }
  });

  app.post('/api/evaluate', (req, res) => {
    const origin = getOrigin(req);
    const rule = typeof req.body?.rule === 'string' ? req.body.rule : undefined;
    const payload = typeof req.body?.payload === 'string' ? req.body.payload : undefined;
    const result = restStore.evaluatePayload(rule, payload);
    sendHal(res, 200, {
      ...result,
      _links: {
        self: { href: `${origin}/api/evaluate`, method: 'POST' },
        rules: { href: `${origin}/api/rules`, method: 'GET' },
        symbols: { href: `${origin}/api/symbols`, method: 'GET' },
      },
    });
  });

  /* ==========================================================================
   * 6. LAZY BUILD-ON-CALL MCP STREAMABLE HTTP ENDPOINTS (WITH HATEOAS LINKS)
   * ======================================================================== */

  app.get('/api/mcp/servers', (req, res) => {
    const origin = getOrigin(req);
    const servers = mcpRegistry.getServerStatuses();
    sendHal(res, 200, {
      protocol: 'MCP 2025-03-26 (Streamable HTTP)',
      activation: 'build-on-call',
      caching: 'content-addressed-lru',
      servers: servers.map((s) => ({
        ...s,
        _links: {
          self: { href: `${origin}/api/mcp/${s.id}`, method: 'GET' },
          rpc: { href: `${origin}/api/mcp/${s.id}`, method: 'POST' },
          exportVscode: { href: `${origin}/api/mcp/${s.id}/export/vscode`, method: 'GET' },
          exportOllama: { href: `${origin}/api/mcp/${s.id}/export/ollama`, method: 'GET' },
          exportOpenclaw: { href: `${origin}/api/mcp/${s.id}/export/openclaw`, method: 'GET' },
        },
      })),
      _links: {
        self: { href: `${origin}/api/mcp/servers`, method: 'GET' },
        root: { href: `${origin}/api`, method: 'GET' },
        unifiedRpc: { href: `${origin}/api/mcp`, method: 'POST' },
      },
    });
  });

  app.get('/api/mcp/:serverId/export/:client', (req, res) => {
    const origin = getOrigin(req);
    const serverId = req.params.serverId === 'all' ? undefined : (req.params.serverId as McpServerId);
    if (serverId && !VALID_MCP_SERVER_IDS.has(serverId)) {
      sendHal(res, 404, { error: `Unknown MCP server '${req.params.serverId}'.` });
      return;
    }
    const client = req.params.client as McpClientExportTarget;
    const exported = generateMcpExportForClient(client, origin || `http://localhost:${PORT}`, serverId);
    sendHal(res, 200, {
      client,
      serverId: serverId || 'all',
      ...exported,
      _links: {
        self: { href: `${origin}/api/mcp/${req.params.serverId}/export/${client}`, method: 'GET' },
        servers: { href: `${origin}/api/mcp/servers`, method: 'GET' },
      },
    });
  });

  app.post('/api/mcp/context', (req, res) => {
    const origin = getOrigin(req);
    const patch = (req.body || {}) as Partial<McpWorkspaceContext>;
    const updated = mcpRegistry.updateContext(patch);
    restStore.syncFromMcpPatch(patch as Record<string, unknown>);
    sendHal(res, 200, {
      ok: true,
      ...updated,
      _links: {
        root: { href: `${origin}/api`, method: 'GET' },
        nodes: { href: `${origin}/api/nodes`, method: 'GET' },
      },
    });
  });

  app.post('/api/mcp/cache/clear', (req, res) => {
    const origin = getOrigin(req);
    const rawId = req.body?.serverId;
    const serverId =
      typeof rawId === 'string' && VALID_MCP_SERVER_IDS.has(rawId as McpServerId)
        ? (rawId as McpServerId)
        : undefined;
    const cleared = mcpRegistry.clearCache(serverId);
    sendHal(res, 200, {
      ok: true,
      ...cleared,
      servers: mcpRegistry.getServerStatuses(),
      _links: { servers: { href: `${origin}/api/mcp/servers`, method: 'GET' } },
    });
  });

  app.post('/api/mcp', async (req, res) => {
    const body = req.body as McpJsonRpcRequest;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' },
      });
      return;
    }
    const rpcRes = await mcpRegistry.handleUnifiedJsonRpc(body);
    res.json(rpcRes);
  });

  app.get('/api/mcp/:serverId', (req, res) => {
    const origin = getOrigin(req);
    const serverId = req.params.serverId as McpServerId;
    if (!VALID_MCP_SERVER_IDS.has(serverId)) {
      sendHal(res, 404, {
        error: `Unknown MCP server '${req.params.serverId}'.`,
        available: Array.from(VALID_MCP_SERVER_IDS),
        _links: { servers: { href: `${origin}/api/mcp/servers`, method: 'GET' } },
      });
      return;
    }
    if (req.query.build === '1') {
      mcpRegistry.ensureBuilt(serverId);
    }
    const status = mcpRegistry.getServerStatuses().find((s) => s.id === serverId);
    sendHal(res, 200, {
      ...status,
      clientConfig: JSON.parse(generateMcpClientConfig(origin || `http://localhost:${PORT}`, serverId)),
      _links: {
        self: { href: `${origin}/api/mcp/${serverId}`, method: 'GET' },
        rpc: { href: `${origin}/api/mcp/${serverId}`, method: 'POST' },
        exportVscode: { href: `${origin}/api/mcp/${serverId}/export/vscode`, method: 'GET' },
        exportOllama: { href: `${origin}/api/mcp/${serverId}/export/ollama`, method: 'GET' },
        exportOpenclaw: { href: `${origin}/api/mcp/${serverId}/export/openclaw`, method: 'GET' },
        servers: { href: `${origin}/api/mcp/servers`, method: 'GET' },
      },
    });
  });

  app.post('/api/mcp/:serverId', async (req, res) => {
    const serverId = req.params.serverId as McpServerId;
    if (!VALID_MCP_SERVER_IDS.has(serverId)) {
      res.status(404).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32601,
          message: `Unknown MCP server '${req.params.serverId}'. Available: ${Array.from(VALID_MCP_SERVER_IDS).join(', ')}`,
        },
      });
      return;
    }

    const body = req.body as McpJsonRpcRequest;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' },
      });
      return;
    }

    const rpcRes = await mcpRegistry.handleJsonRpc(serverId, body);
    res.json(rpcRes);
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(503).send('Production bundle missing. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Grammar2JSON Studio (${isProd ? 'production' : 'development'}), REST/CRUD/HATEOAS API & Lazy MCP Servers listening on http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
