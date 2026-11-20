import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateMcpClientConfig,
  McpLazyServerRegistry,
  VALID_MCP_SERVER_IDS,
  type McpWorkspaceContext,
} from './src/engine/mcpServerEngine';
import type { McpJsonRpcRequest, McpServerId } from './src/types/studio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Single lazy registry: zero upfront builds; each MCP server builds on first call and caches by content hash.
  const mcpRegistry = new McpLazyServerRegistry();

  // CORS headers so external MCP clients / inspectors can reach Streamable HTTP endpoints cleanly
  app.use('/api/mcp', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // List all 10 lazy MCP Tool Servers & their cold/warm cache metrics (never forces a build)
  app.get('/api/mcp/servers', (_req, res) => {
    res.json({
      protocol: 'MCP 2025-03-26 (Streamable HTTP)',
      activation: 'build-on-call',
      caching: 'content-addressed-lru',
      servers: mcpRegistry.getServerStatuses(),
    });
  });

  // Sync active Studio workspace context into the lazy MCP registry (automatically invalidates stale hashes)
  app.post('/api/mcp/context', (req, res) => {
    const patch = (req.body || {}) as Partial<McpWorkspaceContext>;
    const updated = mcpRegistry.updateContext(patch);
    res.json({ ok: true, ...updated });
  });

  // Evict cached builds globally or for a specific serverId (resets target back to cold/lazy)
  app.post('/api/mcp/cache/clear', (req, res) => {
    const rawId = req.body?.serverId;
    const serverId =
      typeof rawId === 'string' && VALID_MCP_SERVER_IDS.has(rawId as McpServerId)
        ? (rawId as McpServerId)
        : undefined;
    const cleared = mcpRegistry.clearCache(serverId);
    res.json({ ok: true, ...cleared, servers: mcpRegistry.getServerStatuses() });
  });

  // Unified MCP JSON-RPC 2.0 endpoint exposing all targets via `<serverId>__<toolName>`
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

  // Per-target MCP manifest inspection (GET does not force build unless ?build=1)
  app.get('/api/mcp/:serverId', (req, res) => {
    const serverId = req.params.serverId as McpServerId;
    if (!VALID_MCP_SERVER_IDS.has(serverId)) {
      res.status(404).json({
        error: `Unknown MCP server '${req.params.serverId}'.`,
        available: Array.from(VALID_MCP_SERVER_IDS),
      });
      return;
    }
    if (req.query.build === '1') {
      mcpRegistry.ensureBuilt(serverId);
    }
    const status = mcpRegistry.getServerStatuses().find((s) => s.id === serverId);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({
      ...status,
      clientConfig: JSON.parse(generateMcpClientConfig(origin, serverId)),
    });
  });

  // Per-target Streamable HTTP MCP JSON-RPC 2.0 endpoint: builds on call & caches automatically
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

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Grammar2JSON Studio & Lazy MCP Tool Servers listening on http://localhost:${PORT}`);
  });
}

void startServer();
