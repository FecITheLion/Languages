import { compileWatToWasm, decompileWasmToWat } from './bidirectionalEngine.ts';
import type { DialectConfig, GrammarRule, WasmCompilationResult } from '../types/studio.ts';
import {
  buildLowerTargetExecutableModule,
  emitCompiledTargetExpr,
  lowerLogicAstForCodegen,
} from './logicTargetCodegen.ts';

export interface LogicGrammarContext {
  grammarText?: string;
  rules?: GrammarRule[];
  dialect?: DialectConfig;
  sampleInput?: string;
}

export type LogicExportTarget =
  | 'python'
  | 'jsonld'
  | 'rust'
  | 'wat'
  | 'wasm'
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'sql'
  | 'swift'
  | 'kotlin'
  | 'ruby'
  | 'scala'
  | 'haskell'
  | 'elixir'
  | 'lua'
  | 'zig'
  | 'dart'
  | 'ocaml';
export type LogicExportInputMode = 'cli' | 'hardcoded';

export type CauchyParamStyle = 'positional' | 'directional' | 'named';

export interface CauchySequenceConfig {
  enabled: boolean;
  paramStyle: CauchyParamStyle;
  customParamNames: string;
  seedValues: string;
  recurrenceExpr: string;
  maxIterations: number;
  epsilon: number;
}

export interface CauchyStepRecord {
  n: number;
  value: number;
  prevDelta: number | null;
  tailDiameter: number;
  withinEpsilon: boolean;
}

export interface CauchyEvaluationResult {
  ok: boolean;
  converged: boolean;
  cauchyIndexN: number | null;
  limitEstimate: number | null;
  finalDelta: number | null;
  tailDiameter: number | null;
  resolvedParamNames: string[];
  availableAliases: string[];
  steps: CauchyStepRecord[];
  error?: string;
}

export interface CauchyPreset {
  id: string;
  label: string;
  description: string;
  config: CauchySequenceConfig;
}

export const CAUCHY_SEQUENCE_PRESETS: CauchyPreset[] = [
  {
    id: 'bisection_midpoint',
    label: 'Midpoint (left / right)',
    description: 'a_n = (left + right) / 2 from seeds 0, 1 → converges to 2/3',
    config: {
      enabled: true,
      paramStyle: 'directional',
      customParamNames: 'left, right',
      seedValues: '0, 1',
      recurrenceExpr: '(left + right) / 2',
      maxIterations: 24,
      epsilon: 0.0001,
    },
  },
  {
    id: 'heron_sqrt2',
    label: 'Heron √2 (_#)',
    description: 'a_n = (_1 + 2 / _1) / 2 from seed 1 → converges to √2',
    config: {
      enabled: true,
      paramStyle: 'positional',
      customParamNames: 'x',
      seedValues: '1',
      recurrenceExpr: '(_1 + (2 / _1)) / 2',
      maxIterations: 12,
      epsilon: 0.00001,
    },
  },
  {
    id: 'golden_ratio',
    label: 'Golden φ (left / right)',
    description: 'a_n = 1 + 1 / right from seeds 1, 1 → converges to φ ≈ 1.618034',
    config: {
      enabled: true,
      paramStyle: 'directional',
      customParamNames: 'left, right',
      seedValues: '1, 1',
      recurrenceExpr: '1 + (1 / right)',
      maxIterations: 24,
      epsilon: 0.0001,
    },
  },
  {
    id: 'weighted_named',
    label: 'Weighted Avg (a, b)',
    description: 'a_n = (a + 2 * b) / 3 using given parameter names a, b',
    config: {
      enabled: true,
      paramStyle: 'named',
      customParamNames: 'a, b',
      seedValues: '0, 10',
      recurrenceExpr: '(a + (2 * b)) / 3',
      maxIterations: 28,
      epsilon: 0.0001,
    },
  },
];

export const DEFAULT_CAUCHY_CONFIG: CauchySequenceConfig = {
  ...CAUCHY_SEQUENCE_PRESETS[0].config,
  enabled: false,
};

export interface LogicLabelBinding {
  id: string;
  name: string;
  value: string;
  kind: 'number' | 'boolean' | 'lambda';
}

export type LogicAstNode =
  | { type: 'NumberLit'; value: number }
  | { type: 'BoolLit'; value: boolean }
  | { type: 'Identifier'; name: string }
  | { type: 'UnaryOp'; op: '¬' | '-'; operand: LogicAstNode }
  | {
      type: 'BinaryOp';
      op: '∧' | '∨' | '⊕' | '→' | '↔' | '≡' | '=' | '≠' | '<' | '≤' | '>' | '≥' | '+' | '-' | '*' | '/' | '^' | '%';
      left: LogicAstNode;
      right: LogicAstNode;
    }
  | { type: 'Quantifier'; quantifier: '∀' | '∃'; variable: string; body: LogicAstNode }
  | { type: 'Lambda'; param: string; body: LogicAstNode }
  | { type: 'Call'; callee: LogicAstNode; arg: LogicAstNode };

export interface LogicCallbackHooks {
  onFinalResult?: string;
  onLogicTrue?: string;
  onLogicFalse?: string;
}

export interface LogicHookExecution {
  hook: 'onFinalResult' | 'onLogicTrue' | 'onLogicFalse';
  callbackName: string;
  input: string;
  output: string;
}

export type EvalValue =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'closure'; param: string; body: LogicAstNode; env: Map<string, EvalValue> };

export interface LogicEvalTraceStep {
  step: number;
  kind: 'beta' | 'callback' | 'logic' | 'arith' | 'bind';
  expression: string;
  result: string;
}

export interface TruthTableRow {
  assignments: Record<string, boolean>;
  result: string;
}

export interface LogicEvaluationResult {
  ok: boolean;
  ast: LogicAstNode | null;
  value: EvalValue | null;
  displayValue: string;
  valueType: 'number' | 'boolean' | 'lambda' | 'error';
  trace: LogicEvalTraceStep[];
  freeVariables: string[];
  truthTable: { variables: string[]; rows: TruthTableRow[] } | null;
  hookExecutions?: LogicHookExecution[];
  error?: string;
}

export function getLogicBindingDiagnostics(
  result: LogicEvaluationResult,
  labels: LogicLabelBinding[]
): Array<{ code: 'unbound_label'; label: string }> {
  const missing = result.error?.match(/^Unbound label "([A-Za-z_][A-Za-z0-9_]*)"/)?.[1];
  if (!missing) return [];
  const configured = new Set(labels.map((label) => label.name.trim()));
  return [...new Set([...result.freeVariables.filter((name) => !configured.has(name)), missing])]
    .map((label) => ({ code: 'unbound_label' as const, label }));
}

export interface LabelSuggestionOption {
  label: string;
  value: string;
  kind: LogicLabelBinding['kind'];
  signature?: string;
}

export interface LabelSuggestion {
  id: string;
  name: string;
  issue: 'undefined' | 'empty_value' | 'invalid_value';
  inferredKind: 'boolean' | 'number' | 'lambda';
  expectedArity?: number;
  reason: string;
  permitted: boolean;
  lockReason?: string;
  options: LabelSuggestionOption[];
  existingLabelId?: string;
}

export interface NamedCallbackSpec {
  name: string;
  params: string[];
  signature: string;
  body: string;
  lambdaExpr: string;
  source: 'label' | 'lifted';
}

export interface NamedCallbackTranslation {
  ok: boolean;
  originalStatement: string;
  translatedStatement: string;
  callbacks: NamedCallbackSpec[];
  liftedLabels: LogicLabelBinding[];
  callCount: number;
  changed: boolean;
}

export interface LogicPreset {
  id: string;
  label: string;
  statement: string;
  labels: LogicLabelBinding[];
}

export const LOGIC_CALCULATOR_PRESETS: LogicPreset[] = [
  {
    id: 'lambda_callback_order',
    label: 'Lambda Callback + Logic Gate',
    statement: '(apply_discount(double)(price) ≥ 80) ∧ ¬(tax > 15)',
    labels: [
      { id: 'lbl_1', name: 'price', value: '45', kind: 'number' },
      { id: 'lbl_2', name: 'tax', value: '8', kind: 'number' },
      { id: 'lbl_3', name: 'double', value: 'λx. x * 2', kind: 'lambda' },
      { id: 'lbl_4', name: 'apply_discount', value: 'λcb. λv. cb(v) - 10', kind: 'lambda' },
    ],
  },
  {
    id: 'propositional_tautology',
    label: 'Propositional Logic (Modus Ponens)',
    statement: '((P → Q) ∧ P) → Q',
    labels: [
      { id: 'lbl_p', name: 'P', value: 'true', kind: 'boolean' },
      { id: 'lbl_q', name: 'Q', value: 'false', kind: 'boolean' },
    ],
  },
  {
    id: 'church_composition',
    label: 'Higher-Order Compose (f ∘ g)',
    statement: 'compose(inc)(square)(base) + offset',
    labels: [
      { id: 'lbl_b', name: 'base', value: '6', kind: 'number' },
      { id: 'lbl_o', name: 'offset', value: '5', kind: 'number' },
      { id: 'lbl_inc', name: 'inc', value: 'λx. x + 1', kind: 'lambda' },
      { id: 'lbl_sq', name: 'square', value: 'λx. x * x', kind: 'lambda' },
      { id: 'lbl_cmp', name: 'compose', value: 'λf. λg. λx. f(g(x))', kind: 'lambda' },
    ],
  },
  {
    id: 'xor_guard',
    label: 'Arithmetic Threshold & XOR Guard',
    statement: '((rate * hours) > 100) ⊕ override',
    labels: [
      { id: 'lbl_r', name: 'rate', value: '35', kind: 'number' },
      { id: 'lbl_h', name: 'hours', value: '4', kind: 'number' },
      { id: 'lbl_ov', name: 'override', value: 'false', kind: 'boolean' },
    ],
  },
];

/* ============================================================================
 * 1. LEXER & RECURSIVE-DESCENT PARSER (LOGIC + ARITHMETIC + LAMBDA CALCULUS)
 * ========================================================================== */

type TokenType =
  | 'NUMBER'
  | 'BOOL'
  | 'IDENT'
  | 'LAMBDA'
  | 'FORALL'
  | 'EXISTS'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'NOT'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'IMPLIES'
  | 'IFF'
  | 'EQUIV'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'PLUS'
  | 'MINUS'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'POW'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenizeLogic(input: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Multi-character ASCII equivalents for logic & comparison symbols
    const three = input.slice(i, i + 3);
    const two = input.slice(i, i + 2);

    if (three === '<->' || three === '<=>') {
      tokens.push({ type: 'IFF', value: '↔', pos: i });
      i += 3;
      continue;
    }
    if (two === '->' || two === '=>') {
      tokens.push({ type: 'IMPLIES', value: '→', pos: i });
      i += 2;
      continue;
    }
    if (two === '&&' || two === '/\\') {
      tokens.push({ type: 'AND', value: '∧', pos: i });
      i += 2;
      continue;
    }
    if (two === '||' || two === '\\/') {
      tokens.push({ type: 'OR', value: '∨', pos: i });
      i += 2;
      continue;
    }
    if (two === '!=' || two === '<>') {
      tokens.push({ type: 'NEQ', value: '≠', pos: i });
      i += 2;
      continue;
    }
    if (two === '<=') {
      tokens.push({ type: 'LTE', value: '≤', pos: i });
      i += 2;
      continue;
    }
    if (two === '>=') {
      tokens.push({ type: 'GTE', value: '≥', pos: i });
      i += 2;
      continue;
    }
    if (two === '==') {
      tokens.push({ type: 'EQ', value: '=', pos: i });
      i += 2;
      continue;
    }
    if (two === '**') {
      tokens.push({ type: 'POW', value: '^', pos: i });
      i += 2;
      continue;
    }

    // Single-character Unicode & ASCII operators
    switch (ch) {
      case 'λ':
      case '\\':
        tokens.push({ type: 'LAMBDA', value: 'λ', pos: i });
        i += 1;
        continue;
      case '.':
        tokens.push({ type: 'DOT', value: '.', pos: i });
        i += 1;
        continue;
      case '(':
        tokens.push({ type: 'LPAREN', value: '(', pos: i });
        i += 1;
        continue;
      case ')':
        tokens.push({ type: 'RPAREN', value: ')', pos: i });
        i += 1;
        continue;
      case ',':
        tokens.push({ type: 'COMMA', value: ',', pos: i });
        i += 1;
        continue;
      case '¬':
      case '!':
      case '~':
        tokens.push({ type: 'NOT', value: '¬', pos: i });
        i += 1;
        continue;
      case '∧':
      case '&':
        tokens.push({ type: 'AND', value: '∧', pos: i });
        i += 1;
        continue;
      case '∨':
      case '|':
        tokens.push({ type: 'OR', value: '∨', pos: i });
        i += 1;
        continue;
      case '⊕':
        tokens.push({ type: 'XOR', value: '⊕', pos: i });
        i += 1;
        continue;
      case '→':
        tokens.push({ type: 'IMPLIES', value: '→', pos: i });
        i += 1;
        continue;
      case '↔':
        tokens.push({ type: 'IFF', value: '↔', pos: i });
        i += 1;
        continue;
      case '≡':
        tokens.push({ type: 'EQUIV', value: '≡', pos: i });
        i += 1;
        continue;
      case '∀':
        tokens.push({ type: 'FORALL', value: '∀', pos: i });
        i += 1;
        continue;
      case '∃':
        tokens.push({ type: 'EXISTS', value: '∃', pos: i });
        i += 1;
        continue;
      case '⊤':
        tokens.push({ type: 'BOOL', value: 'true', pos: i });
        i += 1;
        continue;
      case '⊥':
        tokens.push({ type: 'BOOL', value: 'false', pos: i });
        i += 1;
        continue;
      case '=':
        tokens.push({ type: 'EQ', value: '=', pos: i });
        i += 1;
        continue;
      case '≠':
        tokens.push({ type: 'NEQ', value: '≠', pos: i });
        i += 1;
        continue;
      case '<':
        tokens.push({ type: 'LT', value: '<', pos: i });
        i += 1;
        continue;
      case '≤':
        tokens.push({ type: 'LTE', value: '≤', pos: i });
        i += 1;
        continue;
      case '>':
        tokens.push({ type: 'GT', value: '>', pos: i });
        i += 1;
        continue;
      case '≥':
        tokens.push({ type: 'GTE', value: '≥', pos: i });
        i += 1;
        continue;
      case '+':
        tokens.push({ type: 'PLUS', value: '+', pos: i });
        i += 1;
        continue;
      case '-':
      case '−':
        tokens.push({ type: 'MINUS', value: '-', pos: i });
        i += 1;
        continue;
      case '*':
      case '×':
      case '·':
        tokens.push({ type: 'MUL', value: '*', pos: i });
        i += 1;
        continue;
      case '/':
      case '÷':
        tokens.push({ type: 'DIV', value: '/', pos: i });
        i += 1;
        continue;
      case '%':
        tokens.push({ type: 'MOD', value: '%', pos: i });
        i += 1;
        continue;
      case '^':
        tokens.push({ type: 'POW', value: '^', pos: i });
        i += 1;
        continue;
      default:
        break;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      tokens.push({ type: 'NUMBER', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j += 1;
      const word = input.slice(i, j);
      const lower = word.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        tokens.push({ type: 'BOOL', value: lower, pos: i });
      } else if (lower === 'lambda') {
        tokens.push({ type: 'LAMBDA', value: 'λ', pos: i });
      } else if (lower === 'and') {
        tokens.push({ type: 'AND', value: '∧', pos: i });
      } else if (lower === 'or') {
        tokens.push({ type: 'OR', value: '∨', pos: i });
      } else if (lower === 'xor') {
        tokens.push({ type: 'XOR', value: '⊕', pos: i });
      } else if (lower === 'not') {
        tokens.push({ type: 'NOT', value: '¬', pos: i });
      } else if (lower === 'implies') {
        tokens.push({ type: 'IMPLIES', value: '→', pos: i });
      } else if (lower === 'iff') {
        tokens.push({ type: 'IFF', value: '↔', pos: i });
      } else if (lower === 'equiv') {
        tokens.push({ type: 'EQUIV', value: '≡', pos: i });
      } else if (lower === 'forall') {
        tokens.push({ type: 'FORALL', value: '∀', pos: i });
      } else if (lower === 'exists') {
        tokens.push({ type: 'EXISTS', value: '∃', pos: i });
      } else {
        tokens.push({ type: 'IDENT', value: word, pos: i });
      }
      i = j;
      continue;
    }

    return { ok: false, error: `Unexpected symbol "${ch}" at position ${i + 1}.` };
  }

  tokens.push({ type: 'EOF', value: '', pos: input.length });
  return { ok: true, tokens };
}

