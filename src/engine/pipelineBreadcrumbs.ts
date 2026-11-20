import type {
  BreadcrumbItem,
  DslFlowNode,
  McpServerId,
  PipelineStage,
  SchemaOrgBreadcrumbList,
  TopView,
  WorkflowSlug,
} from '../types/studio.ts';

export interface PipelineStageMeta {
  id: PipelineStage;
  order: number;
  label: string;
  shortLabel: string;
  description: string;
  defaultPage: WorkflowSlug;
}

export const PIPELINE_STAGES: PipelineStageMeta[] = [
  {
    id: 'frontend',
    order: 1,
    label: 'Frontend & Lexing',
    shortLabel: 'Frontend',
    description: 'Grammar dialect syntax, dependency DAG, rule properties & operator precedence.',
    defaultPage: 'dialect',
  },
  {
    id: 'formal',
    order: 2,
    label: 'Formal Logic & λ',
    shortLabel: 'Formal Logic',
    description: 'Propositional logic, quantifiers, labeled arithmetic, and λ callback calculus.',
    defaultPage: 'logic_calc',
  },
  {
    id: 'ir',
    order: 3,
    label: 'IR & Schema',
    shortLabel: 'IR & Schema',
    description: 'Schema.org JSON-LD 1.1 compilation, line mutations, and backtracking evaluation.',
    defaultPage: 'schema',
  },
  {
    id: 'codegen',
    order: 4,
    label: 'Codegen & MCP',
    shortLabel: 'Codegen & MCP',
    description: 'Python AST, Rust syn AST, WABT/WASM binary lowering, and lazy MCP tool servers.',
    defaultPage: 'python_ast',
  },
  {
    id: 'storage',
    order: 5,
    label: 'Storage & Sync',
    shortLabel: 'Storage',
    description: 'Portable JSON-LD packages, ZIP export, and Google Drive / Demo Vault sync.',
    defaultPage: 'payload_io',
  },
];

export const TOP_VIEW_LABELS: Record<TopView, string> = {
  workbench: 'Workbench',
  graph: 'Rule Graph',
  histolog: 'Histolog & Diff',
  files: 'Shared Files',
  api: 'API Studio',
  modules: 'Module Workbench',
  openapi: 'OpenAPI Spec',
  dsl: 'DSL Flows',
  bundle: 'Export Bundle',
};

export const PAGE_TO_MCP_SERVER: Record<WorkflowSlug, McpServerId> = {
  dialect: 'grammar',
  rule_props: 'rule_props',
  logic_calc: 'logic_calc',
  schema: 'jsonld',
  mutations: 'mutations',
  evaluator: 'evaluator',
  python_ast: 'python',
  rust_ast: 'rust',
  wasm_wabt: 'wasm',
  mcp_servers: 'pipeline',
  payload_io: 'jsonld',
  gdrive: 'pipeline',
};

export interface StageProgressSummary {
  stage: PipelineStage;
  order: number;
  label: string;
  shortLabel: string;
  description: string;
  totalSteps: number;
  verifiedSteps: number;
  completionPct: number;
  containsActive: boolean;
  steps: Array<
    DslFlowNode & {
      verified: boolean;
      active: boolean;
      mcpServerId: McpServerId;
      mcpEndpoint: string;
    }
  >;
}

export interface PipelineBreadcrumbsResult {
  items: BreadcrumbItem[];
  jsonLd: SchemaOrgBreadcrumbList;
  stageSummaries: StageProgressSummary[];
  activeFlow: DslFlowNode | null;
  activeStageMeta: PipelineStageMeta | null;
  prevFlow: DslFlowNode | null;
  nextFlow: DslFlowNode | null;
  verifiedCount: number;
  totalCount: number;
  completionPct: number;
}

export function getStageMeta(stage: PipelineStage): PipelineStageMeta {
  return PIPELINE_STAGES.find((s) => s.id === stage) || PIPELINE_STAGES[0];
}

