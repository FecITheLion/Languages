import type { LogicLabelBinding } from './logicLambdaEngine.ts';
import type {
  DialectConfig,
  DialectPresetId,
  LineMutation,
  McpServerId,
  ModalStructure,
  PipelineGridMode,
  PipelineStage,
  PrimaryLanguage,
  RuleOrderConfig,
  SchemaConfig,
  TopView,
  ViewportPreset,
  WorkflowSlug,
} from '../types/studio.ts';

export interface DeepLinkRouteState {
  topView?: TopView;
  activePage?: WorkflowSlug;
  modalOpen?: boolean;
  modalStructure?: ModalStructure;
  viewportPreset?: ViewportPreset;
  stageFilter?: 'all' | PipelineStage;
  pipelineLayoutMode?: PipelineGridMode;
  primaryLanguage?: PrimaryLanguage;
  selectedMcpServerId?: McpServerId;
  dialectPreset?: DialectPresetId;
  evalRule?: string;
  evalPayload?: string;
  histologFromGen?: number;
  histologToGen?: number;
}

export interface DeepLinkFullState extends DeepLinkRouteState {
  v?: 1;
  grammarText?: string;
  dialect?: DialectConfig;
  schemaConfig?: SchemaConfig;
  mutations?: Record<string, LineMutation>;
  ruleConfigs?: Record<string, RuleOrderConfig>;
  logicStatement?: string;
  logicLabels?: LogicLabelBinding[];
  dslSource?: string;
  schemaName?: string;
}

const VALID_TOP_VIEWS: readonly TopView[] = [
  'workbench',
  'formal_logic',
  'schema_predicate',
  'graph',
  'histolog',
  'api',
  'modules',
  'middleware',
  'files',
  'openapi',
  'dsl',
  'bundle',
];

const VALID_PAGES: readonly WorkflowSlug[] = [
  'dialect',
  'rule_props',
  'logic_calc',
  'schema',
  'mutations',
  'evaluator',
  'payload_io',
  'gdrive',
  'python_ast',
  'rust_ast',
  'wasm_wabt',
  'mcp_servers',
];

const VALID_STRUCTURES: readonly ModalStructure[] = ['workbar', 'calculator', 'grid', 'split'];

const VALID_VIEWPORTS: readonly ViewportPreset[] = [
  'responsive',
  '375x667',
  '768x1024',
  '1024x768',
  '1280x720',
];

const VALID_STAGES: ReadonlyArray<'all' | PipelineStage> = [
  'all',
  'frontend',
  'formal',
  'ir',
  'codegen',
  'storage',
];

const VALID_LAYOUTS: readonly PipelineGridMode[] = ['compact', 'lanes', 'rail'];
const VALID_LANGS: readonly PrimaryLanguage[] = [
  'json',
  'python',
  'rust',
  'wasm',
  'typescript',
  'javascript',
  'go',
  'java',
  'cpp',
  'csharp',
  'php',
  'sql',
  'swift',
  'kotlin',
  'ruby',
  'scala',
  'haskell',
  'elixir',
  'lua',
  'zig',
  'dart',
  'ocaml',
];
const VALID_DIALECTS: readonly DialectPresetId[] = [
  'ebnf',
  'bnf',
  'peg',
  'python_peg',
  'rust_macro',
  'wat_sexpr',
];
const VALID_MCP_SERVERS: readonly McpServerId[] = [
  'pipeline',
  'grammar',
  'rule_props',
  'logic_calc',
  'jsonld',
  'mutations',
  'evaluator',
  'python',
  'rust',
  'wasm',
];

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeDeepLinkState(payload: DeepLinkFullState): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeDeepLinkState(encoded: string): DeepLinkFullState | null {
  try {
    const json = fromBase64Url(encoded.trim());
    const parsed = JSON.parse(json) as Partial<DeepLinkFullState>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      v: 1,
      ...parsed,
    };
  } catch {
    return null;
  }
}

/**
 * Parses direct-link parameters from query string (?view=&page=&modal=1&structure=&viewport=...)
 * and optional encoded workspace snapshot in hash (#state=...) or query (?state=...).
 */
