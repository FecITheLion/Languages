import { exportWorkspaceInLanguage, resolveGrammarSymbols } from './bidirectionalEngine';
import {
  SUPPORTED_LANGUAGES,
  type DialectConfig,
  type DslFlowNode,
  type ExportLanguage,
  type GrammarRule,
  type LineMutation,
  type MutationPolicy,
  type PrimaryLanguage,
  type RuleOrderConfig,
  type SchemaConfig,
  type WorkflowSlug,
} from '../types/studio';

export interface PipelineCompilerPassResult {
  step: number;
  flowId: string;
  page: WorkflowSlug;
  stage: string;
  passName: string;
  built: boolean;
  summary: string;
  artifactTag: string;
  consumesFromStep: number | null;
  consumesArtifact: string | null;
  upstreamReady: boolean;
  handoffNote: string;
}

export interface PipelineCompilerContext {
  flows: DslFlowNode[];
  verifiedSteps: WorkflowSlug[];
  primaryLanguage: PrimaryLanguage;
  rules: GrammarRule[];
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutations: Record<string, LineMutation>;
  mutationPolicy: MutationPolicy;
  ruleConfigs: Record<string, RuleOrderConfig>;
  grammarText: string;
  jsonText: string;
  watSource: string;
  evalRule: string;
  evalPayload: string;
  logicStatement: string;
  logicLabelCount: number;
}

export interface FinalCompilerBuild {
  language: PrimaryLanguage;
  exportLanguage: ExportLanguage;
  languageLabel: string;
  filename: string;
  mime: string;
  content: string;
  passes: PipelineCompilerPassResult[];
  builtCount: number;
  totalCount: number;
  isComplete: boolean;
}

function commentPrefixForLanguage(lang: ExportLanguage): { start: string; end?: string } | null {
  switch (lang) {
    case 'jsonld':
      return null;
    case 'python':
    case 'ruby':
    case 'elixir':
      return { start: '# ' };
    case 'sql':
    case 'haskell':
    case 'lua':
      return { start: '-- ' };
    case 'wat':
      return { start: ';; ' };
    case 'ocaml':
      return { start: '(* ', end: ' *)' };
    default:
      return { start: '// ' };
  }
}

export function describePipelinePass(
  flow: DslFlowNode,
  ctx: PipelineCompilerContext,
  built: boolean,
  prevPass?: { step: number; artifactTag: string; built: boolean; upstreamReady: boolean } | null
): PipelineCompilerPassResult {
  const resolvedSyms = resolveGrammarSymbols(ctx.dialect);
  const enabledSymCount = Object.values(resolvedSyms).filter((v) => v.trim().length > 0).length;
  const lockedCount = ctx.mutationPolicy.lockedRules.length;
  const mutationCount = Object.keys(ctx.mutations).length;
  const consumesFromStep = prevPass ? prevPass.step : null;
  const consumesArtifact = prevPass ? prevPass.artifactTag : null;
  const upstreamReady = prevPass ? prevPass.built && prevPass.upstreamReady : true;
  const makePass = (passName: string, summary: string, artifactTag: string, handoffNote: string): PipelineCompilerPassResult => ({
    step: flow.step,
    flowId: flow.id,
    page: flow.page,
    stage: flow.stage,
    passName,
    built,
    summary,
    artifactTag,
    consumesFromStep,
    consumesArtifact,
    upstreamReady,
    handoffNote,
  });

  switch (flow.page) {
    case 'dialect':
      return makePass(
        'Lexer & Dialect Spec',
        `${ctx.dialect.preset.toUpperCase()} (${ctx.dialect.ruleOperator || 'space'}) · ${enabledSymCount} ops`,
        'lexer.spec',
        'Seeds token alphabet & grammar productions for downstream passes.'
      );
    case 'schema':
      return makePass(
        'Schema & Type Header',
        `${ctx.schemaConfig.schemaName} (${ctx.schemaConfig.schemaOrgType})`,
        'schema.types',
        `Binds typed schema metadata onto ${consumesArtifact || 'lexer.spec'}.`
      );
    case 'rule_props':
      return makePass(
        'Precedence & Assoc Table',
        `${ctx.rules.length} ordered rule${ctx.rules.length === 1 ? '' : 's'}`,
        'precedence.tbl',
        `Orders productions from ${consumesArtifact || 'lexer.spec'} with associativity & properties.`
      );
    case 'mutations':
      return makePass(
        'Mutation Policy & Guards',
        `${mutationCount} guard${mutationCount === 1 ? '' : 's'} · ${lockedCount} locked`,
        'policy.guards',
        `Applies lock & transform guards over ${consumesArtifact || 'schema.types'}.`
      );
    case 'evaluator':
      return makePass(
        'Parser & Payload Check',
        `Entry <${ctx.evalRule || ctx.rules[0]?.name || 'root'}>`,
        'parser.check',
        `Validates sample payloads against ${consumesArtifact || 'precedence.tbl'}.`
      );
    case 'logic_calc':
      return makePass(
        'Logic & λ Semantics',
        `${ctx.logicLabelCount} binding${ctx.logicLabelCount === 1 ? '' : 's'}`,
        'logic.sem',
        `Attaches formal logic & λ callbacks to ${consumesArtifact || 'precedence.tbl'}.`
      );
    case 'jsonld_transform':
      return makePass(
        'JSON-LD IR Lowering',
        `${ctx.jsonText.length} B IR`,
        'ir.jsonld',
        `Lowers ${consumesArtifact || 'policy.guards'} into canonical JSON-LD IR.`
      );
    case 'python_ast':
      return makePass(
        'Python AST Codegen',
        `${ctx.rules.length} rule nodes`,
        'ast.py',
        `Emits Python AST from ${consumesArtifact || 'ir.jsonld'}.`
      );
    case 'rust_ast':
      return makePass(
        'Rust syn AST Codegen',
        `${ctx.rules.length} rule nodes`,
        'ast.rs',
        `Mirrors ${consumesArtifact || 'ast.py'} into typed Rust syn AST.`
      );
    case 'wasm_wabt':
      return makePass(
        'WASM / WABT Emitter',
        `${ctx.watSource.split('\n').length} WAT lines`,
        'emit.wat',
        `Compiles ${consumesArtifact || 'ast.rs'} into WebAssembly text & binary.`
      );
    case 'storage':
      return makePass(
        'Workspace Snapshot',
        `Target: ${ctx.primaryLanguage.toUpperCase()}`,
        'vault.snap',
        `Persists verified ${consumesArtifact || 'emit.wat'} bundle to storage.`
      );
    case 'packaging':
    default:
      return makePass(
        'Final Compiler Package',
        `Export ${ctx.primaryLanguage.toUpperCase()} compiler`,
        `compiler.${ctx.primaryLanguage}`,
        `Packages ${consumesArtifact || 'vault.snap'} into final ${ctx.primaryLanguage.toUpperCase()} compiler.`
      );
  }
}

