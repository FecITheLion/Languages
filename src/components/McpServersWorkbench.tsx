import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Play,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import {
  generateMcpExportForClient,
  generateStandaloneMcpScript,
  MCP_CLIENT_EXPORT_TARGETS,
  MCP_SERVER_DESCRIPTORS,
  McpLazyServerRegistry,
  type McpClientExportTarget,
  type McpWorkspaceContext,
} from '../engine/mcpServerEngine';
import { DocTooltip } from './DocTooltip';
import { HtmlCodeOutput } from './HtmlCodeOutput';
import type {
  McpJsonRpcResponse,
  McpServerId,
  McpServerStatus,
  PipelineGridMode,
  PipelineStage,
  TopView,
  WorkflowSlug,
} from '../types/studio';

export interface PipelineMcpUiEffect {
  topView?: TopView;
  activePage?: WorkflowSlug;
  stageFilter?: 'all' | PipelineStage;
  verifiedSteps?: WorkflowSlug[];
  dslSource?: string;
  pipelineLayoutMode?: PipelineGridMode;
}

interface McpServersWorkbenchProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  gridClass: string;
  primarySpan: string;
  secondarySpan: string;
  workspaceContext: McpWorkspaceContext;
  initialServerId?: McpServerId;
  onPipelineMcpEffect?: (effect: PipelineMcpUiEffect) => void;
  onExportTextFile: (content: string, filename: string, mime: string) => void;
  onNotify: (msg: string) => void;
}

