import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Send,
  Terminal,
  Trash2,
  Unlock,
  Workflow,
  XCircle,
} from 'lucide-react';
import { DocTooltip } from './DocTooltip';
import { DomEchelonManipulator, type DomEchelonItem } from './DomEchelonManipulator';
import type { HateoasAction, HateoasLink, NodeMemberDescriptor } from '../engine/hateoasEngine';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

interface ApiCallRecord {
  id: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  timestamp: string;
  responseText: string;
  responseJson: Record<string, unknown> | null;
  responseHeaders: Record<string, string>;
}

interface RoutineStep {
  id: string;
  label: string;
  artifactKey: string;
  method: HttpMethod;
  url: string;
  bodyTemplate: string;
  mergedSubSteps?: Array<{ method: HttpMethod; url: string; bodyTemplate: string; label: string }>;
}

interface RoutineStepRunResult {
  stepId: string;
  artifactKey: string;
  status: number;
  ok: boolean;
  durationMs: number;
  resolvedUrl: string;
  resolvedBody: string;
  responseData: unknown;
  error?: string;
}

interface ApiStudioWorkbenchProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  onSyncWorkspaceToServer: () => Promise<void>;
  onPullServerWorkspace?: () => Promise<void>;
  onDownloadFile: (content: string, filename: string, mime: string) => void;
  onNotify: (msg: string) => void;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-amber-600 dark:text-amber-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  DELETE: 'text-red-600 dark:text-red-400',
  HEAD: 'text-slate-500 dark:text-slate-400',
  OPTIONS: 'text-slate-500 dark:text-slate-400',
};

const COLLECTION_GROUPS: Array<{
  group: string;
  endpoints: Array<{ label: string; method: HttpMethod; url: string; body?: string }>;
}> = [
  {
    group: 'HATEOAS Discovery & Nodes',
    endpoints: [
      { label: 'API Root Discovery', method: 'GET', url: '/api' },
      { label: 'List All Addressable Nodes', method: 'GET', url: '/api/nodes' },
      { label: 'Inspect Rule Node <quantity>', method: 'GET', url: '/api/nodes/rule/quantity' },
      { label: 'List All Rule Members', method: 'GET', url: '/api/nodes/rule/quantity/members' },
      {
        label: 'Patch Mutable Member (expression)',
        method: 'PATCH',
        url: '/api/nodes/rule/quantity/members/expression',
        body: JSON.stringify({ value: 'digit+' }, null, 2),
      },
      {
        label: 'Test Immutable Member (405 Guard)',
        method: 'PATCH',
        url: '/api/nodes/rule/quantity/members/inDegree',
        body: JSON.stringify({ value: 99 }, null, 2),
      },
    ],
  },
  {
    group: 'Rules & Extended DAG Symbols',
    endpoints: [
      { label: 'List Grammar Rules', method: 'GET', url: '/api/rules' },
      {
        label: 'Create Rule (POST)',
        method: 'POST',
        url: '/api/rules',
        body: JSON.stringify({ name: 'promo_code', expression: "'PROMO-' digit+" }, null, 2),
      },
      {
        label: 'Evaluate Payload (digit+)',
        method: 'POST',
        url: '/api/evaluate',
        body: JSON.stringify({ rule: 'order_expr', payload: 'BUY SKU-402 12' }, null, 2),
      },
      { label: 'List Extended DAG Symbols', method: 'GET', url: '/api/symbols' },
      {
        label: 'Configure Symbol (oneOrMore)',
        method: 'PUT',
        url: '/api/symbols/oneOrMore',
        body: JSON.stringify({ value: '+' }, null, 2),
      },
    ],
  },
  {
    group: 'Logic, Cauchy & Callbacks',
    endpoints: [
      { label: 'Get Logic & Cauchy State', method: 'GET', url: '/api/logic' },
      {
        label: 'Evaluate Cauchy Sequence',
        method: 'POST',
        url: '/api/logic/cauchy',
        body: JSON.stringify(
          {
            paramStyle: 'directional',
            seedValues: '0, 1',
            recurrenceExpr: '(left + right) / 2',
            maxIterations: 24,
            epsilon: 0.0001,
          },
          null,
          2
        ),
      },
      { label: 'List Global Callbacks', method: 'GET', url: '/api/callbacks' },
      {
        label: 'Create Global Callback',
        method: 'POST',
        url: '/api/callbacks',
        body: JSON.stringify(
          { name: 'shipping_fee', lambdaExpr: 'λamt. amt + 12', description: 'Flat shipping fee' },
          null,
          2
        ),
      },
    ],
  },
  {
    group: 'Histolog, Languages & MCP Export',
    endpoints: [
      { label: 'List Histolog Generations', method: 'GET', url: '/api/histolog' },
      { label: 'Diff Generations G0 → G1', method: 'GET', url: '/api/histolog/diff?from=0&to=1' },
      { label: 'List All 12 Languages', method: 'GET', url: '/api/languages' },
      { label: 'Export Workspace (Go)', method: 'GET', url: '/api/export/go' },
      { label: 'Export Logic (Python)', method: 'GET', url: '/api/logic/export/python' },
      { label: 'Export MCP for VS Code', method: 'GET', url: '/api/mcp/all/export/vscode' },
      { label: 'Export MCP for Ollama', method: 'GET', url: '/api/mcp/all/export/ollama' },
      { label: 'Export MCP for OpenClaw', method: 'GET', url: '/api/mcp/all/export/openclaw' },
      {
        label: 'Clear Section (Preview)',
        method: 'POST',
        url: '/api/engine/clear',
        body: JSON.stringify({ section: 'evaluator' }, null, 2),
      },
    ],
  },
];

