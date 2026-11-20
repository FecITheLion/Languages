import type { GlobalCallbackDef } from './globalCallbacksEngine.ts';
import type { LogicLabelBinding } from './logicLambdaEngine.ts';
import type {
  GrammarDiagnostic,
  GrammarRule,
  RuleDependencyGraphData,
  RuleOrderConfig,
} from '../types/studio.ts';

export interface StudioLintIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code:
    | 'UNUSED_RULE'
    | 'UNDEFINED_REF'
    | 'DISABLED_SYMBOL'
    | 'SYNTAX_OPERATOR'
    | 'UNCLOSED_QUOTE'
    | 'UNUSED_LABEL'
    | 'UNUSED_CALLBACK'
    | 'UNUSED_LAMBDA_PARAM'
    | 'DUPLICATE_RULE'
    | 'CYCLE'
    | 'JSON_INVALID';
  symbol: string;
  lineNumber?: number;
  message: string;
  suggestion: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function analyzeStudioLint(input: {
  rules: GrammarRule[];
  graph: RuleDependencyGraphData;
  evalRule: string;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
  globalCallbacks: GlobalCallbackDef[];
  ruleConfigs: Record<string, RuleOrderConfig>;
  jsonValid?: boolean;
  jsonError?: string | null;
}): StudioLintIssue[] {
  const issues: StudioLintIssue[] = [];

  // 1. Grammar / Extended DAG diagnostics (undefined refs, disabled symbols, duplicates, cycles)
  for (const d of input.graph.diagnostics as GrammarDiagnostic[]) {
    const mappedCode: StudioLintIssue['code'] =
      d.code === 'UNDEFINED_REF'
        ? 'UNDEFINED_REF'
        : d.code === 'DISABLED_SYMBOL'
          ? 'DISABLED_SYMBOL'
          : d.code === 'DUPLICATE_RULE'
            ? 'DUPLICATE_RULE'
            : d.code === 'CYCLE'
              ? 'CYCLE'
              : d.code === 'SYNTAX_OPERATOR'
                ? 'SYNTAX_OPERATOR'
                : d.code === 'UNCLOSED_QUOTE'
                  ? 'UNCLOSED_QUOTE'
                  : 'UNDEFINED_REF';
    issues.push({
      id: `dag_${d.id}`,
      severity: d.severity,
      code: mappedCode,
      symbol: d.ruleName || d.code,
      lineNumber: d.lineNumber,
      message: d.message,
      suggestion:
        d.code === 'DISABLED_SYMBOL'
          ? 'Enable this operator symbol in 01. Syntax Dialect → Extended DAG Symbol Definitions.'
          : d.code === 'UNDEFINED_REF'
            ? 'Define the missing rule or use Auto-Stub Missing Rules.'
            : 'Inspect the rule definition in 01. Syntax Dialect or Rule Graph.',
    });
  }

  // 2. Unused grammar rules (inDegree === 0 and not the active start rule)
  const definedRuleNames = new Set(input.rules.map((r) => r.name));
  const startRule =
    (input.evalRule.trim() && definedRuleNames.has(input.evalRule.trim())
      ? input.evalRule.trim()
      : input.rules[0]?.name) || '';
  for (const node of input.graph.nodes) {
    if (node.isMissing) continue;
    if (node.inDegree === 0 && node.name !== startRule && input.rules.length > 1) {
      issues.push({
        id: `unused_rule_${node.name}`,
        severity: 'warning',
        code: 'UNUSED_RULE',
        symbol: node.name,
        lineNumber: node.lineNumber ?? undefined,
        message: `Unused rule <${node.name}> — not referenced by any production or the active start rule <${startRule}>.`,
        suggestion: `Reference <${node.name}> in <${startRule}>, switch Evaluator start rule to <${node.name}>, or remove it.`,
      });
    }
  }

  // 3. Unused logic labels & unused local/global callbacks
  const allPropValues = Object.values(input.ruleConfigs || {})
    .flatMap((cfg) => (cfg.properties || []).map((p) => p.value))
    .join(' ');
  const combinedLogicCorpus = `${input.logicStatement} ${input.logicLabels
    .map((l) => l.value)
    .join(' ')} ${allPropValues}`;

  for (const lbl of input.logicLabels) {
    const clean = lbl.name.trim();
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`);
    const usedInStmt = regex.test(input.logicStatement);
    const usedInOtherLabels = input.logicLabels.some(
      (other) => other.id !== lbl.id && regex.test(other.value)
    );
    const usedInProps = regex.test(allPropValues);
    if (!usedInStmt && !usedInOtherLabels && !usedInProps) {
      issues.push({
        id: `unused_label_${lbl.id}`,
        severity: 'warning',
        code: lbl.kind === 'lambda' ? 'UNUSED_CALLBACK' : 'UNUSED_LABEL',
        symbol: clean,
        message:
          lbl.kind === 'lambda'
            ? `Unused λ callback "${clean}" — declared in Labels but never called in LOGIC_STATEMENT or rule properties.`
            : `Unused label "${clean}" (${lbl.kind}) — declared but never referenced in LOGIC_STATEMENT or rule properties.`,
        suggestion:
          lbl.kind === 'lambda'
            ? `Call ${clean}(...) in LOGIC_STATEMENT or inside a Custom Rule Property, or remove it.`
            : `Reference "${clean}" in LOGIC_STATEMENT or remove the unused binding.`,
      });
    }

    // Check unused lambda parameter (e.g. λx. 42)
    if (lbl.kind === 'lambda') {
      const paramMatches = Array.from(lbl.value.matchAll(/[λ\\]\s*([A-Za-z_][A-Za-z0-9_]*)\s*\./g));
      const lastDot = lbl.value.lastIndexOf('.');
      const body = lastDot >= 0 ? lbl.value.slice(lastDot + 1) : '';
      for (const pm of paramMatches) {
        const pName = pm[1];
        const pRegex = new RegExp(`\\b${pName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (body && !pRegex.test(body)) {
          issues.push({
            id: `unused_param_${lbl.id}_${pName}`,
            severity: 'info',
            code: 'UNUSED_LAMBDA_PARAM',
            symbol: pName,
            message: `Unused parameter "${pName}" in callback "${clean}" (${lbl.value}).`,
            suggestion: `Use "${pName}" in the λ body or rename it to "_${pName}".`,
          });
        }
      }
    }
  }

  for (const cb of input.globalCallbacks) {
    const clean = cb.name.trim();
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`);
    if (!regex.test(combinedLogicCorpus)) {
      const cbSig = `${clean}(${cb.params.join(', ')})`;
      issues.push({
        id: `unused_global_cb_${cb.id}`,
        severity: 'info',
        code: 'UNUSED_CALLBACK',
        symbol: clean,
        message: `Unused global callback "${clean}" (${cbSig}) — saved locally, not currently called in active workspace.`,
        suggestion: `Insert "${clean} (...)" into any Rule Property or Logic statement.`,
      });
    }
  }

  if (input.jsonValid === false && input.jsonError) {
    issues.push({
      id: 'json_syntax_error',
      severity: 'error',
      code: 'JSON_INVALID',
      symbol: 'JSON-LD',
      message: `JSON-LD syntax error: ${input.jsonError}`,
      suggestion: 'Fix the JSON syntax in the Bidirectional Live State Mirror or Undo to the previous valid generation.',
    });
  }

  return issues;
}

/**
 * Generates a standalone semantic HTML document string for any Studio code/schema/grammar output,
 * complete with syntax token classes and inline lint tooltip markers.
 */
export function formatCodeAsHtmlDocument(
  code: string,
  title: string,
  language: string,
  issues: StudioLintIssue[] = []
): string {
  const lines = code.split(/\r?\n/);
  const lineIssueMap = new Map<number, StudioLintIssue[]>();
  for (const issue of issues) {
    if (issue.lineNumber) {
      const list = lineIssueMap.get(issue.lineNumber) || [];
      list.push(issue);
      lineIssueMap.set(issue.lineNumber, list);
    }
  }

  const rowsHtml = lines
    .map((line, idx) => {
      const ln = idx + 1;
      const lineIssues = lineIssueMap.get(ln) || [];
      const symIssue =
        lineIssues[0] ||
        issues.find(
          (i) =>
            !i.lineNumber &&
            i.symbol &&
            new RegExp(`\\b${i.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line)
        );
      const cls = symIssue
        ? symIssue.severity === 'error'
          ? 'line lint-error'
          : symIssue.severity === 'warning'
            ? 'line lint-warn'
            : 'line lint-info'
        : 'line';
      const titleAttr = symIssue
        ? ` title="${escapeHtml(`[${symIssue.code}] ${symIssue.message} — ${symIssue.suggestion}`)}"`
        : '';
      return `    <tr class="${cls}"${titleAttr}><td class="ln">${ln}</td><td class="code"><code>${escapeHtml(line)}</code></td></tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} (${escapeHtml(language)})</title>
  <style>
    body { margin: 0; padding: 16px; background: #020617; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; }
    td.ln { width: 42px; text-align: right; padding: 1px 10px 1px 0; color: #64748b; user-select: none; vertical-align: top; }
    td.code { white-space: pre; padding: 1px 6px; }
    tr.lint-error td.code { background: rgba(239,68,68,0.16); text-decoration: wavy underline #f87171; }
    tr.lint-warn td.code { background: rgba(245,158,11,0.14); text-decoration: wavy underline #fbbf24; }
    tr.lint-info td.code { background: rgba(59,130,246,0.12); text-decoration: dotted underline #60a5fa; }
  </style>
</head>
<body>
  <header><strong>${escapeHtml(title)}</strong><span>${escapeHtml(language)} · ${lines.length} lines · ${issues.length} lint note${issues.length === 1 ? '' : 's'}</span></header>
  <table>
${rowsHtml}
  </table>
</body>
</html>
`;
}