export function McpServersWorkbench({
  onSubmitArtifacts,
  gridClass,
  primarySpan,
  secondarySpan,
  workspaceContext,
  initialServerId = 'pipeline',
  onPipelineMcpEffect,
  onExportTextFile,
  onNotify,
}: McpServersWorkbenchProps) {
  // Local fallback registry in case the frontend runs statically without Express /api/mcp
  const fallbackRegistryRef = useRef<McpLazyServerRegistry | null>(null);
  if (!fallbackRegistryRef.current) {
    fallbackRegistryRef.current = new McpLazyServerRegistry(workspaceContext);
  }

  const initialDesc =
    MCP_SERVER_DESCRIPTORS.find((d) => d.id === initialServerId) || MCP_SERVER_DESCRIPTORS[0];

  const [transportMode, setTransportMode] = useState<'http' | 'local'>('http');
  const [servers, setServers] = useState<McpServerStatus[]>(() =>
    fallbackRegistryRef.current!.getServerStatuses()
  );
  const [selectedServerId, setSelectedServerId] = useState<McpServerId>(initialDesc.id);
  const [selectedToolName, setSelectedToolName] = useState<string>(initialDesc.tools[0].name);
  const [argsJson, setArgsJson] = useState<string>(
    JSON.stringify(initialDesc.tools[0].sampleArgs, null, 2)
  );
  const [bypassCache, setBypassCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'invoke' | 'config' | 'export'>('invoke');
  const [scriptLang, setScriptLang] = useState<'typescript' | 'python'>('typescript');
  const [configScope, setConfigScope] = useState<'single' | 'all'>('single');
  const [rpcOutput, setRpcOutput] = useState<McpJsonRpcResponse | null>(null);
  const [lastCallMeta, setLastCallMeta] = useState<{
    cache: string;
    builtOnThisCall: boolean;
    durationMs: number;
    cacheKey?: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId) || servers[0],
    [servers, selectedServerId]
  );

  const selectedTool = useMemo(
    () =>
      selectedServer?.tools.find((t) => t.name === selectedToolName) ||
      selectedServer?.tools[0] ||
      null,
    [selectedServer, selectedToolName]
  );

  // Sync workspace context to both HTTP backend and local fallback registry
  const refreshStatuses = useCallback(async () => {
    fallbackRegistryRef.current!.updateContext(workspaceContext);
    try {
      const res = await fetch('/api/mcp/servers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { servers?: McpServerStatus[] };
      if (Array.isArray(data.servers)) {
        setServers(data.servers);
        setTransportMode('http');
        return;
      }
    } catch {
      setTransportMode('local');
      setServers(fallbackRegistryRef.current!.getServerStatuses());
    }
  }, [workspaceContext]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  // Sync external server selection (e.g. clicking /api/mcp/pipeline from Breadcrumbs or Pipeline Grid)
  useEffect(() => {
    const desc = MCP_SERVER_DESCRIPTORS.find((d) => d.id === initialServerId);
    if (!desc) return;
    setSelectedServerId(desc.id);
    const firstTool = desc.tools[0];
    if (firstTool) {
      setSelectedToolName(firstTool.name);
      setArgsJson(JSON.stringify(firstTool.sampleArgs, null, 2));
    }
  }, [initialServerId]);

  const handleSelectServer = (id: McpServerId) => {
    setSelectedServerId(id);
    const desc = MCP_SERVER_DESCRIPTORS.find((d) => d.id === id);
    const firstTool = desc?.tools[0];
    if (firstTool) {
      setSelectedToolName(firstTool.name);
      setArgsJson(JSON.stringify(firstTool.sampleArgs, null, 2));
    }
    setRpcOutput(null);
    setLastCallMeta(null);
  };

  const handleSelectTool = (toolName: string) => {
    setSelectedToolName(toolName);
    const t = selectedServer?.tools.find((item) => item.name === toolName);
    if (t) {
      setArgsJson(JSON.stringify(t.sampleArgs, null, 2));
    }
  };

  const sendJsonRpc = async (
    method: 'initialize' | 'tools/list' | 'tools/call' | 'resources/list' | 'resources/read',
    params?: Record<string, unknown>
  ) => {
    setBusy(true);
    const requestPayload = {
      jsonrpc: '2.0' as const,
      id: Date.now(),
      method,
      params,
    };

    try {
      let rpcRes: McpJsonRpcResponse;
      try {
        const res = await fetch(`/api/mcp/${selectedServerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(requestPayload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rpcRes = (await res.json()) as McpJsonRpcResponse;
        setTransportMode('http');
      } catch {
        setTransportMode('local');
        fallbackRegistryRef.current!.updateContext(workspaceContext);
        rpcRes = await fallbackRegistryRef.current!.handleJsonRpc(selectedServerId, requestPayload);
      }

      setRpcOutput(rpcRes);
      const resultObj = (rpcRes.result || {}) as Record<string, unknown>;
      const meta = (resultObj._meta || {}) as Record<string, unknown>;
      setLastCallMeta({
        cache: String(meta.cache || (meta.builtOnThisCall ? 'BUILT' : 'WARM')),
        builtOnThisCall: Boolean(meta.builtOnThisCall),
        durationMs: Number(meta.durationMs ?? meta.buildDurationMs ?? 0),
        cacheKey: typeof meta.cacheKey === 'string' ? meta.cacheKey : undefined,
      });

      // Apply live UI effects when mutating tools are invoked on /api/mcp/pipeline
      const structured = resultObj.structuredContent as Record<string, unknown> | undefined;
      if (
        selectedServerId === 'pipeline' &&
        structured &&
        structured.uiEffect &&
        typeof structured.uiEffect === 'object' &&
        onPipelineMcpEffect
      ) {
        onPipelineMcpEffect(structured.uiEffect as PipelineMcpUiEffect);
      }

      await refreshStatuses();
    } catch (err) {
      setRpcOutput({
        jsonrpc: '2.0',
        id: requestPayload.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'MCP invocation failed.',
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleInvokeTool = async () => {
    if (!selectedTool) return;
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    } catch {
      onNotify('Fix JSON syntax in Tool Arguments before calling.');
      return;
    }
    if (bypassCache) {
      parsedArgs._bypassCache = true;
    }
    await sendJsonRpc('tools/call', {
      name: selectedTool.name,
      arguments: parsedArgs,
    });
  };

  const handleClearCache = async (serverId?: McpServerId) => {
    setBusy(true);
    try {
      try {
        const res = await fetch('/api/mcp/cache/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverId ? { serverId } : {}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { servers?: McpServerStatus[] };
        if (Array.isArray(data.servers)) setServers(data.servers);
      } catch {
        fallbackRegistryRef.current!.clearCache(serverId);
        setServers(fallbackRegistryRef.current!.getServerStatuses());
      }
      setLastCallMeta(null);
      onNotify(
        serverId
          ? `Cleared cache for /api/mcp/${serverId} (reset to cold build-on-call).`
          : `Cleared all MCP server caches (all ${servers.length} servers reset to cold).`
      );
    } finally {
      setBusy(false);
    }
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const [clientExportTarget, setClientExportTarget] = useState<McpClientExportTarget>('vscode');

  const mcpClientExport = useMemo(
    () =>
      generateMcpExportForClient(
        clientExportTarget,
        origin,
        configScope === 'single' ? selectedServerId : undefined
      ),
    [clientExportTarget, origin, configScope, selectedServerId]
  );

  const standaloneScript = useMemo(
    () => generateStandaloneMcpScript(selectedServerId, scriptLang),
    [selectedServerId, scriptLang]
  );

  useEffect(() => {
    onSubmitArtifacts('mcp', [
      { path: 'mcp/client-config.txt', content: mcpClientExport.content },
      { path: 'mcp/server-script.txt', content: standaloneScript.content },
      ...(rpcOutput ? [{ path: 'mcp/response.json', content: JSON.stringify(rpcOutput, null, 2) }] : []),
    ]);
  }, [onSubmitArtifacts, mcpClientExport, standaloneScript, rpcOutput]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard error in restricted sandbox
    }
  };

  const totalWarm = servers.filter((s) => s.state === 'warm').length;
  const totalHits = servers.reduce((acc, s) => acc + s.cacheHits, 0);
  const totalCachedEntries = servers.reduce((acc, s) => acc + s.cacheEntries, 0);

  return (
    <div className={gridClass}>
      {/* PRIMARY PANE: LAZY BUILD-ON-CALL MCP SERVER DIRECTORY */}
      <div className={`${primarySpan} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              10. MCP Tool Servers (Build-on-Call &amp; Cached)
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Every workbench &amp; language target exposes a Streamable HTTP MCP JSON-RPC 2.0 endpoint that initializes lazily on first call and caches outputs by content hash — no manual server launch required.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refreshStatuses()}
              disabled={busy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleClearCache()}
              disabled={busy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Evict All Caches
            </button>
          </div>
        </div>

        {/* Clean Unboxed Typographic Telemetry Summary */}
        <div className="flex flex-wrap items-center gap-2 border-y border-slate-200 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {servers.length} endpoints
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {totalWarm} warm / {servers.length - totalWarm} cold (lazy)
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{totalCachedEntries} cached results</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{totalHits} cache hits</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">
            {transportMode === 'http' ? 'HTTP /api/mcp/*' : 'Isomorphic Fallback'}
          </span>
        </div>

        {/* High-Density Server Table */}
        <div
          data-tour-id="workbench.mcp_servers.context"
          className="max-h-[380px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"
        >
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Target Server</th>
                <th className="px-2 py-2 font-medium">Endpoint</th>
                <th className="px-2 py-2 font-medium">State</th>
                <th className="px-2 py-2 text-right font-medium">Cache (H/M)</th>
                <th className="px-3 py-2 text-right font-medium">Tools</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {servers.map((srv) => {
                const isSelected = srv.id === selectedServerId;
                return (
                  <tr
                    key={srv.id}
                    onClick={() => handleSelectServer(srv.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {srv.id}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {srv.stage}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {srv.endpoint}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px]">
                      <span
                        className={
                          srv.state === 'warm'
                            ? 'font-medium text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {srv.state === 'warm'
                          ? `Warm (${srv.lastBuildMs ?? 0}ms)`
                          : 'Cold (Lazy)'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {srv.cacheHits}/{srv.cacheMisses}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {srv.toolCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECONDARY PANE: LIVE MCP JSON-RPC CALLER, mcp.json CONFIG & STANDALONE HANDLER EXPORT */}
      <div className={`${secondarySpan} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Server className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-mono">{selectedServer?.endpoint}</span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setInspectorTab('invoke')}
              data-tour-id="workbench.mcp_servers.tools workbench.mcp_servers.invoke"
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                inspectorTab === 'invoke'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Call Tool
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('config')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                inspectorTab === 'config'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              mcp.json
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('export')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                inspectorTab === 'export'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Export Server
            </button>
          </div>
        </div>

        {inspectorTab === 'invoke' && selectedServer ? (
          <div className="flex flex-1 flex-col gap-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedServer.description}
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label
                  htmlFor="mcpToolSelect"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                >
                  MCP Tool ({selectedServer.tools.length})
                </label>
                <select
                  id="mcpToolSelect"
                  data-tour-id="workbench.mcp_servers.tools"
                  value={selectedTool?.name || ''}
                  onChange={(e) => handleSelectTool(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {selectedServer.tools.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end sm:col-span-4">
                <label className="inline-flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={bypassCache}
                    onChange={(e) => setBypassCache(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                  />
                  <span>Bypass Cache</span>
                </label>
              </div>
            </div>

            {selectedTool && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {selectedTool.description}
              </div>
            )}

            <div>
              <label
                htmlFor="mcpArgsEditor"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
              >
                JSON-RPC Tool Arguments
              </label>
              <textarea
                id="mcpArgsEditor"
                rows={3}
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-950 p-2.5 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleInvokeTool()}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                tools/call (Build &amp; Cache)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendJsonRpc('initialize')}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                initialize
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendJsonRpc('tools/list')}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                tools/list
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void sendJsonRpc(
                    'resources/read',
                    selectedServerId === 'pipeline'
                      ? { uri: 'grammar2json://pipeline/breadcrumbs.jsonld' }
                      : { uri: `grammar2json://${selectedServerId}/artifact` }
                  )
                }
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                resources/read
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleClearCache(selectedServerId)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Reset to Cold
              </button>
            </div>

            {lastCallMeta && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <span
                  className={
                    lastCallMeta.cache === 'HIT'
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'font-semibold text-blue-700 dark:text-blue-400'
                  }
                >
                  Cache: {lastCallMeta.cache}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{lastCallMeta.durationMs}ms</span>
                <span aria-hidden="true">·</span>
                <span>
                  {lastCallMeta.builtOnThisCall ? 'Built server on this call' : 'Reused warm server'}
                </span>
                {lastCallMeta.cacheKey && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>key:{lastCallMeta.cacheKey}</span>
                  </>
                )}
              </div>
            )}

            <pre
              data-tour-id="workbench.mcp_servers.invoke"
              className="max-h-56 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200 dark:border-slate-800"
            >
              {rpcOutput
                ? JSON.stringify(rpcOutput, null, 2)
                : `// Click "tools/call (Build & Cache)" twice to verify lazy build-on-call (MISS) followed by instant cached replay (HIT).\n// Endpoint: POST ${origin}${selectedServer.endpoint}`}
            </pre>
          </div>
        ) : inspectorTab === 'config' ? (
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setConfigScope('single')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    configScope === 'single'
                      ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-500'
                  }`}
                >
                  {selectedServerId} only
                </button>
                <button
                  type="button"
                  onClick={() => setConfigScope('all')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    configScope === 'all'
                      ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-500'
                  }`}
                >
                  All {servers.length} Servers
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={clientExportTarget}
                  onChange={(e) => setClientExportTarget(e.target.value as McpClientExportTarget)}
                  aria-label="MCP client export target"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {MCP_CLIENT_EXPORT_TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <DocTooltip docKey="mcpClientExport" align="right" />
                <button
                  type="button"
                  onClick={() => void copyText('mcp_json', mcpClientExport.content)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {copiedKey === 'mcp_json' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedKey === 'mcp_json' ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onExportTextFile(
                      mcpClientExport.content,
                      mcpClientExport.filename,
                      mcpClientExport.mime
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export {mcpClientExport.filename}
                </button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {mcpClientExport.installHint}
            </div>
            <HtmlCodeOutput
              title={mcpClientExport.filename}
              language={clientExportTarget.toUpperCase()}
              code={mcpClientExport.content}
              maxHeightClass="max-h-72"
              onDownloadHtml={onExportTextFile}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setScriptLang('typescript')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    scriptLang === 'typescript'
                      ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-500'
                  }`}
                >
                  TypeScript Handler
                </button>
                <button
                  type="button"
                  onClick={() => setScriptLang('python')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    scriptLang === 'python'
                      ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-500'
                  }`}
                >
                  Python Handler
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void copyText('script', standaloneScript.content)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {copiedKey === 'script' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedKey === 'script' ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onExportTextFile(
                      standaloneScript.content,
                      standaloneScript.filename,
                      standaloneScript.mime
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  {standaloneScript.filename}
                </button>
              </div>
            </div>
            <pre className="max-h-80 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200 dark:border-slate-800">
              {standaloneScript.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
