import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'crypto';
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
  type LogicExportInputMode,
  type LogicExportTarget,
  type LogicLabelBinding,
} from './src/engine/logicLambdaEngine.ts';
import {
  assessCauchySequencingSafety,
  logicInputDiagnostic,
  normalizeLogicEvaluationInput,
} from './src/engine/logicInputNormalizer.ts';
import {
  generateMcpClientConfig,
  generateMcpExportForClient,
  generateOpenAiApiToolsManifest,
  McpLazyServerRegistry,
  VALID_MCP_SERVER_IDS,
  type McpClientExportTarget,
  type McpWorkspaceContext,
} from './src/engine/mcpServerEngine.ts';
import {
  buildAwsDeploymentBundle,
  buildAzureDeploymentBundle,
  computeMiddlewareEtag,
  createDefaultMiddlewareConfig,
  DEFAULT_SLUG_PATTERNS,
  DEFAULT_SLUG_ROUTES,
  DEFAULT_TEMPLATE_FRAGMENTS,
  DEFAULT_TEMPLATE_THEMES,
  isValidSlugName,
  isValidTemplateIdentifier,
  mergeMiddlewareConfigPatch,
  renderFragmentHtmlSafe,
} from './src/engine/middlewareConfigEngine.ts';
import { validateModule, type StudioModulePackage } from './src/engine/modulePackageEngine.ts';
import { evaluateMultilineBooleanProgram } from './src/engine/multilineBooleanEngine.ts';
import {
  DEFAULT_JSON_SCHEMA_SAMPLE,
  DEFAULT_TEST_INSTANCE_SAMPLE,
  evaluateSchemaPredicateStudio,
} from './src/engine/schemaPredicateEngine.ts';
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
const PRETTY_BASE_PATH = process.env.PRETTY_BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(PRETTY_BASE_PATH)) {
  throw new Error('PRETTY_BASE_PATH must be a slash-terminated path of letters, digits, hyphens, and underscores.');
}
const prettyPrefix = (origin: string) => `${origin}${PRETTY_BASE_PATH === '/' ? '' : PRETTY_BASE_PATH.slice(0, -1)}`;

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

interface SessionModuleRecord extends StudioModulePackage {
  updatedAt: string;
}

interface SessionContext {
  sessionId: string;
  restStore: RestHateoasEngineStore;
  mcpRegistry: McpLazyServerRegistry;
  modules: Map<string, SessionModuleRecord>;
  historyBundle: Record<string, unknown> | null;
  updatedAt: string;
}

const SESSION_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