const INITIAL_ROUTINE_STEPS: RoutineStep[] = [
  {
    id: 'step_root',
    label: 'Discover HATEOAS Root',
    artifactKey: 'root_discovery',
    method: 'GET',
    url: '/api',
    bodyTemplate: '',
  },
  {
    id: 'step_eval',
    label: 'Evaluate Order Payload (digit+)',
    artifactKey: 'eval_artifact',
    method: 'POST',
    url: '/api/evaluate',
    bodyTemplate: JSON.stringify({ rule: 'order_expr', payload: 'BUY SKU-402 12' }, null, 2),
  },
  {
    id: 'step_cauchy',
    label: 'Compute Cauchy Limit (left/right)',
    artifactKey: 'cauchy_artifact',
    method: 'POST',
    url: '/api/logic/cauchy',
    bodyTemplate: JSON.stringify(
      {
        paramStyle: 'directional',
        seedValues: '0, 1',
        recurrenceExpr: '(left + right) / 2',
        maxIterations: 20,
        epsilon: 0.0001,
      },
      null,
      2
    ),
  },
  {
    id: 'step_export',
    label: 'Compile TypeScript Artifact',
    artifactKey: 'ts_module',
    method: 'GET',
    url: '/api/export/typescript',
    bodyTemplate: '',
  },
  {
    id: 'step_checkpoint',
    label: 'Record Histolog Checkpoint',
    artifactKey: 'histolog_gen',
    method: 'POST',
    url: '/api/histolog',
    bodyTemplate: JSON.stringify(
      { summary: 'Routine built {{artifacts.ts_module.filename}} (matched={{artifacts.eval_artifact.matched}})' },
      null,
      2
    ),
  },
];

function lookupPath(obj: unknown, pathStr: string): unknown {
  const parts = pathStr.split('.').filter(Boolean);
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr && typeof curr === 'object' && part in (curr as Record<string, unknown>)) {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return curr;
}

function resolvePipeTemplate(template: string, ctx: Record<string, unknown>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, expr: string) => {
    const val = lookupPath(ctx, expr);
    if (val === undefined) return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    return JSON.stringify(val);
  });
}