export function buildFinalPipelineCompiler(ctx: PipelineCompilerContext): FinalCompilerBuild {
  const verifiedSet = new Set(ctx.verifiedSteps);
  const passes: PipelineCompilerPassResult[] = [];
  for (const flow of ctx.flows) {
    const prev = passes.length > 0 ? passes[passes.length - 1] : null;
    passes.push(describePipelinePass(flow, ctx, verifiedSet.has(flow.page), prev));
  }
  const builtCount = passes.filter((p) => p.built).length;
  const totalCount = passes.length;

  const exportLanguage: ExportLanguage =
    ctx.primaryLanguage === 'json'
      ? 'jsonld'
      : ctx.primaryLanguage === 'wasm'
        ? 'wat'
        : (ctx.primaryLanguage as ExportLanguage);

  const langMeta = SUPPORTED_LANGUAGES.find((l) => l.id === ctx.primaryLanguage);
  const baseExport = exportWorkspaceInLanguage(exportLanguage, {
    rules: ctx.rules,
    dialect: ctx.dialect,
    schemaConfig: ctx.schemaConfig,
    mutations: ctx.mutations,
    mutationPolicy: ctx.mutationPolicy,
    ruleConfigs: ctx.ruleConfigs,
    grammarText: ctx.grammarText,
    jsonText: ctx.jsonText,
    watSource: ctx.watSource,
  });

  const slug = (ctx.schemaConfig.schemaName || 'grammar_compiler').replace(/[^A-Za-z0-9_-]/g, '_');
  const ext = langMeta?.extension || '.txt';
  const filename = `${slug}_compiler${ext}`;

  let content = baseExport.content;
  const cmt = commentPrefixForLanguage(exportLanguage);

  if (cmt) {
    const line = (text: string) => `${cmt.start}${text}${cmt.end ?? ''}`;
    const headerLines = [
      line('========================================================================='),
      line(`Final Pipeline Compiler Export · Target: ${langMeta?.label || baseExport.label}`),
      line(`Schema: ${ctx.schemaConfig.schemaName} (${ctx.schemaConfig.schemaOrgType}) | Dialect: ${ctx.dialect.preset} | Rules: ${ctx.rules.length}`),
      line(`Pipeline Build Status: ${builtCount}/${totalCount} steps built`),
      line('-------------------------------------------------------------------------'),
      ...passes.map((p) =>
        line(
          `[${p.built ? 'BUILT' : 'PENDING'}] Step ${String(p.step).padStart(2, '0')} (${p.stage}) ${p.consumesArtifact ? `${p.consumesArtifact} -> ` : ''}${p.artifactTag} | ${p.passName}: ${p.summary}`
        )
      ),
      line('========================================================================='),
      '',
    ];
    if (exportLanguage === 'php' && content.startsWith('<?php')) {
      content = content.replace(/^<\?php\r?\n?/, `<?php\n${headerLines.join('\n')}\n`);
    } else if (content.startsWith('#!')) {
      const nl = content.indexOf('\n');
      content =
        nl >= 0
          ? `${content.slice(0, nl + 1)}${headerLines.join('\n')}\n${content.slice(nl + 1)}`
          : `${content}\n${headerLines.join('\n')}`;
    } else {
      content = `${headerLines.join('\n')}\n${content}`;
    }
  } else {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      parsed['x-pipeline-compiler'] = {
        targetLanguage: langMeta?.label || 'JSON-LD',
        builtSteps: builtCount,
        totalSteps: totalCount,
        complete: builtCount === totalCount && totalCount > 0,
        passes: passes.map((p) => ({
          step: p.step,
          page: p.page,
          stage: p.stage,
          passName: p.passName,
          built: p.built,
          summary: p.summary,
          artifact: p.artifactTag,
        })),
      };
      content = JSON.stringify(parsed, null, 2);
    } catch {
      // Keep raw JSON text if unparseable
    }
  }

  return {
    language: ctx.primaryLanguage,
    exportLanguage,
    languageLabel: langMeta?.label || baseExport.label,
    filename,
    mime: baseExport.mime,
    content,
    passes,
    builtCount,
    totalCount,
    isComplete: totalCount > 0 && builtCount === totalCount,
  };
}