export function createApiApp(): express.Express {
  const app = express();
  app.use('/api/logic/evaluate', express.text({ type: 'text/plain', limit: '5mb' }));
  app.use('/api/logic/evaluate', express.json({ strict: false, limit: '5mb' }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, service: 'grammar2json-studio' });
  });

  // Session-isolated registries + Middleware config kept in sync per session
  const sessions = new Map<string, SessionContext>();
  const sessionStorage = new AsyncLocalStorage<SessionContext>();
  const writeRateBuckets = new Map<string, number[]>();

  const buildMcpCtx = (rs: RestHateoasEngineStore) => ({
    grammarText: rs.workspace.grammarText,
    dialect: rs.workspace.dialect,
    schemaConfig: rs.workspace.schemaConfig,
    mutationPolicy: rs.workspace.mutationPolicy,
    mutations: rs.workspace.mutations,
    ruleConfigs: rs.workspace.ruleConfigs,
    evalRule: rs.workspace.evalRule,
    evalPayload: rs.workspace.evalPayload,
    logicStatement: rs.workspace.logicStatement,
    logicLabels: rs.workspace.logicLabels,
    dslSource: rs.workspace.dslSource,
  });

  const createSessionContext = (sessionId: string, cloneFrom?: SessionContext): SessionContext => {
    const rs = new RestHateoasEngineStore();
    const mcp = new McpLazyServerRegistry();
    const mods = new Map<string, SessionModuleRecord>();
    let historyBundle: Record<string, unknown> | null = null;
    if (cloneFrom) {
      rs.workspace = JSON.parse(JSON.stringify(cloneFrom.restStore.workspace));
      rs.callbacks = JSON.parse(JSON.stringify(cloneFrom.restStore.callbacks));
      rs.histolog = JSON.parse(JSON.stringify(cloneFrom.restStore.histolog));
      rs.workspaces = new Map(
        Array.from(cloneFrom.restStore.workspaces.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
      );
      mcp.updateContext(buildMcpCtx(rs));
      for (const [k, v] of cloneFrom.modules.entries()) {
        mods.set(k, JSON.parse(JSON.stringify(v)));
      }
      if (cloneFrom.historyBundle) {
        historyBundle = {
          ...JSON.parse(JSON.stringify(cloneFrom.historyBundle)),
          sessionId,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    return {
      sessionId,
      restStore: rs,
      mcpRegistry: mcp,
      modules: mods,
      historyBundle,
      updatedAt: new Date().toISOString(),
    };
  };

  const getOrCreateSession = (sessionId: string): SessionContext => {
    let ctx = sessions.get(sessionId);
    if (!ctx) {
      ctx = createSessionContext(sessionId);
      sessions.set(sessionId, ctx);
    }
    return ctx;
  };

  const defaultSession = getOrCreateSession('default');
  const currentSession = (): SessionContext => sessionStorage.getStore() ?? defaultSession;

  const wrapSessionProxy = <T extends object>(pick: (ctx: SessionContext) => T): T =>
    new Proxy({} as T, {
      get(_target, prop) {
        const target = pick(currentSession());
        const val = Reflect.get(target, prop, target);
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set(_target, prop, value) {
        const target = pick(currentSession());
        return Reflect.set(target, prop, value, target);
      },
    });

  const mcpRegistry = wrapSessionProxy((c) => c.mcpRegistry);
  const restStore = wrapSessionProxy((c) => c.restStore);
  let middlewareConfig = createDefaultMiddlewareConfig(process.env as Record<string, string | undefined>);
  let templateCacheEpoch = 1;
  const bumpTemplateCache = () => {
    templateCacheEpoch += 1;
  };

  const syncRestToMcp = () => {
    bumpTemplateCache();
    currentSession().updatedAt = new Date().toISOString();
    mcpRegistry.updateContext(buildMcpCtx(restStore));
  };

  const isStateMutatingApiRoute = (method: string, subPath: string): boolean => {
    if (['PUT', 'PATCH', 'DELETE'].includes(method)) return true;
    if (method !== 'POST') return false;
    return [
      '/rules', '/workspaces', '/callbacks', '/logic/labels',
      '/histolog', '/engine/clear', '/middleware/reset', '/modules',
      '/sessions', '/mcp/context', '/mcp/cache/clear',
    ].includes(subPath) || /^\/histolog\/\d+\/restore$/.test(subPath);
  };

  // Global API CORS + Session Binding + Optional Write Auth + Rate Limit + HATEOAS discovery headers
  app.use('/api', (req, res, next) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const reqOrigin = req.get('origin') || '';
    if (allowed.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (reqOrigin) {
      res.setHeader('Vary', 'Origin');
      if (allowed.includes(reqOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      } else {
        res.status(403).json({ ok: false, error: 'Origin not allowed by ALLOWED_ORIGINS.' });
        return;
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-API-Key, Mcp-Session-Id, X-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Link, Location, Allow, Retry-After, X-Session-Id');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const rawSid = req.get('x-session-id') ?? (typeof req.query.session === 'string' ? req.query.session : '');
    const sid = rawSid.trim() || 'default';
    if (sid !== 'default' && !SESSION_ID_REGEX.test(sid)) {
      res.status(400).json({ ok: false, error: 'Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.' });
      return;
    }
    res.setHeader('X-Session-Id', sid);

    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
      res.status(204).end();
      return;
    }

    const writeToken = process.env.GRAMMAR2JSON_WRITE_TOKEN || '';
    if (writeToken && isStateMutatingApiRoute(req.method, req.path)) {
      const auth = req.get('authorization') || '';
      const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || '';
      const apiKey = (req.get('x-api-key') || '').trim();
      const supplied = bearer || apiKey;
      const expectedBuf = Buffer.from(writeToken, 'utf8');
      const suppliedBuf = Buffer.from(supplied, 'utf8');
      if (!supplied || expectedBuf.length !== suppliedBuf.length || !crypto.timingSafeEqual(expectedBuf, suppliedBuf)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="grammar2json-studio"');
        res.status(401).json({
          ok: false,
          error: 'Write authentication required. Supply Authorization: Bearer <token> or X-API-Key.',
        });
        return;
      }
    }

    const rawMax = Number(process.env.GRAMMAR2JSON_RATE_LIMIT_MAX || '0');
    if (Number.isFinite(rawMax) && rawMax > 0 && isStateMutatingApiRoute(req.method, req.path)) {
      const key = `${req.ip || 'local'}:${sid}`;
      const now = Date.now();
      const windowTimes = (writeRateBuckets.get(key) || []).filter((t) => now - t < 60_000);
      if (windowTimes.length >= rawMax) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({ ok: false, error: 'Write rate limit exceeded. Try again shortly.' });
        return;
      }
      windowTimes.push(now);
      writeRateBuckets.set(key, windowTimes);
    }

    const ctx = getOrCreateSession(sid);
    sessionStorage.run(ctx, () => next());
  });

  /* ==========================================================================
   * 1. HATEOAS ROOT DISCOVERY & NODE / MEMBER-LEVEL REST CRUD ENDPOINTS
   * ======================================================================== */

  app.get('/api', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, restStore.buildRootDocument(origin, PRETTY_BASE_PATH));
  });

  // List all addressable nodes across the engine (each with mutable & non-mutable members)
  app.get('/api/nodes', (req, res) => {
    const origin = getOrigin(req);
    const kindFilter = typeof req.query.kind === 'string' ? req.query.kind : '';
    const allNodes = restStore.listAddressableNodes(origin, PRETTY_BASE_PATH);
    const prettyBase = prettyPrefix(origin);
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
        prettyNodeTemplate: { href: `${prettyBase}/nodes/{kind}/{nodeId}`, method: 'GET', templated: true },
        prettyMemberTemplate: { href: `${prettyBase}/nodes/{kind}/{nodeId}/members/{member}`, method: 'GET', templated: true },
        shortMemberTemplate: { href: `${prettyBase}/members/{member}?node={kind}/{nodeId}`, method: 'GET', templated: true },
      },
    });
  });

  // Inspect a single node with full mutable & immutable member map
  app.get('/api/nodes/:kind/:nodeId', (req, res) => {
    const origin = getOrigin(req);
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin, PRETTY_BASE_PATH);
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
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin, PRETTY_BASE_PATH);
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
    const node = restStore.getAddressableNode(req.params.kind, req.params.nodeId, origin, PRETTY_BASE_PATH);
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
    const node = restStore.getAddressableNode('rule', rule.name, origin, PRETTY_BASE_PATH);
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
    const cauchySafety = assessCauchySequencingSafety(req.body, normalized.input, restStore.workspace.cauchyConfig);
    const cauchyEval =
      cauchySafety.canEnable && cauchySafety.config
        ? evaluateCauchySequence(cauchySafety.config, labels)
        : undefined;
    sendHal(res, 200, {
      statement: stmt,
      ok: evalRes.ok,
      displayValue: evalRes.displayValue,
      valueType: evalRes.valueType,
      trace: evalRes.trace,
      error: evalRes.error,
      diagnostics: getLogicBindingDiagnostics(evalRes, labels),
      ...(cauchyEval
        ? {
            cauchyAutoEnabled: true,
            cauchyEvaluation: {
              ok: cauchyEval.ok,
              converged: cauchyEval.converged,
              cauchyIndexN: cauchyEval.cauchyIndexN,
              limitEstimate: cauchyEval.limitEstimate,
              resolvedParamNames: cauchyEval.resolvedParamNames,
            },
          }
        : restStore.workspace.cauchyConfig.enabled
          ? { cauchyAutoEnabled: false, cauchySkippedReason: cauchySafety.reason }
          : {}),
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

  app.post('/api/logic/multiline', (req, res) => {
    const origin = getOrigin(req);
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    if (
      (body.preInput !== undefined && typeof body.preInput !== 'string') ||
      (body.program !== undefined && typeof body.program !== 'string')
    ) {
      sendHal(res, 400, {
        ok: false,
        error: 'Fields preInput and program must be strings.',
        _links: { self: { href: `${origin}/api/logic/multiline`, method: 'POST' } },
      });
      return;
    }
    const preInput = typeof body.preInput === 'string' ? body.preInput : 'e=true';
    const program = typeof body.program === 'string' ? body.program : 'a(b,c)=b & c\nd=false\na(e,d)';
    const evalResult = evaluateMultilineBooleanProgram(preInput, program);
    sendHal(res, 200, {
      ...evalResult,
      _links: {
        self: { href: `${origin}/api/logic/multiline`, method: 'POST' },
        root: { href: `${origin}/api`, method: 'GET' },
      },
    });
  });

  app.post('/api/schema/predicate-tree', (req, res) => {
    const origin = getOrigin(req);
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const schemaInput =
      body.schema === undefined
        ? DEFAULT_JSON_SCHEMA_SAMPLE
        : typeof body.schema === 'string'
          ? body.schema
          : JSON.stringify(body.schema);
    const instanceInput =
      body.instance === undefined
        ? DEFAULT_TEST_INSTANCE_SAMPLE
        : typeof body.instance === 'string'
          ? body.instance
          : JSON.stringify(body.instance);
    const result = evaluateSchemaPredicateStudio(schemaInput, instanceInput);
    sendHal(res, 200, {
      ...result,
      _links: {
        self: { href: `${origin}/api/schema/predicate-tree`, method: 'POST' },
        root: { href: `${origin}/api`, method: 'GET' },
      },
    });
  });

  /* ==========================================================================
   * 4B. MODULE WORKBENCH DRAFTS & SESSION HISTORY SHARING CRUD
   * ======================================================================== */

  app.get('/api/modules', (req, res) => {
    const origin = getOrigin(req);
    const mods = Array.from(currentSession().modules.values()).map((mod) => ({
      ...mod,
      _links: { self: { href: `${origin}/api/modules/${encodeURIComponent(mod.manifest.id)}`, method: 'GET' } },
    }));
    sendHal(res, 200, {
      count: mods.length,
      modules: mods,
      _links: { self: { href: `${origin}/api/modules`, method: 'GET' }, root: { href: `${origin}/api`, method: 'GET' } },
    });
  });

  app.get('/api/modules/:id', (req, res) => {
    const origin = getOrigin(req);
    const mod = currentSession().modules.get(req.params.id);
    if (!mod) {
      sendHal(res, 404, { ok: false, error: `Module '${req.params.id}' not found.` });
      return;
    }
    sendHal(res, 200, {
      ...mod,
      _links: {
        self: { href: `${origin}/api/modules/${encodeURIComponent(mod.manifest.id)}`, method: 'GET' },
        collection: { href: `${origin}/api/modules`, method: 'GET' },
      },
    });
  });

  const handleSaveModule = (req: express.Request, res: express.Response, forcedId?: string) => {
    const origin = getOrigin(req);
    try {
      const body = req.body as StudioModulePackage;
      const pkg: StudioModulePackage = forcedId
        ? { ...body, manifest: { ...(body?.manifest || ({} as StudioModulePackage['manifest'])), id: forcedId } }
        : body;
      validateModule(pkg);
      const mods = currentSession().modules;
      const modId = pkg.manifest.id;
      if (mods.size >= 64 && !mods.has(modId)) {
        sendHal(res, 400, { ok: false, error: 'At most 64 stored modules are supported.' });
        return;
      }
      const record: SessionModuleRecord = {
        manifest: pkg.manifest,
        files: pkg.files,
        updatedAt: new Date().toISOString(),
      };
      mods.set(modId, record);
      const selfHref = `${origin}/api/modules/${encodeURIComponent(modId)}`;
      sendHal(
        res,
        forcedId ? 200 : 201,
        {
          ok: true,
          module: record,
          _links: { self: { href: selfHref, method: 'GET' }, collection: { href: `${origin}/api/modules`, method: 'GET' } },
        },
        forcedId ? undefined : { Location: selfHref }
      );
    } catch (error) {
      sendHal(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid module payload.' });
    }
  };
  app.post('/api/modules', (req, res) => handleSaveModule(req, res));
  app.put('/api/modules/:id', (req, res) => handleSaveModule(req, res, req.params.id));
  app.patch('/api/modules/:id', (req, res) => handleSaveModule(req, res, req.params.id));

  app.delete('/api/modules/:id', (req, res) => {
    const origin = getOrigin(req);
    const existed = currentSession().modules.delete(req.params.id);
    if (!existed) {
      sendHal(res, 404, { ok: false, error: `Module '${req.params.id}' not found.` });
      return;
    }
    sendHal(res, 200, {
      ok: true,
      deleted: req.params.id,
      _links: { collection: { href: `${origin}/api/modules`, method: 'GET' } },
    });
  });

  app.get('/api/sessions', (req, res) => {
    const origin = getOrigin(req);
    const cur = currentSession();
    const list = Array.from(sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      updatedAt: s.updatedAt,
      hasHistory: Boolean(s.historyBundle),
      _links: {
        self: { href: `${origin}/api/sessions/${encodeURIComponent(s.sessionId)}`, method: 'GET' },
        share: { href: `${origin}/?session=${encodeURIComponent(s.sessionId)}`, method: 'GET' },
      },
    }));
    sendHal(res, 200, {
      ok: true,
      count: list.length,
      currentSessionId: cur.sessionId,
      sessions: list,
      _links: { self: { href: `${origin}/api/sessions`, method: 'GET' }, root: { href: `${origin}/api`, method: 'GET' } },
    });
  });

  app.post('/api/sessions', (req, res) => {
    const origin = getOrigin(req);
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const requestedId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : '';
    const newId = requestedId || `s_${crypto.randomBytes(8).toString('hex')}`;
    if (newId !== 'default' && !SESSION_ID_REGEX.test(newId)) {
      sendHal(res, 400, { ok: false, error: 'Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.' });
      return;
    }
    const sourceRaw = typeof body.sourceSessionId === 'string' && body.sourceSessionId.trim() ? body.sourceSessionId.trim() : '';
    if (sourceRaw && sourceRaw !== 'default' && !SESSION_ID_REGEX.test(sourceRaw)) {
      sendHal(res, 400, { ok: false, error: 'Invalid sourceSessionId.' });
      return;
    }
    const sourceCtx = sourceRaw ? sessions.get(sourceRaw) : undefined;
    const nextCtx = createSessionContext(newId, sourceCtx);
    sessions.set(newId, nextCtx);
    const selfHref = `${origin}/api/sessions/${encodeURIComponent(newId)}`;
    sendHal(
      res,
      201,
      {
        ok: true,
        sessionId: newId,
        clonedFrom: sourceRaw || null,
        shareQuery: `?session=${encodeURIComponent(newId)}`,
        shareUrl: `${origin}/?session=${encodeURIComponent(newId)}`,
        _links: { self: { href: selfHref, method: 'GET' }, collection: { href: `${origin}/api/sessions`, method: 'GET' } },
      },
      { Location: selfHref }
    );
  });

  app.get('/api/sessions/:id', (req, res) => {
    const origin = getOrigin(req);
    const sid = req.params.id.trim();
    if (sid !== 'default' && !SESSION_ID_REGEX.test(sid)) {
      sendHal(res, 400, { ok: false, error: 'Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.' });
      return;
    }
    const ctx = sessions.get(sid);
    sendHal(res, 200, {
      ok: true,
      exists: Boolean(ctx?.historyBundle),
      sessionId: sid,
      updatedAt: ctx?.historyBundle ? ctx.updatedAt : null,
      bundle: ctx?.historyBundle ?? null,
      _links: {
        self: { href: `${origin}/api/sessions/${encodeURIComponent(sid)}`, method: 'GET' },
        collection: { href: `${origin}/api/sessions`, method: 'GET' },
      },
    });
  });

  app.put('/api/sessions/:id', (req, res) => {
    const origin = getOrigin(req);
    const sid = req.params.id.trim();
    if (sid !== 'default' && !SESSION_ID_REGEX.test(sid)) {
      sendHal(res, 400, { ok: false, error: 'Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.' });
      return;
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      sendHal(res, 400, { ok: false, error: 'Session payload must be a JSON object.' });
      return;
    }
    const raw = req.body as Record<string, unknown>;
    const inner = raw.bundle && typeof raw.bundle === 'object' && !Array.isArray(raw.bundle)
      ? (raw.bundle as Record<string, unknown>)
      : raw;
    const ctx = getOrCreateSession(sid);
    const now = new Date().toISOString();
    ctx.historyBundle = { ...inner, sessionId: sid, updatedAt: now };
    ctx.updatedAt = now;
    sendHal(res, 200, {
      ok: true,
      sessionId: sid,
      updatedAt: now,
      shareUrl: `${origin}/?session=${encodeURIComponent(sid)}`,
      _links: {
        self: { href: `${origin}/api/sessions/${encodeURIComponent(sid)}`, method: 'GET' },
        collection: { href: `${origin}/api/sessions`, method: 'GET' },
      },
    });
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const origin = getOrigin(req);
    const sid = req.params.id.trim();
    if (sid !== 'default' && !SESSION_ID_REGEX.test(sid)) {
      sendHal(res, 400, { ok: false, error: 'Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.' });
      return;
    }
    sessions.delete(sid);
    if (sid === 'default') {
      sessions.set('default', createSessionContext('default'));
    }
    sendHal(res, 200, {
      ok: true,
      deleted: sid,
      _links: { collection: { href: `${origin}/api/sessions`, method: 'GET' } },
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

  const handleUpdateWorkspace = (req: express.Request, res: express.Response) => {
    const origin = getOrigin(req);
    const id = req.params.id;
    const base = restStore.workspaces.get(id) ?? restStore.workspace;
    const patch = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const updated = {
      ...base,
      ...patch,
      id,
      name: typeof patch.name === 'string' && patch.name.trim() ? patch.name : base.name || id,
      updatedAt: new Date().toISOString(),
    };
    restStore.workspaces.set(id, updated);
    if (id === 'default') {
      restStore.workspace = updated;
      syncRestToMcp();
    }
    sendHal(res, 200, {
      ok: true,
      workspace: updated,
      _links: { self: { href: `${origin}/api/workspaces/${encodeURIComponent(id)}`, method: 'GET' } },
    });
  };
  app.put('/api/workspaces/:id', handleUpdateWorkspace);
  app.patch('/api/workspaces/:id', handleUpdateWorkspace);

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
    const rawMode = typeof req.query.mode === 'string' ? req.query.mode.toLowerCase() : 'cli';
    const inputMode: LogicExportInputMode = rawMode === 'hardcoded' ? 'hardcoded' : 'cli';
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
      const exported = restStore.exportLogic(lang, inputMode);
      sendHal(res, 200, {
        language: lang,
        inputMode,
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
          exportFoundry: { href: `${origin}/api/mcp/${s.id}/export/foundry`, method: 'GET' },
          exportOpenai: { href: `${origin}/api/mcp/${s.id}/export/openai`, method: 'GET' },
          exportAwsBedrock: { href: `${origin}/api/mcp/${s.id}/export/aws_bedrock`, method: 'GET' },
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

  /* ==========================================================================
   * 7. OPENAI TOOLS & FULL API BASE BRIDGE
   * ======================================================================== */

  app.get('/api/openai/tools', (req, res) => {
    const origin = getOrigin(req);
    const scopeRaw = String(req.query.scope || 'all').toLowerCase();
    const scope = scopeRaw === 'mcp' || scopeRaw === 'api' ? scopeRaw : 'all';
    const formatRaw = String(req.query.format || 'responses').toLowerCase();
    const format = formatRaw === 'chat_completions' ? 'chat_completions' : 'responses';
    const serverParam = typeof req.query.serverId === 'string' && VALID_MCP_SERVER_IDS.has(req.query.serverId as McpServerId)
      ? (req.query.serverId as McpServerId)
      : undefined;
    const manifest = generateOpenAiApiToolsManifest(origin || `http://localhost:${PORT}`, {
      scope,
      format,
      serverId: serverParam,
    });
    sendHal(res, 200, {
      ...manifest,
      _links: {
        self: { href: `${origin}/api/openai/tools`, method: 'GET' },
        execute: { href: `${origin}/api/openai/tools/execute`, method: 'POST' },
        mcpServers: { href: `${origin}/api/mcp/servers`, method: 'GET' },
        root: { href: `${origin}/api`, method: 'GET' },
      },
    });
  });

  app.post('/api/openai/tools/execute', async (req, res) => {
    const origin = getOrigin(req);
    const rawBody = req.body as Record<string, unknown> | undefined;
    const calls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    if (Array.isArray(rawBody?.tool_calls)) {
      for (const tc of rawBody.tool_calls as Array<Record<string, unknown>>) {
        const fn = (tc.function as Record<string, unknown> | undefined) ?? tc;
        const name = String(fn?.name || '');
        let args: Record<string, unknown> = {};
        if (typeof fn?.arguments === 'string' && fn.arguments.trim()) {
          try { args = JSON.parse(fn.arguments) as Record<string, unknown>; } catch { args = {}; }
        } else if (fn?.arguments && typeof fn.arguments === 'object') {
          args = fn.arguments as Record<string, unknown>;
        }
        calls.push({ id: String(tc.id || `call_${calls.length + 1}`), name, args });
      }
    } else if (typeof rawBody?.name === 'string') {
      const args = typeof rawBody.arguments === 'string'
        ? (() => { try { return JSON.parse(rawBody.arguments) as Record<string, unknown>; } catch { return {}; } })()
        : ((rawBody.arguments as Record<string, unknown>) || {});
      calls.push({ id: String(rawBody.tool_call_id || 'call_1'), name: rawBody.name, args });
    } else {
      sendHal(res, 400, { ok: false, error: 'Provide either { "name", "arguments" } or { "tool_calls": [...] }.' });
      return;
    }

    const executeOne = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      // 1. Unified MCP tool (serverId__toolName)
      if (name.includes('__')) {
        const rpc = await mcpRegistry.handleUnifiedJsonRpc({
          jsonrpc: '2.0',
          id: name,
          method: 'tools/call',
          params: { name, arguments: args },
        });
        if (rpc.error) return { ok: false, error: rpc.error.message };
        return rpc.result;
      }
      // 2. REST API base tools
      switch (name) {
        case 'api_discover_root':
          return restStore.buildRootDocument(origin, middlewareConfig.frontend.prettyBasePath);
        case 'api_list_rules':
          return { count: restStore.getRules().length, rules: restStore.getRules() };
        case 'api_create_rule': {
          const r = restStore.createRule(String(args.name || ''), String(args.expression || ''));
          if (r.ok) syncRestToMcp();
          return r;
        }
        case 'api_update_rule': {
          const r = restStore.updateRule(String(args.name || ''), {
            name: typeof args.newName === 'string' ? args.newName : undefined,
            expression: typeof args.expression === 'string' ? args.expression : undefined,
          });
          if (r.ok) syncRestToMcp();
          return r;
        }
        case 'api_delete_rule': {
          const r = restStore.deleteRule(String(args.name || ''));
          if (r.ok) syncRestToMcp();
          return r;
        }
        case 'api_list_symbols':
          return { symbols: restStore.getGraph().symbolRegistry ?? [] };
        case 'api_list_nodes': {
          const all = restStore.listAddressableNodes(origin, middlewareConfig.frontend.prettyBasePath);
          const kind = typeof args.kind === 'string' ? args.kind : '';
          return { nodes: kind ? all.filter((n) => n.kind === kind) : all };
        }
        case 'api_mutate_node_member': {
          const out = restStore.mutateNodeMember(
            String(args.kind || ''),
            String(args.nodeId || ''),
            String(args.member || ''),
            'update',
            args.value,
            origin
          );
          if (out.status === 200) syncRestToMcp();
          return out.body;
        }
        case 'api_evaluate_grammar':
          return restStore.evaluatePayload(
            typeof args.rule === 'string' ? args.rule : undefined,
            typeof args.payload === 'string' ? args.payload : undefined
          );
        case 'api_get_logic':
          return {
            statement: restStore.workspace.logicStatement,
            labels: restStore.workspace.logicLabels,
            cauchyConfig: restStore.workspace.cauchyConfig,
            evaluation: evaluateLogicStatement(restStore.workspace.logicStatement, restStore.workspace.logicLabels),
          };
        case 'api_evaluate_logic': {
          const norm = normalizeLogicEvaluationInput(args, {
            statement: restStore.workspace.logicStatement,
            labels: restStore.workspace.logicLabels,
          });
          if (!norm.ok) return { ok: false, error: norm.error };
          return evaluateLogicStatement(norm.input.statement, norm.input.labels);
        }
        case 'api_evaluate_cauchy':
          return evaluateCauchySequence(
            { ...restStore.workspace.cauchyConfig, enabled: true, ...(args as Partial<CauchySequenceConfig>) },
            restStore.workspace.logicLabels
          );
        case 'api_export_workspace':
          return restStore.exportWorkspace((String(args.language || 'jsonld')) as ExportLanguage);
        case 'api_export_logic': {
          const lang = String(args.language || 'python') as LogicExportTarget;
          const mode = args.mode === 'hardcoded' ? 'hardcoded' : 'cli';
          return restStore.exportLogic(lang, mode);
        }
        case 'api_evaluate_multiline_logic':
          return evaluateMultilineBooleanProgram(
            typeof args.preInput === 'string' ? args.preInput : 'e=true',
            typeof args.program === 'string' ? args.program : 'a(b,c)=b & c\nd=false\na(e,d)'
          );
        case 'api_compile_schema_predicate_tree':
          return evaluateSchemaPredicateStudio(
            args.schema === undefined
              ? DEFAULT_JSON_SCHEMA_SAMPLE
              : typeof args.schema === 'string'
                ? args.schema
                : JSON.stringify(args.schema),
            args.instance === undefined
              ? DEFAULT_TEST_INSTANCE_SAMPLE
              : typeof args.instance === 'string'
                ? args.instance
                : JSON.stringify(args.instance)
          );
        case 'api_list_modules': {
          const list = Array.from(currentSession().modules.values());
          return { count: list.length, modules: list };
        }
        case 'api_list_callbacks':
          return { count: restStore.callbacks.length, callbacks: restStore.callbacks };
        case 'api_list_histolog':
          return { index: restStore.getHistologIndex(), generations: restStore.histolog };
        case 'api_list_workspaces':
          return { workspaces: Array.from(restStore.workspaces.values()).map((w) => ({ id: w.id, name: w.name, updatedAt: w.updatedAt })) };
        case 'api_get_middleware_config':
          return middlewareConfig;
        case 'api_update_middleware_config': {
          const merged = mergeMiddlewareConfigPatch(middlewareConfig, args);
          if (!merged.ok) return merged;
          middlewareConfig = merged.state;
          bumpTemplateCache();
          return { ok: true, config: middlewareConfig };
        }
        default:
          return { ok: false, error: `Unknown OpenAI tool '${name}'.` };
      }
    };

    const toolMessages = [];
    for (const call of calls) {
      const output = await executeOne(call.name, call.args);
      toolMessages.push({
        tool_call_id: call.id,
        role: 'tool',
        name: call.name,
        content: JSON.stringify(output),
        parsed: output,
      });
    }

    sendHal(res, 200, {
      ok: true,
      count: toolMessages.length,
      messages: toolMessages,
      _links: {
        self: { href: `${origin}/api/openai/tools/execute`, method: 'POST' },
        tools: { href: `${origin}/api/openai/tools`, method: 'GET' },
      },
    });
  });

  /* ==========================================================================
   * 8. MIDDLEWARE MANAGEMENT SUITE (TEMPLATES, SLUGS, FRONT-END, AZURE/AWS)
   * ======================================================================== */

  app.get('/api/middleware/config', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      ...middlewareConfig,
      cacheEpoch: templateCacheEpoch,
      defaults: {
        templates: DEFAULT_TEMPLATE_THEMES,
        fragments: DEFAULT_TEMPLATE_FRAGMENTS,
        slugRoutes: DEFAULT_SLUG_ROUTES,
        slugPatterns: DEFAULT_SLUG_PATTERNS,
      },
      cloudBundles: {
        azure: buildAzureDeploymentBundle(middlewareConfig.frontend.azure, origin || `http://localhost:${PORT}`),
        aws: buildAwsDeploymentBundle(middlewareConfig.frontend.aws, origin || `http://localhost:${PORT}`),
      },
      _links: {
        self: { href: `${origin}/api/middleware/config`, method: 'GET' },
        slugs: { href: `${origin}/api/middleware/slugs`, method: 'GET' },
        templates: { href: `${origin}/api/middleware/templates`, method: 'GET' },
        frontend: { href: `${origin}/api/middleware/frontend`, method: 'GET' },
        reset: { href: `${origin}/api/middleware/reset`, method: 'POST' },
      },
    });
  });

  const handleMiddlewareUpdate = (req: express.Request, res: express.Response) => {
    const origin = getOrigin(req);
    const merged = mergeMiddlewareConfigPatch(middlewareConfig, (req.body || {}) as Record<string, unknown>);
    if (!merged.ok) {
      sendHal(res, 400, { ok: false, error: merged.error });
      return;
    }
    middlewareConfig = merged.state;
    bumpTemplateCache();
    sendHal(res, 200, {
      ok: true,
      cacheEpoch: templateCacheEpoch,
      config: middlewareConfig,
      _links: { self: { href: `${origin}/api/middleware/config`, method: 'GET' } },
    });
  };
  app.put('/api/middleware/config', handleMiddlewareUpdate);
  app.patch('/api/middleware/config', handleMiddlewareUpdate);

  app.get('/api/middleware/slugs', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      prettyBasePath: middlewareConfig.frontend.prettyBasePath,
      slugRoutes: middlewareConfig.slugRoutes,
      slugPatterns: middlewareConfig.slugPatterns,
      hardcodedDefaults: { slugRoutes: DEFAULT_SLUG_ROUTES, slugPatterns: DEFAULT_SLUG_PATTERNS },
      _links: { self: { href: `${origin}/api/middleware/slugs`, method: 'GET' }, config: { href: `${origin}/api/middleware/config`, method: 'GET' } },
    });
  });

  app.put('/api/middleware/slugs/:slug', (req, res) => {
    const origin = getOrigin(req);
    const slug = req.params.slug;
    if (!isValidSlugName(slug)) {
      sendHal(res, 400, { ok: false, error: `Invalid slug '${slug}'.` });
      return;
    }
    const merged = mergeMiddlewareConfigPatch(middlewareConfig, {
      slugRoutes: { [slug]: { ...(req.body || {}), slug } },
    });
    if (!merged.ok) {
      sendHal(res, 400, { ok: false, error: merged.error });
      return;
    }
    middlewareConfig = merged.state;
    bumpTemplateCache();
    sendHal(res, 200, {
      ok: true,
      slug: middlewareConfig.slugRoutes[slug],
      _links: { self: { href: `${origin}/api/middleware/slugs/${encodeURIComponent(slug)}`, method: 'GET' } },
    });
  });

  app.delete('/api/middleware/slugs/:slug', (req, res) => {
    const origin = getOrigin(req);
    const slug = req.params.slug;
    if (!middlewareConfig.slugRoutes[slug]) {
      sendHal(res, 404, { ok: false, error: `Slug '${slug}' not found.` });
      return;
    }
    if (DEFAULT_SLUG_ROUTES[slug]) {
      middlewareConfig.slugRoutes[slug] = { ...DEFAULT_SLUG_ROUTES[slug] };
    } else {
      delete middlewareConfig.slugRoutes[slug];
    }
    middlewareConfig.version += 1;
    middlewareConfig.updatedAt = new Date().toISOString();
    bumpTemplateCache();
    sendHal(res, 200, {
      ok: true,
      slug,
      restoredDefault: Boolean(DEFAULT_SLUG_ROUTES[slug]),
      _links: { slugs: { href: `${origin}/api/middleware/slugs`, method: 'GET' } },
    });
  });

  app.get('/api/middleware/templates', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      cacheEpoch: templateCacheEpoch,
      templates: middlewareConfig.templates,
      fragments: middlewareConfig.fragments,
      hardcodedDefaults: { templates: DEFAULT_TEMPLATE_THEMES, fragments: DEFAULT_TEMPLATE_FRAGMENTS },
      _links: { self: { href: `${origin}/api/middleware/templates`, method: 'GET' } },
    });
  });

  app.get('/api/middleware/frontend', (req, res) => {
    const origin = getOrigin(req);
    sendHal(res, 200, {
      frontend: middlewareConfig.frontend,
      cloudBundles: {
        azure: buildAzureDeploymentBundle(middlewareConfig.frontend.azure, origin || `http://localhost:${PORT}`),
        aws: buildAwsDeploymentBundle(middlewareConfig.frontend.aws, origin || `http://localhost:${PORT}`),
      },
      _links: { self: { href: `${origin}/api/middleware/frontend`, method: 'GET' } },
    });
  });

  app.post('/api/middleware/reset', (req, res) => {
    const origin = getOrigin(req);
    const branch = String(req.body?.branch || 'all');
    const defaults = createDefaultMiddlewareConfig(process.env as Record<string, string | undefined>);
    if (branch === 'slugs') {
      middlewareConfig.slugRoutes = defaults.slugRoutes;
      middlewareConfig.slugPatterns = defaults.slugPatterns;
    } else if (branch === 'templates') {
      middlewareConfig.templates = defaults.templates;
      middlewareConfig.fragments = defaults.fragments;
    } else if (branch === 'frontend') {
      middlewareConfig.frontend = defaults.frontend;
    } else {
      middlewareConfig = defaults;
    }
    middlewareConfig.version += 1;
    middlewareConfig.updatedAt = new Date().toISOString();
    bumpTemplateCache();
    sendHal(res, 200, {
      ok: true,
      resetBranch: branch,
      cacheEpoch: templateCacheEpoch,
      config: middlewareConfig,
      _links: { self: { href: `${origin}/api/middleware/config`, method: 'GET' } },
    });
  });

  app.get('/api/templates', (req, res) => {
    const requested = typeof req.query.template === 'string' && req.query.template ? req.query.template : middlewareConfig.frontend.defaultTemplate;
    if (!isValidTemplateIdentifier(requested) || !middlewareConfig.templates[requested]) {
      res.status(400).json({ error: 'Unknown HTML template name.' });
      return;
    }
    res.status(200).json({
      template: requested,
      templates: Object.keys(middlewareConfig.templates),
      fragments: Object.keys(middlewareConfig.fragments),
      cacheEpoch: templateCacheEpoch,
    });
  });

  // Hardened /template/:template/:fragment with allowlist validation + ETag 304 for text/plain & text/html
  const handleTemplateFragmentRoute = (req: express.Request, res: express.Response) => {
    const templateName = req.params.template;
    const fragmentName = req.params.fragment;
    if (!isValidTemplateIdentifier(templateName) || !isValidTemplateIdentifier(fragmentName)) {
      res.status(404).end();
      return;
    }
    const tpl = middlewareConfig.templates[templateName];
    const frag = middlewareConfig.fragments[fragmentName];
    if (!tpl || !frag) {
      res.status(404).end();
      return;
    }
    res.setHeader('Vary', 'Accept');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const accept = (req.get('accept') || 'text/html').toLowerCase();
    const wantsPlain = accept.includes('text/plain') && !accept.includes('text/html');
    const wantsHtml = accept.includes('text/html') || accept.includes('text/*') || accept.includes('*/*') || accept === '';
    if (!wantsPlain && !wantsHtml) {
      res.status(406).setHeader('Cache-Control', 'no-store').end();
      return;
    }

    if (wantsPlain) {
      const etag = computeMiddlewareEtag(['plain', templateCacheEpoch, templateName, fragmentName, frag.markup]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('ETag', etag);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if ((req.get('if-none-match') || '').trim() === etag) {
        res.status(304).end();
        return;
      }
      res.status(200).send(req.method === 'HEAD' ? '' : frag.markup);
      return;
    }

    const rawValues = req.method === 'POST' ? (req.body && typeof req.body === 'object' ? req.body : {}) : req.query;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawValues as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        values[k] = String(v);
      }
    }
    const html = renderFragmentHtmlSafe(frag.markup, values);
    const etag = computeMiddlewareEtag(['html', templateCacheEpoch, templateName, fragmentName, html]);
    res.setHeader('ETag', etag);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', req.method === 'POST' ? 'private, no-store' : 'private, no-cache');
    if (req.method !== 'POST' && (req.get('if-none-match') || '').trim() === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(req.method === 'HEAD' ? '' : html);
  };
  app.all('/template/:template/:fragment', (req, res) => {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      res.status(405).end();
      return;
    }
    handleTemplateFragmentRoute(req, res);
  });

  // Pretty slug redirects honoring PRETTY_BASE_PATH
  const basePrefix = PRETTY_BASE_PATH === '/' ? '' : PRETTY_BASE_PATH.slice(0, -1);
  app.all(`${basePrefix}/nodes/:kind/:nodeId/members/:member`, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(
      307,
      `${basePrefix}/api/nodes/${encodeURIComponent(req.params.kind)}/${encodeURIComponent(req.params.nodeId)}/members/${encodeURIComponent(req.params.member)}`
    );
  });
  app.all(`${basePrefix}/nodes/:kind/:nodeId`, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(
      307,
      `${basePrefix}/api/nodes/${encodeURIComponent(req.params.kind)}/${encodeURIComponent(req.params.nodeId)}`
    );
  });
  app.all(`${basePrefix}/members/:member`, (req, res) => {
    const nodeParam = typeof req.query.node === 'string' ? req.query.node : '';
    const parts = nodeParam.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      res.status(400).json({ error: 'The short member URL requires ?node=kind/nodeId.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(
      307,
      `${basePrefix}/api/nodes/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/members/${encodeURIComponent(req.params.member)}`
    );
  });

  return app;
}

async function startServer() {
  const app = createApiApp();

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

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