export function buildPipelineBreadcrumbs(input: {
  flows: DslFlowNode[];
  topView: TopView;
  activePage: WorkflowSlug;
  stageFilter: 'all' | PipelineStage;
  verifiedSteps: WorkflowSlug[];
  contextLabel?: string;
  origin?: string;
}): PipelineBreadcrumbsResult {
  const {
    flows,
    topView,
    activePage,
    stageFilter,
    verifiedSteps,
    contextLabel,
    origin = 'https://grammar2json.studio',
  } = input;

  const baseUrl = origin.replace(/\/+$/, '');
  const verifiedSet = new Set(verifiedSteps);
  const activeIdx = Math.max(
    0,
    flows.findIndex((f) => f.page === activePage)
  );
  const activeFlow = flows[activeIdx] || flows[0] || null;
  const prevFlow =
    flows.length > 0 ? flows[(activeIdx - 1 + flows.length) % flows.length] : null;
  const nextFlow =
    flows.length > 0 ? flows[(activeIdx + 1) % flows.length] : null;
  const activeStageMeta = activeFlow ? getStageMeta(activeFlow.stage) : null;

  const stageSummaries: StageProgressSummary[] = PIPELINE_STAGES.map((stageMeta) => {
    const stageFlows = flows.filter((f) => f.stage === stageMeta.id);
    const verifiedInStage = stageFlows.filter((f) => verifiedSet.has(f.page)).length;
    return {
      stage: stageMeta.id,
      order: stageMeta.order,
      label: stageMeta.label,
      shortLabel: stageMeta.shortLabel,
      description: stageMeta.description,
      totalSteps: stageFlows.length,
      verifiedSteps: verifiedInStage,
      completionPct:
        stageFlows.length > 0 ? Math.round((verifiedInStage / stageFlows.length) * 100) : 0,
      containsActive: activeFlow?.stage === stageMeta.id,
      steps: stageFlows.map((f) => {
        const mcpServerId = PAGE_TO_MCP_SERVER[f.page] || 'pipeline';
        return {
          ...f,
          verified: verifiedSet.has(f.page),
          active: f.page === activePage,
          mcpServerId,
          mcpEndpoint: `/api/mcp/${mcpServerId}`,
        };
      }),
    };
  });

  const items: BreadcrumbItem[] = [];

  // Level 1: Studio Root
  items.push({
    id: 'root',
    position: 1,
    label: 'Studio',
    kind: 'root',
    href: `${baseUrl}/`,
    current: false,
    targetTopView: 'workbench',
    targetStage: 'all',
  });

  // Level 2: Primary Top View
  const viewSiblings = (Object.keys(TOP_VIEW_LABELS) as TopView[]).map((v) => ({
    id: v,
    label: TOP_VIEW_LABELS[v],
    active: v === topView,
    targetTopView: v,
  }));

  const isTopViewLeaf = topView !== 'workbench' && !contextLabel;
  items.push({
    id: `view:${topView}`,
    position: 2,
    label: TOP_VIEW_LABELS[topView],
    kind: 'view',
    href: `${baseUrl}/?view=${topView}`,
    current: isTopViewLeaf,
    targetTopView: topView,
    targetStage: topView === 'workbench' ? 'all' : undefined,
    siblings: viewSiblings,
  });

  if (topView === 'workbench' && activeFlow && activeStageMeta) {
    // Level 3: Compiler Stage (with sibling stages for quick jump)
    const stageSiblings = stageSummaries.map((s) => ({
      id: s.stage,
      label: `${s.order}. ${s.shortLabel}`,
      sublabel: `${s.verifiedSteps}/${s.totalSteps} verified`,
      active: s.stage === activeStageMeta.id,
      targetTopView: 'workbench' as TopView,
      targetStage: s.stage,
      targetPage: s.steps[0]?.page,
    }));

    items.push({
      id: `stage:${activeStageMeta.id}`,
      position: 3,
      label:
        stageFilter === activeStageMeta.id
          ? `Stage ${activeStageMeta.order}: ${activeStageMeta.shortLabel} (Filtered)`
          : `Stage ${activeStageMeta.order}: ${activeStageMeta.shortLabel}`,
      kind: 'stage',
      href: `${baseUrl}/?view=workbench&stage=${activeStageMeta.id}`,
      current: false,
      targetTopView: 'workbench',
      targetStage: activeStageMeta.id,
      siblings: stageSiblings,
    });

    // Level 4: Active Pipeline Step (with sibling steps in the same stage)
    const activeStageSummary = stageSummaries.find((s) => s.stage === activeStageMeta.id);
    const stepSiblings = (activeStageSummary?.steps || flows.map((f) => ({
      ...f,
      verified: verifiedSet.has(f.page),
      active: f.page === activePage,
    }))).map((f) => ({
      id: f.id,
      label: f.label,
      sublabel: f.id,
      active: f.page === activePage,
      verified: verifiedSet.has(f.page),
      targetTopView: 'workbench' as TopView,
      targetPage: f.page,
    }));

    items.push({
      id: `step:${activeFlow.page}`,
      position: 4,
      label: activeFlow.label,
      kind: 'step',
      href: `${baseUrl}/?view=workbench&stage=${activeStageMeta.id}&page=${activeFlow.page}`,
      current: !contextLabel,
      targetTopView: 'workbench',
      targetStage: activeStageMeta.id,
      targetPage: activeFlow.page,
      siblings: stepSiblings,
    });
  }

  // Optional Level 5 (or 3 for non-workbench views): Active sub-context (schema/rule/server)
  if (contextLabel && contextLabel.trim()) {
    items.push({
      id: `ctx:${contextLabel.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`,
      position: items.length + 1,
      label: contextLabel.trim(),
      kind: 'context',
      href: `${baseUrl}/?view=${topView}&page=${activePage}&context=${encodeURIComponent(contextLabel.trim())}`,
      current: true,
    });
  }

  const jsonLd: SchemaOrgBreadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    name: 'Grammar2JSON Studio Pipeline Navigation',
    numberOfItems: items.length,
    itemListElement: items.map((crumb) => ({
      '@type': 'ListItem',
      position: crumb.position,
      name: crumb.label,
      item: crumb.href,
      identifier: crumb.id,
    })),
  };

  const verifiedCount = flows.filter((f) => verifiedSet.has(f.page)).length;
  const totalCount = flows.length;
  const completionPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

  return {
    items,
    jsonLd,
    stageSummaries,
    activeFlow,
    activeStageMeta,
    prevFlow,
    nextFlow,
    verifiedCount,
    totalCount,
    completionPct,
  };
}