export function parseDeepLinkFromLocation(
  search: string,
  hash: string
): { hasDirectLink: boolean; state: DeepLinkFullState } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  let decodedState: DeepLinkFullState | null = null;

  const hashClean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (hashClean) {
    const hashParams = new URLSearchParams(hashClean);
    const hashState = hashParams.get('state');
    if (hashState) {
      decodedState = decodeDeepLinkState(hashState);
    }
  }
  const queryState = params.get('state');
  if (!decodedState && queryState) {
    decodedState = decodeDeepLinkState(queryState);
  }

  const result: DeepLinkFullState = decodedState ? { ...decodedState, v: 1 } : { v: 1 };
  let hasDirectLink = Boolean(decodedState);

  const view = params.get('view');
  if (view && (VALID_TOP_VIEWS as readonly string[]).includes(view)) {
    result.topView = view as TopView;
    hasDirectLink = true;
  }

  const page = params.get('page');
  if (page && (VALID_PAGES as readonly string[]).includes(page)) {
    result.activePage = page as WorkflowSlug;
    hasDirectLink = true;
  }

  const modal = params.get('modal');
  if (modal !== null) {
    result.modalOpen = modal === '1' || modal === 'true' || modal === 'open';
    hasDirectLink = true;
  }

  const structure = params.get('structure');
  if (structure && (VALID_STRUCTURES as readonly string[]).includes(structure)) {
    result.modalStructure = structure as ModalStructure;
    hasDirectLink = true;
  }

  const viewport = params.get('viewport');
  if (viewport && (VALID_VIEWPORTS as readonly string[]).includes(viewport)) {
    result.viewportPreset = viewport as ViewportPreset;
    hasDirectLink = true;
  }

  const stage = params.get('stage');
  if (stage && (VALID_STAGES as readonly string[]).includes(stage)) {
    result.stageFilter = stage as 'all' | PipelineStage;
    hasDirectLink = true;
  }

  const layout = params.get('layout');
  if (layout && (VALID_LAYOUTS as readonly string[]).includes(layout)) {
    result.pipelineLayoutMode = layout as PipelineGridMode;
    hasDirectLink = true;
  }

  const lang = params.get('lang');
  if (lang && (VALID_LANGS as readonly string[]).includes(lang)) {
    result.primaryLanguage = lang as PrimaryLanguage;
    hasDirectLink = true;
  }

  const mcp = params.get('mcp');
  if (mcp && (VALID_MCP_SERVERS as readonly string[]).includes(mcp)) {
    result.selectedMcpServerId = mcp as McpServerId;
    hasDirectLink = true;
  }

  const dialect = params.get('dialect');
  if (dialect && (VALID_DIALECTS as readonly string[]).includes(dialect)) {
    result.dialectPreset = dialect as DialectPresetId;
    hasDirectLink = true;
  }

  const rule = params.get('rule');
  if (rule) {
    result.evalRule = rule;
    hasDirectLink = true;
  }

  const payload = params.get('payload');
  if (payload !== null) {
    result.evalPayload = payload;
    hasDirectLink = true;
  }

  const gen = params.get('gen');
  if (gen) {
    const pair = gen.match(/^(\d+)\.\.(\d+)$/);
    if (pair) {
      result.histologFromGen = Number(pair[1]);
      result.histologToGen = Number(pair[2]);
      hasDirectLink = true;
    } else if (/^\d+$/.test(gen)) {
      result.histologToGen = Number(gen);
      hasDirectLink = true;
    }
  }

  return { hasDirectLink, state: result };
}

/**
 * Builds a clean, shareable direct URL targeting a specific view, workbench, modal,
 * and optional serialized full workspace state.
 */
export function buildDeepLinkUrl(
  baseHref: string,
  state: DeepLinkFullState,
  options?: { includeFullState?: boolean; forceModalOpen?: boolean }
): string {
  const url = new URL(baseHref);
  const params = new URLSearchParams();

  if (state.topView) params.set('view', state.topView);
  if (state.activePage) params.set('page', state.activePage);

  const shouldOpenModal =
    options?.forceModalOpen !== undefined ? options.forceModalOpen : Boolean(state.modalOpen);
  if (shouldOpenModal) {
    params.set('modal', '1');
    if (state.modalStructure) params.set('structure', state.modalStructure);
    if (state.viewportPreset) params.set('viewport', state.viewportPreset);
  }

  if (state.stageFilter && state.stageFilter !== 'all') {
    params.set('stage', state.stageFilter);
  }
  if (state.pipelineLayoutMode && state.pipelineLayoutMode !== 'compact') {
    params.set('layout', state.pipelineLayoutMode);
  }
  if (state.primaryLanguage && state.primaryLanguage !== 'json') {
    params.set('lang', state.primaryLanguage);
  }
  if (state.activePage === 'mcp_servers' && state.selectedMcpServerId) {
    params.set('mcp', state.selectedMcpServerId);
  }
  if (
    state.topView === 'histolog' &&
    typeof state.histologFromGen === 'number' &&
    typeof state.histologToGen === 'number'
  ) {
    params.set('gen', `${state.histologFromGen}..${state.histologToGen}`);
  }

  url.search = params.toString();

  if (options?.includeFullState) {
    const encoded = encodeDeepLinkState({
      ...state,
      modalOpen: shouldOpenModal,
      v: 1,
    });
    url.hash = `state=${encoded}`;
  } else {
    url.hash = '';
  }

  return url.toString();
}