export function parseLogicExpression(
  input: string
): { ok: true; ast: LogicAstNode } | { ok: false; error: string } {
  if (!input.trim()) {
    return { ok: false, error: 'Expression is empty.' };
  }
  const lex = tokenizeLogic(input);
  if (!lex.ok) return lex;
  const tokens = lex.tokens;
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = (expected?: TokenType): Token => {
    const tok = tokens[pos];
    if (expected && tok.type !== expected) {
      throw new Error(`Expected ${expected} near "${tok.value || 'end of input'}" (pos ${tok.pos + 1}).`);
    }
    pos += 1;
    return tok;
  };

  function parseExpr(): LogicAstNode {
    return parseLambda();
  }

  function parseLambda(): LogicAstNode {
    if (peek().type === 'FORALL' || peek().type === 'EXISTS') {
      const qTok = consume();
      const quantifier: '∀' | '∃' = qTok.type === 'FORALL' ? '∀' : '∃';
      const vars: string[] = [];
      while (peek().type === 'IDENT') {
        vars.push(consume('IDENT').value);
        if (peek().type === 'COMMA') consume('COMMA');
      }
      if (vars.length === 0) {
        throw new Error(`Quantifier ${quantifier} requires at least one bound variable before ".".`);
      }
      if (peek().type === 'DOT') {
        consume('DOT');
      }
      let body = parseExpr();
      for (let idx = vars.length - 1; idx >= 0; idx -= 1) {
        body = { type: 'Quantifier', quantifier, variable: vars[idx], body };
      }
      return body;
    }
    if (peek().type === 'LAMBDA') {
      consume('LAMBDA');
      const params: string[] = [];
      while (peek().type === 'IDENT') {
        params.push(consume('IDENT').value);
        if (peek().type === 'COMMA') consume('COMMA');
      }
      if (params.length === 0) {
        throw new Error('Lambda abstraction requires at least one parameter name before ".".');
      }
      if (peek().type === 'DOT' || peek().type === 'IMPLIES') {
        consume();
      } else {
        throw new Error('Expected "." after lambda parameter(s).');
      }
      let body = parseExpr();
      for (let idx = params.length - 1; idx >= 0; idx -= 1) {
        body = { type: 'Lambda', param: params[idx], body };
      }
      return body;
    }
    return parseIff();
  }

  function parseIff(): LogicAstNode {
    let left = parseImplies();
    while (peek().type === 'IFF' || peek().type === 'EQUIV') {
      const tok = consume();
      const right = parseImplies();
      left = { type: 'BinaryOp', op: tok.type === 'EQUIV' ? '≡' : '↔', left, right };
    }
    return left;
  }

  function parseImplies(): LogicAstNode {
    const left = parseOr();
    if (peek().type === 'IMPLIES') {
      consume('IMPLIES');
      // Right-associative implication: A → B → C === A → (B → C)
      const right = parseImplies();
      return { type: 'BinaryOp', op: '→', left, right };
    }
    return left;
  }

  function parseOr(): LogicAstNode {
    let left = parseXor();
    while (peek().type === 'OR') {
      consume('OR');
      left = { type: 'BinaryOp', op: '∨', left, right: parseXor() };
    }
    return left;
  }

  function parseXor(): LogicAstNode {
    let left = parseAnd();
    while (peek().type === 'XOR') {
      consume('XOR');
      left = { type: 'BinaryOp', op: '⊕', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): LogicAstNode {
    let left = parseComparison();
    while (peek().type === 'AND') {
      consume('AND');
      left = { type: 'BinaryOp', op: '∧', left, right: parseComparison() };
    }
    return left;
  }

  function parseComparison(): LogicAstNode {
    let left = parseAdditive();
    while (
      peek().type === 'EQ' ||
      peek().type === 'NEQ' ||
      peek().type === 'LT' ||
      peek().type === 'LTE' ||
      peek().type === 'GT' ||
      peek().type === 'GTE'
    ) {
      const tok = consume();
      const right = parseAdditive();
      left = {
        type: 'BinaryOp',
        op: tok.value as '=' | '≠' | '<' | '≤' | '>' | '≥',
        left,
        right,
      };
    }
    return left;
  }

  function parseAdditive(): LogicAstNode {
    let left = parseMultiplicative();
    while (peek().type === 'PLUS' || peek().type === 'MINUS') {
      const tok = consume();
      left = { type: 'BinaryOp', op: tok.value as '+' | '-', left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative(): LogicAstNode {
    let left = parsePower();
    while (peek().type === 'MUL' || peek().type === 'DIV' || peek().type === 'MOD') {
      const tok = consume();
      left = { type: 'BinaryOp', op: tok.value as '*' | '/' | '%', left, right: parsePower() };
    }
    return left;
  }

  function parsePower(): LogicAstNode {
    const base = parseUnary();
    if (peek().type === 'POW') {
      consume('POW');
      return { type: 'BinaryOp', op: '^', left: base, right: parsePower() };
    }
    return base;
  }

  function parseUnary(): LogicAstNode {
    if (peek().type === 'NOT') {
      consume('NOT');
      return { type: 'UnaryOp', op: '¬', operand: parseUnary() };
    }
    if (peek().type === 'MINUS') {
      consume('MINUS');
      return { type: 'UnaryOp', op: '-', operand: parseUnary() };
    }
    return parseCall();
  }

  function parseCall(): LogicAstNode {
    let expr = parsePrimary();
    while (peek().type === 'LPAREN') {
      consume('LPAREN');
      const args: LogicAstNode[] = [];
      if (peek().type !== 'RPAREN') {
        args.push(parseExpr());
        while (peek().type === 'COMMA') {
          consume('COMMA');
          args.push(parseExpr());
        }
      }
      consume('RPAREN');
      for (const arg of args) {
        expr = { type: 'Call', callee: expr, arg };
      }
    }
    return expr;
  }

  function parsePrimary(): LogicAstNode {
    const tok = peek();
    if (tok.type === 'NUMBER') {
      consume('NUMBER');
      return { type: 'NumberLit', value: Number(tok.value) };
    }
    if (tok.type === 'BOOL') {
      consume('BOOL');
      return { type: 'BoolLit', value: tok.value === 'true' };
    }
    if (tok.type === 'IDENT') {
      consume('IDENT');
      return { type: 'Identifier', name: tok.value };
    }
    if (tok.type === 'LPAREN') {
      consume('LPAREN');
      const inner = parseExpr();
      consume('RPAREN');
      return inner;
    }
    throw new Error(`Unexpected token "${tok.value || 'EOF'}" at position ${tok.pos + 1}.`);
  }

  try {
    const ast = parseExpr();
    if (peek().type !== 'EOF') {
      return {
        ok: false,
        error: `Unexpected trailing token "${peek().value}" at position ${peek().pos + 1}.`,
      };
    }
    return { ok: true, ast };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to parse logic/lambda expression.',
    };
  }
}

export function formatLogicAst(node: LogicAstNode): string {
  switch (node.type) {
    case 'NumberLit':
      return String(node.value);
    case 'BoolLit':
      return node.value ? '⊤' : '⊥';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return `${node.op}${node.operand.type === 'BinaryOp' ? `(${formatLogicAst(node.operand)})` : formatLogicAst(node.operand)}`;
    case 'BinaryOp':
      return `(${formatLogicAst(node.left)} ${node.op} ${formatLogicAst(node.right)})`;
    case 'Quantifier':
      return `(${node.quantifier}${node.variable}. ${formatLogicAst(node.body)})`;
    case 'Lambda':
      return `(λ${node.param}. ${formatLogicAst(node.body)})`;
    case 'Call':
      return `${formatLogicAst(node.callee)}(${formatLogicAst(node.arg)})`;
  }
}

function collectFreeVariables(node: LogicAstNode, bound: Set<string> = new Set()): Set<string> {
  const out = new Set<string>();
  switch (node.type) {
    case 'Identifier':
      if (!bound.has(node.name)) out.add(node.name);
      return out;
    case 'UnaryOp':
      return collectFreeVariables(node.operand, bound);
    case 'BinaryOp': {
      const l = collectFreeVariables(node.left, bound);
      const r = collectFreeVariables(node.right, bound);
      l.forEach((v) => out.add(v));
      r.forEach((v) => out.add(v));
      return out;
    }
    case 'Quantifier': {
      const nextBound = new Set(bound);
      nextBound.add(node.variable);
      return collectFreeVariables(node.body, nextBound);
    }
    case 'Lambda': {
      const nextBound = new Set(bound);
      nextBound.add(node.param);
      return collectFreeVariables(node.body, nextBound);
    }
    case 'Call': {
      collectFreeVariables(node.callee, bound).forEach((v) => out.add(v));
      collectFreeVariables(node.arg, bound).forEach((v) => out.add(v));
      return out;
    }
    default:
      return out;
  }
}

/* ============================================================================
 * 2. EVALUATOR WITH BETA-REDUCTION & TRUTH TABLE GENERATOR
 * ========================================================================== */

function formatEvalValue(val: EvalValue): string {
  if (val.kind === 'number') {
    return Number.isInteger(val.value) ? String(val.value) : Number(val.value.toFixed(6)).toString();
  }
  if (val.kind === 'boolean') {
    return val.value ? '⊤ (true)' : '⊥ (false)';
  }
  return `λ${val.param}. ${formatLogicAst(val.body)}`;
}

function toBool(val: EvalValue): boolean {
  if (val.kind === 'boolean') return val.value;
  if (val.kind === 'number') return val.value !== 0;
  return true;
}

function toNum(val: EvalValue): number {
  if (val.kind === 'number') return val.value;
  if (val.kind === 'boolean') return val.value ? 1 : 0;
  throw new Error(`Expected numeric operand, received lambda closure (${formatEvalValue(val)}).`);
}

function evalAstNode(
  node: LogicAstNode,
  env: Map<string, EvalValue>,
  trace: LogicEvalTraceStep[],
  depth = 0
): EvalValue {
  if (depth > 48) {
    throw new Error('Maximum lambda recursion depth (48) exceeded.');
  }

  switch (node.type) {
    case 'NumberLit':
      return { kind: 'number', value: node.value };
    case 'BoolLit':
      return { kind: 'boolean', value: node.value };
    case 'Identifier': {
      const bound = env.get(node.name);
      if (!bound) {
        throw new Error(`Unbound label "${node.name}". Define it in the Labels & Callbacks panel.`);
      }
      return bound;
    }
    case 'Quantifier': {
      const envTrue = new Map(env);
      envTrue.set(node.variable, { kind: 'boolean', value: true });
      const envFalse = new Map(env);
      envFalse.set(node.variable, { kind: 'boolean', value: false });
      const resTrue = toBool(evalAstNode(node.body, envTrue, [], depth + 1));
      const resFalse = toBool(evalAstNode(node.body, envFalse, [], depth + 1));
      const holds = node.quantifier === '∀' ? resTrue && resFalse : resTrue || resFalse;
      const res: EvalValue = { kind: 'boolean', value: holds };
      if (trace.length < 80) {
        trace.push({
          step: trace.length + 1,
          kind: 'logic',
          expression: `${node.quantifier}${node.variable} ∈ {⊥,⊤}. ${formatLogicAst(node.body)}`,
          result: formatEvalValue(res),
        });
      }
      return res;
    }
    case 'Lambda':
      return { kind: 'closure', param: node.param, body: node.body, env: new Map(env) };
    case 'Call': {
      const fnVal = evalAstNode(node.callee, env, trace, depth + 1);
      if (fnVal.kind !== 'closure') {
        throw new Error(`Cannot invoke non-lambda value "${formatEvalValue(fnVal)}" as a callback.`);
      }
      const argVal = evalAstNode(node.arg, env, trace, depth + 1);
      const nextEnv = new Map(fnVal.env);
      nextEnv.set(fnVal.param, argVal);
      const res = evalAstNode(fnVal.body, nextEnv, trace, depth + 1);
      if (trace.length < 80) {
        trace.push({
          step: trace.length + 1,
          kind: argVal.kind === 'closure' ? 'callback' : 'beta',
          expression: `(λ${fnVal.param}. ${formatLogicAst(fnVal.body)})(${formatEvalValue(argVal)})`,
          result: formatEvalValue(res),
        });
      }
      return res;
    }
    case 'UnaryOp': {
      const val = evalAstNode(node.operand, env, trace, depth + 1);
      if (node.op === '¬') {
        const res: EvalValue = { kind: 'boolean', value: !toBool(val) };
        if (trace.length < 80) {
          trace.push({
            step: trace.length + 1,
            kind: 'logic',
            expression: `¬${formatEvalValue(val)}`,
            result: formatEvalValue(res),
          });
        }
        return res;
      }
      const res: EvalValue = { kind: 'number', value: -toNum(val) };
      if (trace.length < 80) {
        trace.push({
          step: trace.length + 1,
          kind: 'arith',
          expression: `-${formatEvalValue(val)}`,
          result: formatEvalValue(res),
        });
      }
      return res;
    }
    case 'BinaryOp': {
      const l = evalAstNode(node.left, env, trace, depth + 1);
      const r = evalAstNode(node.right, env, trace, depth + 1);
      let res: EvalValue;
      let kind: LogicEvalTraceStep['kind'] = 'arith';

      switch (node.op) {
        case '∧':
          kind = 'logic';
          res = { kind: 'boolean', value: toBool(l) && toBool(r) };
          break;
        case '∨':
          kind = 'logic';
          res = { kind: 'boolean', value: toBool(l) || toBool(r) };
          break;
        case '⊕':
          kind = 'logic';
          res = { kind: 'boolean', value: toBool(l) !== toBool(r) };
          break;
        case '→':
          kind = 'logic';
          res = { kind: 'boolean', value: !toBool(l) || toBool(r) };
          break;
        case '↔':
        case '≡':
          kind = 'logic';
          res = { kind: 'boolean', value: toBool(l) === toBool(r) };
          break;
        case '=':
          kind = 'logic';
          res = {
            kind: 'boolean',
            value:
              l.kind === 'boolean' && r.kind === 'boolean'
                ? l.value === r.value
                : toNum(l) === toNum(r),
          };
          break;
        case '≠':
          kind = 'logic';
          res = {
            kind: 'boolean',
            value:
              l.kind === 'boolean' && r.kind === 'boolean'
                ? l.value !== r.value
                : toNum(l) !== toNum(r),
          };
          break;
        case '<':
          kind = 'logic';
          res = { kind: 'boolean', value: toNum(l) < toNum(r) };
          break;
        case '≤':
          kind = 'logic';
          res = { kind: 'boolean', value: toNum(l) <= toNum(r) };
          break;
        case '>':
          kind = 'logic';
          res = { kind: 'boolean', value: toNum(l) > toNum(r) };
          break;
        case '≥':
          kind = 'logic';
          res = { kind: 'boolean', value: toNum(l) >= toNum(r) };
          break;
        case '+':
          res = { kind: 'number', value: toNum(l) + toNum(r) };
          break;
        case '-':
          res = { kind: 'number', value: toNum(l) - toNum(r) };
          break;
        case '*':
          res = { kind: 'number', value: toNum(l) * toNum(r) };
          break;
        case '/': {
          const denom = toNum(r);
          if (denom === 0) throw new Error('Division by zero.');
          res = { kind: 'number', value: toNum(l) / denom };
          break;
        }
        case '%': {
          const denom = toNum(r);
          if (denom === 0) throw new Error('Modulo by zero.');
          res = { kind: 'number', value: toNum(l) % denom };
          break;
        }
        case '^':
          res = { kind: 'number', value: Math.pow(toNum(l), toNum(r)) };
          break;
      }

      if (trace.length < 80) {
        trace.push({
          step: trace.length + 1,
          kind,
          expression: `${formatEvalValue(l)} ${node.op} ${formatEvalValue(r)}`,
          result: formatEvalValue(res),
        });
      }
      return res;
    }
  }
}

export function evaluateLogicStatement(
  statement: string,
  labels: LogicLabelBinding[],
  callbackHooks?: LogicCallbackHooks
): LogicEvaluationResult {
  const parsed = parseLogicExpression(statement);
  if (!parsed.ok) {
    return {
      ok: false,
      ast: null,
      value: null,
      displayValue: 'Parse Error',
      valueType: 'error',
      trace: [],
      freeVariables: [],
      truthTable: null,
      error: parsed.error,
    };
  }

  const trace: LogicEvalTraceStep[] = [];
  const env = new Map<string, EvalValue>();

  // Bind labels in declaration order so callbacks and properties can reference earlier labels & global callbacks
  for (const lbl of labels) {
    const cleanName = lbl.name.trim();
    if (!cleanName) continue;
    const rawVal = lbl.value.trim();
    if (lbl.kind === 'boolean') {
      const lower = rawVal.toLowerCase();
      if (lower === 'true' || rawVal === '⊤' || rawVal === '1') {
        env.set(cleanName, { kind: 'boolean', value: true });
        trace.push({ step: trace.length + 1, kind: 'bind', expression: `${cleanName} := ⊤`, result: '⊤' });
      } else if (lower === 'false' || rawVal === '⊥' || rawVal === '0') {
        env.set(cleanName, { kind: 'boolean', value: false });
        trace.push({ step: trace.length + 1, kind: 'bind', expression: `${cleanName} := ⊥`, result: '⊥' });
      } else {
        const sub = parseLogicExpression(rawVal);
        if (!sub.ok) {
          return {
            ok: false,
            ast: parsed.ast,
            value: null,
            displayValue: 'Binding Error',
            valueType: 'error',
            trace,
            freeVariables: Array.from(collectFreeVariables(parsed.ast)),
            truthTable: null,
            error: `Boolean label "${cleanName}" expression error: ${sub.error}`,
          };
        }
        try {
          const evaluated = evalAstNode(sub.ast, env, trace, 0);
          const b =
            evaluated.kind === 'boolean'
              ? evaluated.value
              : evaluated.kind === 'number'
                ? evaluated.value !== 0
                : false;
          env.set(cleanName, { kind: 'boolean', value: b });
          trace.push({
            step: trace.length + 1,
            kind: 'bind',
            expression: `${cleanName} := ${rawVal}`,
            result: b ? '⊤' : '⊥',
          });
        } catch (err) {
          return {
            ok: false,
            ast: parsed.ast,
            value: null,
            displayValue: 'Binding Error',
            valueType: 'error',
            trace,
            freeVariables: Array.from(collectFreeVariables(parsed.ast)),
            truthTable: null,
            error: err instanceof Error ? err.message : `Failed to evaluate boolean label "${cleanName}".`,
          };
        }
      }
    } else if (lbl.kind === 'number') {
      const plainNum = rawVal !== '' ? Number(rawVal) : Number.NaN;
      if (!Number.isNaN(plainNum) && Number.isFinite(plainNum)) {
        env.set(cleanName, { kind: 'number', value: plainNum });
        trace.push({ step: trace.length + 1, kind: 'bind', expression: `${cleanName} := ${plainNum}`, result: String(plainNum) });
      } else {
        const sub = parseLogicExpression(rawVal);
        if (!sub.ok) {
          return {
            ok: false,
            ast: parsed.ast,
            value: null,
            displayValue: 'Binding Error',
            valueType: 'error',
            trace,
            freeVariables: Array.from(collectFreeVariables(parsed.ast)),
            truthTable: null,
            error: `Label "${cleanName}" has invalid numeric/callback value "${rawVal}": ${sub.error}`,
          };
        }
        try {
          const evaluated = evalAstNode(sub.ast, env, trace, 0);
          const n =
            evaluated.kind === 'number'
              ? evaluated.value
              : evaluated.kind === 'boolean'
                ? evaluated.value
                  ? 1
                  : 0
                : Number.NaN;
          if (Number.isNaN(n)) {
            return {
              ok: false,
              ast: parsed.ast,
              value: null,
              displayValue: 'Binding Error',
              valueType: 'error',
              trace,
              freeVariables: Array.from(collectFreeVariables(parsed.ast)),
              truthTable: null,
              error: `Label "${cleanName}" evaluated to a closure instead of a number.`,
            };
          }
          env.set(cleanName, { kind: 'number', value: n });
          trace.push({
            step: trace.length + 1,
            kind: 'bind',
            expression: `${cleanName} := ${rawVal}`,
            result: String(n),
          });
        } catch (err) {
          return {
            ok: false,
            ast: parsed.ast,
            value: null,
            displayValue: 'Binding Error',
            valueType: 'error',
            trace,
            freeVariables: Array.from(collectFreeVariables(parsed.ast)),
            truthTable: null,
            error: err instanceof Error ? err.message : `Failed to evaluate label "${cleanName}".`,
          };
        }
      }
    } else {
      const sub = parseLogicExpression(rawVal);
      if (!sub.ok) {
        return {
          ok: false,
          ast: parsed.ast,
          value: null,
          displayValue: 'Callback Error',
          valueType: 'error',
          trace,
          freeVariables: Array.from(collectFreeVariables(parsed.ast)),
          truthTable: null,
          error: `Callback "${cleanName}" parse error: ${sub.error}`,
        };
      }
      try {
        const evaluated = evalAstNode(sub.ast, env, [], 0);
        env.set(cleanName, evaluated);
        trace.push({
          step: trace.length + 1,
          kind: 'bind',
          expression: `${cleanName} := ${rawVal}`,
          result: formatEvalValue(evaluated),
        });
      } catch (err) {
        return {
          ok: false,
          ast: parsed.ast,
          value: null,
          displayValue: 'Callback Error',
          valueType: 'error',
          trace,
          freeVariables: Array.from(collectFreeVariables(parsed.ast)),
          truthTable: null,
          error: err instanceof Error ? err.message : `Failed to bind callback "${cleanName}".`,
        };
      }
    }
  }

  const freeVariables = Array.from(collectFreeVariables(parsed.ast));

  try {
    const val = evalAstNode(parsed.ast, env, trace, 0);

    // Build truth table if 1..4 boolean variables appear in the statement
    const boolVars = labels
      .filter((l) => l.kind === 'boolean' && freeVariables.includes(l.name.trim()))
      .map((l) => l.name.trim())
      .slice(0, 4);

    let truthTable: { variables: string[]; rows: TruthTableRow[] } | null = null;
    if (boolVars.length > 0 && val.kind === 'boolean') {
      const rows: TruthTableRow[] = [];
      const total = 1 << boolVars.length;
      for (let mask = 0; mask < total; mask += 1) {
        const testEnv = new Map(env);
        const assignments: Record<string, boolean> = {};
        boolVars.forEach((vName, bitIdx) => {
          const bVal = Boolean((mask >> (boolVars.length - 1 - bitIdx)) & 1);
          assignments[vName] = bVal;
          testEnv.set(vName, { kind: 'boolean', value: bVal });
        });
        const rowRes = evalAstNode(parsed.ast, testEnv, [], 0);
        rows.push({
          assignments,
          result: rowRes.kind === 'boolean' ? (rowRes.value ? '⊤' : '⊥') : formatEvalValue(rowRes),
        });
      }
      truthTable = { variables: boolVars, rows };
    }

    // Execute configured Lambda Callback Hooks (onFinalResult, onLogicTrue, onLogicFalse)
    const hookExecutions: LogicHookExecution[] = [];
    const invokeHook = (
      hook: LogicHookExecution['hook'],
      cbName: string | undefined,
      argVal: EvalValue
    ) => {
      if (!cbName || !cbName.trim()) return;
      const fnVal = env.get(cbName.trim());
      if (!fnVal || fnVal.kind !== 'closure') return;
      try {
        const nextEnv = new Map(fnVal.env);
        nextEnv.set(fnVal.param, argVal);
        const outVal = evalAstNode(fnVal.body, nextEnv, trace, 0);
        const inputStr = formatEvalValue(argVal);
        const outputStr = formatEvalValue(outVal);
        hookExecutions.push({ hook, callbackName: cbName.trim(), input: inputStr, output: outputStr });
        if (trace.length < 80) {
          trace.push({
            step: trace.length + 1,
            kind: 'callback',
            expression: `hook:${hook} -> ${cbName.trim()}(${inputStr})`,
            result: outputStr,
          });
        }
      } catch (hookErr) {
        const msg = hookErr instanceof Error ? hookErr.message : 'Hook error';
        hookExecutions.push({
          hook,
          callbackName: cbName.trim(),
          input: formatEvalValue(argVal),
          output: `Error: ${msg}`,
        });
      }
    };

    if (callbackHooks) {
      invokeHook('onFinalResult', callbackHooks.onFinalResult, val);
      if (val.kind === 'boolean') {
        if (val.value) invokeHook('onLogicTrue', callbackHooks.onLogicTrue, val);
        else invokeHook('onLogicFalse', callbackHooks.onLogicFalse, val);
      }
    }

    return {
      ok: true,
      ast: parsed.ast,
      value: val,
      displayValue: formatEvalValue(val),
      valueType: val.kind === 'closure' ? 'lambda' : val.kind,
      trace,
      freeVariables,
      truthTable,
      hookExecutions,
    };
  } catch (err) {
    return {
      ok: false,
      ast: parsed.ast,
      value: null,
      displayValue: 'Eval Error',
      valueType: 'error',
      trace,
      freeVariables,
      truthTable: null,
      error: err instanceof Error ? err.message : 'Evaluation error.',
    };
  }
}

/* ============================================================================
 * 2A. CAUCHY SEQUENCE ENGINE (_# / left-right / Given Parameter Names)
 * ========================================================================== */

export function resolveCauchyParamNames(
  style: CauchyParamStyle,
  arity: number,
  customParamNames = ''
): string[] {
  const safeArity = Math.max(1, Math.min(8, arity));
  if (style === 'positional') {
    return Array.from({ length: safeArity }, (_, idx) => `_${idx + 1}`);
  }
  if (style === 'directional') {
    if (safeArity === 1) return ['right'];
    if (safeArity === 2) return ['left', 'right'];
    if (safeArity === 3) return ['left', 'mid', 'right'];
    return [
      'left',
      ...Array.from({ length: safeArity - 2 }, (_, idx) => `mid_${idx + 1}`),
      'right',
    ];
  }
  const parsedCustom = customParamNames
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
  const out: string[] = [];
  for (let i = 0; i < safeArity; i += 1) {
    out.push(parsedCustom[i] || `param_${i + 1}`);
  }
  return out;
}

export function evaluateCauchySequence(
  config: CauchySequenceConfig,
  baseLabels: LogicLabelBinding[]
): CauchyEvaluationResult {
  const rawSeeds = config.seedValues
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSeeds.length === 0) {
    return {
      ok: false,
      converged: false,
      cauchyIndexN: null,
      limitEstimate: null,
      finalDelta: null,
      tailDiameter: null,
      resolvedParamNames: resolveCauchyParamNames(config.paramStyle, 2, config.customParamNames),
      availableAliases: ['_1', '_2', 'left', 'right', 'n', 'prev'],
      steps: [],
      error: 'Provide at least one comma-separated numeric seed term (e.g. "0, 1").',
    };
  }

  const terms: number[] = [];
  for (let i = 0; i < rawSeeds.length; i += 1) {
    const raw = rawSeeds[i];
    const direct = Number(raw);
    if (!Number.isNaN(direct) && Number.isFinite(direct)) {
      terms.push(direct);
    } else {
      const evalSeed = evaluateLogicStatement(raw, baseLabels);
      if (!evalSeed.ok || evalSeed.value?.kind !== 'number' || !Number.isFinite(evalSeed.value.value)) {
        return {
          ok: false,
          converged: false,
          cauchyIndexN: null,
          limitEstimate: null,
          finalDelta: null,
          tailDiameter: null,
          resolvedParamNames: resolveCauchyParamNames(config.paramStyle, rawSeeds.length, config.customParamNames),
          availableAliases: [],
          steps: [],
          error: `Seed #${i + 1} ("${raw}") did not evaluate to a finite number.`,
        };
      }
      terms.push(evalSeed.value.value);
    }
  }

  const arity = terms.length;
  const resolvedParamNames = resolveCauchyParamNames(config.paramStyle, arity, config.customParamNames);
  const recurrence = config.recurrenceExpr.trim();
  const usesZeroIndexed = /\b_0\b/.test(recurrence);
  const positionalAliases = usesZeroIndexed
    ? Array.from({ length: arity }, (_, idx) => `_${idx}`)
    : Array.from({ length: arity }, (_, idx) => `_${idx + 1}`);
  const directionalAliases = resolveCauchyParamNames('directional', arity);
  const availableAliases = Array.from(
    new Set([...resolvedParamNames, ...positionalAliases, ...directionalAliases, 'left', 'right', 'prev', 'n'])
  );

  if (!recurrence) {
    return {
      ok: false,
      converged: false,
      cauchyIndexN: null,
      limitEstimate: null,
      finalDelta: null,
      tailDiameter: null,
      resolvedParamNames,
      availableAliases,
      steps: [],
      error: 'Enter a recurrence expression (e.g. "(left + right) / 2" or "(_1 + _2) / 2").',
    };
  }

  const maxIter = Math.max(1, Math.min(120, Math.floor(config.maxIterations || 24)));
  const eps = Number.isFinite(config.epsilon) && config.epsilon > 0 ? config.epsilon : 0.0001;

  for (let stepIdx = 0; stepIdx < maxIter; stepIdx += 1) {
    const windowSlice = terms.slice(terms.length - arity);
    const stepBindings = new Map<string, number>();

    // Bind universal positional _#, directional left/right, and index n/prev
    stepBindings.set('n', terms.length);
    stepBindings.set('prev', windowSlice[windowSlice.length - 1]);
    stepBindings.set('left', windowSlice[0]);
    stepBindings.set('right', windowSlice[windowSlice.length - 1]);

    directionalAliases.forEach((alias, idx) => {
      stepBindings.set(alias, windowSlice[idx]);
    });
    positionalAliases.forEach((alias, idx) => {
      stepBindings.set(alias, windowSlice[idx]);
    });
    // Primary resolved parameter names win if overlapping
    resolvedParamNames.forEach((pName, idx) => {
      stepBindings.set(pName, windowSlice[idx]);
    });

    const stepLabels: LogicLabelBinding[] = [
      ...baseLabels.filter((l) => !stepBindings.has(l.name.trim())),
      ...Array.from(stepBindings.entries()).map(([name, val], idx) => ({
        id: `cauchy_param_${stepIdx}_${idx}`,
        name,
        kind: 'number' as const,
        value: String(val),
      })),
    ];

    const res = evaluateLogicStatement(recurrence, stepLabels);
    if (!res.ok) {
      return {
        ok: false,
        converged: false,
        cauchyIndexN: null,
        limitEstimate: null,
        finalDelta: null,
        tailDiameter: null,
        resolvedParamNames,
        availableAliases,
        steps: [],
        error: `Step n=${terms.length}: ${res.error || 'Recurrence evaluation failed.'}`,
      };
    }
    if (res.value?.kind !== 'number' || !Number.isFinite(res.value.value)) {
      return {
        ok: false,
        converged: false,
        cauchyIndexN: null,
        limitEstimate: null,
        finalDelta: null,
        tailDiameter: null,
        resolvedParamNames,
        availableAliases,
        steps: [],
        error: `Step n=${terms.length} produced non-finite value (${res.displayValue}).`,
      };
    }
    terms.push(res.value.value);
  }

  // Compute exact tail Cauchy diameters sup_{p,q >= i} |a_p - a_q|
  const steps: CauchyStepRecord[] = [];
  let cauchyIndexN: number | null = null;
  for (let i = 0; i < terms.length; i += 1) {
    let minVal = terms[i];
    let maxVal = terms[i];
    for (let j = i + 1; j < terms.length; j += 1) {
      if (terms[j] < minVal) minVal = terms[j];
      if (terms[j] > maxVal) maxVal = terms[j];
    }
    const tailDiameter = maxVal - minVal;
    const prevDelta = i === 0 ? null : Math.abs(terms[i] - terms[i - 1]);
    const withinEpsilon = i < terms.length - 1 ? tailDiameter < eps : (prevDelta ?? tailDiameter) < eps;
    if (cauchyIndexN === null && i < terms.length - 1 && tailDiameter < eps) {
      cauchyIndexN = i;
    }
    steps.push({
      n: i,
      value: terms[i],
      prevDelta,
      tailDiameter,
      withinEpsilon,
    });
  }

  const last = steps[steps.length - 1];
  const converged = cauchyIndexN !== null;
  return {
    ok: true,
    converged,
    cauchyIndexN,
    limitEstimate: last ? last.value : null,
    finalDelta: last ? last.prevDelta : null,
    tailDiameter: cauchyIndexN !== null ? steps[cauchyIndexN].tailDiameter : steps[Math.max(0, steps.length - 2)]?.tailDiameter ?? 0,
    resolvedParamNames,
    availableAliases,
    steps,
  };
}

/* ============================================================================
 * 2B. SMART LABEL / LAMBDA SUGGESTIONS & NAMED CALLBACK TRANSLATION
 * ========================================================================== */

export function formatNamedCallbackSignature(name: string, params: string[]): string {
  return `${name} (${params.join(', ')})`;
}

export function extractLambdaParamsAndBody(
  exprOrAst: string | LogicAstNode
): { params: string[]; body: LogicAstNode } | null {
  let node: LogicAstNode;
  if (typeof exprOrAst === 'string') {
    const parsed = parseLogicExpression(exprOrAst);
    if (!parsed.ok) return null;
    node = parsed.ast;
  } else {
    node = exprOrAst;
  }
  if (node.type !== 'Lambda') return null;
  const params: string[] = [];
  let curr: LogicAstNode = node;
  while (curr.type === 'Lambda') {
    params.push(curr.param);
    curr = curr.body;
  }
  return { params, body: curr };
}

function unwindCallChain(node: LogicAstNode): { root: LogicAstNode; args: LogicAstNode[] } {
  const args: LogicAstNode[] = [];
  let curr: LogicAstNode = node;
  while (curr.type === 'Call') {
    args.unshift(curr.arg);
    curr = curr.callee;
  }
  return { root: curr, args };
}

function getBinaryPrecedence(op: Extract<LogicAstNode, { type: 'BinaryOp' }>['op']): number {
  switch (op) {
    case '↔':
    case '≡':
      return 1;
    case '→':
      return 2;
    case '∨':
      return 3;
    case '⊕':
      return 4;
    case '∧':
      return 5;
    case '=':
    case '≠':
    case '<':
    case '≤':
    case '>':
    case '≥':
      return 6;
    case '+':
    case '-':
      return 7;
    case '*':
    case '/':
    case '%':
      return 8;
    case '^':
      return 9;
  }
}

function formatAstForNamedCallbacks(
  node: LogicAstNode,
  liftAnonymous: (lam: Extract<LogicAstNode, { type: 'Lambda' }>) => string,
  stats: { callCount: number },
  parentPrec = 0
): string {
  switch (node.type) {
    case 'NumberLit':
      return String(node.value);
    case 'BoolLit':
      return node.value ? '⊤' : '⊥';
    case 'Identifier':
      return node.name;
    case 'UnaryOp': {
      const inner = formatAstForNamedCallbacks(node.operand, liftAnonymous, stats, 10);
      if (node.operand.type === 'BinaryOp' || node.operand.type === 'Lambda' || node.operand.type === 'Quantifier') {
        return `${node.op}(${inner})`;
      }
      return `${node.op}${inner}`;
    }
    case 'BinaryOp': {
      const prec = getBinaryPrecedence(node.op);
      const leftStr = formatAstForNamedCallbacks(node.left, liftAnonymous, stats, prec);
      const rightStr = formatAstForNamedCallbacks(node.right, liftAnonymous, stats, prec + 1);
      const expr = `${leftStr} ${node.op} ${rightStr}`;
      return prec < parentPrec ? `(${expr})` : expr;
    }
    case 'Quantifier': {
      const bodyStr = formatAstForNamedCallbacks(node.body, liftAnonymous, stats, 0);
      const expr = `${node.quantifier}${node.variable}. ${bodyStr}`;
      return parentPrec > 0 ? `(${expr})` : expr;
    }
    case 'Lambda': {
      const unwrapped = extractLambdaParamsAndBody(node);
      if (!unwrapped) return formatLogicAst(node);
      const prefix = unwrapped.params.map((p) => `λ${p}.`).join(' ');
      const bodyStr = formatAstForNamedCallbacks(unwrapped.body, liftAnonymous, stats, 0);
      const expr = `${prefix} ${bodyStr}`;
      return parentPrec > 0 ? `(${expr})` : expr;
    }
    case 'Call': {
      stats.callCount += 1;
      const { root, args } = unwindCallChain(node);
      const formattedArgs = args.map((a) => formatAstForNamedCallbacks(a, liftAnonymous, stats, 0));
      if (root.type === 'Identifier') {
        return `${root.name} (${formattedArgs.join(', ')})`;
      }
      if (root.type === 'Lambda') {
        const liftedName = liftAnonymous(root);
        return `${liftedName} (${formattedArgs.join(', ')})`;
      }
      const calleeStr = formatAstForNamedCallbacks(root, liftAnonymous, stats, 11);
      return `(${calleeStr}) (${formattedArgs.join(', ')})`;
    }
  }
}

export function translateLambdaCallsToNamedCallbacks(
  statement: string,
  labels: LogicLabelBinding[]
): NamedCallbackTranslation {
  const original = statement.trim();
  const callbacks: NamedCallbackSpec[] = [];
  const liftedLabels: LogicLabelBinding[] = [];
  const usedNames = new Set(labels.map((l) => l.name.trim()).filter(Boolean));
  const stats = { callCount: 0 };

  const liftAnonymous = (lam: Extract<LogicAstNode, { type: 'Lambda' }>): string => {
    let idx = 1;
    let candidate = `cb_${idx}`;
    while (usedNames.has(candidate)) {
      idx += 1;
      candidate = `cb_${idx}`;
    }
    usedNames.add(candidate);
    const unwrapped = extractLambdaParamsAndBody(lam);
    const params = unwrapped ? unwrapped.params : [lam.param];
    const bodyNode = unwrapped ? unwrapped.body : lam.body;
    const bodyStr = formatAstForNamedCallbacks(bodyNode, liftAnonymous, stats, 0);
    const lambdaExpr = `${params.map((p) => `λ${p}.`).join(' ')} ${bodyStr}`;
    callbacks.push({
      name: candidate,
      params,
      signature: formatNamedCallbackSignature(candidate, params),
      body: bodyStr,
      lambdaExpr,
      source: 'lifted',
    });
    liftedLabels.push({
      id: `lifted_${candidate}_${Date.now()}`,
      name: candidate,
      kind: 'lambda',
      value: lambdaExpr,
    });
    return candidate;
  };

  for (const lbl of labels) {
    const cleanName = lbl.name.trim();
    if (lbl.kind !== 'lambda' || !cleanName) continue;
    const unwrapped = extractLambdaParamsAndBody(lbl.value);
    if (!unwrapped) continue;
    const bodyStr = formatAstForNamedCallbacks(unwrapped.body, liftAnonymous, { callCount: 0 }, 0);
    callbacks.push({
      name: cleanName,
      params: unwrapped.params,
      signature: formatNamedCallbackSignature(cleanName, unwrapped.params),
      body: bodyStr,
      lambdaExpr: lbl.value.trim(),
      source: 'label',
    });
  }

  const parsed = parseLogicExpression(original);
  if (!parsed.ok) {
    return {
      ok: false,
      originalStatement: original,
      translatedStatement: original,
      callbacks,
      liftedLabels,
      callCount: 0,
      changed: false,
    };
  }

  const translated = formatAstForNamedCallbacks(parsed.ast, liftAnonymous, stats, 0);
  const changed = translated !== original || liftedLabels.length > 0;
  return {
    ok: true,
    originalStatement: original,
    translatedStatement: translated,
    callbacks,
    liftedLabels,
    callCount: stats.callCount,
    changed,
  };
}

function inferIdentifierUsageInAst(
  node: LogicAstNode,
  targetName: string,
  bound: Set<string> = new Set()
): 'boolean' | 'number' | 'lambda' | null {
  switch (node.type) {
    case 'UnaryOp':
      if (node.operand.type === 'Identifier' && node.operand.name === targetName && !bound.has(targetName)) {
        return node.op === '¬' ? 'boolean' : 'number';
      }
      return inferIdentifierUsageInAst(node.operand, targetName, bound);
    case 'BinaryOp': {
      const isLogicOp = ['∧', '∨', '⊕', '→', '↔', '≡'].includes(node.op);
      const isArithOp = ['+', '-', '*', '/', '%', '^', '<', '≤', '>', '≥'].includes(node.op);
      if (node.left.type === 'Identifier' && node.left.name === targetName && !bound.has(targetName)) {
        if (isLogicOp) return 'boolean';
        if (isArithOp) return 'number';
      }
      if (node.right.type === 'Identifier' && node.right.name === targetName && !bound.has(targetName)) {
        if (isLogicOp) return 'boolean';
        if (isArithOp) return 'number';
      }
      return (
        inferIdentifierUsageInAst(node.left, targetName, bound) ||
        inferIdentifierUsageInAst(node.right, targetName, bound)
      );
    }
    case 'Call': {
      const { root, args } = unwindCallChain(node);
      if (root.type === 'Identifier' && root.name === targetName && !bound.has(targetName)) {
        return 'lambda';
      }
      const fromRoot = inferIdentifierUsageInAst(root, targetName, bound);
      if (fromRoot) return fromRoot;
      for (const a of args) {
        const res = inferIdentifierUsageInAst(a, targetName, bound);
        if (res) return res;
      }
      return null;
    }
    case 'Lambda': {
      const next = new Set(bound);
      next.add(node.param);
      return inferIdentifierUsageInAst(node.body, targetName, next);
    }
    case 'Quantifier': {
      const next = new Set(bound);
      next.add(node.variable);
      return inferIdentifierUsageInAst(node.body, targetName, next);
    }
    default:
      return null;
  }
}

function buildOptionsForKind(
  name: string,
  kind: 'boolean' | 'number' | 'lambda',
  expectedArity = 1,
  expectsCallbackArg = false
): LabelSuggestionOption[] {
  if (kind === 'boolean') {
    return [
      { label: 'true (⊤)', value: 'true', kind: 'boolean' },
      { label: 'false (⊥)', value: 'false', kind: 'boolean' },
    ];
  }
  if (kind === 'number') {
    return [
      { label: '0', value: '0', kind: 'number' },
      { label: '1', value: '1', kind: 'number' },
      { label: '10', value: '10', kind: 'number' },
      { label: '100', value: '100', kind: 'number' },
    ];
  }
  const arity = Math.max(1, Math.min(4, expectedArity));
  const params =
    expectsCallbackArg && arity >= 2
      ? ['cb', ...Array.from({ length: arity - 1 }, (_, i) => (i === 0 ? 'v' : `param${i + 2}`))]
      : Array.from({ length: arity }, (_, i) => `param${i + 1}`);
  const prefix = params.map((p) => `λ${p}.`).join(' ');
  const sig = formatNamedCallbackSignature(name, params);

  if (arity === 1) {
    return [
      { label: `${sig} → identity`, value: `${prefix} ${params[0]}`, kind: 'lambda', signature: sig },
      { label: `${sig} → × 2`, value: `${prefix} ${params[0]} * 2`, kind: 'lambda', signature: sig },
      { label: `${sig} → ¬${params[0]}`, value: `${prefix} ¬${params[0]}`, kind: 'lambda', signature: sig },
    ];
  }
  if (arity === 2) {
    const cbExpr = `${prefix} ${params[0]} (${params[1]})`;
    const sumExpr = `${prefix} ${params[0]} + ${params[1]}`;
    const logicExpr = `${prefix} ${params[0]} ∧ ${params[1]}`;
    return expectsCallbackArg
      ? [
          { label: `${sig} → invoke callback`, value: cbExpr, kind: 'lambda', signature: sig },
          { label: `${sig} → sum`, value: sumExpr, kind: 'lambda', signature: sig },
        ]
      : [
          { label: `${sig} → sum`, value: sumExpr, kind: 'lambda', signature: sig },
          { label: `${sig} → invoke callback`, value: cbExpr, kind: 'lambda', signature: sig },
          { label: `${sig} → logic ∧`, value: logicExpr, kind: 'lambda', signature: sig },
        ];
  }
  const composed = `${prefix} ${params[0]} (${params[1]} (${params.slice(2).join(', ')}))`;
  const summed = `${prefix} ${params.join(' + ')}`;
  return [
    { label: `${sig} → compose`, value: composed, kind: 'lambda', signature: sig },
    { label: `${sig} → sum`, value: summed, kind: 'lambda', signature: sig },
  ];
}

export function analyzeLabelSuggestions(
  statement: string,
  labels: LogicLabelBinding[],
  opts?: { lockedNames?: string[]; allowMutation?: boolean }
): LabelSuggestion[] {
  const lockedSet = new Set((opts?.lockedNames || []).map((s) => s.trim()));
  const allowMutation = opts?.allowMutation !== false;
  const suggestions: LabelSuggestion[] = [];
  const labelMap = new Map<string, LogicLabelBinding>();

  const checkPermitted = (name: string): { permitted: boolean; lockReason?: string } => {
    if (!allowMutation) {
      return { permitted: false, lockReason: 'Mutations disabled by x-mutation-policy.' };
    }
    if (lockedSet.has(name)) {
      return { permitted: false, lockReason: `"${name}" is locked by x-mutation-policy.` };
    }
    return { permitted: true };
  };

  // 1. Validate existing label bindings for empty / undefined / invalid values
  for (const lbl of labels) {
    const cleanName = lbl.name.trim();
    if (!cleanName) continue;
    labelMap.set(cleanName, lbl);
    const raw = lbl.value.trim();
    const perm = checkPermitted(cleanName);

    if (lbl.kind === 'boolean') {
      const validBool = ['true', 'false', '⊤', '⊥', '1', '0'].includes(raw.toLowerCase());
      if (!raw || !validBool) {
        suggestions.push({
          id: `sug_existing_${lbl.id}`,
          name: cleanName,
          issue: raw ? 'invalid_value' : 'empty_value',
          inferredKind: 'boolean',
          reason: raw
            ? `Boolean label "${cleanName}" has unrecognized value "${raw}".`
            : `Boolean label "${cleanName}" is undefined — choose true or false.`,
          permitted: perm.permitted,
          lockReason: perm.lockReason,
          options: buildOptionsForKind(cleanName, 'boolean'),
          existingLabelId: lbl.id,
        });
      }
    } else if (lbl.kind === 'number') {
      if (!raw || Number.isNaN(Number(raw))) {
        suggestions.push({
          id: `sug_existing_${lbl.id}`,
          name: cleanName,
          issue: raw ? 'invalid_value' : 'empty_value',
          inferredKind: 'number',
          reason: raw
            ? `Numeric label "${cleanName}" has non-numeric value "${raw}".`
            : `Numeric label "${cleanName}" is empty.`,
          permitted: perm.permitted,
          lockReason: perm.lockReason,
          options: buildOptionsForKind(cleanName, 'number'),
          existingLabelId: lbl.id,
        });
      }
    } else if (lbl.kind === 'lambda') {
      const parsedCb = raw ? parseLogicExpression(raw) : null;
      if (!raw || !parsedCb?.ok) {
        suggestions.push({
          id: `sug_existing_${lbl.id}`,
          name: cleanName,
          issue: raw ? 'invalid_value' : 'empty_value',
          inferredKind: 'lambda',
          expectedArity: 2,
          reason: raw
            ? `Lambda callback "${cleanName}" has a syntax error.`
            : `Lambda callback "${cleanName}" is undefined.`,
          permitted: perm.permitted,
          lockReason: perm.lockReason,
          options: buildOptionsForKind(cleanName, 'lambda', 2, true),
          existingLabelId: lbl.id,
        });
      }
    }
  }

  // 2. Inspect statement AST (or fallback token stream) for undefined labels & callbacks
  const inferredMap = new Map<
    string,
    {
      kind: 'boolean' | 'number' | 'lambda';
      arity: number;
      expectsCallbackArg: boolean;
      reason: string;
    }
  >();

  const recordInference = (
    name: string,
    kind: 'boolean' | 'number' | 'lambda',
    reason: string,
    arity = 1,
    expectsCallbackArg = false
  ) => {
    if (labelMap.has(name)) return;
    const prev = inferredMap.get(name);
    if (!prev) {
      inferredMap.set(name, { kind, arity, expectsCallbackArg, reason });
      return;
    }
    // Priority: lambda > boolean/number
    if (kind === 'lambda') {
      inferredMap.set(name, {
        kind: 'lambda',
        arity: Math.max(prev.arity, arity),
        expectsCallbackArg: prev.expectsCallbackArg || expectsCallbackArg,
        reason,
      });
    } else if (prev.kind !== 'lambda' && kind === 'boolean' && prev.kind !== 'boolean') {
      inferredMap.set(name, { kind: 'boolean', arity: prev.arity, expectsCallbackArg: false, reason });
    }
  };

  const parsed = parseLogicExpression(statement);
  if (parsed.ok) {
    const walk = (node: LogicAstNode, bound: Set<string>, expected: 'boolean' | 'number' | null) => {
      switch (node.type) {
        case 'Identifier': {
          if (bound.has(node.name) || labelMap.has(node.name)) return;
          if (expected === 'boolean') {
            recordInference(node.name, 'boolean', `Used in boolean logic context — suggest true or false.`);
          } else if (expected === 'number') {
            recordInference(node.name, 'number', `Used in numeric arithmetic/comparison context.`);
          } else {
            const looksBoolean =
              /^[A-Z][0-9]?$/.test(node.name) ||
              /^(is|has|can|should|allow|enable|flag|override|valid|ok)_?/i.test(node.name);
            recordInference(
              node.name,
              looksBoolean ? 'boolean' : 'number',
              looksBoolean
                ? `Undefined propositional/boolean symbol "${node.name}" — suggest true or false.`
                : `Undefined label "${node.name}".`
            );
          }
          return;
        }
        case 'UnaryOp':
          walk(node.operand, bound, node.op === '¬' ? 'boolean' : 'number');
          return;
        case 'BinaryOp': {
          const isLogicOp = ['∧', '∨', '⊕', '→', '↔', '≡'].includes(node.op);
          const isArithOrOrder = ['+', '-', '*', '/', '%', '^', '<', '≤', '>', '≥'].includes(node.op);
          if (isLogicOp) {
            walk(node.left, bound, 'boolean');
            walk(node.right, bound, 'boolean');
          } else if (isArithOrOrder) {
            walk(node.left, bound, 'number');
            walk(node.right, bound, 'number');
          } else {
            // '=' or '≠': infer from peer side
            const leftIsBool =
              node.left.type === 'BoolLit' ||
              (node.left.type === 'Identifier' && labelMap.get(node.left.name)?.kind === 'boolean');
            const rightIsBool =
              node.right.type === 'BoolLit' ||
              (node.right.type === 'Identifier' && labelMap.get(node.right.name)?.kind === 'boolean');
            const sideExpected: 'boolean' | 'number' = leftIsBool || rightIsBool ? 'boolean' : 'number';
            walk(node.left, bound, sideExpected);
            walk(node.right, bound, sideExpected);
          }
          return;
        }
        case 'Quantifier': {
          const next = new Set(bound);
          next.add(node.variable);
          walk(node.body, next, 'boolean');
          return;
        }
        case 'Lambda': {
          const next = new Set(bound);
          next.add(node.param);
          walk(node.body, next, null);
          return;
        }
        case 'Call': {
          const { root, args } = unwindCallChain(node);
          if (root.type === 'Identifier' && !bound.has(root.name)) {
            if (!labelMap.has(root.name)) {
              const firstArgIsCb =
                args.length >= 2 &&
                ((args[0].type === 'Identifier' && labelMap.get(args[0].name)?.kind === 'lambda') ||
                  args[0].type === 'Lambda');
              const sig = formatNamedCallbackSignature(
                root.name,
                Array.from({ length: args.length }, (_, i) => `param${i + 1}`)
              );
              recordInference(
                root.name,
                'lambda',
                `Invoked as callback ${sig} (${args.length} param${args.length === 1 ? '' : 's'}).`,
                args.length,
                firstArgIsCb
              );
            } else {
              // Root is a known lambda label: inspect parameter usage inside its body to type its undefined arguments!
              const knownLbl = labelMap.get(root.name);
              const unwrapped = knownLbl?.kind === 'lambda' ? extractLambdaParamsAndBody(knownLbl.value) : null;
              if (unwrapped) {
                args.forEach((argNode, idx) => {
                  const paramName = unwrapped.params[idx];
                  const paramHint = paramName ? inferIdentifierUsageInAst(unwrapped.body, paramName) : null;
                  if (argNode.type === 'Identifier' && !bound.has(argNode.name) && !labelMap.has(argNode.name)) {
                    if (paramHint === 'lambda') {
                      recordInference(
                        argNode.name,
                        'lambda',
                        `Passed as callback parameter "${paramName}" to ${root.name}.`,
                        1,
                        false
                      );
                      return;
                    }
                    if (paramHint === 'boolean') {
                      recordInference(
                        argNode.name,
                        'boolean',
                        `Passed as boolean parameter "${paramName}" to ${root.name} — suggest true or false.`
                      );
                      return;
                    }
                    if (paramHint === 'number') {
                      recordInference(
                        argNode.name,
                        'number',
                        `Passed as numeric parameter "${paramName}" to ${root.name}.`
                      );
                      return;
                    }
                  }
                  walk(argNode, bound, paramHint === 'boolean' || paramHint === 'number' ? paramHint : null);
                });
                return;
              }
            }
          } else {
            walk(root, bound, null);
          }
          args.forEach((a) => walk(a, bound, null));
          return;
        }
        default:
          return;
      }
    };

    walk(parsed.ast, new Set(), null);
  } else if (statement.trim()) {
    // Partial/incomplete expression token scan so undefined booleans still get true/false suggestions while typing
    const lex = tokenizeLogic(statement);
    if (lex.ok) {
      const toks = lex.tokens;
      const logicTypes = new Set<TokenType>(['NOT', 'AND', 'OR', 'XOR', 'IMPLIES', 'IFF', 'EQUIV']);
      const arithTypes = new Set<TokenType>(['PLUS', 'MINUS', 'MUL', 'DIV', 'MOD', 'POW', 'LT', 'LTE', 'GT', 'GTE']);
      for (let i = 0; i < toks.length; i += 1) {
        const tok = toks[i];
        if (tok.type !== 'IDENT' || labelMap.has(tok.value)) continue;
        const prev = i > 0 ? toks[i - 1] : null;
        const next = i + 1 < toks.length ? toks[i + 1] : null;
        if (prev && (prev.type === 'LAMBDA' || prev.type === 'FORALL' || prev.type === 'EXISTS')) continue;
        if (next && next.type === 'LPAREN') {
          recordInference(tok.value, 'lambda', `Invoked as callback "${tok.value} (...)".`, 2, false);
        } else if ((prev && logicTypes.has(prev.type)) || (next && logicTypes.has(next.type))) {
          recordInference(tok.value, 'boolean', `Used with logic operator — suggest true or false.`);
        } else if ((prev && arithTypes.has(prev.type)) || (next && arithTypes.has(next.type))) {
          recordInference(tok.value, 'number', `Used with arithmetic/comparison operator.`);
        } else if (/^[A-Z][0-9]?$/.test(tok.value) || /^(is|has|can|flag|override)/i.test(tok.value)) {
          recordInference(tok.value, 'boolean', `Undefined boolean label "${tok.value}" — suggest true or false.`);
        }
      }
    }
  }

  inferredMap.forEach((info, name) => {
    const perm = checkPermitted(name);
    suggestions.push({
      id: `sug_undef_${name}`,
      name,
      issue: 'undefined',
      inferredKind: info.kind,
      expectedArity: info.kind === 'lambda' ? info.arity : undefined,
      reason: info.reason,
      permitted: perm.permitted,
      lockReason: perm.lockReason,
      options: buildOptionsForKind(name, info.kind, info.arity, info.expectsCallbackArg),
    });
  });

  return suggestions;
}

/* ============================================================================
 * 3. MULTI-LANGUAGE EXPORTERS (PYTHON, JSON-LD, RUST, WABT, REAL WASM BINARY)
 * ========================================================================== */

function astToPythonExpr(node: LogicAstNode, namedArity?: Map<string, number>): string {
  switch (node.type) {
    case 'NumberLit':
      return String(node.value);
    case 'BoolLit':
      return node.value ? 'True' : 'False';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return node.op === '¬'
        ? `(not ${astToPythonExpr(node.operand, namedArity)})`
        : `(-${astToPythonExpr(node.operand, namedArity)})`;
    case 'BinaryOp': {
      const l = astToPythonExpr(node.left, namedArity);
      const r = astToPythonExpr(node.right, namedArity);
      switch (node.op) {
        case '∧':
          return `(${l} and ${r})`;
        case '∨':
          return `(${l} or ${r})`;
        case '⊕':
          return `(bool(${l}) != bool(${r}))`;
        case '→':
          return `((not ${l}) or ${r})`;
        case '↔':
        case '≡':
          return `(bool(${l}) == bool(${r}))`;
        case '=':
          return `(${l} == ${r})`;
        case '≠':
          return `(${l} != ${r})`;
        case '<':
          return `(${l} < ${r})`;
        case '≤':
          return `(${l} <= ${r})`;
        case '>':
          return `(${l} > ${r})`;
        case '≥':
          return `(${l} >= ${r})`;
        case '^':
          return `(${l} ** ${r})`;
        default:
          return `(${l} ${node.op} ${r})`;
      }
    }
    case 'Quantifier': {
      const fn = node.quantifier === '∀' ? 'all' : 'any';
      return `${fn}(${astToPythonExpr(node.body, namedArity)} for ${node.variable} in (False, True))`;
    }
    case 'Lambda':
      return `(lambda ${node.param}: ${astToPythonExpr(node.body, namedArity)})`;
    case 'Call': {
      const { root, args } = unwindCallChain(node);
      if (root.type === 'Identifier' && namedArity?.has(root.name)) {
        const arity = namedArity.get(root.name) || 1;
        const pyArgs = args.map((a) => astToPythonExpr(a, namedArity));
        if (pyArgs.length === arity) {
          return `${root.name}(${pyArgs.join(', ')})`;
        }
        if (pyArgs.length > arity) {
          const head = `${root.name}(${pyArgs.slice(0, arity).join(', ')})`;
          return pyArgs.slice(arity).reduce((acc, a) => `${acc}(${a})`, head);
        }
        // Partial application fallback
        const rem = Array.from({ length: arity - pyArgs.length }, (_, i) => `_p${i + 1}`);
        return `(lambda ${rem.join(', ')}: ${root.name}(${[...pyArgs, ...rem].join(', ')}))`;
      }
      return `${astToPythonExpr(node.callee, namedArity)}(${astToPythonExpr(node.arg, namedArity)})`;
    }
  }
}

function astToRustExpr(node: LogicAstNode, namedArity?: Map<string, number>): string {
  switch (node.type) {
    case 'NumberLit':
      return Number.isInteger(node.value) ? `${node.value}.0_f64` : `${node.value}_f64`;
    case 'BoolLit':
      return node.value ? 'true' : 'false';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return node.op === '¬'
        ? `(!${astToRustExpr(node.operand, namedArity)})`
        : `(-${astToRustExpr(node.operand, namedArity)})`;
    case 'BinaryOp': {
      const l = astToRustExpr(node.left, namedArity);
      const r = astToRustExpr(node.right, namedArity);
      switch (node.op) {
        case '∧':
          return `(${l} && ${r})`;
        case '∨':
          return `(${l} || ${r})`;
        case '⊕':
          return `(${l} ^ ${r})`;
        case '→':
          return `((!${l}) || ${r})`;
        case '↔':
        case '≡':
          return `(${l} == ${r})`;
        case '=':
          return `(${l} == ${r})`;
        case '≠':
          return `(${l} != ${r})`;
        case '<':
          return `(${l} < ${r})`;
        case '≤':
          return `(${l} <= ${r})`;
        case '>':
          return `(${l} > ${r})`;
        case '≥':
          return `(${l} >= ${r})`;
        case '^':
          return `(${l}.powf(${r}))`;
        default:
          return `(${l} ${node.op} ${r})`;
      }
    }
    case 'Quantifier': {
      const method = node.quantifier === '∀' ? 'all' : 'any';
      return `[false, true].into_iter().${method}(|${node.variable}| ${astToRustExpr(node.body, namedArity)})`;
    }
    case 'Lambda':
      return `(|${node.param}| ${astToRustExpr(node.body, namedArity)})`;
    case 'Call': {
      const { root, args } = unwindCallChain(node);
      if (root.type === 'Identifier' && namedArity?.has(root.name)) {
        const arity = namedArity.get(root.name) || 1;
        const rsArgs = args.map((a) => astToRustExpr(a, namedArity));
        if (rsArgs.length === arity) {
          return `${root.name}(${rsArgs.join(', ')})`;
        }
        if (rsArgs.length > arity) {
          const head = `${root.name}(${rsArgs.slice(0, arity).join(', ')})`;
          return rsArgs.slice(arity).reduce((acc, a) => `${acc}(${a})`, head);
        }
        const rem = Array.from({ length: arity - rsArgs.length }, (_, i) => `_p${i + 1}`);
        return `(|${rem.join(', ')}| ${root.name}(${[...rsArgs, ...rem].join(', ')}))`;
      }
      return `${astToRustExpr(node.callee, namedArity)}(${astToRustExpr(node.arg, namedArity)})`;
    }
  }
}

interface ResolvedInputGrammarSpec {
  requiredInputs: Array<{ name: string; kind: 'number' | 'boolean'; defaultValue: string }>;
  rules: Array<{ name: string; expression: string }>;
  grammarText: string;
  entryRule: string;
  sampleSingleInput: string;
}

function buildLogicInputGrammarSpec(
  allLabels: LogicLabelBinding[],
  evalRes: LogicEvaluationResult,
  grammarCtx?: LogicGrammarContext
): ResolvedInputGrammarSpec {
  const seen = new Set<string>();
  const lambdaNames = new Set(
    allLabels
      .filter((l) => l.kind === 'lambda')
      .map((l) => l.name.trim())
      .filter(Boolean)
  );
  const requiredInputs: Array<{ name: string; kind: 'number' | 'boolean'; defaultValue: string }> = [];

  for (const l of allLabels) {
    if (l.kind === 'lambda') continue;
    const cleanName = l.name.trim();
    if (!cleanName || seen.has(cleanName)) continue;
    seen.add(cleanName);
    requiredInputs.push({
      name: cleanName,
      kind: l.kind,
      defaultValue: l.value.trim() || (l.kind === 'boolean' ? 'false' : '0'),
    });
  }

  for (const freeVar of evalRes.freeVariables) {
    if (!freeVar || seen.has(freeVar) || lambdaNames.has(freeVar)) continue;
    seen.add(freeVar);
    requiredInputs.push({ name: freeVar, kind: 'number', defaultValue: '0' });
  }

  const ruleOp = grammarCtx?.dialect?.ruleOperator || '::=';
  const studioRules = (grammarCtx?.rules ?? [])
    .filter((r) => r.name.trim() && r.expression.trim())
    .map((r) => ({ name: r.name.trim(), expression: r.expression.trim() }));

  // Build composite input grammar combining the active Studio Grammar rules with explicit input bindings
  const existingNames = new Set(studioRules.map((r) => r.name));
  const syntheticInputRules: Array<{ name: string; expression: string }> = [];
  if (requiredInputs.length > 0 && !existingNames.has('logic_input')) {
    const seqParts = requiredInputs.map((inp) => `("${inp.name}=" ${inp.name})`);
    syntheticInputRules.push({
      name: 'logic_input',
      expression: seqParts.join(' " " '),
    });
  }
  for (const inp of requiredInputs) {
    if (!existingNames.has(inp.name)) {
      syntheticInputRules.push({
        name: inp.name,
        expression: inp.kind === 'boolean' ? '"true" | "false" | "1" | "0"' : '("+" | "-")? digit+ ("." digit+)?',
      });
    }
  }
  if (!existingNames.has('digit') && syntheticInputRules.some((r) => r.expression.includes('digit'))) {
    syntheticInputRules.push({
      name: 'digit',
      expression: '"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"',
    });
  }

  const combinedRules = [...studioRules, ...syntheticInputRules];
  const baseGrammar = (grammarCtx?.grammarText ?? '').trim();
  const syntheticText = syntheticInputRules
    .map((r) => `${r.name} ${ruleOp} ${r.expression}`)
    .join('\n');
  const grammarText = [baseGrammar, syntheticText].filter(Boolean).join('\n');
  const entryRule =
    requiredInputs.length > 0 && combinedRules.some((r) => r.name === 'logic_input')
      ? 'logic_input'
      : combinedRules[0]?.name || 'logic_input';

  const kvSample = requiredInputs.map((inp) => `${inp.name}=${inp.defaultValue}`).join(' ');
  const sampleSingleInput =
    kvSample || (grammarCtx?.sampleInput?.trim() ?? '');

  return {
    requiredInputs,
    rules: combinedRules,
    grammarText,
    entryRule,
    sampleSingleInput,
  };
}

export function getLogicExportUnsupportedReason(
  target: LogicExportTarget,
  cauchy?: CauchySequenceConfig
): string | null {
  return cauchy?.enabled && ['go', 'java', 'cpp', 'csharp', 'php'].includes(target)
    ? `Cauchy evaluation is not implemented for ${target} exports.`
    : null;
}

function collectFreeIdentifiersFromExpr(expr: string, out: Set<string>): void {
  const trimmed = expr.trim();
  if (!trimmed) return;
  const parsed = parseLogicExpression(trimmed);
  if (parsed.ok) {
    const walk = (node: LogicAstNode, bound: Set<string>): void => {
      switch (node.type) {
        case 'Identifier':
          if (!bound.has(node.name)) out.add(node.name);
          return;
        case 'UnaryOp':
          walk(node.operand, bound);
          return;
        case 'BinaryOp':
          walk(node.left, bound);
          walk(node.right, bound);
          return;
        case 'Lambda': {
          const next = new Set(bound);
          next.add(node.param);
          walk(node.body, next);
          return;
        }
        case 'Quantifier': {
          const next = new Set(bound);
          next.add(node.variable);
          walk(node.body, next);
          return;
        }
        case 'Call':
          walk(node.callee, bound);
          walk(node.arg, bound);
          return;
        default:
          return;
      }
    };
    walk(parsed.ast, new Set());
    return;
  }
  for (const m of trimmed.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    out.add(m[0]);
  }
}

function collectUsedCallbackNames(
  rawLabels: LogicLabelBinding[],
  statement: string,
  translatedStatement: string,
  cauchy?: CauchySequenceConfig
): Set<string> {
  const reachable = new Set<string>();
  collectFreeIdentifiersFromExpr(statement, reachable);
  collectFreeIdentifiersFromExpr(translatedStatement, reachable);
  if (cauchy?.enabled) {
    collectFreeIdentifiersFromExpr(cauchy.recurrenceExpr || '', reachable);
    collectFreeIdentifiersFromExpr(cauchy.seedValues || '', reachable);
  }
  for (const l of rawLabels) {
    if (l.kind !== 'lambda') {
      collectFreeIdentifiersFromExpr(l.value, reachable);
    }
  }

  const lambdaLabels = rawLabels.filter((l) => l.kind === 'lambda' && l.name.trim());
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of lambdaLabels) {
      const name = l.name.trim();
      if (!reachable.has(name)) continue;
      const before = reachable.size;
      collectFreeIdentifiersFromExpr(l.value, reachable);
      if (reachable.size > before) changed = true;
    }
  }
  return reachable;
}

export function exportLogicStatement(
  target: LogicExportTarget,
  statement: string,
  labels: LogicLabelBinding[],
  evalRes: LogicEvaluationResult,
  cauchy?: CauchySequenceConfig,
  grammarCtx?: LogicGrammarContext,
  inputMode: LogicExportInputMode = 'cli'
): {
  content: string;
  filename: string;
  mime: string;
  wasm?: WasmCompilationResult;
} {
  const cauchyEval = cauchy?.enabled ? evaluateCauchySequence(cauchy, labels) : null;
  const cleanStmt = statement.trim();
  const translation = translateLambdaCallsToNamedCallbacks(cleanStmt, labels);
  const rawAllLabels = [...labels, ...translation.liftedLabels];
  const usedCallbackNames = collectUsedCallbackNames(
    rawAllLabels,
    cleanStmt,
    translation.translatedStatement,
    cauchy
  );
  const usedInputLabels = labels.filter(
    (l) => l.kind !== 'lambda' || usedCallbackNames.has(l.name.trim())
  );
  const allLabels = rawAllLabels.filter(
    (l) => l.kind !== 'lambda' || usedCallbackNames.has(l.name.trim())
  );
  const usedCallbacks = translation.callbacks.filter((cb) =>
    usedCallbackNames.has(cb.name.trim())
  );
  const namedArity = new Map<string, number>();
  for (const cb of usedCallbacks) {
    namedArity.set(cb.name, cb.params.length);
  }

  const translatedAstParsed = parseLogicExpression(translation.translatedStatement);
  const exprAst = translatedAstParsed.ok ? translatedAstParsed.ast : evalRes.ast;
  const loweredPlan = exprAst ? lowerLogicAstForCodegen(exprAst, allLabels, parseLogicExpression) : null;
  const astExprPy = exprAst ? astToPythonExpr(exprAst, namedArity) : 'None';
  const astExprRs = exprAst ? astToRustExpr(exprAst, namedArity) : 'false';
  const inputGrammar = buildLogicInputGrammarSpec(allLabels, evalRes, grammarCtx);
  const unsupportedReason = getLogicExportUnsupportedReason(target, cauchy);
  if (unsupportedReason) throw new Error(unsupportedReason);

  if (target === 'python') {
    const lowerQuantifiers = (node: LogicAstNode): LogicAstNode => {
      switch (node.type) {
        case 'Quantifier': {
          const body = lowerQuantifiers(node.body);
          let param = '_logic_quantifier';
          while (namedArity.has(param)) param += '_';
          const apply = (value: boolean): LogicAstNode => ({
            type: 'UnaryOp',
            op: '¬',
            operand: {
              type: 'UnaryOp',
              op: '¬',
              operand: {
                type: 'Call',
                callee: { type: 'Identifier', name: param },
                arg: { type: 'BoolLit', value },
              },
            },
          });
          return {
            type: 'Call',
            callee: {
              type: 'Lambda',
              param,
              body: {
                type: 'BinaryOp',
                op: node.quantifier === '∀' ? '∧' : '∨',
                left: apply(false),
                right: apply(true),
              },
            },
            arg: { type: 'Lambda', param: node.variable, body },
          };
        }
        case 'UnaryOp': return { ...node, operand: lowerQuantifiers(node.operand) };
        case 'BinaryOp': return { ...node, left: lowerQuantifiers(node.left), right: lowerQuantifiers(node.right) };
        case 'Lambda': return { ...node, body: lowerQuantifiers(node.body) };
        case 'Call': return { ...node, callee: lowerQuantifiers(node.callee), arg: lowerQuantifiers(node.arg) };
        default: return node;
      }
    };
    const safeAstExprPy = translatedAstParsed.ok
      ? astToPythonExpr(lowerQuantifiers(translatedAstParsed.ast), namedArity)
      : astExprPy;
    const booleanFree = new Set<string>();
    const inferBooleans = (node: LogicAstNode, expected = false): void => {
      if (node.type === 'Identifier' && expected) booleanFree.add(node.name);
      else if (node.type === 'UnaryOp') inferBooleans(node.operand, node.op === '¬');
      else if (node.type === 'BinaryOp') {
        const logical = ['∧', '∨', '⊕', '→', '↔', '≡'].includes(node.op);
        inferBooleans(node.left, logical);
        inferBooleans(node.right, logical);
      } else if (node.type === 'Quantifier' || node.type === 'Lambda') inferBooleans(node.body, expected);
    };
    if (exprAst) inferBooleans(exprAst);
    const labelNames = new Set(allLabels.map((l) => l.name.trim()));
    const callbackNames = new Set(allLabels.filter((l) => l.kind === 'lambda').map((l) => l.name.trim()));
    const metaEntries = allLabels.map(
      (l) => `    (${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}),`
    );

    const grammarRuleEntries = inputGrammar.rules.map(
      (r) => `    ${JSON.stringify(r.name)}: ${JSON.stringify(r.expression)},`
    );

    const requiredInputEntries = inputGrammar.requiredInputs.filter((inp) => !callbackNames.has(inp.name)).map(
      (inp) => `    (${JSON.stringify(inp.name)}, ${JSON.stringify(!labelNames.has(inp.name) && booleanFree.has(inp.name) ? 'boolean' : inp.kind)}, ${JSON.stringify(inp.defaultValue)}),`
    );

    const cauchyPyBlock =
      cauchy?.enabled && cauchyEval
        ? `
CAUCHY_CONFIG = {
    "param_style": "${cauchy.paramStyle}",
    "params": ${JSON.stringify(cauchyEval.resolvedParamNames)},
    "seeds": ${JSON.stringify(cauchy.seedValues)},
    "recurrence": '${cauchy.recurrenceExpr.replace(/'/g, '"')}',
    "max_iterations": ${cauchy.maxIterations},
    "epsilon": ${cauchy.epsilon},
}

def evaluate_cauchy_sequence(config=CAUCHY_CONFIG, labels=LOGIC_LABELS):
    seeds = [float(s.strip()) for s in str(config["seeds"]).split(",") if s.strip()]
    params = list(config["params"])
    arity = len(seeds)
    terms = list(seeds)
    for _ in range(int(config["max_iterations"])):
        window = terms[-arity:]
        step_labels = list(labels) + [
            ("n", "number", str(len(terms))),
            ("left", "number", str(window[0])),
            ("right", "number", str(window[-1])),
        ]
        for idx, val in enumerate(window):
            step_labels.append((f"_{idx + 1}", "number", str(val)))
            if idx < len(params):
                step_labels.append((params[idx], "number", str(val)))
        terms.append(float(parse_logic_call(config["recurrence"], step_labels)))
    return terms
`
        : '';

    const content = `# Logic, Labeled Arithmetic & Named Lambda Callbacks Module
# Exposes all named literal parameters to the CLI (--<var> <literal>),
# allows editing string inputs (--input / --statement / --labels / --grammar),
# or falls back to the built-in defaults automatically.
import argparse
import ast
import json
import re
import symtable
import sys

CLI_INPUTS_ENABLED = ${inputMode === 'cli' ? 'True' : 'False'}
LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}

LOGIC_LABELS = [
${metaEntries.join('\n')}
]

ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)}

GRAMMAR_RULES = {
${grammarRuleEntries.join('\n')}
}

REQUIRED_INPUTS = [
${requiredInputEntries.join('\n')}
]

SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)}

def _split_top_level_alts(expr: str):
    parts = []
    buf = []
    depth = 0
    quote = None
    i = 0
    while i < len(expr):
        ch = expr[i]
        if quote:
            buf.append(ch)
            if ch == '\\\\' and i + 1 < len(expr):
                i += 1
                buf.append(expr[i])
            elif ch == quote:
                quote = None
        else:
            if ch in ('"', "'"):
                quote = ch
                buf.append(ch)
            elif ch == '(':
                depth += 1
                buf.append(ch)
            elif ch == ')' and depth > 0:
                depth -= 1
                buf.append(ch)
            elif ch == '|' and depth == 0:
                seg = ''.join(buf).strip()
                if seg:
                    parts.append(seg)
                buf = []
            else:
                buf.append(ch)
        i += 1
    seg = ''.join(buf).strip()
    if seg:
        parts.append(seg)
    return parts

def _compile_grammar_expr_regex(expr: str, grammar_rules=GRAMMAR_RULES, depth: int = 0) -> str:
    alts = _split_top_level_alts(expr)
    compiled_alts = []
    for alt in alts:
        tokens = re.findall(r"""(?:"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()|+*?])""", alt)
        seq = []
        for tok in tokens:
            if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                seq.append(re.escape(tok[1:-1]))
            elif tok in ('(', ')', '|', '+', '*', '?'):
                seq.append(tok)
            else:
                q = tok[-1] if tok[-1] in '+*?' else ''
                ref = tok[:-1] if q else tok
                sub = _compile_grammar_rule_regex(ref, grammar_rules, depth + 1)
                seq.append(f'(?:{sub}){q}')
        compiled_alts.append(''.join(seq))
    return '(?:' + '|'.join(compiled_alts) + ')' if compiled_alts else r'[^\\s,;]+'

def _compile_grammar_rule_regex(rule_name: str, grammar_rules=GRAMMAR_RULES, depth: int = 0) -> str:
    if depth > 8:
        return r'[^\\s,;]+'
    expr = grammar_rules.get(rule_name)
    if not expr:
        return r'[+-]?\\d+(?:\\.\\d+)?|true|false|[^\\s,;]+'
    if rule_name == 'digit':
        return r'[0-9]'
    return _compile_grammar_expr_regex(expr, grammar_rules, depth)

def parse_inputs_from_string(raw_input: str, grammar_rules=GRAMMAR_RULES, required_inputs=REQUIRED_INPUTS):
    """Extract named assignments and positional literals from a single string."""
    text = str(raw_input or '').strip()
    parsed = {}

    assignments = re.compile(r'([A-Za-z_][A-Za-z0-9_]*)\\s*[:=]\\s*([^\\s,;]+)')
    for match in assignments.finditer(text):
        name, value = match.groups()
        if name in grammar_rules:
            pattern = _compile_grammar_rule_regex(name, grammar_rules)
            if not re.fullmatch(pattern, value, re.IGNORECASE):
                raise ValueError(f"Input {name} does not match its grammar rule")
        parsed[name] = value
    remaining = assignments.sub(' ', text)
    tokens = [t for t in re.split(r'[\\s,;]+', remaining) if t]
    for token in tokens:
        target = next(((name, kind) for name, kind, _ in required_inputs
                       if name not in parsed and
                       ((kind == 'boolean' and token.lower() in ('true', 'false', '⊤', '⊥'))
                        or (kind == 'number' and re.fullmatch(r'[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?', token)))), None)
        if target is None:
            raise ValueError(f"Unrecognized positional literal: {token}")
        parsed[target[0]] = token
    return parsed

def _rewrite_implications(expr: str) -> str:
    # Split on top-level implication arrows ('→' or '->') right-associatively
    parts = []
    buf = []
    depth = 0
    i = 0
    while i < len(expr):
        ch = expr[i]
        if ch == '(':
            depth += 1
            buf.append(ch)
            i += 1
        elif ch == ')':
            if depth > 0:
                depth -= 1
            buf.append(ch)
            i += 1
        elif depth == 0 and ch == '→':
            parts.append(''.join(buf).strip())
            buf = []
            i += 1
        elif depth == 0 and expr[i:i+2] == '->':
            parts.append(''.join(buf).strip())
            buf = []
            i += 2
        else:
            buf.append(ch)
            i += 1
    parts.append(''.join(buf).strip())
    if len(parts) > 1:
        rewritten = [_rewrite_implications(p) for p in parts]
        acc = rewritten[-1]
        for p in reversed(rewritten[:-1]):
            acc = f"((not ({p})) or ({acc}))"
        return acc
    # Recursively rewrite parenthesized sub-expressions
    out = []
    i = 0
    while i < len(expr):
        if expr[i] == '(':
            depth = 1
            j = i + 1
            while j < len(expr) and depth > 0:
                if expr[j] == '(':
                    depth += 1
                elif expr[j] == ')':
                    depth -= 1
                j += 1
            inner = expr[i + 1:j - 1]
            out.append('(' + _rewrite_implications(inner) + ')')
            i = j
        else:
            out.append(expr[i])
            i += 1
    return ''.join(out)

def _rewrite_quantifiers(expr: str) -> str:
    m = re.search(r'([∀∃])\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\.\\s*', expr)
    if not m:
        return expr
    q_sym, var_name = m.group(1), m.group(2)
    op = 'and' if q_sym == '∀' else 'or'
    prefix = expr[:m.start()]
    body = _rewrite_quantifiers(expr[m.end():].strip())
    return f"{prefix}((lambda _q: bool(_q(False)) {op} bool(_q(True)))(lambda {var_name}: {body}))"

def _normalize_to_python_expr(source: str) -> str:
    expr = source.strip()
    # Convert chained Unicode lambdas (λa. λb. body) into Python multi-arg lambdas
    def _collapse_lambdas(match: re.Match) -> str:
        params = re.findall(r'[λ\\\\]\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\.', match.group(0))
        return f"lambda {', '.join(params)}: "
    expr = re.sub(r'(?:[λ\\\\]\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\.\\s*)+', _collapse_lambdas, expr)
    expr = _rewrite_quantifiers(expr)
    expr = _rewrite_implications(expr)
    expr = expr.replace('⊤', 'True').replace('⊥', 'False')
    expr = expr.replace('¬', ' not ').replace('∧', ' and ').replace('∨', ' or ')
    expr = expr.replace('≤', '<=').replace('≥', '>=').replace('≠', '!=')
    expr = expr.replace('⊕', ' != ').replace('↔', ' == ').replace('≡', ' == ')
    expr = expr.replace('^', '**')
    expr = re.sub(r'(?<![<>=!])=(?!=)', '==', expr)
    return expr

_ALLOWED_DSL_NODES = (
    ast.Expression, ast.Constant, ast.Name, ast.Load,
    ast.UnaryOp, ast.Not, ast.USub, ast.UAdd,
    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow,
    ast.BoolOp, ast.And, ast.Or,
    ast.Compare, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.Lambda, ast.arguments, ast.arg, ast.Call,
)

def _eval_dsl_expr(source: str, env: dict, filename: str):
    tree = ast.parse(source, filename=filename, mode='eval')
    for node in ast.walk(tree):
        if type(node) not in _ALLOWED_DSL_NODES:
            raise ValueError(f"Unsupported expression syntax: {type(node).__name__}")
        if isinstance(node, ast.Constant) and type(node.value) not in (bool, int, float):
            raise ValueError("Only boolean and numeric literals are supported")
        if isinstance(node, ast.Name) and node.id == '__builtins__':
            raise ValueError("Unsupported identifier: __builtins__")
        if isinstance(node, ast.Call) and (not node.args or node.keywords):
            raise ValueError("Calls require positional arguments")
        if isinstance(node, ast.arguments) and (
            not node.args or node.posonlyargs or node.kwonlyargs or node.vararg or
            node.kwarg or node.defaults or node.kw_defaults
        ):
            raise ValueError("Only simple lambda parameters are supported")
        if isinstance(node, ast.arg) and (node.annotation is not None or node.type_comment is not None):
            raise ValueError("Lambda parameter annotations are not supported")
    return eval(compile(tree, filename, 'eval'), env)

def parse_logic_call(statement: str, labels=LOGIC_LABELS, system_parser=None):
    """Calls LOGIC_STATEMENT with LOGIC_LABELS via defined system_parser or Python's conventional AST flow."""
    if callable(system_parser):
        return system_parser(statement, labels)

    env = {"__builtins__": {}, "True": True, "False": False, "bool": bool, "int": int, "float": float, "all": all, "any": any}
    for name, kind, raw_val in labels:
        val_str = str(raw_val).strip()
        if kind == 'boolean':
            low = val_str.lower()
            if low in ('true', '⊤', '1'):
                env[name] = True
            elif low in ('false', '⊥', '0'):
                env[name] = False
            else:
                env[name] = bool(_eval_dsl_expr(_normalize_to_python_expr(val_str), env, '<label>'))
        elif kind == 'number':
            try:
                env[name] = int(val_str) if val_str.lstrip('+-').isdigit() else float(val_str)
            except ValueError:
                env[name] = _eval_dsl_expr(_normalize_to_python_expr(val_str), env, '<label>')
        else:
            env[name] = _eval_dsl_expr(_normalize_to_python_expr(val_str), env, '<callback>')

    ${!translatedAstParsed.ok ? `if statement == LOGIC_STATEMENT:\n        raise ValueError(${JSON.stringify(translatedAstParsed.error)})` : ''}
    py_expr = _normalize_to_python_expr(statement)
    def unresolved(table):
        names = {s.get_name() for s in table.get_symbols()
                 if s.is_referenced() and s.is_global() and s.get_name() not in env}
        for child in table.get_children():
            names.update(unresolved(child))
        return names
    missing = unresolved(symtable.symtable(py_expr, '<LOGIC_STATEMENT>', 'eval'))
    if missing:
        raise NameError("Unresolved variables: " + ', '.join(sorted(missing)))
    return _eval_dsl_expr(py_expr, env, '<LOGIC_STATEMENT>')

def evaluate_logic(statement: str = LOGIC_STATEMENT, labels=LOGIC_LABELS, system_parser=None):
    if isinstance(labels, str):
        return evaluate_from_input(labels, statement, system_parser=system_parser)
    return parse_logic_call(statement, labels, system_parser=system_parser)

def _parse_grammar_rules_from_text(grammar_text: str):
    """Parses rule definitions from an edited ACTIVE_GRAMMAR string."""
    parsed_rules = dict(GRAMMAR_RULES)
    for line in str(grammar_text or '').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or stripped.startswith('//'):
            continue
        m = re.match(r'^<?([A-Za-z_][A-Za-z0-9_-]*)>?\\s*(?:::=|:=|<-|->|=|:)\\s*(.+)$', stripped)
        if m:
            parsed_rules[m.group(1).strip()] = m.group(2).strip()
    return parsed_rules

def _coerce_cli_literal(raw_val: str, kind: str):
    text = str(raw_val).strip()
    if kind == 'boolean':
        low = text.lower()
        if low in ('true', '1', 'yes', 't', '⊤'):
            return True
        if low in ('false', '0', 'no', 'f', '⊥'):
            return False
        raise argparse.ArgumentTypeError(f"Expected boolean literal (true/false), got {raw_val!r}")
    if kind == 'number':
        try:
            return int(text) if re.fullmatch(r'[+-]?\\d+', text) else float(text)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Expected numeric literal, got {raw_val!r}") from exc
    return text

def evaluate_from_input(
    raw_input: str = '',
    statement: str = LOGIC_STATEMENT,
    labels=LOGIC_LABELS,
    grammar_rules=GRAMMAR_RULES,
    overrides=None,
    system_parser=None,
):
    """Parses inputs from a single string via the grammar, applies named literal overrides, and evaluates."""
    extracted = parse_inputs_from_string(raw_input, grammar_rules=grammar_rules)
    if overrides:
        for k, v in overrides.items():
            if v is not None:
                extracted[k] = 'true' if v is True else ('false' if v is False else str(v))
    merged_labels = [
        (name, kind, extracted.get(name, raw_val) if kind != 'lambda' else raw_val)
        for name, kind, raw_val in labels
    ]
    known = {name for name, _, _ in merged_labels}
    kinds = {name: kind for name, kind, _ in REQUIRED_INPUTS}
    for name, value in extracted.items():
        if name not in known:
            kind = kinds.get(name, 'boolean' if str(value).lower() in ('true', 'false', '⊤', '⊥') else 'number')
            merged_labels.append((name, kind, value))
    return evaluate_logic(statement, merged_labels, system_parser=system_parser)

def evaluate_logic_compiled():
    return evaluate_logic()
${cauchyPyBlock}
def build_cli_parser():
    """Exposes every named literal variable as a typed CLI option alongside editable string flags."""
    parser = argparse.ArgumentParser(
        description="Evaluate LOGIC_STATEMENT using named literal CLI parameters, edited strings, or defaults."
    )
    parser.add_argument(
        "raw_input",
        nargs="?",
        default=None,
        help="Optional single-string literal input (default: no overrides)",
    )
    parser.add_argument("labels_input", nargs="*",
                        help="Labels as name=value pairs; with a first positional statement")
    parser.add_argument(
        "--input",
        dest="input_str",
        default=None,
        help="Single-string literal input",
    )
    parser.add_argument(
        "--statement",
        default=LOGIC_STATEMENT,
        help=f"Edit LOGIC_STATEMENT string (default: {LOGIC_STATEMENT!r})",
    )
    parser.add_argument(
        "--grammar",
        default=None,
        help="Edit ACTIVE_GRAMMAR string used to parse --input",
    )
    parser.add_argument("--labels", default=None, help="Labels as name=value pairs")
    for var_name, kind, default_val in REQUIRED_INPUTS:
        flag_names = [f"--{var_name}"]
        dash_alias = f"--{var_name.replace('_', '-')}"
        if dash_alias != flag_names[0]:
            flag_names.append(dash_alias)
        parser.add_argument(
            *flag_names,
            dest=f"var__{var_name}",
            default=None,
            type=lambda v, _k=kind: _coerce_cli_literal(v, _k),
            metavar=kind.upper(),
            help=f"Literal {kind} parameter '{var_name}' (default: {default_val})",
        )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print structured JSON output",
    )
    return parser

def run_cli(argv=None):
    parser = build_cli_parser()
    args = parser.parse_args(argv if CLI_INPUTS_ENABLED else [])
    active_grammar_rules = _parse_grammar_rules_from_text(args.grammar) if args.grammar else GRAMMAR_RULES
    statement = args.statement
    if args.labels_input:
        positional = [args.raw_input] + args.labels_input
        is_literal = lambda t: t.lower() in ('true', 'false', '⊤', '⊥') or re.fullmatch(r'[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?', t)
        if all(is_literal(t) for t in positional):
            raw_input = ' '.join(positional)
        elif len(args.labels_input) == 1:
            statement, raw_input = args.raw_input, args.labels_input[0]
        else:
            parser.error("expected positional literals or a statement and labels string")
    else:
        raw_input = args.input_str if args.input_str is not None else (args.raw_input or '')
        if args.raw_input and args.input_str is None and args.labels is None:
            rest = re.sub(r'[A-Za-z_][A-Za-z0-9_]*\\s*[:=]\\s*[^\\s,;]+', '', raw_input)
            tokens = [t for t in re.split(r'[\\s,;]+', rest) if t]
            if any(not (t.lower() in ('true', 'false', '⊤', '⊥') or
                        re.fullmatch(r'[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?', t)) for t in tokens):
                statement, raw_input = raw_input, ''
    if args.labels is not None:
        raw_input = args.labels

    overrides = {}
    for var_name, _kind, _default_val in REQUIRED_INPUTS:
        val = getattr(args, f"var__{var_name}", None)
        if val is not None:
            overrides[var_name] = val

    resolved = parse_inputs_from_string(raw_input, grammar_rules=active_grammar_rules)
    for k, v in overrides.items():
        resolved[k] = v

    # Seed defaults from REQUIRED_INPUTS / LOGIC_LABELS, then apply CLI overrides
    default_label_names = {name for name, kind, _ in LOGIC_LABELS if kind != 'lambda'}
    typed_vars = {}
    for name, kind, default_val in REQUIRED_INPUTS:
        if name in resolved:
            typed_vars[name] = _coerce_cli_literal(resolved[name], kind)
        elif name in default_label_names:
            try:
                typed_vars[name] = _coerce_cli_literal(default_val, kind)
            except Exception:
                typed_vars[name] = default_val
    result = evaluate_from_input(
        raw_input=raw_input,
        statement=statement,
        grammar_rules=active_grammar_rules,
        overrides=overrides,
    )
    if args.json:
        print(json.dumps({"statement": statement, "variables": typed_vars, "result": result}, default=str))
    else:
        print("Variables:", typed_vars)
        print("Result:", result)${cauchy?.enabled ? "\n        print('Cauchy Limit:', evaluate_cauchy_sequence()[-1])" : ''}
    return result

if __name__ == '__main__':
    run_cli(sys.argv[1:])
`;
    return { content, filename: 'logic_lambda_calc.py', mime: 'text/x-python' };
  }

  if (target === 'jsonld') {
    const doc = {
      '@context': 'https://schema.org',
      '@type': 'MathSolver',
      name: 'LogicLambdaStatement',
      'x-logic-format': 'grammar2json-logic-lambda/v1',
      'x-logic-statement': cleanStmt,
      'x-translated-statement': translation.translatedStatement,
      'x-input-grammar': {
        entryRule: inputGrammar.entryRule,
        sampleSingleInput: inputGrammar.sampleSingleInput,
        requiredInputs: inputGrammar.requiredInputs,
        rules: inputGrammar.rules,
        grammarText: inputGrammar.grammarText,
      },
      'x-cli-parameters': {
        namedLiteralFlags: inputGrammar.requiredInputs.map((inp) => ({
          name: inp.name,
          flag: `--${inp.name}`,
          literalType: inp.kind,
          defaultValue: inp.defaultValue,
        })),
        editableStringFlags: [
          { flag: '--input', target: 'SAMPLE_SINGLE_INPUT', defaultValue: inputGrammar.sampleSingleInput },
          { flag: '--statement', target: 'LOGIC_STATEMENT', defaultValue: translation.translatedStatement },
          { flag: '--grammar', target: 'ACTIVE_GRAMMAR', defaultValue: inputGrammar.grammarText },
        ],
      },
      'x-named-callbacks': usedCallbacks.map((cb) => ({
        name: cb.name,
        params: cb.params,
        signature: cb.signature,
        body: cb.body,
        source: cb.source,
      })),
      'x-labels': allLabels.map((l) => ({
        name: l.name,
        kind: l.kind,
        value: l.value,
      })),
      'x-evaluation': {
        ok: evalRes.ok,
        valueType: evalRes.valueType,
        displayValue: evalRes.displayValue,
      },
      ...(cauchy?.enabled && cauchyEval
        ? {
            'x-cauchy-sequence': {
              paramStyle: cauchy.paramStyle,
              resolvedParamNames: cauchyEval.resolvedParamNames,
              seedValues: cauchy.seedValues,
              recurrenceExpr: cauchy.recurrenceExpr,
              maxIterations: cauchy.maxIterations,
              epsilon: cauchy.epsilon,
              converged: cauchyEval.converged,
              cauchyIndexN: cauchyEval.cauchyIndexN,
              limitEstimate: cauchyEval.limitEstimate,
              tailDiameter: cauchyEval.tailDiameter,
            },
          }
        : {}),
      'x-ast': evalRes.ast,
    };
    return {
      content: JSON.stringify(doc, null, 2),
      filename: 'logic_lambda_calc.jsonld',
      mime: 'application/ld+json',
    };
  }

  if (target === 'rust') {
    const booleanFree = new Set<string>();
    const inferBooleans = (node: LogicAstNode, expected = false): void => {
      if (node.type === 'Identifier' && expected) booleanFree.add(node.name);
      else if (node.type === 'UnaryOp') inferBooleans(node.operand, node.op === '¬');
      else if (node.type === 'BinaryOp') {
        const logical = ['∧', '∨', '⊕', '→', '↔', '≡'].includes(node.op);
        inferBooleans(node.left, logical);
        inferBooleans(node.right, logical);
      } else if (node.type === 'Quantifier' || node.type === 'Lambda') inferBooleans(node.body, expected);
    };
    if (exprAst) inferBooleans(exprAst);
    const labelLines = allLabels.map((l) => {
      if (l.kind === 'boolean') {
        const lower = l.value.trim().toLowerCase();
        const fallback = lower === 'true' || l.value.trim() === '⊤' || l.value.trim() === '1'
          ? 'true'
          : lower === 'false' || l.value.trim() === '⊥' || l.value.trim() === '0'
            ? 'false'
            : (() => {
                const parsedExpr = parseLogicExpression(l.value);
                return parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : `panic!("Invalid boolean label: ${l.name}")`;
              })();
        return `    let ${l.name}: bool = parsed_inputs.get("${l.name}").map(|v| parse_bool(v)).unwrap_or_else(|| ${fallback});`;
      }
      if (l.kind === 'number') {
        const n = Number(l.value.trim());
        const fallback = l.value.trim() !== '' && !Number.isNaN(n)
          ? (Number.isInteger(n) ? `${n}.0` : `${n}`)
          : (() => {
              const parsedExpr = parseLogicExpression(l.value);
              return parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : `panic!("Invalid numeric label: ${l.name}")`;
            })();
        return `    let ${l.name}: f64 = parsed_inputs.get("${l.name}").map(|v| v.parse::<f64>().unwrap_or_else(|_| panic!("Invalid number for ${l.name}: {}", v))).unwrap_or_else(|| ${fallback});`;
      }
      const unwrapped = extractLambdaParamsAndBody(l.value);
      if (unwrapped) {
        return `    let ${l.name} = |${unwrapped.params.join(', ')}| ${astToRustExpr(unwrapped.body, namedArity)};`;
      }
      const parsedCb = parseLogicExpression(l.value);
      return `    let ${l.name} = ${parsedCb.ok ? astToRustExpr(parsedCb.ast, namedArity) : `panic!("Invalid callback: ${l.name}")`};`;
    });
    const knownLabels = new Set(allLabels.map((l) => l.name.trim()));
    const callbackNames = new Set(allLabels.filter((l) => l.kind === 'lambda').map((l) => l.name.trim()));
    const literalInputs = inputGrammar.requiredInputs.filter((inp) => !callbackNames.has(inp.name));
    const freeInputs = literalInputs.filter((inp) => !knownLabels.has(inp.name));
    const freeLines = freeInputs.map((inp) =>
      booleanFree.has(inp.name)
        ? `    let ${inp.name}: bool = parse_bool(parsed_inputs.get(${JSON.stringify(inp.name)}).unwrap_or_else(|| panic!("Unresolved variable: ${inp.name}")));`
        : `    let ${inp.name}: f64 = parsed_inputs.get(${JSON.stringify(inp.name)}).unwrap_or_else(|| panic!("Unresolved variable: ${inp.name}")).parse::<f64>().unwrap_or_else(|_| panic!("Invalid number for ${inp.name}"));`
    );
    const labelDependencies = new Set<string>();
    for (const label of allLabels) {
      const parsed = parseLogicExpression(label.value);
      if (parsed.ok) for (const name of collectFreeVariables(parsed.ast)) labelDependencies.add(name);
    }
    const dynamicFreeLines = freeLines.filter((_, i) =>
      labelDependencies.has(freeInputs[i].name)
    );
    const dynamicLabelLines = labelLines.filter((_, i) =>
      allLabels[i].kind !== 'lambda' || labelDependencies.has(allLabels[i].name)
    );

    const specTuples = allLabels.map(
      (l) => `    ("${l.name}", "${l.kind}", r#"${l.value}"#),`
    );

    const grammarTuples = inputGrammar.rules.map(
      (r) => `    (${JSON.stringify(r.name)}, r#"${r.expression}"#),`
    );

    const requiredTuples = literalInputs.map(
      (inp) => `    (${JSON.stringify(inp.name)}, ${JSON.stringify(!knownLabels.has(inp.name) && booleanFree.has(inp.name) ? 'boolean' : inp.kind)}, ${JSON.stringify(inp.defaultValue)}),`
    );

    const numericAst = (node: LogicAstNode | null): boolean => {
      if (!node) return false;
      if (node.type === 'NumberLit') return true;
      if (node.type === 'Identifier') return allLabels.find((l) => l.name === node.name)?.kind !== 'boolean';
      if (node.type === 'UnaryOp') return node.op === '-';
      if (node.type === 'BinaryOp') return ['+', '-', '*', '/', '^', '%'].includes(node.op);
      return false;
    };
    const retType = evalRes.valueType === 'number' || (evalRes.valueType === 'error' && numericAst(exprAst)) ? 'f64' : 'bool';
    const dynamicEntries = literalInputs.filter((inp) => knownLabels.has(inp.name)).map(
      (inp) => `    vars.insert(${JSON.stringify(inp.name)}.to_string(), Value::${inp.kind === 'boolean' ? 'Bool' : 'Num'}(${inp.name}));`
    );
    const content = `// Auto-generated Rust Logic & Named Lambda Callbacks Module
// Parses named assignments or positional literals from a single &str input.
use std::collections::HashMap;

pub const LOGIC_STATEMENT: &str = r#"${translation.translatedStatement}"#;

pub const LOGIC_LABELS: &[(&str, &str, &str)] = &[
${specTuples.join('\n')}
];

pub const ACTIVE_GRAMMAR: &str = r#"${inputGrammar.grammarText}"#;

pub const GRAMMAR_RULES: &[(&str, &str)] = &[
${grammarTuples.join('\n')}
];

pub const REQUIRED_INPUTS: &[(&str, &str, &str)] = &[
${requiredTuples.join('\n')}
];

pub const SAMPLE_SINGLE_INPUT: &str = ${JSON.stringify(inputGrammar.sampleSingleInput)};

/// Parses all needed inputs from a single string input guided by GRAMMAR_RULES & REQUIRED_INPUTS.
pub fn parse_inputs_from_string(raw_input: &str) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    let mut positional_nums: Vec<String> = Vec::new();
    let mut positional_bools: Vec<String> = Vec::new();

    let normalized = raw_input.replace(" =", "=").replace("= ", "=").replace(" :", ":").replace(": ", ":");
    for token in normalized.split(|c: char| c.is_whitespace() || c == ',' || c == ';').filter(|t| !t.is_empty()) {
        if let Some((k, v)) = token.split_once('=').or_else(|| token.split_once(':')) {
            let key = k.trim();
            let val = v.trim();
            if key.is_empty() || val.is_empty() { panic!("Invalid named input: {}", token); }
            map.insert(key.to_string(), val.to_string());
            continue;
        }
        let low = token.to_lowercase();
        if matches!(low.as_str(), "true" | "false" | "⊤" | "⊥") {
            positional_bools.push(token.to_string());
        } else if token.parse::<f64>().is_ok() {
            positional_nums.push(token.to_string());
        } else {
            panic!("Unrecognized positional literal: {}", token);
        }
    }

    let (mut n_idx, mut b_idx) = (0usize, 0usize);
    for (name, kind, _) in REQUIRED_INPUTS {
        if map.contains_key(*name) {
            continue;
        }
        if *kind == "number" && n_idx < positional_nums.len() {
            map.insert((*name).to_string(), positional_nums[n_idx].clone());
            n_idx += 1;
        } else if *kind == "boolean" && b_idx < positional_bools.len() {
            map.insert((*name).to_string(), positional_bools[b_idx].clone());
            b_idx += 1;
        }
    }
    if n_idx != positional_nums.len() || b_idx != positional_bools.len() {
        panic!("Too many positional literals");
    }
    map
}

fn parse_bool(value: &str) -> bool {
    match value.to_lowercase().as_str() {
        "true" | "1" | "⊤" => true,
        "false" | "0" | "⊥" => false,
        _ => panic!("Invalid boolean literal: {}", value),
    }
}

#[derive(Clone, Copy)]
enum Value { Num(f64), Bool(bool) }

fn dynamic_statement(statement: &str, vars: &HashMap<String, Value>) -> Value {
    let mut tokens = Vec::new();
    let chars: Vec<char> = statement.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() { i += 1; continue; }
        let start = i;
        if c.is_ascii_digit() || c == '.' {
            i += 1;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') { i += 1; }
        } else if c.is_alphanumeric() || c == '_' {
            i += 1;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') { i += 1; }
        } else {
            i += 1;
            if i < chars.len() && matches!((c, chars[i]), ('<', '=') | ('>', '=') | ('!', '=') | ('=', '=') | ('&', '&') | ('|', '|') | ('-', '>')) { i += 1; }
        }
        tokens.push(chars[start..i].iter().collect::<String>());
    }
    fn expr(tokens: &[String], pos: &mut usize, vars: &HashMap<String, Value>, min: u8) -> Value {
        let token = tokens.get(*pos).unwrap_or_else(|| panic!("Expected expression"));
        *pos += 1;
        let mut left = match token.as_str() {
            "(" => { let v = expr(tokens, pos, vars, 0); if tokens.get(*pos).map(String::as_str) != Some(")") { panic!("Expected ')'"); } *pos += 1; v },
            "-" => match expr(tokens, pos, vars, 7) { Value::Num(v) => Value::Num(-v), _ => panic!("Expected number") },
            "!" | "¬" | "not" => match expr(tokens, pos, vars, 7) { Value::Bool(v) => Value::Bool(!v), _ => panic!("Expected boolean") },
            "true" | "True" | "⊤" => Value::Bool(true),
            "false" | "False" | "⊥" => Value::Bool(false),
            _ => if let Ok(v) = token.parse::<f64>() { Value::Num(v) } else { *vars.get(token).unwrap_or_else(|| panic!("Unresolved variable: {}", token)) },
        };
        while let Some(op) = tokens.get(*pos) {
            let prec = match op.as_str() {
                "→" | "->" | "↔" | "≡" => 1,
                "∨" | "||" | "or" | "⊕" => 2,
                "∧" | "&&" | "and" => 3,
                "=" | "==" | "!=" | "≠" | "<" | ">" | "<=" | ">=" | "≤" | "≥" => 4,
                "+" | "-" => 5, "*" | "/" | "%" => 6, "^" => 7,
                _ => break,
            };
            if prec < min { break; }
            *pos += 1;
            let right = expr(tokens, pos, vars, prec + if op == "^" || op == "→" || op == "->" { 0 } else { 1 });
            left = match (left, right) {
                (Value::Num(a), Value::Num(b)) => match op.as_str() {
                    "+" => Value::Num(a+b), "-" => Value::Num(a-b), "*" => Value::Num(a*b),
                    "/" => { if b == 0.0 { panic!("Division by zero"); } Value::Num(a/b) },
                    "%" => { if b == 0.0 { panic!("Division by zero"); } Value::Num(a%b) },
                    "^" => Value::Num(a.powf(b)),
                    "=" | "==" => Value::Bool(a==b), "!=" | "≠" => Value::Bool(a!=b),
                    "<" => Value::Bool(a<b), ">" => Value::Bool(a>b),
                    "<=" | "≤" => Value::Bool(a<=b), ">=" | "≥" => Value::Bool(a>=b),
                    _ => panic!("Invalid numeric operator: {}", op),
                },
                (Value::Bool(a), Value::Bool(b)) => match op.as_str() {
                    "∧" | "&&" | "and" => Value::Bool(a && b),
                    "∨" | "||" | "or" => Value::Bool(a || b),
                    "⊕" | "!=" | "≠" => Value::Bool(a != b),
                    "→" | "->" => Value::Bool(!a || b),
                    "↔" | "≡" | "=" | "==" => Value::Bool(a == b),
                    _ => panic!("Invalid boolean operator: {}", op),
                },
                _ => panic!("Incompatible operand types"),
            };
        }
        left
    }
    let mut pos = 0;
    let result = expr(&tokens, &mut pos, vars, 0);
    if pos != tokens.len() { panic!("Unsupported expression near: {}", tokens[pos]); }
    result
}

pub fn evaluate_logic_with_overrides(
    raw_input: &str,
    overrides: &HashMap<String, String>,
) -> ${retType} {
    let mut parsed_inputs = parse_inputs_from_string(raw_input);
    for k in parsed_inputs.keys() {
        if !REQUIRED_INPUTS.iter().any(|(n, _, _)| *n == k) { panic!("Unknown input: {}", k); }
    }
    for (k, v) in overrides {
        if !REQUIRED_INPUTS.iter().any(|(n, _, _)| *n == k) {
            panic!("Unknown input: {}", k);
        }
        parsed_inputs.insert(k.clone(), v.clone());
    }
${freeLines.join('\n')}
${labelLines.join('\n')}
    ${translatedAstParsed.ok ? astExprRs : 'panic!("Invalid logic statement")'}
}

pub fn evaluate_statement_with_overrides(statement: &str, raw_input: &str, overrides: &HashMap<String, String>) -> ${retType} {
    if statement == LOGIC_STATEMENT { return evaluate_logic_with_overrides(raw_input, overrides); }
    let mut parsed_inputs = parse_inputs_from_string(raw_input);
    for (k, v) in overrides {
        parsed_inputs.insert(k.clone(), v.clone());
    }
${dynamicFreeLines.join('\n')}
${dynamicLabelLines.join('\n')}
    let mut vars = HashMap::new();
${dynamicEntries.join('\n')}
    for (name, value) in &parsed_inputs {
        if !vars.contains_key(name) {
            let parsed = if matches!(value.to_lowercase().as_str(), "true" | "false" | "⊤" | "⊥") {
                Value::Bool(parse_bool(value))
            } else {
                Value::Num(value.parse::<f64>().unwrap_or_else(|_| panic!("Invalid literal for {}: {}", name, value)))
            };
            vars.insert(name.clone(), parsed);
        }
    }
    match dynamic_statement(statement, &vars) {
        Value::${retType === 'f64' ? 'Num' : 'Bool'}(value) => value,
        _ => panic!("Dynamic statement result type differs from exported result type"),
    }
}

pub fn evaluate_logic_from_input(raw_input: &str) -> ${retType} {
    let empty: HashMap<String, String> = HashMap::new();
    evaluate_logic_with_overrides(raw_input, &empty)
}

pub fn evaluate_logic_from_strings(statement: &str, labels: &str) -> ${retType} {
    evaluate_statement_with_overrides(statement, labels, &HashMap::new())
}

pub fn evaluate_logic_with<F>(
    statement: &str,
    labels: &[(&str, &str, &str)],
    system_parser: Option<F>,
) -> ${retType}
where
    F: Fn(&str, &[(&str, &str, &str)]) -> ${retType},
{
    if let Some(parser) = system_parser {
        return parser(statement, labels);
    }
    let mut overrides = HashMap::new();
    for (name, kind, value) in labels {
        if *kind == "lambda" {
            if !LOGIC_LABELS.iter().any(|(n, k, v)| n == name && k == kind && v == value) {
                panic!("Dynamic callbacks require a system_parser");
            }
        } else if !LOGIC_LABELS.iter().any(|(n, k, v)| n == name && k == kind && v == value) {
            overrides.insert((*name).to_string(), (*value).to_string());
        }
    }
    evaluate_statement_with_overrides(statement, "", &overrides)
}

pub fn evaluate_logic() -> ${retType} {
    evaluate_logic_from_input("")
}

/// Parses CLI flags exposing every named literal variable (--<name> <literal>),
/// editable strings (--input / --statement / --grammar), or default values.
pub fn parse_cli_args(args: &[String]) -> (String, String, HashMap<String, String>) {
    let mut raw_input = String::new();
    let mut statement = LOGIC_STATEMENT.to_string();
    let mut overrides: HashMap<String, String> = HashMap::new();
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < args.len() {
        let arg = &args[i];
        if let Some(rest) = arg.strip_prefix("--") {
            let (flag, inline_val) = match rest.split_once('=') {
                Some((k, v)) => (k, Some(v.to_string())),
                None => (rest, None),
            };
            let next_val = || -> Option<String> {
                if let Some(v) = inline_val.clone() {
                    return Some(v);
                }
                if i + 1 < args.len() {
                    return Some(args[i + 1].clone());
                }
                None
            };
            if flag == "input" || flag == "labels" {
                if let Some(v) = next_val() {
                    raw_input = v;
                    if inline_val.is_none() { i += 1; }
                } else { panic!("Missing value for --{}", flag); }
            } else if flag == "statement" {
                if let Some(v) = next_val() {
                    statement = v;
                    if inline_val.is_none() { i += 1; }
                } else { panic!("Missing value for --statement"); }
            } else if flag == "grammar" {
                panic!("Edited grammar is not supported by this Rust export");
            } else {
                let normalized = flag.replace('-', "_");
                if REQUIRED_INPUTS.iter().any(|(n, _, _)| *n == flag || *n == normalized) {
                    if let Some(v) = next_val() {
                        overrides.insert(normalized, v);
                        if inline_val.is_none() { i += 1; }
                    } else { panic!("Missing value for --{}", flag); }
                } else { panic!("Unknown flag: --{}", flag); }
            }
        } else {
            positional.push(arg.clone());
        }
        i += 1;
    }
    let literals = positional.iter().all(|t| t.parse::<f64>().is_ok() || matches!(t.to_lowercase().as_str(), "true" | "false" | "⊤" | "⊥"));
    if positional.len() > 1 && literals {
        raw_input = positional.join(" ");
    } else if positional.len() == 1 {
        let value = positional.remove(0);
        let normalized = value.replace(" =", "=").replace("= ", "=").replace(" :", ":").replace(": ", ":");
        let is_input = normalized.split(|c: char| c.is_whitespace() || c == ',' || c == ';')
            .filter(|t| !t.is_empty())
            .all(|t| t.contains('=') || t.contains(':') || t.parse::<f64>().is_ok() || matches!(t.to_lowercase().as_str(), "true" | "false" | "⊤" | "⊥"));
        if is_input { raw_input = value; } else { statement = value; }
    }
    else if positional.len() == 2 { statement = positional.remove(0); raw_input = positional.remove(0); }
    else if !positional.is_empty() { panic!("Expected input or statement and labels"); }
    (raw_input, statement, overrides)
}

pub const CLI_INPUTS_ENABLED: bool = ${inputMode === 'cli'};

pub fn run_cli() {
    let args: Vec<String> = if CLI_INPUTS_ENABLED { std::env::args().skip(1).collect() } else { Vec::new() };
    if args.iter().any(|a| a == "-h" || a == "--help") {
        println!("Named literal CLI flags:");
        for (name, kind, def) in REQUIRED_INPUTS {
            println!("  --{} <{}>  (default: {})", name, kind, def);
        }
        println!("  --input <STRING>      (default: no overrides)");
        println!("  --labels <STRING>     named assignments");
        println!("  --statement <STRING>  (default: {})", LOGIC_STATEMENT);
        return;
    }
    let (raw_input, statement, overrides) = parse_cli_args(&args);
    let mut vars = parse_inputs_from_string(&raw_input);
    for (k, v) in &overrides {
        vars.insert(k.clone(), v.clone());
    }
    println!("Variables: {:?}", vars);
    println!("Result: {:?}", evaluate_statement_with_overrides(&statement, &raw_input, &overrides));
}

#[allow(dead_code)]
fn main() {
    run_cli();
}
`;
    return { content, filename: 'logic_lambda_calc.rs', mime: 'text/plain' };
  }

  if (target === 'typescript' || target === 'javascript') {
    const isTs = target === 'typescript';
    const labelTuples = usedInputLabels.map(
      (l) => `  [${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}],`
    );
    const grammarRuleMap = Object.fromEntries(inputGrammar.rules.map((r) => [r.name, r.expression]));
    const cauchyBlock =
      cauchy?.enabled && cauchyEval
        ? `
export const CAUCHY_CONFIG = ${JSON.stringify(
            {
              paramStyle: cauchy.paramStyle,
              params: cauchyEval.resolvedParamNames,
              seeds: cauchy.seedValues,
              recurrence: cauchy.recurrenceExpr,
              maxIterations: cauchy.maxIterations,
              epsilon: cauchy.epsilon,
              converged: cauchyEval.converged,
              cauchyIndexN: cauchyEval.cauchyIndexN,
              limitEstimate: cauchyEval.limitEstimate,
            },
            null,
            2
          )};
`
        : '';
    const content = `// Auto-generated ${isTs ? 'TypeScript' : 'JavaScript (ESM)'} Logic, Lambda & Grammar Input Module
// Accepts named bindings or positional literals in REQUIRED_INPUTS order.
export const CLI_INPUTS_ENABLED = ${inputMode === 'cli'};
export const LOGIC_STATEMENT = ${JSON.stringify(cleanStmt)};

export const LOGIC_LABELS${isTs ? ': Array<[string, "number" | "boolean" | "lambda", string]>' : ''} = [
${labelTuples.join('\n')}
];

export const ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)};

export const GRAMMAR_RULES${isTs ? ': Record<string, string>' : ''} = ${JSON.stringify(grammarRuleMap, null, 2)};

export const REQUIRED_INPUTS${isTs ? ': Array<{ name: string; kind: "number" | "boolean"; defaultValue: string }>' : ''} = ${JSON.stringify(inputGrammar.requiredInputs, null, 2)};

const DEFAULT_INPUT_NAMES = new Set(${JSON.stringify(labels.filter((l) => l.kind !== 'lambda').map((l) => l.name.trim()))});
export const SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)};
${cauchyBlock}
export function parseInputsFromString(rawInput${isTs ? ': string' : ''}, includeDefaults = true)${isTs ? ': Record<string, number | boolean | string>' : ''} {
  const text = String(rawInput ?? '').trim();
  const parsed${isTs ? ': Record<string, number | boolean | string>' : ''} = {};
  for (const inp of REQUIRED_INPUTS) {
    if (includeDefaults && DEFAULT_INPUT_NAMES.has(inp.name)) {
      try {
        Object.defineProperty(parsed, inp.name, { value: coerceCliLiteral(inp.defaultValue, inp.kind), enumerable: true, writable: true, configurable: true });
      } catch { /* expression-valued label */ }
    }
  }
  if (!text) return parsed;
  let entries${isTs ? ': Array<[string, unknown]>' : ''};
  if (text.startsWith('{') || text.startsWith('[')) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      if (data.length > REQUIRED_INPUTS.length) throw new Error('Too many positional inputs');
      entries = data.map((value, i) => [REQUIRED_INPUTS[i].name, value]);
    } else if (data && typeof data === 'object') {
      entries = Object.entries(data);
    } else throw new Error('Expected named inputs or a positional array');
  } else {
    entries = [];
    const re = /([A-Za-z_][A-Za-z0-9_]*)\\s*[:=]\\s*([^\\s,;]+)/gy;
    let remaining = text;
    while (remaining) {
      remaining = remaining.replace(/^[\\s,;]+/, '');
      if (!remaining) break;
      re.lastIndex = 0;
      const m = re.exec(remaining);
      if (!m) throw new Error(\`Invalid input bindings near: \${remaining}\`);
      entries.push([m[1], m[2]]);
      remaining = remaining.slice(m[0].length);
    }
  }
  for (const [name, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(\`Invalid input name: \${name}\`);
    const spec = REQUIRED_INPUTS.find((inp) => inp.name === name);
    const raw = String(value);
    const kind = spec?.kind ?? (/^(true|false|⊤|⊥)$/i.test(raw) ? 'boolean' : 'number');
    Object.defineProperty(parsed, name, { value: coerceCliLiteral(raw, kind), enumerable: true, writable: true, configurable: true });
  }
  return parsed;
}

export function parseGrammarString(grammarText${isTs ? ': string' : ''})${isTs ? ': Record<string, string>' : ''} {
  const rules${isTs ? ': Record<string, string>' : ''} = { ...GRAMMAR_RULES };
  for (const line of String(grammarText ?? '').split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const m = trimmed.match(/^<?([A-Za-z_][A-Za-z0-9_-]*)>?\\s*(?:::=|:=|<-|->|=|:)\\s*(.+)$/);
    if (m) rules[m[1].trim()] = m[2].trim();
  }
  return rules;
}

function coerceCliLiteral(raw${isTs ? ': string' : ''}, kind${isTs ? ': "number" | "boolean"' : ''})${isTs ? ': number | boolean' : ''} {
  const t = String(raw).trim();
  if (kind === 'boolean') {
    if (/^(true|1|yes|t|⊤)$/i.test(t)) return true;
    if (/^(false|0|no|f|⊥)$/i.test(t)) return false;
    throw new Error(\`Invalid boolean literal: \${raw}\`);
  }
  const n = Number(t);
  if (!t || !Number.isFinite(n)) throw new Error(\`Invalid numeric literal: \${raw}\`);
  return n;
}

// Parse only the logic/lambda language; never compile user text as JavaScript.
function parseDsl(source${isTs ? ': string' : ''}) {
  const tokens${isTs ? ': Array<{ type: string; value: string }>' : ''} = [];
  const keywords${isTs ? ': Record<string, string>' : ''} = {
    lambda: 'λ', forall: '∀', exists: '∃', not: '¬', and: '∧',
    or: '∨', xor: '⊕', implies: '→', iff: '↔', equiv: '≡',
    true: '⊤', false: '⊥',
  };
  const aliases${isTs ? ': Record<string, string>' : ''} = {
    '<->': '↔', '<=>': '↔', '->': '→', '=>': '→', '&&': '∧', '||': '∨',
    '!=': '≠', '<>': '≠', '<=': '≤', '>=': '≥', '==': '=', '**': '^',
    '!': '¬', '~': '¬', '&': '∧', '|': '∨', '−': '-', '×': '*', '·': '*', '÷': '/',
  };
  const backslash = String.fromCharCode(92);
  aliases['/' + backslash] = '∧';
  aliases[backslash + '/'] = '∨';
  aliases[backslash] = 'λ';
  let rest = source;
  while (rest.length) {
    const whitespace = rest.match(/^\\s+/);
    if (whitespace) { rest = rest.slice(whitespace[0].length); continue; }
    const number = rest.match(/^\\d+(?:\\.\\d+)?/);
    if (number) {
      tokens.push({ type: 'number', value: number[0] });
      rest = rest.slice(number[0].length);
      continue;
    }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (word) {
      const lower = word[0].toLowerCase();
      const value = Object.hasOwn(keywords, lower) ? keywords[lower] : undefined;
      tokens.push({ type: value || 'identifier', value: value || word[0] });
      rest = rest.slice(word[0].length);
      continue;
    }
    const alias = Object.keys(aliases).find((key) => rest.startsWith(key));
    if (alias) { tokens.push({ type: aliases[alias], value: aliases[alias] }); rest = rest.slice(alias.length); continue; }
    const ch = rest[0];
    if ('λ∀∃⊤⊥¬∧∨⊕→↔≡=≠<≤>≥+-*/%^(),.'.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      rest = rest.slice(1);
      continue;
    }
    throw new Error(\`Unexpected symbol "\${ch}" in logic expression\`);
  }
  tokens.push({ type: 'EOF', value: '' });
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (type${isTs ? '?: string' : ''}) => {
    const token = peek();
    if (type && token.type !== type) throw new Error(\`Expected \${type}, found "\${token.value || 'end of input'}"\`);
    pos++;
    return token;
  };
  const precedence${isTs ? ': Record<string, number>' : ''} = {
    '↔': 1, '≡': 1, '→': 2, '∨': 3, '⊕': 4, '∧': 5,
    '=': 6, '≠': 6, '<': 6, '≤': 6, '>': 6, '≥': 6,
    '+': 7, '-': 7, '*': 8, '/': 8, '%': 8, '^': 9,
  };
  function expression()${isTs ? ': any' : ''} {
    const type = peek().type;
    if (type === 'λ' || type === '∀' || type === '∃') {
      take();
      const names${isTs ? ': string[]' : ''} = [];
      while (peek().type === 'identifier') {
        names.push(take().value);
        if (peek().type === ',') take();
      }
      if (!names.length) throw new Error(\`Expected parameter after \${type}\`);
      if (type === 'λ') {
        if (peek().type !== '.' && peek().type !== '→') throw new Error('Expected "." after lambda parameters');
        take();
      } else if (peek().type === '.') take();
      let body = expression();
      for (let i = names.length - 1; i >= 0; i--) body = { type, name: names[i], body };
      return body;
    }
    return binary(1);
  }
  function binary(min${isTs ? ': number' : ''})${isTs ? ': any' : ''} {
    let left = unary();
    while ((precedence[peek().type] || 0) >= min) {
      const op = take().type;
      const p = precedence[op];
      const right = binary(p + (op === '^' || op === '→' ? 0 : 1));
      left = { type: 'binary', op, left, right };
    }
    return left;
  }
  function unary()${isTs ? ': any' : ''} {
    if (peek().type === '¬' || peek().type === '-') {
      const op = take().type;
      return { type: 'unary', op, operand: unary() };
    }
    let node${isTs ? ': any' : ''};
    const token = take();
    if (token.type === 'number') node = { type: 'literal', value: Number(token.value) };
    else if (token.type === '⊤' || token.type === '⊥') node = { type: 'literal', value: token.type === '⊤' };
    else if (token.type === 'identifier') node = { type: 'identifier', name: token.value };
    else if (token.type === '(') { node = expression(); take(')'); }
    else throw new Error(\`Unexpected token "\${token.value || 'EOF'}"\`);
    while (peek().type === '(') {
      take();
      if (peek().type !== ')') {
        node = { type: 'call', callee: node, arg: expression() };
        while (peek().type === ',') {
          take();
          node = { type: 'call', callee: node, arg: expression() };
        }
      }
      take(')');
    }
    return node;
  }
  const ast = expression();
  if (peek().type !== 'EOF') throw new Error(\`Unexpected trailing token "\${peek().value}"\`);
  return ast;
}

function evalDsl(node${isTs ? ': any' : ''}, env${isTs ? ': Map<string, any>' : ''}, depth = 0)${isTs ? ': any' : ''} {
  if (depth > 48) throw new Error('Maximum lambda recursion depth (48) exceeded.');
  const evaluate = (child${isTs ? ': any' : ''}, scope = env) => evalDsl(child, scope, depth + 1);
  const bool = (value${isTs ? ': any' : ''}) => typeof value === 'object' ? true : Boolean(value);
  const num = (value${isTs ? ': any' : ''}) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    throw new Error('Expected numeric operand, received lambda closure.');
  };
  if (node.type === 'literal') return node.value;
  if (node.type === 'identifier') {
    if (!env.has(node.name)) throw new Error(\`Unbound label "\${node.name}". Provide a definition.\`);
    return env.get(node.name);
  }
  if (node.type === 'λ') return { kind: 'closure', name: node.name, body: node.body, env: new Map(env) };
  if (node.type === '∀' || node.type === '∃') {
    const t = new Map(env), f = new Map(env);
    t.set(node.name, true); f.set(node.name, false);
    const left = bool(evaluate(node.body, t)), right = bool(evaluate(node.body, f));
    return node.type === '∀' ? left && right : left || right;
  }
  if (node.type === 'call') {
    const fn = evaluate(node.callee);
    if (!fn || fn.kind !== 'closure') throw new Error('Cannot invoke a non-lambda value as a callback.');
    const arg = evaluate(node.arg);
    const scope${isTs ? ': Map<string, any>' : ''} = new Map(fn.env);
    scope.set(fn.name, arg);
    return evaluate(fn.body, scope);
  }
  if (node.type === 'unary') {
    const value = evaluate(node.operand);
    return node.op === '¬' ? !bool(value) : -num(value);
  }
  const left = evaluate(node.left), right = evaluate(node.right);
  switch (node.op) {
    case '∧': return bool(left) && bool(right);
    case '∨': return bool(left) || bool(right);
    case '⊕': return bool(left) !== bool(right);
    case '→': return !bool(left) || bool(right);
    case '↔': case '≡': return bool(left) === bool(right);
    case '=': return typeof left === 'boolean' && typeof right === 'boolean' ? left === right : num(left) === num(right);
    case '≠': return typeof left === 'boolean' && typeof right === 'boolean' ? left !== right : num(left) !== num(right);
    case '<': return num(left) < num(right);
    case '≤': return num(left) <= num(right);
    case '>': return num(left) > num(right);
    case '≥': return num(left) >= num(right);
    case '+': return num(left) + num(right);
    case '-': return num(left) - num(right);
    case '*': return num(left) * num(right);
    case '/': if (num(right) === 0) throw new Error('Division by zero.'); return num(left) / num(right);
    case '%': if (num(right) === 0) throw new Error('Modulo by zero.'); return num(left) % num(right);
    case '^': return Math.pow(num(left), num(right));
    default: throw new Error('Invalid logic operator');
  }
}

function evaluateWithLabels(statement${isTs ? ': string' : ''}, labels${isTs ? ': Array<[string, string, string]>' : ''}) {
  const ast = parseDsl(statement);
  const env${isTs ? ': Map<string, any>' : ''} = new Map();
  for (const [name, kind, val] of labels) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(\`Invalid label name: \${name}\`);
    if (!['number', 'boolean', 'lambda'].includes(kind)) throw new Error(\`Invalid label kind: \${kind}\`);
    let value${isTs ? ': any' : ''};
    if (kind === 'number' && val.trim() && Number.isFinite(Number(val))) value = Number(val);
    else if (kind === 'boolean' && /^(true|false|1|0|⊤|⊥)$/i.test(val.trim())) value = coerceCliLiteral(val, 'boolean');
    else value = evalDsl(parseDsl(val), env);
    if (kind === 'number') {
      if (typeof value === 'boolean') value = value ? 1 : 0;
      if (typeof value !== 'number') throw new Error(\`Invalid numeric label: \${name}\`);
    } else if (kind === 'boolean') value = typeof value === 'object' ? false : Boolean(value);
    env.set(name, value);
  }
  return evalDsl(ast, env);
}

function mergeInputs(labels${isTs ? ': Array<[string, string, string]>' : ''}, inputs${isTs ? ': Record<string, number | boolean | string>' : ''}) {
  for (const [name, kind] of labels) {
    if (kind === 'lambda' && Object.hasOwn(inputs, name)) throw new Error(\`Cannot replace lambda \${name} with a literal input\`);
  }
  const merged = labels.map(([name, kind, value]) => [
    name, kind, kind !== 'lambda' && Object.hasOwn(inputs, name) ? String(inputs[name]) : value,
  ]${isTs ? ' as [string, string, string]' : ''});
  for (const [name, value] of Object.entries(inputs)) {
    if (!merged.some(([existing]) => existing === name)) {
      merged.unshift([name, typeof value === 'boolean' ? 'boolean' : 'number', String(value)]);
    }
  }
  return merged;
}

export function evaluateFromInput(
  rawInput${isTs ? ': string' : ''} = '',
  statement${isTs ? ': string' : ''} = LOGIC_STATEMENT,
  systemParser${isTs ? '?: (stmt: string, lbls: Array<[string, string, string]>) => unknown' : ''},
  overrides${isTs ? '?: Record<string, number | boolean | string>' : ''},
  labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS
) {
  const inputs = { ...parseInputsFromString(rawInput, false), ...(overrides ?? {}) };
  const mergedLabels = mergeInputs(labels, inputs);
  if (typeof systemParser === 'function') return systemParser(statement, mergedLabels);
  const result = evaluateWithLabels(statement, mergedLabels);
  return { statement, parsedInputs: inputs, labels: mergedLabels, result };
}

export function evaluateLogic(
  statement${isTs ? ': string' : ''} = LOGIC_STATEMENT,
  labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS,
  systemParser${isTs ? '?: (stmt: string, lbls: Array<[string, string, string]>) => unknown' : ''}
) {
  if (typeof systemParser === 'function') {
    return systemParser(statement, labels);
  }
  return evaluateWithLabels(statement, labels);
}

${cauchy?.enabled ? `
export function evaluateCauchySequence(labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS) {
  const seeds = CAUCHY_CONFIG.seeds.split(',').map((s) => s.trim()).filter(Boolean);
  if (!seeds.length) throw new Error('Provide at least one Cauchy seed');
  const terms${isTs ? ': number[]' : ''} = seeds.map((seed) => {
    const value = evaluateWithLabels(seed, labels);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(\`Invalid Cauchy seed: \${seed}\`);
    return value;
  });
  const arity = terms.length;
  const directional = arity === 1 ? ['right'] : arity === 2 ? ['left', 'right'] :
    arity === 3 ? ['left', 'mid', 'right'] : ['left', ...Array.from({ length: arity - 2 }, (_, i) => \`mid_\${i + 1}\`), 'right'];
  const zeroIndexed = /\\b_0\\b/.test(CAUCHY_CONFIG.recurrence);
  const maxIterations = Math.max(1, Math.min(120, Math.floor(CAUCHY_CONFIG.maxIterations || 24)));
  const epsilon = Number.isFinite(CAUCHY_CONFIG.epsilon) && CAUCHY_CONFIG.epsilon > 0 ? CAUCHY_CONFIG.epsilon : 0.0001;
  for (let i = 0; i < maxIterations; i++) {
    const window = terms.slice(-arity);
    const bindings${isTs ? ': Record<string, number>' : ''} = { n: terms.length, prev: window[arity - 1], left: window[0], right: window[arity - 1] };
    directional.forEach((name, j) => { bindings[name] = window[j]; });
    window.forEach((value, j) => { bindings[\`_\${j + (zeroIndexed ? 0 : 1)}\`] = value; });
    CAUCHY_CONFIG.params.forEach((name, j) => { bindings[name] = window[j]; });
    const base = labels.filter(([name]) => !Object.hasOwn(bindings, name));
    const stepLabels${isTs ? ': Array<[string, string, string]>' : ''} = [...base, ...Object.entries(bindings).map(([name, value]) => [name, 'number', String(value)]${isTs ? ' as [string, string, string]' : ''})];
    const value = evaluateWithLabels(CAUCHY_CONFIG.recurrence, stepLabels);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(\`Invalid Cauchy recurrence at n=\${terms.length}\`);
    terms.push(value);
  }
  const cauchyIndexN = terms.findIndex((_v, i) => i < terms.length - 1 &&
    Math.max(...terms.slice(i)) - Math.min(...terms.slice(i)) < epsilon);
  return { terms, converged: cauchyIndexN >= 0, cauchyIndexN: cauchyIndexN < 0 ? null : cauchyIndexN, limitEstimate: terms[terms.length - 1] };
}
` : ''}

function parseLabels(value${isTs ? ': unknown' : ''})${isTs ? ': Array<[string, string, string]>' : ''} {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('{') || text.startsWith('[')) return parseLabels(JSON.parse(text));
    return Object.entries(parseInputsFromString(text, false)).map(([name, val]) =>
      [name, typeof val === 'boolean' ? 'boolean' : 'number', String(val)]);
  }
  if (Array.isArray(value)) return value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every((part) => typeof part === 'string')) throw new Error('Labels must be [name, kind, value] tuples');
    return [entry[0], entry[1], entry[2]]${isTs ? ' as [string, string, string]' : ''};
  });
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, val]) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const definition = val${isTs ? ' as Record<string, unknown>' : ''};
        if (typeof definition.kind !== 'string' || typeof definition.value !== 'string' ||
            !['number', 'boolean', 'lambda'].includes(definition.kind)) throw new Error(\`Invalid definition for label \${name}\`);
        return [name, definition.kind, definition.value]${isTs ? ' as [string, string, string]' : ''};
      }
      const inputs = parseInputsFromString(JSON.stringify({ [name]: val }), false);
      return [name, typeof inputs[name] === 'boolean' ? 'boolean' : 'number', String(inputs[name])]${isTs ? ' as [string, string, string]' : ''};
    });
  }
  throw new Error('Invalid logic_labels');
}

/**
 * Exposes every named literal variable to the CLI (--<var> <literal> or --<var>=<literal>),
 * supports editing strings (--input, --statement, --grammar), or uses built-in defaults.
 */
export function parseCliArgs(argv${isTs ? ': string[]' : ''} = []) {
  let rawInput = '';
  let statement = LOGIC_STATEMENT;
  let grammarText = ACTIVE_GRAMMAR;
  const overrides${isTs ? ': Record<string, number | boolean>' : ''} = {};
  let labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS.map((label) => [...label]${isTs ? ' as [string, string, string]' : ''});
  const positional${isTs ? ': string[]' : ''} = [];
  let explicitStatement = false;
  const setLabels = (value${isTs ? ': unknown' : ''}) => {
    for (const label of parseLabels(value)) {
      const index = labels.findIndex(([name]) => name === label[0]);
      if (index >= 0) labels[index] = label;
      else if (label[1] !== 'lambda' && /^(?:-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?|true|false|⊤|⊥)$/i.test(label[2].trim())) labels.unshift(label);
      else labels.push(label);
    }
  };
  const consumeObject = (value${isTs ? ': Record<string, unknown>' : ''}) => {
    const { logic_statement, logic_labels, ...bindings } = value;
    if (logic_statement !== undefined) {
      if (typeof logic_statement !== 'string') throw new Error('logic_statement must be a string');
      statement = logic_statement;
      explicitStatement = true;
    }
    if (logic_labels !== undefined) setLabels(logic_labels);
    if (Object.keys(bindings).length) rawInput = JSON.stringify(bindings);
  };
  const varMap = new Map(REQUIRED_INPUTS.map((v) => [v.name, v]));

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true, rawInput, statement, grammarText, overrides, labels };
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eqIdx = body.indexOf('=');
      const flag = eqIdx >= 0 ? body.slice(0, eqIdx) : body;
      const val = eqIdx >= 0 ? body.slice(eqIdx + 1) : argv[++i];
      if (val === undefined || (eqIdx < 0 && val.startsWith('--'))) throw new Error(\`Missing value for --\${flag}\`);
      if (flag === 'input') rawInput = val;
      else if (flag === 'statement' || flag === 'logic_statement') { statement = val; explicitStatement = true; }
      else if (flag === 'labels' || flag === 'logic_labels') setLabels(val);
      else if (flag === 'grammar' && val !== undefined) grammarText = val;
      else {
        const spec = varMap.get(flag) ?? varMap.get(flag.replace(/-/g, '_'));
        if (!spec) throw new Error(\`Unknown option: --\${flag}\`);
        overrides[spec.name] = coerceCliLiteral(val, spec.kind);
      }
    } else positional.push(arg);
  }
  if (positional.length === 1 && positional[0].trim().startsWith('{')) {
    const value = JSON.parse(positional[0]);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Expected a JSON object');
    consumeObject(value);
  } else if (positional.length === 1 && positional[0].trim().startsWith('[')) {
    rawInput = positional[0];
  } else if (positional.length && positional.every((arg) => /^(?:-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?|true|false|⊤|⊥)$/i.test(arg))) {
    rawInput = JSON.stringify(positional);
  } else if (positional.length === 2) {
    if (explicitStatement) throw new Error('Statement specified twice');
    statement = positional[0];
    setLabels(positional[1]);
  } else if (positional.length === 1) {
    const text = positional[0].trim();
    const match = text.match(/(?:^|[\\s;])([A-Za-z_][A-Za-z0-9_]*\\s*[:=]\\s*(?![=])[^\\s,;]+(?:[\\s,;]+[A-Za-z_][A-Za-z0-9_]*\\s*[:=]\\s*(?![=])[^\\s,;]+)*)\\s*$/);
    if (match) {
      rawInput = match[1];
      const prefix = text.slice(0, match.index).trim().replace(/[;,]$/, '').trim();
      if (prefix) {
        if (explicitStatement) throw new Error('Statement specified twice');
        statement = prefix;
      }
    } else {
      if (explicitStatement) throw new Error('Statement specified twice');
      statement = text;
    }
  } else if (positional.length) {
    throw new Error('Expected a statement and optional labels, or positional literals');
  }
  if (rawInput.trim().startsWith('{')) {
    const value = JSON.parse(rawInput);
    if (value && typeof value === 'object' && !Array.isArray(value) && ('logic_statement' in value || 'logic_labels' in value)) {
      rawInput = '';
      consumeObject(value);
    }
  }
  return { help: false, rawInput, statement, grammarText, overrides, labels };
}

export function runCli(argv${isTs ? ': string[]' : ''} = typeof process !== 'undefined' ? process.argv.slice(2) : []) {
  const parsed = parseCliArgs(CLI_INPUTS_ENABLED ? argv : []);
  if (parsed.help) {
    console.log('Named literal CLI options:');
    for (const inp of REQUIRED_INPUTS) {
      console.log(\`  --\${inp.name} <\${inp.kind}>  (default: \${inp.defaultValue})\`);
    }
    console.log(\`  --input <string>      (example: \${SAMPLE_SINGLE_INPUT})\`);
    console.log(\`  --statement <string>  (default: \${LOGIC_STATEMENT})\`);
    console.log('  --labels <bindings>   (e.g. x=2 or JSON label tuples)');
    console.log('  Positional: statement [labels], named bindings, or a JSON literal array');
    return null;
  }
  if (parsed.grammarText !== ACTIVE_GRAMMAR) throw new Error('Custom grammar is not supported by this export');
  const out = evaluateFromInput(parsed.rawInput, parsed.statement, undefined, parsed.overrides, parsed.labels)${isTs ? ' as { parsedInputs: Record<string, number | boolean | string>; result: unknown; labels: Array<[string, string, string]> }' : ''};
  console.log('Variables:', out.parsedInputs);
  console.log('Result:', out.result);
  ${cauchy?.enabled ? "console.log('Cauchy:', evaluateCauchySequence(out.labels));" : ''}
  return out;
}

if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url.endsWith(process.argv[1].replace(/\\\\/g, '/'))) {
  runCli(process.argv.slice(2));
}
`;
    return {
      content,
      filename: isTs ? 'logic_lambda_calc.ts' : 'logic_lambda_calc.mjs',
      mime: isTs ? 'text/typescript' : 'text/javascript',
    };
  }

  if (target === 'go') {
    const entries = allLabels.map(
      (l) => `\t{Name: ${JSON.stringify(l.name)}, Kind: ${JSON.stringify(l.kind)}, Value: ${JSON.stringify(l.value)}},`
    );
    const ruleEntries = inputGrammar.rules.map(
      (r) => `\t${JSON.stringify(r.name)}: ${JSON.stringify(r.expression)},`
    );
    const content = `// Auto-generated Go Logic & Lambda Module with Grammar Single-String Input Parser
package logiccalc

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

type LogicLabel struct {
	Name  string
	Kind  string
	Value string
}

const CliInputsEnabled = ${inputMode === 'cli'}
const LogicStatement = ${JSON.stringify(translation.translatedStatement)}
const ActiveGrammar = ${JSON.stringify(inputGrammar.grammarText)}
const SampleSingleInput = ${JSON.stringify(inputGrammar.sampleSingleInput)}

var GrammarRules = map[string]string{
${ruleEntries.join('\n')}
}

var LogicLabels = []LogicLabel{
${entries.join('\n')}
}

func ParseInputsFromString(rawInput string) map[string]string {
	parsed := make(map[string]string)
	kinds := make(map[string]string)
	assigned := make(map[string]bool)
	var positional []string
	for _, lbl := range LogicLabels {
		if lbl.Kind == "lambda" { continue }
		kinds[lbl.Name] = lbl.Kind
		parsed[lbl.Name] = lbl.Value
	}
	for _, tok := range strings.FieldsFunc(rawInput, func(r rune) bool { return r == ' ' || r == ',' || r == ';' || r == '\\t' }) {
		if idx := strings.IndexAny(tok, "=:"); idx > 0 {
			name, value := tok[:idx], tok[idx+1:]
			if _, ok := kinds[name]; !ok { panic(fmt.Sprintf("unknown input name %q", name)) }
			parsed[name] = value
			assigned[name] = true
		} else { positional = append(positional, tok) }
	}
	required := make([]string, 0)
	for _, lbl := range LogicLabels {
		if lbl.Kind == "number" || lbl.Kind == "boolean" { required = append(required, lbl.Name) }
	}
	next := 0
	for _, tok := range positional {
		for next < len(required) && assigned[required[next]] { next++ }
		if next == len(required) { panic("too many positional inputs") }
		parsed[required[next]] = tok
		assigned[required[next]] = true
		next++
	}
	for _, lbl := range LogicLabels {
		if lbl.Kind == "lambda" { continue }
		if !assigned[lbl.Name] { continue }
		value := strings.TrimSpace(parsed[lbl.Name])
		if lbl.Kind == "number" {
			n, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(n) || math.IsInf(n, 0) { panic(fmt.Sprintf("invalid numeric literal for %s: %q", lbl.Name, value)) }
		} else if lbl.Kind == "boolean" {
			switch strings.ToLower(value) {
			case "true", "1", "⊤": parsed[lbl.Name] = "true"
			case "false", "0", "⊥": parsed[lbl.Name] = "false"
			default: panic(fmt.Sprintf("invalid boolean literal for %s: %q", lbl.Name, value))
			}
		}
	}
	return parsed
}

func EvaluateFromInput(rawInput string, systemParser func(string, []LogicLabel) any) any {
	return EvaluateFromInputStatement(rawInput, LogicStatement, systemParser)
}

func EvaluateFromInputStatement(rawInput string, statement string, systemParser func(string, []LogicLabel) any) any {
	if systemParser == nil && (rawInput == "" || rawInput == SampleSingleInput) && statement == LogicStatement {
		${evalRes.ok ? `return ${JSON.stringify(evalRes.displayValue)}` : ''}
	}
	extracted := ParseInputsFromString(rawInput)
	merged := make([]LogicLabel, len(LogicLabels))
	for i, lbl := range LogicLabels {
		if lbl.Kind != "lambda" {
			if v, ok := extracted[lbl.Name]; ok {
				lbl.Value = v
			}
		}
		merged[i] = lbl
	}
	return EvaluateLogic(statement, merged, systemParser)
}

func labelsMatchDefaults(labels []LogicLabel) bool {
	if len(labels) != len(LogicLabels) { return false }
	for i := range labels {
		if labels[i] != LogicLabels[i] { return false }
	}
	return true
}

func EvaluateLogic(statement string, labels []LogicLabel, systemParser func(string, []LogicLabel) any) any {
	if systemParser != nil {
		return systemParser(statement, labels)
	}
	if statement != LogicStatement {
		panic(fmt.Sprintf("Dynamic statement override requires systemParser: %q", statement))
	}
${evalRes.ok && loweredPlan ? `	vals := make(map[string]string, len(labels))
	for _, l := range labels {
		if l.Kind != "lambda" {
			vals[l.Name] = l.Value
		}
	}
${loweredPlan.usedVars.map((v) =>
  (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
    ? `\tv_${v} := strings.EqualFold(strings.TrimSpace(vals[${JSON.stringify(v)}]), "true") || strings.TrimSpace(vals[${JSON.stringify(v)}]) == "1"`
    : `\tv_${v}, err_${v} := strconv.ParseFloat(strings.TrimSpace(vals[${JSON.stringify(v)}]), 64)\n\tif err_${v} != nil { panic(fmt.Sprintf("invalid numeric input %s: %v", ${JSON.stringify(v)}, err_${v})) }`
).join('\n')}
	return ${emitCompiledTargetExpr(loweredPlan.ast, 'go')}` : `	panic("Logic expression failed to compile")`}
}

// ParseCliArgs exposes every named literal variable (--<name> <literal>), editable strings (--input/--statement), or built-in defaults.
func ParseCliArgs(args []string) (rawInput string, statement string, overrides map[string]string) {
    if !CliInputsEnabled { args = nil }
	rawInput = ""
	statement = LogicStatement
	overrides = make(map[string]string)
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "--") {
			rest := strings.TrimPrefix(arg, "--")
			key, val, hasEq := strings.Cut(rest, "=")
			if !hasEq && i+1 < len(args) {
				i++
				val = args[i]
			}
			switch key {
			case "input":
				rawInput = val
			case "statement":
				statement = val
			default:
				overrides[strings.ReplaceAll(key, "-", "_")] = val
			}
		} else if !strings.HasPrefix(arg, "-") {
			if rawInput != "" { rawInput += " " }
			rawInput += arg
		}
	}
	if rawInput == "" { rawInput = SampleSingleInput }
	return rawInput, statement, overrides
}
`;
    return { content, filename: 'logic_lambda_calc.go', mime: 'text/plain' };
  }

  if (target === 'java') {
    const entries = allLabels.map(
      (l) => `        new LogicLabel(${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)})`
    );
    const ruleEntries = inputGrammar.rules.map(
      (r) => `        Map.entry(${JSON.stringify(r.name)}, ${JSON.stringify(r.expression)})`
    );
    const content = `// Auto-generated Java Logic & Lambda Module with Grammar Single-String Input Parser
import java.util.*;
import java.util.function.BiFunction;

public final class LogicLambdaCalc {
    public record LogicLabel(String name, String kind, String value) {}

    public static final boolean CLI_INPUTS_ENABLED = ${inputMode === 'cli'};
    public static final String LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
    public static final String ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)};
    public static final String SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)};
    public static final Map<String, String> GRAMMAR_RULES = Map.ofEntries(
${ruleEntries.join(',\n')}
    );
    public static final List<LogicLabel> LOGIC_LABELS = List.of(
${entries.join(',\n')}
    );

    public static Map<String, String> parseInputsFromString(String rawInput) {
        Map<String, String> parsed = new LinkedHashMap<>();
        Map<String, String> kinds = new LinkedHashMap<>();
        Set<String> assigned = new HashSet<>();
        List<String> positional = new ArrayList<>();
        for (LogicLabel lbl : LOGIC_LABELS) if (!lbl.kind().equals("lambda")) {
            parsed.put(lbl.name(), lbl.value());
            kinds.put(lbl.name(), lbl.kind());
        }
        for (String tok : (rawInput == null ? "" : rawInput.trim()).split("[\\\\s,;]+")) {
            if (tok.isEmpty()) continue;
            int sep = tok.indexOf('=') >= 0 ? tok.indexOf('=') : tok.indexOf(':');
            if (sep > 0) {
                String name = tok.substring(0, sep);
                if (!kinds.containsKey(name)) throw new IllegalArgumentException("Unknown input name: " + name);
                parsed.put(name, tok.substring(sep + 1));
                assigned.add(name);
            } else positional.add(tok);
        }
        List<String> required = LOGIC_LABELS.stream().filter(l -> !l.kind().equals("lambda")).map(LogicLabel::name).toList();
        int next = 0;
        for (String value : positional) {
            while (next < required.size() && assigned.contains(required.get(next))) next++;
            if (next == required.size()) throw new IllegalArgumentException("Too many positional inputs");
            parsed.put(required.get(next), value);
            assigned.add(required.get(next++));
        }
        for (LogicLabel lbl : LOGIC_LABELS) {
            if (lbl.kind().equals("lambda") || !assigned.contains(lbl.name())) continue;
            String value = parsed.get(lbl.name()).trim();
            if (lbl.kind().equals("number")) {
                double n;
                try { n = Double.parseDouble(value); } catch (NumberFormatException ex) { throw new IllegalArgumentException("Invalid numeric literal for " + lbl.name() + ": " + value); }
                if (!Double.isFinite(n)) throw new IllegalArgumentException("Invalid numeric literal for " + lbl.name() + ": " + value);
            } else if (lbl.kind().equals("boolean")) {
                if (value.equalsIgnoreCase("true") || value.equals("1") || value.equals("⊤")) parsed.put(lbl.name(), "true");
                else if (value.equalsIgnoreCase("false") || value.equals("0") || value.equals("⊥")) parsed.put(lbl.name(), "false");
                else throw new IllegalArgumentException("Invalid boolean literal for " + lbl.name() + ": " + value);
            }
        }
        return parsed;
    }

    public static Object evaluateFromInput(String rawInput, BiFunction<String, List<LogicLabel>, Object> systemParser) {
        return evaluateFromInput(rawInput, LOGIC_STATEMENT, systemParser);
    }

    public static Object evaluateFromInput(String rawInput, String statement, BiFunction<String, List<LogicLabel>, Object> systemParser) {
        if (systemParser == null && (rawInput == null || rawInput.isEmpty() || SAMPLE_SINGLE_INPUT.equals(rawInput)) && statement.equals(LOGIC_STATEMENT)) {
            ${evalRes.ok ? `return ${JSON.stringify(evalRes.displayValue)};` : ''}
        }
        Map<String, String> inputs = parseInputsFromString(rawInput);
        List<LogicLabel> merged = LOGIC_LABELS.stream()
            .map(l -> !l.kind().equals("lambda") && inputs.containsKey(l.name())
                ? new LogicLabel(l.name(), l.kind(), inputs.get(l.name())) : l)
            .toList();
        return evaluateLogic(statement, merged, systemParser);
    }

    public static Object evaluateLogic(
        String statement,
        List<LogicLabel> labels,
        BiFunction<String, List<LogicLabel>, Object> systemParser
    ) {
        if (systemParser != null) {
            return systemParser.apply(statement, labels);
        }
        if (!statement.equals(LOGIC_STATEMENT)) {
            throw new UnsupportedOperationException("Dynamic statement override requires systemParser: " + statement);
        }
${evalRes.ok && loweredPlan ? `        Map<String, String> vals = new LinkedHashMap<>();
        for (LogicLabel lbl : labels) {
            if (!"lambda".equals(lbl.kind())) vals.put(lbl.name(), lbl.value());
        }
${loweredPlan.usedVars.map((v) =>
  (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
    ? `        boolean v_${v} = "true".equalsIgnoreCase(vals.getOrDefault(${JSON.stringify(v)}, "false").trim()) || "1".equals(vals.getOrDefault(${JSON.stringify(v)}, "0").trim());`
    : `        double v_${v} = Double.parseDouble(vals.getOrDefault(${JSON.stringify(v)}, "0").trim());`
).join('\n')}
        return ${emitCompiledTargetExpr(loweredPlan.ast, 'java')};` : `        throw new IllegalStateException("Logic expression failed to compile");`}
    }

    /** CLI entry point exposing named literal flags (--<var> <literal>), --input, --statement, or defaults. */
    public static void main(String[] args) {
        if (!CLI_INPUTS_ENABLED) args = new String[0];
        String rawInput = "";
        String statement = LOGIC_STATEMENT;
        Map<String, String> overrides = new LinkedHashMap<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (arg.startsWith("--")) {
                String body = arg.substring(2);
                int eq = body.indexOf('=');
                String key = eq >= 0 ? body.substring(0, eq) : body;
                String val = eq >= 0 ? body.substring(eq + 1) : (i + 1 < args.length ? args[++i] : "");
                if ("input".equals(key)) rawInput = val;
                else if ("statement".equals(key)) statement = val;
                else overrides.put(key.replace('-', '_'), val);
            } else if (!arg.startsWith("-")) {
                rawInput = rawInput.isEmpty() ? arg : rawInput + " " + arg;
            }
        }
        if (rawInput.isEmpty()) rawInput = SAMPLE_SINGLE_INPUT;
        Map<String, String> vars = parseInputsFromString(rawInput);
        vars.putAll(overrides);
        for (Map.Entry<String, String> entry : overrides.entrySet()) {
            rawInput += " " + entry.getKey() + "=" + entry.getValue();
        }
        System.out.println("Variables: " + vars);
        System.out.println("Statement: " + statement);
        System.out.println("Result: " + evaluateFromInput(rawInput, statement, null));
    }
}
`;
    return { content, filename: 'LogicLambdaCalc.java', mime: 'text/plain' };
  }

  if (target === 'cpp') {
    const entries = allLabels.map(
      (l) => `    {${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}},`
    );
    const ruleEntries = inputGrammar.rules.map(
      (r) => `    {${JSON.stringify(r.name)}, ${JSON.stringify(r.expression)}},`
    );
    const content = `// Auto-generated C++20 Logic & Lambda Header with Grammar Single-String Input Parser
#pragma once
#include <functional>
#include <cmath>
#include <algorithm>
#include <cctype>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace logic_calc {

struct LogicLabel {
    std::string name;
    std::string kind;
    std::string value;
};

inline constexpr bool CLI_INPUTS_ENABLED = ${inputMode === 'cli'};
inline const std::string LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
inline const std::string ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)};
inline const std::string SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)};
inline const std::unordered_map<std::string, std::string> GRAMMAR_RULES = {
${ruleEntries.join('\n')}
};
inline const std::vector<LogicLabel> LOGIC_LABELS = {
${entries.join('\n')}
};

inline std::unordered_map<std::string, std::string> parse_inputs_from_string(const std::string& raw_input) {
    std::unordered_map<std::string, std::string> parsed;
    std::unordered_map<std::string, std::string> kinds;
    std::unordered_map<std::string, bool> assigned;
    for (const auto& lbl : LOGIC_LABELS) if (lbl.kind != "lambda") {
        parsed[lbl.name] = lbl.value;
        kinds[lbl.name] = lbl.kind;
    }
    std::string normalized = raw_input;
    for (char& c : normalized) if (c == ',' || c == ';') c = ' ';
    std::istringstream iss(normalized);
    std::string tok;
    std::vector<std::string> positional;
    while (iss >> tok) {
        auto pos = tok.find_first_of("=:");
        if (pos != std::string::npos && pos > 0) {
            auto name = tok.substr(0, pos);
            if (!kinds.count(name)) throw std::invalid_argument("unknown input name: " + name);
            parsed[name] = tok.substr(pos + 1);
            assigned[name] = true;
        } else {
            positional.push_back(tok);
        }
    }
    std::vector<std::string> required;
    for (const auto& lbl : LOGIC_LABELS) if (lbl.kind != "lambda") required.push_back(lbl.name);
    size_t next = 0;
    for (const auto& value : positional) {
        while (next < required.size() && assigned[required[next]]) ++next;
        if (next == required.size()) throw std::invalid_argument("too many positional inputs");
        parsed[required[next]] = value;
        assigned[required[next++]] = true;
    }
    for (const auto& lbl : LOGIC_LABELS) {
        if (lbl.kind == "lambda" || !assigned[lbl.name]) continue;
        auto value = parsed[lbl.name];
        if (lbl.kind == "number") {
            size_t used = 0;
            double n;
            try { n = std::stod(value, &used); } catch (...) { throw std::invalid_argument("invalid numeric literal for " + lbl.name); }
            if (used != value.size() || !std::isfinite(n)) throw std::invalid_argument("invalid numeric literal for " + lbl.name);
        } else if (lbl.kind == "boolean") {
            std::string lower = value;
            std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            if (lower == "true" || value == "1" || value == "⊤") parsed[lbl.name] = "true";
            else if (lower == "false" || value == "0" || value == "⊥") parsed[lbl.name] = "false";
            else throw std::invalid_argument("invalid boolean literal for " + lbl.name);
        }
    }
    return parsed;
}

inline std::string evaluate_logic(
    const std::string& statement = LOGIC_STATEMENT,
    const std::vector<LogicLabel>& labels = LOGIC_LABELS,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    if (system_parser) return system_parser(statement, labels);
    if (statement == LOGIC_STATEMENT && labels.size() == LOGIC_LABELS.size()) {
        bool matches_defaults = true;
        for (size_t i = 0; i < labels.size(); ++i) {
            if (labels[i].name != LOGIC_LABELS[i].name ||
                labels[i].kind != LOGIC_LABELS[i].kind ||
                labels[i].value != LOGIC_LABELS[i].value) {
                matches_defaults = false;
                break;
            }
        }
    if (statement != LOGIC_STATEMENT) {
        throw std::runtime_error("Dynamic statement override requires system_parser: " + statement);
    }
${evalRes.ok && loweredPlan ? `    std::unordered_map<std::string, std::string> vals;
    for (const auto& lbl : labels) {
        if (lbl.kind != "lambda") vals[lbl.name] = lbl.value;
    }
${loweredPlan.usedVars.map((v) =>
  (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
    ? `    bool v_${v} = (vals[${JSON.stringify(v)}] == "true" || vals[${JSON.stringify(v)}] == "1");`
    : `    double v_${v} = std::stod(vals.at(${JSON.stringify(v)}));`
).join('\n')}
    auto result = ${emitCompiledTargetExpr(loweredPlan.ast, 'cpp')};
    return ${loweredPlan.resultType === 'boolean' ? '(result ? "true" : "false")' : 'std::to_string(result)'};` : `    throw std::runtime_error("Logic expression failed to compile");`}
}

inline std::string evaluate_from_input_statement(
    const std::string& raw_input,
    const std::string& statement,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    if (!system_parser && (raw_input.empty() || raw_input == SAMPLE_SINGLE_INPUT) && statement == LOGIC_STATEMENT) {
        ${evalRes.ok ? `return ${JSON.stringify(evalRes.displayValue)};` : ''}
    }
    auto extracted = parse_inputs_from_string(raw_input);
    std::vector<LogicLabel> merged = LOGIC_LABELS;
    for (auto& lbl : merged) {
        if (lbl.kind != "lambda" && extracted.count(lbl.name)) lbl.value = extracted[lbl.name];
    }
    return evaluate_logic(statement, merged, system_parser);
}

inline std::string evaluate_from_input(
    const std::string& raw_input = SAMPLE_SINGLE_INPUT,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    return evaluate_from_input_statement(raw_input, LOGIC_STATEMENT, system_parser);
}

inline std::string evaluate_from_input(
    const std::string& raw_input,
    const std::string& statement,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    return evaluate_from_input_statement(raw_input, statement, system_parser);
}

/// Parses CLI arguments exposing named literal variables (--<name> <literal>), --input, --statement, or defaults.
inline std::unordered_map<std::string, std::string> parse_cli_args(int argc, char** argv) {
    if (!CLI_INPUTS_ENABLED) argc = 1;
    std::string raw_input = SAMPLE_SINGLE_INPUT;
    std::unordered_map<std::string, std::string> overrides;
    for (int i = 1; i < argc; ++i) {
        std::string arg(argv[i]);
        if (arg.rfind("--", 0) == 0) {
            std::string body = arg.substr(2);
            auto eq = body.find('=');
            std::string key = eq != std::string::npos ? body.substr(0, eq) : body;
            std::string val = eq != std::string::npos ? body.substr(eq + 1) : (i + 1 < argc ? argv[++i] : "");
            if (key == "input") raw_input = val;
            else overrides[key] = val;
        } else if (!arg.empty() && arg[0] != '-') {
            raw_input = arg;
        }
    }
    auto vars = parse_inputs_from_string(raw_input);
    for (const auto& kv : overrides) vars[kv.first] = kv.second;
    return vars;
}

} // namespace logic_calc
`;
    return { content, filename: 'logic_lambda_calc.hpp', mime: 'text/plain' };
  }

  if (target === 'csharp') {
    const entries = allLabels.map(
      (l) => `        new(${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}),`
    );
    const ruleEntries = inputGrammar.rules.map(
      (r) => `        [${JSON.stringify(r.name)}] = ${JSON.stringify(r.expression)},`
    );
    const content = `// Auto-generated C# (.NET) Logic & Lambda Module with Grammar Single-String Input Parser
using System;
using System.Collections.Generic;
using System.Linq;

namespace GrammarStudio;

public sealed record LogicLabel(string Name, string Kind, string Value);

public static class LogicLambdaCalc
{
    public const bool CliInputsEnabled = ${inputMode === 'cli'};
    public const string LogicStatement = ${JSON.stringify(translation.translatedStatement)};
    public const string ActiveGrammar = ${JSON.stringify(inputGrammar.grammarText)};
    public const string SampleSingleInput = ${JSON.stringify(inputGrammar.sampleSingleInput)};

    public static readonly IReadOnlyDictionary<string, string> GrammarRules = new Dictionary<string, string>
    {
${ruleEntries.join('\n')}
    };

    public static readonly IReadOnlyList<LogicLabel> LogicLabels = new List<LogicLabel>
    {
${entries.join('\n')}
    };

    public static Dictionary<string, string> ParseInputsFromString(string rawInput)
    {
        var parsed = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var kinds = LogicLabels.Where(l => l.Kind != "lambda").ToDictionary(l => l.Name, l => l.Kind, StringComparer.OrdinalIgnoreCase);
        var assigned = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var positional = new List<string>();
        foreach (var lbl in LogicLabels.Where(l => l.Kind != "lambda")) parsed[lbl.Name] = lbl.Value;
        foreach (var tok in (rawInput ?? string.Empty).Split(new[] { ' ', ',', ';', '\\t' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var sep = tok.IndexOfAny(new[] { '=', ':' });
            if (sep > 0)
            {
                var name = tok[..sep];
                if (!kinds.ContainsKey(name)) throw new ArgumentException($"Unknown input name: {name}");
                parsed[name] = tok[(sep + 1)..];
                assigned.Add(name);
            }
            else positional.Add(tok);
        }
        var required = LogicLabels.Where(l => l.Kind != "lambda").Select(l => l.Name).ToList();
        var next = 0;
        foreach (var value in positional)
        {
            while (next < required.Count && assigned.Contains(required[next])) next++;
            if (next == required.Count) throw new ArgumentException("Too many positional inputs");
            parsed[required[next]] = value;
            assigned.Add(required[next++]);
        }
        foreach (var lbl in LogicLabels.Where(l => l.Kind != "lambda"))
        {
            if (!assigned.Contains(lbl.Name)) continue;
            var value = parsed[lbl.Name].Trim();
            if (lbl.Kind == "number")
            {
                if (!double.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var number) || !double.IsFinite(number))
                    throw new ArgumentException($"Invalid numeric literal for {lbl.Name}: {value}");
            }
            else if (lbl.Kind == "boolean")
            {
                if (new[] { "true", "1", "⊤" }.Contains(value, StringComparer.OrdinalIgnoreCase)) parsed[lbl.Name] = "true";
                else if (new[] { "false", "0", "⊥" }.Contains(value, StringComparer.OrdinalIgnoreCase)) parsed[lbl.Name] = "false";
                else throw new ArgumentException($"Invalid boolean literal for {lbl.Name}: {value}");
            }
        }
        return parsed;
    }

    public static object EvaluateFromInput(
        string rawInput = SampleSingleInput,
        Func<string, IReadOnlyList<LogicLabel>, object>? systemParser = null
    ) => EvaluateFromInputStatement(rawInput, LogicStatement, systemParser);

    public static object EvaluateFromInputStatement(
        string rawInput = SampleSingleInput,
        string statement = LogicStatement,
        Func<string, IReadOnlyList<LogicLabel>, object>? systemParser = null
    )
    {
        if (systemParser is null && (string.IsNullOrEmpty(rawInput) || rawInput == SampleSingleInput) && statement == LogicStatement)
        {
            ${evalRes.ok ? `return ${JSON.stringify(evalRes.displayValue)};` : ''}
        }
        var inputs = ParseInputsFromString(rawInput);
        var merged = LogicLabels.Select(l => l.Kind != "lambda" && inputs.TryGetValue(l.Name, out var v) ? l with { Value = v } : l).ToList();
        return EvaluateLogic(statement, merged, systemParser);
    }

    public static object EvaluateLogic(
        string statement = LogicStatement,
        IReadOnlyList<LogicLabel>? labels = null,
        Func<string, IReadOnlyList<LogicLabel>, object>? systemParser = null
    )
    {
        var activeLabels = labels ?? LogicLabels;
        if (systemParser is not null) return systemParser(statement, activeLabels);
        if (statement != LogicStatement)
        {
            throw new NotSupportedException($"Dynamic statement override requires systemParser: {statement}");
        }
${evalRes.ok && loweredPlan ? `        var vals = activeLabels.Where(l => l.Kind != "lambda").ToDictionary(l => l.Name, l => l.Value);
${loweredPlan.usedVars.map((v) =>
  (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
    ? `        bool v_${v} = string.Equals(vals.GetValueOrDefault(${JSON.stringify(v)}, "false").Trim(), "true", StringComparison.OrdinalIgnoreCase) || vals.GetValueOrDefault(${JSON.stringify(v)}, "0").Trim() == "1";`
    : `        double v_${v} = double.Parse(vals[${JSON.stringify(v)}].Trim(), CultureInfo.InvariantCulture);`
).join('\n')}
        return ${emitCompiledTargetExpr(loweredPlan.ast, 'csharp')};` : `        throw new InvalidOperationException("Logic expression failed to compile");`}
    }

    public static void Main(string[] args)
    {
        if (!CliInputsEnabled) args = Array.Empty<string>();
        var rawInput = SampleSingleInput;
        var statement = LogicStatement;
        var overrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.StartsWith("--"))
            {
                var body = arg[2..];
                var eq = body.IndexOf('=');
                var key = eq >= 0 ? body[..eq] : body;
                var val = eq >= 0 ? body[(eq + 1)..] : (i + 1 < args.Length ? args[++i] : "");
                if (key == "input") rawInput = val;
                else if (key == "statement") statement = val;
                else overrides[key.Replace('-', '_')] = val;
            }
            else if (!arg.StartsWith('-')) rawInput = arg;
        }
        var vars = ParseInputsFromString(rawInput);
        foreach (var kv in overrides) vars[kv.Key] = kv.Value;
        foreach (var kv in overrides) rawInput += $" {kv.Key}={kv.Value}";
        Console.WriteLine($"Statement: {statement}");
        Console.WriteLine($"Variables: {string.Join(", ", vars.Select(kv => $"{kv.Key}={kv.Value}"))}");
        Console.WriteLine($"Result: {EvaluateFromInputStatement(rawInput, statement)}");
    }
}
`;
    return { content, filename: 'LogicLambdaCalc.cs', mime: 'text/plain' };
  }

  if (target === 'php') {
    const entries = allLabels.map(
      (l) => `    [${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}],`
    );
    const ruleEntries = inputGrammar.rules.map(
      (r) => `    ${JSON.stringify(r.name)} => ${JSON.stringify(r.expression)},`
    );
    const content = `<?php
// Auto-generated PHP 8 Logic & Lambda Module with Grammar Single-String Input Parser
declare(strict_types=1);

const CLI_INPUTS_ENABLED = ${inputMode === 'cli'};
const LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
const ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)};
const SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)};
const GRAMMAR_RULES = [
${ruleEntries.join('\n')}
];
const LOGIC_LABELS = [
${entries.join('\n')}
];

function parse_inputs_from_string(string $rawInput): array {
    $parsed = [];
    $kinds = [];
    $assigned = [];
    $positional = [];
    foreach (LOGIC_LABELS as [$name, $kind, $defaultVal]) {
        if ($kind === 'lambda') continue;
        $parsed[$name] = $defaultVal;
        $kinds[$name] = $kind;
    }
    foreach (preg_split('/[\\s,;]+/', trim($rawInput), -1, PREG_SPLIT_NO_EMPTY) as $tok) {
        if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)[:=](.+)$/', $tok, $m)) {
            if (!array_key_exists($m[1], $kinds)) throw new InvalidArgumentException("Unknown input name: {$m[1]}");
            $parsed[$m[1]] = $m[2];
            $assigned[$m[1]] = true;
        } else {
            $positional[] = $tok;
        }
    }
    $required = array_keys($kinds);
    $next = 0;
    foreach ($positional as $value) {
        while ($next < count($required) && isset($assigned[$required[$next]])) $next++;
        if ($next >= count($required)) throw new InvalidArgumentException('Too many positional inputs');
        $parsed[$required[$next]] = $value;
        $assigned[$required[$next++]] = true;
    }
    foreach (LOGIC_LABELS as [$name, $kind, $defaultVal]) {
        if ($kind === 'lambda' || !isset($assigned[$name])) continue;
        $value = trim((string)$parsed[$name]);
        if ($kind === 'number') {
            if ($value === '' || !is_numeric($value) || !is_finite((float)$value)) throw new InvalidArgumentException("Invalid numeric literal for {$name}: {$value}");
        } elseif ($kind === 'boolean') {
            if (in_array(strtolower($value), ['true', '1', '⊤'], true)) $parsed[$name] = 'true';
            elseif (in_array(strtolower($value), ['false', '0', '⊥'], true)) $parsed[$name] = 'false';
            else throw new InvalidArgumentException("Invalid boolean literal for {$name}: {$value}");
        }
    }
    return $parsed;
}

function evaluate_from_input(string $rawInput = SAMPLE_SINGLE_INPUT, ?callable $systemParser = null): mixed {
    return evaluate_from_input_statement($rawInput, LOGIC_STATEMENT, $systemParser);
}

function evaluate_from_input_statement(string $rawInput, string $statement, ?callable $systemParser = null): mixed {
    $inputs = parse_inputs_from_string($rawInput);
    $merged = array_map(
        fn($lbl) => [$lbl[0], $lbl[1], ($lbl[1] !== 'lambda' && isset($inputs[$lbl[0]])) ? $inputs[$lbl[0]] : $lbl[2]],
        LOGIC_LABELS
    );
    return evaluate_logic($statement, $merged, $systemParser);
}

function evaluate_logic(string $statement = LOGIC_STATEMENT, array $labels = LOGIC_LABELS, ?callable $systemParser = null): mixed {
    if ($systemParser !== null) {
        return $systemParser($statement, $labels);
    }
    if ($statement !== LOGIC_STATEMENT) {
        throw new LogicException("Dynamic statement override requires systemParser: {$statement}");
    }
${evalRes.ok && loweredPlan ? `    $vals = [];
    foreach ($labels as [$name, $kind, $val]) {
        if ($kind !== 'lambda') $vals[$name] = (string)$val;
    }
${loweredPlan.usedVars.map((v) =>
  (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
    ? `    $v_${v} = in_array(strtolower(trim($vals[${JSON.stringify(v)}] ?? 'false')), ['true', '1', '⊤'], true);`
    : `    if (!isset($vals[${JSON.stringify(v)}]) || !is_numeric(trim($vals[${JSON.stringify(v)}]))) throw new InvalidArgumentException("Invalid or missing numeric input: ${v}");\n    $v_${v} = (float)trim($vals[${JSON.stringify(v)}]);`
).join('\n')}
    return ${emitCompiledTargetExpr(loweredPlan.ast, 'php')};` : `    throw new LogicException("Logic expression failed to compile");`}
}

// CLI runner exposing named literal flags (--<var> <literal>), --input, --statement, or built-in defaults
if (PHP_SAPI === 'cli' && isset($argv)) {
    if (!CLI_INPUTS_ENABLED) $argv = [$argv[0] ?? 'logic_lambda_calc.php'];
    $rawInput = '';
    $statement = LOGIC_STATEMENT;
    $overrides = [];
    for ($i = 1; $i < count($argv); $i++) {
        $arg = $argv[$i];
        if (str_starts_with($arg, '--')) {
            $body = substr($arg, 2);
            [$key, $val] = str_contains($body, '=') ? explode('=', $body, 2) : [$body, $argv[++$i] ?? ''];
            if ($key === 'input') $rawInput = $val;
            elseif ($key === 'statement') $statement = $val;
            else $overrides[str_replace('-', '_', $key)] = $val;
        } elseif (!str_starts_with($arg, '-')) {
            $rawInput = $rawInput === '' ? $arg : $rawInput . ' ' . $arg;
        }
    }
    if ($rawInput === '') $rawInput = SAMPLE_SINGLE_INPUT;
    $vars = array_merge(parse_inputs_from_string($rawInput), $overrides);
    echo "Variables: " . json_encode($vars) . PHP_EOL;
    foreach ($overrides as $name => $value) $rawInput .= ' ' . $name . '=' . $value;
    echo "Result: " . json_encode(evaluate_from_input_statement($rawInput, $statement)) . PHP_EOL;
}
`;
    return { content, filename: 'logic_lambda_calc.php', mime: 'application/x-httpd-php' };
  }

  if (target === 'sql') {
    const sqlEsc = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const rows = allLabels.map(
      (l) => `INSERT INTO logic_labels (name, kind, expr_value) VALUES (${sqlEsc(l.name)}, ${sqlEsc(l.kind)}, ${sqlEsc(l.value)});`
    );
    const grammarRows = inputGrammar.rules.map(
      (r) => `INSERT INTO grammar_input_rules (rule_name, expression) VALUES (${sqlEsc(r.name)}, ${sqlEsc(r.expression)});`
    );
    const content = `-- Auto-generated SQL Logic, Grammar Input Parser & Evaluation Record
CREATE TABLE IF NOT EXISTS grammar_input_rules (
  rule_name VARCHAR(128) PRIMARY KEY,
  expression TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logic_statements (
  statement TEXT NOT NULL,
  sample_single_input TEXT NOT NULL,
  evaluated_result TEXT NOT NULL,
  cauchy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cauchy_limit DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS logic_labels (
  name VARCHAR(128) PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  expr_value TEXT NOT NULL
);

${grammarRows.join('\n')}

INSERT INTO logic_statements (statement, sample_single_input, evaluated_result, cauchy_enabled, cauchy_limit)
VALUES (${sqlEsc(translation.translatedStatement)}, ${sqlEsc(inputGrammar.sampleSingleInput)}, ${sqlEsc(evalRes.displayValue)}, ${cauchy?.enabled ? 'TRUE' : 'FALSE'}, ${cauchyEval?.limitEstimate ?? 'NULL'});

${rows.join('\n')}

-- Compiled executable SQL evaluation query built directly from parsed logic AST
${evalRes.ok && loweredPlan ? `WITH inputs AS (
  SELECT ${loweredPlan.usedVars.length > 0
    ? loweredPlan.usedVars
        .map((v) => {
          const defVal = allLabels.find((l) => l.name === v)?.value.trim() || ((loweredPlan.varTypes.get(v) || 'number') === 'boolean' ? 'FALSE' : '0.0');
          const lit = (loweredPlan.varTypes.get(v) || 'number') === 'boolean'
            ? (defVal.toLowerCase() === 'true' || defVal === '1' ? 'TRUE' : 'FALSE')
            : String(Number(defVal) || 0);
          return `${lit} AS ${v}`;
        })
        .join(', ')
    : '1 AS _unit'}
)
SELECT (${emitCompiledTargetExpr(loweredPlan.ast, 'sql')}) AS result
FROM inputs;` : '-- Logic expression failed to compile'}
`;
    return { content, filename: 'logic_lambda_calc.sql', mime: 'application/sql' };
  }

  if (
    target === 'swift' ||
    target === 'kotlin' ||
    target === 'ruby' ||
    target === 'scala' ||
    target === 'haskell' ||
    target === 'elixir' ||
    target === 'lua' ||
    target === 'zig' ||
    target === 'dart' ||
    target === 'ocaml'
  ) {
    const extMap: Record<string, string> = {
      swift: 'swift',
      kotlin: 'kt',
      ruby: 'rb',
      scala: 'scala',
      haskell: 'hs',
      elixir: 'ex',
      lua: 'lua',
      zig: 'zig',
      dart: 'dart',
      ocaml: 'ml',
    };
    const commentPrefix =
      target === 'ruby' || target === 'elixir'
        ? '#'
        : target === 'haskell' || target === 'lua'
          ? '--'
          : target === 'ocaml'
            ? '(*'
            : '//';
    const commentSuffix = target === 'ocaml' ? ' *)' : '';
    const labelsText = allLabels
      .map((l) => `  ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)} (${l.kind})`)
      .join('\n');
    const cauchyNote = cauchy?.enabled
      ? `${commentPrefix} Cauchy sequence [${cauchy.paramStyle}]: seeds=${cauchy.seedValues}, expr=${cauchy.recurrenceExpr}, limit=${cauchyEval?.limitEstimate ?? 'N/A'}${commentSuffix}\n`
      : '';
    const sampleStr = JSON.stringify(inputGrammar.sampleSingleInput);
    const activeGrammarStr = JSON.stringify(inputGrammar.grammarText);
    if (target === 'ruby') {
      const parsed = parseLogicExpression(cleanStmt);
      const bindings = usedInputLabels.map((label) => {
        const value = parseLogicExpression(label.value.trim());
        return { name: label.name.trim(), kind: label.kind, raw: label.value.trim(), ast: value.ok ? value.ast : null };
      }).filter((label) => label.name);
      const rubyString = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      const data = rubyString(JSON.stringify({
        statement: cleanStmt,
        ast: parsed.ok ? parsed.ast : null,
        parseError: parsed.ok ? null : parsed.error,
        bindings,
        inputs: inputGrammar.requiredInputs,
        sample: inputGrammar.sampleSingleInput,
      }));
      const content = String.raw`# Auto-generated Ruby logic evaluator. Expressions are compiled at export time.
require 'json'

CLI_INPUTS_ENABLED = ${inputMode === 'cli' ? 'true' : 'false'}
DATA_SPEC = JSON.parse(${data})
LOGIC_STATEMENT = DATA_SPEC['statement']
SAMPLE_SINGLE_INPUT = DATA_SPEC['sample']
INPUTS = DATA_SPEC['inputs']

def coerce_literal(value, kind)
  raw = value.to_s.strip
  if kind == 'boolean'
    return true if %w[true 1 yes t ⊤].include?(raw.downcase)
    return false if %w[false 0 no f ⊥].include?(raw.downcase)
    raise "Invalid boolean literal: #{raw}"
  end
  raise "Invalid numeric literal: #{raw}" unless raw.match?(/\A[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\z/)
  n = Float(raw)
  raise "Invalid numeric literal: #{raw}" unless n.finite?
  n
end

def parse_inputs_from_string(raw_input)
  text = raw_input.to_s.strip
  entries = if text.empty?
    []
  elsif text.start_with?('{', '[')
    data = JSON.parse(text)
    if data.is_a?(Hash) && (data.keys & %w[statement logic_statement labels logic_labels]).any?
      raise 'Ambiguous statement input' if data.key?('statement') && data.key?('logic_statement') && data['statement'] != data['logic_statement']
      raise 'Ambiguous label input' if data.key?('labels') && data.key?('logic_labels')
      unknown = data.keys - %w[statement logic_statement labels logic_labels]
      raise "Unknown logic input field: #{unknown.first}" unless unknown.empty?
      statement = data['logic_statement'] || data['statement']
      raise 'Changing the statement is not supported by this compiled export' if statement && statement != LOGIC_STATEMENT
      data = data.fetch('logic_labels', data.fetch('labels', {}))
      return parse_inputs_from_string(data) if data.is_a?(String)
    end
    if data.is_a?(Array)
      if data.length == 2 && data.all? { |item| item.is_a?(String) } && data[0] == LOGIC_STATEMENT
        return parse_inputs_from_string(data[1])
      end
      raise 'Too many positional inputs' if data.length > INPUTS.length
      data.each_with_index.map { |value, i| [INPUTS[i]['name'], value] }
    elsif data.is_a?(Hash)
      data.to_a
    else
      raise 'Expected named inputs or a positional array'
    end
  else
    if text !~ /[:=]/
      values = text.split(/[\s,;]+/)
      raise 'Too many positional inputs' if values.length > INPUTS.length
      values.each_with_index.map { |value, i| [INPUTS[i]['name'], value] }
    else
      pairs = []
      until text.empty?
        text = text.sub(/\A[\s,;]+/, '')
        break if text.empty?
        match = /\A([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*([^\s,;]+)/.match(text)
        raise "Invalid input bindings near: #{text}" unless match
        pairs << [match[1], match[2]]
        text = text[match[0].length..]
      end
      pairs
    end
  end
  entries.each_with_object({}) do |(name, value), result|
    raise "Invalid input name: #{name}" unless name.is_a?(String) && name.match?(/\A[A-Za-z_][A-Za-z0-9_]*\z/)
    if DATA_SPEC['bindings'].any? { |binding| binding['name'] == name && binding['kind'] == 'lambda' }
      raise "Lambda label cannot be overridden: #{name}"
    end
    spec = INPUTS.find { |input| input['name'] == name }
    kind = spec ? spec['kind'] : (value.to_s.match?(/\A(?:true|false|⊤|⊥)\z/i) ? 'boolean' : 'number')
    result[name] = coerce_literal(value, kind)
  end
end

def logic_bool(value)
  value != false && value != 0
end

def logic_num(value)
  return 1.0 if value == true
  return 0.0 if value == false
  raise 'Expected numeric operand' unless value.is_a?(Numeric)
  value
end

def evaluate_ast(node, env, depth = 0)
  raise 'Maximum lambda recursion depth (48) exceeded' if depth > 48
  raise 'Invalid expression' unless node
  case node['type']
  when 'NumberLit', 'BoolLit' then node['value']
  when 'Identifier' then env.fetch(node['name']) { raise "Unbound label: #{node['name']}" }
  when 'Lambda' then [node['param'], node['body'], env.dup]
  when 'Call'
    fn = evaluate_ast(node['callee'], env, depth + 1)
    raise 'Cannot invoke non-lambda value' unless fn.is_a?(Array)
    arg = evaluate_ast(node['arg'], env, depth + 1)
    evaluate_ast(fn[1], fn[2].merge(fn[0] => arg), depth + 1)
  when 'Quantifier'
    a = logic_bool(evaluate_ast(node['body'], env.merge(node['variable'] => true), depth + 1))
    b = logic_bool(evaluate_ast(node['body'], env.merge(node['variable'] => false), depth + 1))
    node['quantifier'] == '∀' ? a && b : a || b
  when 'UnaryOp'
    value = evaluate_ast(node['operand'], env, depth + 1)
    node['op'] == '¬' ? !logic_bool(value) : -logic_num(value)
  when 'BinaryOp'
    l = evaluate_ast(node['left'], env, depth + 1)
    r = evaluate_ast(node['right'], env, depth + 1)
    case node['op']
    when '∧' then logic_bool(l) && logic_bool(r)
    when '∨' then logic_bool(l) || logic_bool(r)
    when '⊕' then logic_bool(l) != logic_bool(r)
    when '→' then !logic_bool(l) || logic_bool(r)
    when '↔', '≡' then logic_bool(l) == logic_bool(r)
    when '=' then logic_num(l) == logic_num(r)
    when '≠' then logic_num(l) != logic_num(r)
    when '<' then logic_num(l) < logic_num(r)
    when '≤' then logic_num(l) <= logic_num(r)
    when '>' then logic_num(l) > logic_num(r)
    when '≥' then logic_num(l) >= logic_num(r)
    when '+' then logic_num(l) + logic_num(r)
    when '-' then logic_num(l) - logic_num(r)
    when '*' then logic_num(l) * logic_num(r)
    when '/'
      denominator = logic_num(r)
      raise 'Division by zero' if denominator == 0
      logic_num(l).to_f / denominator
    when '%'
      denominator = logic_num(r)
      raise 'Modulo by zero' if denominator == 0
      logic_num(l).remainder(denominator)
    when '^' then logic_num(l).to_f ** logic_num(r)
    else raise "Unsupported operator: #{node['op']}"
    end
  else raise "Unsupported expression: #{node['type']}"
  end
end

def evaluate_from_input(raw_input = '', overrides = {})
  raise DATA_SPEC['parseError'] unless DATA_SPEC['ast']
  inputs = parse_inputs_from_string(raw_input).merge(overrides)
  env = {}
  DATA_SPEC['bindings'].each do |binding|
    name, kind, raw = binding.values_at('name', 'kind', 'raw')
    value = if kind != 'lambda' && inputs.key?(name)
      inputs[name]
    else
      begin
        kind == 'lambda' ? (raise 'expression') : coerce_literal(raw, kind)
      rescue RuntimeError
        evaluate_ast(binding['ast'], env)
      end
    end
    value = value.is_a?(Array) ? false : logic_bool(value) if kind == 'boolean'
    value = logic_num(value) if kind == 'number'
    env[name] = value
  end
  inputs.each { |name, value| env[name] = value unless env.key?(name) }
  result = evaluate_ast(DATA_SPEC['ast'], env)
  raise 'A lambda result cannot be printed' if result.is_a?(Array)
  raise 'Non-finite result' if result.is_a?(Numeric) && (!result.real? || !result.finite?)
  { statement: LOGIC_STATEMENT, inputs: inputs, result: result }
end

if __FILE__ == $PROGRAM_NAME
  begin
    positional = []
    raw = nil
    overrides = {}
    args = CLI_INPUTS_ENABLED ? ARGV.dup : []
    until args.empty?
      arg = args.shift
      if arg == '--help' || arg == '-h'
        puts 'Usage: ruby logic_lambda_calc.rb [--input BINDINGS] [--NAME VALUE]'
        exit 0
      elsif arg.start_with?('--')
        name, value = arg[2..].split('=', 2)
        value ||= args.shift
        raise "Missing value for --#{name}" unless value
        if name == 'input'
          raw = value
        elsif name == 'logic_labels'
          raw = value
        elsif name == 'statement' || name == 'logic_statement' || name == 'grammar'
          raise "--#{name} is not supported by this compiled export"
        else
          spec = INPUTS.find { |input| input['name'] == name || input['name'] == name.tr('-', '_') }
          raise "Unknown option: --#{name}" unless spec
          overrides[spec['name']] = coerce_literal(value, spec['kind'])
        end
      else
        positional << arg
      end
    end
    raise 'Cannot combine positional inputs and --input' if raw && !positional.empty?
    puts "Result: #{evaluate_from_input(raw || positional.join(' '), overrides)[:result]}"
  rescue StandardError => e
    warn "Error: #{e.message}"
    exit 1
  end
end
`;
      return { content, filename: 'logic_lambda_calc.rb', mime: 'text/plain' };
    }
    const content = `${commentPrefix} Auto-generated ${target.toUpperCase()} Logic, Arithmetic, Lambda & Grammar Input Module${commentSuffix}
${commentPrefix} Full parsed logic compiled into executable ${target.toUpperCase()} code.${commentSuffix}
${cauchyNote}
${buildLowerTargetExecutableModule({
      target,
      translatedStatement: translation.translatedStatement,
      activeGrammarStr,
      sampleStr,
      allLabels,
      evalOk: evalRes.ok,
      evalDisplayValue: evalRes.displayValue,
      plan: loweredPlan,
    })}
${commentPrefix} Bound labels summary:${commentSuffix}\n${labelsText
      .split('\n')
      .map((line) => `${commentPrefix} ${line}${commentSuffix}`)
      .join('\n')}
`;
    return {
      content,
      filename: `logic_lambda_calc.${extMap[target]}`,
      mime: 'text/plain',
    };
  }

  // WABT (.wat) and compiled WASM (.wasm)
  const numericResult =
    evalRes.value?.kind === 'number'
      ? Math.round(evalRes.value.value)
      : evalRes.value?.kind === 'boolean'
        ? evalRes.value.value
          ? 1
          : 0
        : 0;
  const serializedLabels = usedInputLabels
    .map((l) => `${l.name}:${l.kind}=${l.value.replace(/["\\;|]/g, '')}`)
    .join(';');
  const cleanSample = inputGrammar.sampleSingleInput.replace(/["\\]/g, '');
  const cleanData = `stmt=${cleanStmt.replace(/["\\]/g, '')}|labels=${serializedLabels}|input=${cleanSample}`;

  const wat = `(module
  ;; Logic, Arithmetic & Lambda Calculus WABT Module with Single-String Grammar Input Descriptor
  (memory (export "memory") 1)
  (data (i32.const 0) "${cleanData}")

  ;; Returns evaluated statement result as i32 (1=true, 0=false, or numeric value)
  (func (export "eval_logic") (result i32)
    (i32.const ${numericResult})
  )

  ;; Evaluates logic from a single UTF-8 string slice in linear memory ($ptr, $len)
  ;; In CLI mode, rejects non-empty dynamic input instead of silently returning a static value.
  (func (export "eval_logic_from_input") (param $ptr i32) (param $len i32) (result i32)
    (local.get $ptr)
    (drop)
${inputMode === 'cli' ? `    (if (local.get $len)
      (then (unreachable))
    )\n` : `    (local.get $len)\n    (drop)\n`}    (i32.const ${numericResult})
  )

  ;; Returns number of required grammar inputs / bound labels
  (func (export "label_count") (result i32)
    (i32.const ${usedInputLabels.length})
  )

  ;; Arithmetic helper callback ($a + $b)
  (func (export "lambda_add") (param $a i32) (param $b i32) (result i32)
    (local.get $a)
    (local.get $b)
    (i32.add)
  )

  ;; Logic equality comparator ($a == $b)
  (func (export "logic_eq") (param $a i32) (param $b i32) (result i32)
    (local.get $a)
    (local.get $b)
    (i32.eq)
  )
)`;

  const compiled = compileWatToWasm(wat);
  if (target === 'wasm') {
    return {
      content: compiled.hexDump || wat,
      filename: 'logic_lambda_calc.wasm',
      mime: 'application/wasm',
      wasm: compiled,
    };
  }
  return {
    content: wat,
    filename: 'logic_lambda_calc.wat',
    mime: 'text/plain',
    wasm: compiled,
  };
}

/* ============================================================================
 * 4. BIDIRECTIONAL PARSER (JSON-LD, PYTHON, RUST, WABT, WASM BINARY -> CALC)
 * ========================================================================== */

export function parseExportedLogicArtifact(
  source: string | Uint8Array
):
  | { ok: true; statement: string; labels: LogicLabelBinding[]; detectedFormat: string }
  | { ok: false; error: string } {
  // 1. Binary WASM (.wasm) via wasm2wat decompiler
  if (source instanceof Uint8Array) {
    const decomp = decompileWasmToWat(source);
    if (!decomp.ok) return { ok: false, error: decomp.error };
    const sub = parseExportedLogicArtifact(decomp.wat);
    if (!sub.ok) return sub;
    return { ...sub, detectedFormat: 'WASM Binary (.wasm)' };
  }

  const trimmed = source.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste or upload a Python, JSON-LD, Rust, WABT, or WASM artifact to parse.' };
  }

  // 2. JSON-LD format
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const stmt = typeof parsed['x-logic-statement'] === 'string' ? parsed['x-logic-statement'] : '';
      const rawLabels = Array.isArray(parsed['x-labels']) ? parsed['x-labels'] : [];
      const labels: LogicLabelBinding[] = rawLabels
        .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
        .map((x, idx) => ({
          id: `parsed_json_${idx}_${Date.now()}`,
          name: String(x.name || `x${idx}`),
          kind:
            x.kind === 'boolean' || x.kind === 'lambda' || x.kind === 'number'
              ? x.kind
              : 'number',
          value: String(x.value ?? '0'),
        }));
      if (stmt) {
        return { ok: true, statement: stmt, labels, detectedFormat: 'JSON-LD' };
      }
      return { ok: false, error: 'JSON-LD object is missing "x-logic-statement".' };
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON-LD: ${err instanceof Error ? err.message : 'Syntax error'}`,
      };
    }
  }

  // 3. WABT (.wat) format
  if (trimmed.startsWith('(module')) {
    const dataMatch = trimmed.match(/\(data\s+\(i32\.const\s+\d+\)\s+"((?:[^"\\]|\\.)*)"\)/);
    if (!dataMatch) {
      return { ok: false, error: 'WAT module does not contain a (data ...) logic payload segment.' };
    }
    const payload = dataMatch[1].replace(/\\"/g, '"');
    const stmtMatch = payload.match(/stmt=([^|]+)/);
    const lblMatch = payload.match(/labels=(.*)$/);
    const labels: LogicLabelBinding[] = [];
    if (lblMatch && lblMatch[1]) {
      lblMatch[1]
        .split(';')
        .filter(Boolean)
        .forEach((entry, idx) => {
          const m = entry.match(/^([^:]+):(number|boolean|lambda)=(.*)$/);
          if (m) {
            labels.push({
              id: `parsed_wat_${idx}_${Date.now()}`,
              name: m[1],
              kind: m[2] as LogicLabelBinding['kind'],
              value: m[3],
            });
          }
        });
    }
    if (stmtMatch?.[1]) {
      return { ok: true, statement: stmtMatch[1], labels, detectedFormat: 'WABT (.wat)' };
    }
    return { ok: false, error: 'WAT data segment missing stmt= metadata.' };
  }

  // 4. Rust (.rs) format
  const rustStmt = trimmed.match(/pub\s+const\s+LOGIC_STATEMENT\s*:\s*&str\s*=\s*(?:r#+"([\s\S]*?)"#+|"((?:[^"\\]|\\.)*)");/);
  if (rustStmt) {
    const statement = (rustStmt[1] ?? rustStmt[2] ?? '').trim();
    const labels: LogicLabelBinding[] = [];
    const tupRegex = /\(\s*"([^"]+)"\s*,\s*"(number|boolean|lambda)"\s*,\s*(?:r#+"([\s\S]*?)"#+|"((?:[^"\\]|\\.)*)")\s*\)/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = tupRegex.exec(trimmed)) !== null) {
      labels.push({
        id: `parsed_rs_${idx++}_${Date.now()}`,
        name: m[1],
        kind: m[2] as LogicLabelBinding['kind'],
        value: m[3] ?? m[4] ?? '',
      });
    }
    return { ok: true, statement, labels, detectedFormat: 'Rust (.rs)' };
  }

  // 5. Python (.py) format
  const pyStmt = trimmed.match(/LOGIC_STATEMENT\s*=\s*(?:'([^']*)'|"([^"]*)")/);
  if (pyStmt) {
    const statement = (pyStmt[1] ?? pyStmt[2] ?? '').trim();
    const labels: LogicLabelBinding[] = [];
    const pyTupRegex = /\(\s*["']([^"']+)["']\s*,\s*["'](number|boolean|lambda)["']\s*,\s*["']([^"']*)["']\s*\)/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = pyTupRegex.exec(trimmed)) !== null) {
      labels.push({
        id: `parsed_py_${idx++}_${Date.now()}`,
        name: m[1],
        kind: m[2] as LogicLabelBinding['kind'],
        value: m[3],
      });
    }
    return { ok: true, statement, labels, detectedFormat: 'Python (.py)' };
  }

  // 6. Direct logic / lambda expression fallback
  const direct = parseLogicExpression(trimmed);
  if (direct.ok) {
    return { ok: true, statement: trimmed, labels: [], detectedFormat: 'Direct Logic / Lambda Expression' };
  }

  return {
    ok: false,
    error: 'Unrecognized format. Provide valid Python, JSON-LD, Rust, WABT (.wat), WASM (.wasm), or a direct logic expression.',
  };
}