export function ApiStudioWorkbench({
  onSubmitArtifacts,
  onSyncWorkspaceToServer,
  onPullServerWorkspace,
  onDownloadFile,
  onNotify,
}: ApiStudioWorkbenchProps) {
  const [studioMode, setStudioMode] = useState<'postman' | 'routine'>('postman');

  // Postman-style Request state
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('/api');
  const [reqTab, setReqTab] = useState<'params' | 'headers' | 'body'>('body');
  const [resTab, setResTab] = useState<'body' | 'hateoas' | 'headers' | 'history'>('hateoas');
  const [params, setParams] = useState<KeyValueRow[]>([
    { id: 'p1', key: '', value: '', enabled: true },
  ]);
  const [headers, setHeaders] = useState<KeyValueRow[]>([
    { id: 'h1', key: 'Accept', value: 'application/hal+json', enabled: true },
    { id: 'h2', key: 'Content-Type', value: 'application/json', enabled: true },
  ]);
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastCall, setLastCall] = useState<ApiCallRecord | null>(null);
  const [callHistory, setCallHistory] = useState<ApiCallRecord[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sequential DOM Routine Builder state
  const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>(INITIAL_ROUTINE_STEPS);
  const [selectedRoutineStepId, setSelectedRoutineStepId] = useState<string>(INITIAL_ROUTINE_STEPS[0].id);
  const [routineRunning, setRoutineRunning] = useState(false);
  const [routineResults, setRoutineResults] = useState<RoutineStepRunResult[]>([]);
  const [routineArtifacts, setRoutineArtifacts] = useState<Record<string, unknown>>({});

  useEffect(() => {
    onSubmitArtifacts('api', [
      ...(lastCall ? [{ path: 'api/response.txt', content: lastCall.responseText }] : []),
      ...(routineResults.length ? [{ path: 'api/routine-results.json', content: JSON.stringify({ results: routineResults, artifacts: routineArtifacts }, null, 2) }] : []),
    ]);
  }, [onSubmitArtifacts, lastCall, routineResults, routineArtifacts]);

  const selectedRoutineStep =
    routineSteps.find((s) => s.id === selectedRoutineStepId) || routineSteps[0] || null;

  const executeRequest = async (override?: { method?: HttpMethod; url?: string; body?: string }) => {
    const reqMethod = override?.method || method;
    let targetUrl = (override?.url ?? url).trim();
    if (!targetUrl) return;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('/')) {
      targetUrl = `/${targetUrl}`;
    }

    // Append active query params if not overridden
    if (!override?.url) {
      const activeParams = params.filter((p) => p.enabled && p.key.trim());
      if (activeParams.length > 0 && !targetUrl.includes('?')) {
        const qs = new URLSearchParams();
        activeParams.forEach((p) => qs.set(p.key.trim(), p.value));
        targetUrl = `${targetUrl}?${qs.toString()}`;
      }
    }

    const reqHeaders: Record<string, string> = {};
    headers.forEach((h) => {
      if (h.enabled && h.key.trim()) reqHeaders[h.key.trim()] = h.value;
    });

    const reqBody = override?.body !== undefined ? override.body : bodyText;
    const init: RequestInit = { method: reqMethod, headers: reqHeaders };
    if (reqMethod !== 'GET' && reqMethod !== 'HEAD' && reqMethod !== 'OPTIONS' && reqBody.trim()) {
      init.body = reqBody;
    }

    setSending(true);
    const t0 = performance.now();
    try {
      const res = await fetch(targetUrl, init);
      const durationMs = Math.max(1, Math.round(performance.now() - t0));
      const text = await res.text();
      let parsedJson: Record<string, unknown> | null = null;
      try {
        const p = JSON.parse(text) as unknown;
        if (p && typeof p === 'object') parsedJson = p as Record<string, unknown>;
      } catch {
        parsedJson = null;
      }
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });
      const rec: ApiCallRecord = {
        id: `call_${Date.now()}`,
        method: reqMethod,
        url: targetUrl,
        status: res.status,
        durationMs,
        timestamp: new Date().toLocaleTimeString(),
        responseText: parsedJson ? JSON.stringify(parsedJson, null, 2) : text,
        responseJson: parsedJson,
        responseHeaders: resHeaders,
      };
      setLastCall(rec);
      setCallHistory((prev) => [rec, ...prev].slice(0, 25));

      // If mutating call succeeded, pull updated state back into Studio higher echelons
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(reqMethod) && res.ok && onPullServerWorkspace) {
        void onPullServerWorkspace();
      }
    } catch (err) {
      const durationMs = Math.max(1, Math.round(performance.now() - t0));
      const msg = err instanceof Error ? err.message : 'Network error';
      setLastCall({
        id: `err_${Date.now()}`,
        method: reqMethod,
        url: targetUrl,
        status: 0,
        durationMs,
        timestamp: new Date().toLocaleTimeString(),
        responseText: JSON.stringify({ error: msg }, null, 2),
        responseJson: { error: msg },
        responseHeaders: {},
      });
    } finally {
      setSending(false);
    }
  };

  // Auto-discover HATEOAS root on initial mount
  useEffect(() => {
    void executeRequest({ method: 'GET', url: '/api', body: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discoveredLinks = useMemo(() => {
    const raw = lastCall?.responseJson?._links;
    if (!raw || typeof raw !== 'object') return [] as Array<[string, HateoasLink]>;
    return Object.entries(raw as Record<string, HateoasLink>);
  }, [lastCall]);

  const discoveredActions = useMemo(() => {
    const raw = lastCall?.responseJson?._actions;
    if (!raw || typeof raw !== 'object') return [] as Array<[string, HateoasAction]>;
    return Object.entries(raw as Record<string, HateoasAction>);
  }, [lastCall]);

  const discoveredMembers = useMemo(() => {
    const raw = lastCall?.responseJson?.members;
    if (!raw || typeof raw !== 'object') return [] as Array<[string, NodeMemberDescriptor]>;
    return Object.entries(raw as Record<string, NodeMemberDescriptor>);
  }, [lastCall]);

  const handleFollowLink = (link: HateoasLink) => {
    const nextMethod = (link.method || 'GET') as HttpMethod;
    let href = link.href;
    // Strip origin so relative URLs stay clean in the bar
    if (typeof window !== 'undefined' && href.startsWith(window.location.origin)) {
      href = href.slice(window.location.origin.length) || '/';
    }
    href = href.replace('{language}', 'python').replace('{kind}', 'rule').replace('{nodeId}', 'quantity').replace('{member}', 'expression');
    setMethod(nextMethod);
    setUrl(href);
    if (nextMethod === 'GET' || nextMethod === 'DELETE') {
      setBodyText('');
      void executeRequest({ method: nextMethod, url: href, body: '' });
    } else {
      setReqTab('body');
    }
  };

  const handleLoadAction = (action: HateoasAction) => {
    let href = action.href;
    if (typeof window !== 'undefined' && href.startsWith(window.location.origin)) {
      href = href.slice(window.location.origin.length) || '/';
    }
    const sampleObj: Record<string, unknown> = {};
    for (const f of action.fields || []) {
      sampleObj[f.name] = f.example ?? '';
    }
    const sampleJson = Object.keys(sampleObj).length > 0 ? JSON.stringify(sampleObj, null, 2) : '';
    setMethod(action.method);
    setUrl(href);
    setBodyText(sampleJson);
    setReqTab('body');
    onNotify(`Loaded HATEOAS action "${action.title}" into request editor.`);
  };

  const buildCurlCommand = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const fullUrl = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
    const hdrFlags = headers
      .filter((h) => h.enabled && h.key.trim())
      .map((h) => `-H "${h.key.trim()}: ${h.value}"`)
      .join(' ');
    const dataFlag =
      method !== 'GET' && method !== 'HEAD' && bodyText.trim()
        ? ` -d '${bodyText.replace(/'/g, "'\\''")}'`
        : '';
    return `curl -i -X ${method} ${hdrFlags} "${fullUrl}"${dataFlag}`;
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore restricted clipboard
    }
  };

  /* ==========================================================================
   * SEQUENTIAL DOM ROUTINE PIPELINE (Order, Merge, Biject/Split + Execute)
   * ======================================================================== */

  const handleReorderRoutine = (sourceId: string, targetId: string, position: 'before' | 'after') => {
    setRoutineSteps((prev) => {
      const srcIdx = prev.findIndex((s) => s.id === sourceId);
      const tgtIdx = prev.findIndex((s) => s.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(srcIdx, 1);
      const nextTgtIdx = copy.findIndex((s) => s.id === targetId);
      copy.splice(position === 'before' ? nextTgtIdx : nextTgtIdx + 1, 0, moved);
      return copy;
    });
    onNotify('Reordered sequential routine steps.');
  };

  const handleMergeRoutine = (sourceId: string, targetId: string) => {
    setRoutineSteps((prev) => {
      const src = prev.find((s) => s.id === sourceId);
      const tgt = prev.find((s) => s.id === targetId);
      if (!src || !tgt || src.id === tgt.id) return prev;
      const subSteps = [
        ...(tgt.mergedSubSteps || [{ method: tgt.method, url: tgt.url, bodyTemplate: tgt.bodyTemplate, label: tgt.label }]),
        ...(src.mergedSubSteps || [{ method: src.method, url: src.url, bodyTemplate: src.bodyTemplate, label: src.label }]),
      ];
      const merged: RoutineStep = {
        ...tgt,
        label: `${tgt.label} + ${src.label}`,
        artifactKey: `${tgt.artifactKey}_${src.artifactKey}`,
        mergedSubSteps: subSteps,
      };
      return prev.filter((s) => s.id !== sourceId).map((s) => (s.id === targetId ? merged : s));
    });
    onNotify('Combined the endpoint steps into one group. Use Split to separate them again.');
  };

  const handleSplitRoutine = (targetId: string, splitIndex = 1, draggedSourceId?: string) => {
    setRoutineSteps((prev) => {
      const tgtIdx = prev.findIndex((s) => s.id === targetId);
      if (tgtIdx < 0) return prev;
      const tgt = prev[tgtIdx];
      let nextList = [...prev];
      let draggedStep: RoutineStep | null = null;
      if (draggedSourceId && draggedSourceId !== targetId) {
        const dIdx = nextList.findIndex((s) => s.id === draggedSourceId);
        if (dIdx >= 0) {
          [draggedStep] = nextList.splice(dIdx, 1);
        }
      }
      const insertAt = nextList.findIndex((s) => s.id === targetId);

      // Inverse bijection if target is a merged composite step
      if (tgt.mergedSubSteps && tgt.mergedSubSteps.length >= 2) {
        const cut = Math.max(1, Math.min(tgt.mergedSubSteps.length - 1, splitIndex));
        const leftSubs = tgt.mergedSubSteps.slice(0, cut);
        const rightSubs = tgt.mergedSubSteps.slice(cut);
        const leftStep: RoutineStep = {
          id: `${tgt.id}_L_${Date.now()}`,
          label: leftSubs.map((s) => s.label).join(' + '),
          artifactKey: `${tgt.artifactKey}_left`,
          method: leftSubs[0].method,
          url: leftSubs[0].url,
          bodyTemplate: leftSubs[0].bodyTemplate,
          mergedSubSteps: leftSubs.length > 1 ? leftSubs : undefined,
        };
        const rightStep: RoutineStep = {
          id: `${tgt.id}_R_${Date.now() + 1}`,
          label: rightSubs.map((s) => s.label).join(' + '),
          artifactKey: `${tgt.artifactKey}_right`,
          method: rightSubs[0].method,
          url: rightSubs[0].url,
          bodyTemplate: rightSubs[0].bodyTemplate,
          mergedSubSteps: rightSubs.length > 1 ? rightSubs : undefined,
        };
        const replacement = draggedStep ? [leftStep, draggedStep, rightStep] : [leftStep, rightStep];
        nextList.splice(insertAt, 1, ...replacement);
        return nextList;
      }

      // Biject a single endpoint step into a forward/verify paired routine
      const forwardStep: RoutineStep = {
        ...tgt,
        id: `${tgt.id}_fwd_${Date.now()}`,
        label: `${tgt.label} (Forward)`,
        artifactKey: `${tgt.artifactKey}_fwd`,
      };
      const inverseStep: RoutineStep = {
        id: `${tgt.id}_inv_${Date.now() + 1}`,
        label: `${tgt.label} (Inspect / Inverse)`,
        artifactKey: `${tgt.artifactKey}_verify`,
        method: 'GET',
        url: tgt.url.includes('/api/rules') ? '/api/rules' : tgt.url.startsWith('/api/export/') ? '/api/languages' : '/api/nodes',
        bodyTemplate: '',
      };
      const replacement = draggedStep ? [forwardStep, draggedStep, inverseStep] : [forwardStep, inverseStep];
      nextList.splice(insertAt, 1, ...replacement);
      return nextList;
    });
    onNotify(
      draggedSourceId
        ? 'Split step at chosen boundary and spliced dragged step cleanly between halves.'
        : 'Separated this step into forward and verification calls.'
    );
  };

  const handleRunRoutine = async () => {
    setRoutineRunning(true);
    setRoutineResults([]);
    const artifacts: Record<string, unknown> = {};
    const stepOutputs: Array<Record<string, unknown>> = [];
    const results: RoutineStepRunResult[] = [];

    for (let i = 0; i < routineSteps.length; i += 1) {
      const step = routineSteps[i];
      const pipeCtx = {
        prev: stepOutputs[stepOutputs.length - 1] || {},
        steps: stepOutputs,
        artifacts,
      };
      const calls = step.mergedSubSteps || [
        { method: step.method, url: step.url, bodyTemplate: step.bodyTemplate, label: step.label },
      ];

      const subOutputs: unknown[] = [];
      let combinedStatus = 200;
      let combinedOk = true;
      let totalMs = 0;
      let lastUrl = '';
      let lastBody = '';
      let stepError: string | undefined;

      for (const call of calls) {
        const resolvedUrl = resolvePipeTemplate(call.url, pipeCtx);
        const resolvedBody = resolvePipeTemplate(call.bodyTemplate, pipeCtx);
        lastUrl = resolvedUrl;
        lastBody = resolvedBody;
        const t0 = performance.now();
        try {
          const init: RequestInit = {
            method: call.method,
            headers: { Accept: 'application/hal+json', 'Content-Type': 'application/json' },
          };
          if (call.method !== 'GET' && call.method !== 'HEAD' && resolvedBody.trim()) {
            init.body = resolvedBody;
          }
          const res = await fetch(resolvedUrl, init);
          totalMs += Math.max(1, Math.round(performance.now() - t0));
          combinedStatus = res.status;
          if (!res.ok) combinedOk = false;
          const text = await res.text();
          let data: unknown = text;
          try {
            data = JSON.parse(text);
          } catch {
            // Keep raw text
          }
          subOutputs.push(data);
        } catch (err) {
          totalMs += Math.max(1, Math.round(performance.now() - t0));
          combinedStatus = 0;
          combinedOk = false;
          stepError = err instanceof Error ? err.message : 'Request failed';
          subOutputs.push({ error: stepError });
        }
      }

      const finalData = subOutputs.length === 1 ? subOutputs[0] : subOutputs;
      artifacts[step.artifactKey] = finalData;
      stepOutputs.push({
        status: combinedStatus,
        ok: combinedOk,
        body: finalData,
        links:
          finalData && typeof finalData === 'object' && '_links' in (finalData as Record<string, unknown>)
            ? (finalData as Record<string, unknown>)._links
            : {},
      });
      results.push({
        stepId: step.id,
        artifactKey: step.artifactKey,
        status: combinedStatus,
        ok: combinedOk,
        durationMs: totalMs,
        resolvedUrl: lastUrl,
        resolvedBody: lastBody,
        responseData: finalData,
        error: stepError,
      });
      setRoutineResults([...results]);
      setRoutineArtifacts({ ...artifacts });
    }

    setRoutineRunning(false);
    if (onPullServerWorkspace) void onPullServerWorkspace();
    onNotify(`Routine finished: built ${results.length} sequential artifact${results.length === 1 ? '' : 's'}.`);
  };

  const routineDomItems: DomEchelonItem[] = routineSteps.map((s) => ({
    id: s.id,
    title: s.label,
    badge: s.mergedSubSteps ? `COMPOSITE (${s.mergedSubSteps.length})` : s.method,
    subtitle: s.mergedSubSteps ? s.mergedSubSteps.map((sub) => `${sub.method} ${sub.url}`).join(' → ') : s.url,
    meta: `artifact: ${s.artifactKey}`,
    composite: Boolean(s.mergedSubSteps && s.mergedSubSteps.length > 1),
    splitPoints:
      s.mergedSubSteps && s.mergedSubSteps.length >= 2
        ? s.mergedSubSteps.slice(0, -1).map((sub, i) => ({
            index: i + 1,
            label: `After ${sub.label.slice(0, 14)}`,
          }))
        : [
            { index: 1, label: 'Forward / verification' },
            { index: 2, label: 'Splice Pipeline' },
          ],
  }));

  return (
    <section className="space-y-4">
      {/* Top Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Try API requests and build routines
            </h1>
            <DocTooltip docKey="hateoasRestNodes" />
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Send a request to explore the API, or build a routine that runs several requests in order. Some requests can change workspace data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            data-tour-id="view.api.mode"
            role="group"
            aria-label="Choose an API tool"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => setStudioMode('postman')}
              aria-pressed={studioMode === 'postman'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                studioMode === 'postman'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Send a request
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('routine')}
              aria-pressed={studioMode === 'routine'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                studioMode === 'routine'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Workflow className="h-3.5 w-3.5" />
              Build a routine
            </button>
          </div>

          <button
            type="button"
            onClick={() => void onSyncWorkspaceToServer()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync workspace to API
          </button>
        </div>
      </div>

      {/* MODE 1: POSTMAN-STYLE API CONSOLE */}
      {studioMode === 'postman' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Collection Tree */}
          <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                REST / HATEOAS Collection
              </span>
              <span className="font-mono text-[10px] text-slate-400">Live /api</span>
            </div>
            <div className="max-h-[600px] space-y-3 overflow-auto pr-0.5">
              {COLLECTION_GROUPS.map((grp) => (
                <div key={grp.group} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {grp.group}
                  </div>
                  {grp.endpoints.map((ep) => (
                    <button
                      key={`${ep.method}:${ep.url}`}
                      type="button"
                      onClick={() => {
                        setMethod(ep.method);
                        setUrl(ep.url);
                        setBodyText(ep.body || '');
                        if (ep.method === 'GET') {
                          void executeRequest({ method: ep.method, url: ep.url, body: '' });
                        } else {
                          setReqTab('body');
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        url === ep.url && method === ep.method
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className={`w-12 shrink-0 font-mono text-[10px] font-bold ${METHOD_COLORS[ep.method]}`}>
                        {ep.method}
                      </span>
                      <span className="truncate">{ep.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* Right Request Builder & Response Inspector */}
          <div className="space-y-4 lg:col-span-9">
            {/* Request Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <form
                data-tour-id="view.api.request"
                onSubmit={(e) => {
                  e.preventDefault();
                  void executeRequest();
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                  aria-label="HTTP Method"
                  className={`min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-bold focus:border-blue-500 focus:outline-none sm:w-28 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 ${METHOD_COLORS[method]}`}
                >
                  {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as HttpMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="/api/nodes/rule/quantity/members/expression"
                  aria-label="Request Endpoint URL"
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:min-h-0 sm:flex-none"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText('curl', buildCurlCommand())}
                    className="inline-flex min-h-[40px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    {copiedKey === 'curl' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    cURL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextStep: RoutineStep = {
                        id: `step_${Date.now()}`,
                        label: `${method} ${url}`,
                        artifactKey: `artifact_${routineSteps.length + 1}`,
                        method,
                        url,
                        bodyTemplate: bodyText,
                      };
                      setRoutineSteps((prev) => [...prev, nextStep]);
                      setSelectedRoutineStepId(nextStep.id);
                      setStudioMode('routine');
                      onNotify(`Added "${method} ${url}" to Sequential Routine Builder.`);
                    }}
                    title="Add current request to Sequential Routine Builder"
                    className="inline-flex min-h-[40px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Pipe
                  </button>
                </div>
              </form>

              {/* Request Tabs: Params / Headers / Body */}
              <div className="mt-3 flex items-center gap-3 border-b border-slate-100 text-xs dark:border-slate-800">
                {(
                  [
                    ['body', 'Body (JSON)'],
                    ['params', `Params (${params.filter((p) => p.key.trim()).length})`],
                    ['headers', `Headers (${headers.filter((h) => h.enabled && h.key.trim()).length})`],
                  ] as const
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setReqTab(tabId)}
                    className={`border-b-2 pb-2 font-medium transition-colors ${
                      reqTab === tabId
                        ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-slate-100'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {reqTab === 'body' && (
                  <textarea
                    rows={5}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    spellCheck={false}
                    placeholder='{ "value": "digit+" }'
                    className="w-full rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
                  />
                )}
                {reqTab === 'params' && (
                  <div className="space-y-1.5">
                    {params.map((row) => (
                      <div key={row.id} className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) =>
                            setParams((prev) => prev.map((p) => (p.id === row.id ? { ...p, key: e.target.value } : p)))
                          }
                          placeholder="Query key (e.g. kind, from, to)"
                          className="col-span-5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) =>
                            setParams((prev) => prev.map((p) => (p.id === row.id ? { ...p, value: e.target.value } : p)))
                          }
                          placeholder="Value"
                          className="col-span-6 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() => setParams((prev) => prev.filter((p) => p.id !== row.id))}
                          className="col-span-1 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-red-600 dark:border-slate-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setParams((prev) => [...prev, { id: `p_${Date.now()}`, key: '', value: '', enabled: true }])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Plus className="h-3 w-3" /> Add Query Param
                    </button>
                  </div>
                )}
                {reqTab === 'headers' && (
                  <div className="space-y-1.5">
                    {headers.map((row) => (
                      <div key={row.id} className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) =>
                            setHeaders((prev) => prev.map((h) => (h.id === row.id ? { ...h, key: e.target.value } : h)))
                          }
                          placeholder="Header name"
                          className="col-span-5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) =>
                            setHeaders((prev) => prev.map((h) => (h.id === row.id ? { ...h, value: e.target.value } : h)))
                          }
                          placeholder="Header value"
                          className="col-span-6 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() => setHeaders((prev) => prev.filter((h) => h.id !== row.id))}
                          className="col-span-1 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-red-600 dark:border-slate-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setHeaders((prev) => [...prev, { id: `h_${Date.now()}`, key: '', value: '', enabled: true }])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Plus className="h-3 w-3" /> Add Header
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live Response & HATEOAS Hypermedia Navigator */}
            <div
              data-tour-id="view.api.response"
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                <div className="flex items-center gap-3 text-xs">
                  {(
                    [
                      ['hateoas', `HATEOAS (${discoveredLinks.length} links · ${discoveredMembers.length} members)`],
                      ['body', 'Pretty JSON'],
                      ['headers', `Headers (${Object.keys(lastCall?.responseHeaders || {}).length})`],
                      ['history', `History (${callHistory.length})`],
                    ] as const
                  ).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setResTab(tabId)}
                      className={`border-b-2 pb-1.5 font-medium transition-colors ${
                        resTab === tabId
                          ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-slate-100'
                          : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {lastCall && (
                  <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                    <span
                      className={`font-semibold ${
                        lastCall.status >= 200 && lastCall.status < 300
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      HTTP {lastCall.status}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-500">{lastCall.durationMs}ms</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-500">{lastCall.responseText.length} B</span>
                  </div>
                )}
              </div>

              <div className="mt-3">
                {resTab === 'hateoas' && (
                  <div className="space-y-4">
                    {/* Interactive _links Traversal */}
                    {discoveredLinks.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Hypermedia _links (Click to Follow Live Transition)
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {discoveredLinks.map(([rel, link]) => (
                            <button
                              key={rel}
                              type="button"
                              onClick={() => handleFollowLink(link)}
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-left text-xs transition-colors hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-blue-600"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-mono text-[10px] font-bold ${METHOD_COLORS[(link.method || 'GET') as HttpMethod]}`}>
                                    {link.method || 'GET'}
                                  </span>
                                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {rel}
                                  </span>
                                </div>
                                <div className="truncate font-mono text-[10px] text-slate-500">{link.href}</div>
                              </div>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Interactive _actions Affordances */}
                    {discoveredActions.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Hypermedia _actions (Load State-Transition Affordance)
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {discoveredActions.map(([actKey, act]) => (
                            <button
                              key={actKey}
                              type="button"
                              onClick={() => handleLoadAction(act)}
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs hover:border-blue-400 dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-mono text-[10px] font-bold ${METHOD_COLORS[act.method]}`}>
                                    {act.method}
                                  </span>
                                  <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                    {act.title}
                                  </span>
                                </div>
                                <div className="truncate font-mono text-[10px] text-slate-500">{act.href}</div>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Node Members Matrix (Mutable vs Non-Mutable) */}
                    {discoveredMembers.length > 0 && (
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Node Members (Mutable vs Non-Mutable REST Endpoints)
                        </div>
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                          {discoveredMembers.map(([mName, desc]) => (
                            <div
                              key={mName}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {desc.mutable ? (
                                    <Unlock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                  ) : (
                                    <Lock className="h-3 w-3 text-slate-400" />
                                  )}
                                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {mName}
                                  </span>
                                  <span className="font-mono text-[10px] text-slate-400">
                                    ({desc.valueType} · {desc.mutable ? 'mutable' : 'non-mutable'})
                                  </span>
                                </div>
                                <div className="truncate font-mono text-[11px] text-slate-500">
                                  {JSON.stringify(desc.value)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleFollowLink(desc._links.self)}
                                  className="rounded border border-slate-200 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-700 hover:bg-slate-50 dark:border-slate-700 dark:text-emerald-400"
                                >
                                  GET
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleLoadAction(
                                      desc._actions.update || {
                                        name: 'testImmutable',
                                        title: `Test PATCH on immutable ${mName} (expects 405)`,
                                        href: desc._links.self.href,
                                        method: 'PATCH',
                                        fields: [{ name: 'value', type: desc.valueType, example: desc.value }],
                                      }
                                    )
                                  }
                                  className="rounded border border-slate-200 px-2 py-0.5 font-mono text-[10px] font-medium text-purple-700 hover:bg-slate-50 dark:border-slate-700 dark:text-purple-400"
                                >
                                  PATCH
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw Preview Footer */}
                    {lastCall && (
                      <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                        {lastCall.responseText}
                      </pre>
                    )}
                  </div>
                )}

                {resTab === 'body' && (
                  <pre className="max-h-[460px] overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                    {lastCall?.responseText || '// Click Send to execute request'}
                  </pre>
                )}

                {resTab === 'headers' && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 font-mono text-xs dark:divide-slate-800 dark:border-slate-800">
                    {Object.entries(lastCall?.responseHeaders || {}).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-12 gap-2 px-3 py-1.5">
                        <span className="col-span-4 font-semibold text-slate-700 dark:text-slate-300">{k}</span>
                        <span className="col-span-8 break-all text-slate-500 dark:text-slate-400">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {resTab === 'history' && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {callHistory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMethod(item.method);
                          setUrl(item.url);
                          setLastCall(item);
                          setResTab('hateoas');
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <div className="flex min-w-0 items-center gap-2 font-mono">
                          <span className={`font-bold ${METHOD_COLORS[item.method]}`}>{item.method}</span>
                          <span className="truncate text-slate-800 dark:text-slate-200">{item.url}</span>
                        </div>
                        <span className="shrink-0 font-mono tabular-nums text-slate-500">
                          {item.status} · {item.durationMs}ms · {item.timestamp}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODE 2: FULL-SCALE SEQUENTIAL DOM ENDPOINT-PIPING ROUTINE BUILDER */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Routine steps ({routineSteps.length})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next: RoutineStep = {
                      id: `step_${Date.now()}`,
                      label: `Custom Step #${routineSteps.length + 1}`,
                      artifactKey: `artifact_${routineSteps.length + 1}`,
                      method: 'GET',
                      url: '/api/rules',
                      bodyTemplate: '',
                    };
                    setRoutineSteps((prev) => [...prev, next]);
                    setSelectedRoutineStepId(next.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onDownloadFile(
                      JSON.stringify({ format: 'grammar2json-routine/v1', steps: routineSteps, artifacts: routineArtifacts }, null, 2),
                      'endpoint-routine.json',
                      'application/json'
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" /> Download routine
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunRoutine()}
                  disabled={routineRunning}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5" />
                  {routineRunning ? 'Running steps...' : 'Run steps in order'}
                </button>
              </div>
            </div>

            <DomEchelonManipulator
              title="Arrange routine steps"
              subtitle="Steps run from top to bottom. Select a step to edit it, or move it up and down to change what runs first."
              items={routineDomItems}
              activeId={selectedRoutineStep?.id}
              onSelect={setSelectedRoutineStepId}
              onReorder={handleReorderRoutine}
              onMerge={handleMergeRoutine}
              onSplit={handleSplitRoutine}
              onDelete={(id) => setRoutineSteps((prev) => prev.filter((s) => s.id !== id))}
            />
          </div>

          {/* Right Pane: Selected Step Editor + Live Sequential Execution Trace */}
          <div className="space-y-4 lg:col-span-5">
            {selectedRoutineStep && (
              <div
                data-tour-id="view.api.request"
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Edit Step: {selectedRoutineStep.label}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Step Title</label>
                    <input
                      type="text"
                      value={selectedRoutineStep.label}
                      onChange={(e) =>
                        setRoutineSteps((prev) =>
                          prev.map((s) => (s.id === selectedRoutineStep.id ? { ...s, label: e.target.value } : s))
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Output Artifact Key</label>
                    <input
                      type="text"
                      value={selectedRoutineStep.artifactKey}
                      onChange={(e) =>
                        setRoutineSteps((prev) =>
                          prev.map((s) =>
                            s.id === selectedRoutineStep.id ? { ...s, artifactKey: e.target.value } : s
                          )
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedRoutineStep.method}
                    onChange={(e) =>
                      setRoutineSteps((prev) =>
                        prev.map((s) =>
                          s.id === selectedRoutineStep.id ? { ...s, method: e.target.value as HttpMethod } : s
                        )
                      )
                    }
                    className="w-24 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                  >
                    {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedRoutineStep.url}
                    onChange={(e) =>
                      setRoutineSteps((prev) =>
                        prev.map((s) => (s.id === selectedRoutineStep.id ? { ...s, url: e.target.value } : s))
                      )
                    }
                    className="flex-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">
                    JSON Body Template (supports <code className="font-mono">{'{{artifacts.key.field}}'}</code> &amp; <code className="font-mono">{'{{prev.body.field}}'}</code>)
                  </label>
                  <textarea
                    rows={4}
                    value={selectedRoutineStep.bodyTemplate}
                    onChange={(e) =>
                      setRoutineSteps((prev) =>
                        prev.map((s) =>
                          s.id === selectedRoutineStep.id ? { ...s, bodyTemplate: e.target.value } : s
                        )
                      )
                    }
                    spellCheck={false}
                    className="mt-1 w-full rounded border border-slate-200 bg-slate-950 p-2.5 font-mono text-xs text-slate-100 dark:border-slate-800"
                  />
                </div>
              </div>
            )}

            {/* Sequential Artifact Output Log */}
            <div
              data-tour-id="view.api.response"
              className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Sequential Artifact Pipeline Output
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  {routineResults.length}/{routineSteps.length} built
                </span>
              </div>
              {routineResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                  Click &ldquo;Run Routine Sequentially&rdquo; to execute each endpoint and pipe artifacts step-by-step.
                </div>
              ) : (
                <div className="max-h-[420px] space-y-2 overflow-auto">
                  {routineResults.map((r, i) => (
                    <div
                      key={`${r.stepId}-${i}`}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {r.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                          )}
                          #{i + 1} {r.artifactKey}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                          HTTP {r.status} · {r.durationMs}ms
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                        {r.resolvedUrl}
                      </div>
                      <pre className="mt-1.5 max-h-28 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
                        {JSON.stringify(r.responseData, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
