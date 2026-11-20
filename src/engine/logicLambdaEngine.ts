import { compileWatToWasm, decompileWasmToWat } from './bidirectionalEngine.ts';
import type { WasmCompilationResult } from '../types/studio.ts';

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

export function exportLogicStatement(
  target: LogicExportTarget,
  statement: string,
  labels: LogicLabelBinding[],
  evalRes: LogicEvaluationResult,
  cauchy?: CauchySequenceConfig
): {
  content: string;
  filename: string;
  mime: string;
  wasm?: WasmCompilationResult;
} {
  const cauchyEval = cauchy?.enabled ? evaluateCauchySequence(cauchy, labels) : null;
  const cleanStmt = statement.trim();
  const translation = translateLambdaCallsToNamedCallbacks(cleanStmt, labels);
  const allLabels = [...labels, ...translation.liftedLabels];
  const namedArity = new Map<string, number>();
  for (const cb of translation.callbacks) {
    namedArity.set(cb.name, cb.params.length);
  }

  const translatedAstParsed = parseLogicExpression(translation.translatedStatement);
  const exprAst = translatedAstParsed.ok ? translatedAstParsed.ast : evalRes.ast;
  const astExprPy = exprAst ? astToPythonExpr(exprAst, namedArity) : 'None';
  const astExprRs = exprAst ? astToRustExpr(exprAst, namedArity) : 'false';

  if (target === 'python') {
    const labelDefs = allLabels.map((l) => {
      if (l.kind === 'boolean') {
        const lower = l.value.trim().toLowerCase();
        if (lower === 'true' || l.value.trim() === '⊤' || l.value.trim() === '1') {
          return `${l.name} = True`;
        }
        if (lower === 'false' || l.value.trim() === '⊥' || l.value.trim() === '0') {
          return `${l.name} = False`;
        }
        const parsedExpr = parseLogicExpression(l.value);
        return `${l.name} = bool(${parsedExpr.ok ? astToPythonExpr(parsedExpr.ast, namedArity) : 'False'})`;
      }
      if (l.kind === 'number') {
        const plainNum = Number(l.value.trim());
        if (l.value.trim() !== '' && !Number.isNaN(plainNum)) {
          return `${l.name} = ${l.value.trim()}`;
        }
        const parsedExpr = parseLogicExpression(l.value);
        return `${l.name} = ${parsedExpr.ok ? astToPythonExpr(parsedExpr.ast, namedArity) : '0'}`;
      }
      const unwrapped = extractLambdaParamsAndBody(l.value);
      if (unwrapped) {
        return `def ${l.name}(${unwrapped.params.join(', ')}):\n    return ${astToPythonExpr(unwrapped.body, namedArity)}`;
      }
      const parsedCb = parseLogicExpression(l.value);
      return `${l.name} = ${parsedCb.ok ? astToPythonExpr(parsedCb.ast, namedArity) : 'lambda x: x'}`;
    });

    const metaEntries = allLabels.map(
      (l) => `    ("${l.name}", "${l.kind}", "${l.value.replace(/"/g, "'")}"),`
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
import ast
import re

LOGIC_STATEMENT = '${translation.translatedStatement.replace(/'/g, '"')}'

LOGIC_LABELS = [
${metaEntries.join('\n')}
]

${labelDefs.join('\n\n')}

def _normalize_to_python_expr(source: str) -> str:
    expr = source.strip()
    # Convert chained Unicode lambdas (λa. λb. body) into Python multi-arg lambdas
    def _collapse_lambdas(match: re.Match) -> str:
        params = re.findall(r'[λ\\\\]\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\.', match.group(0))
        return f"lambda {', '.join(params)}: "
    expr = re.sub(r'(?:[λ\\\\]\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\.\\s*)+', _collapse_lambdas, expr)
    expr = expr.replace('⊤', 'True').replace('⊥', 'False')
    expr = expr.replace('¬', ' not ').replace('∧', ' and ').replace('∨', ' or ')
    expr = expr.replace('≤', '<=').replace('≥', '>=').replace('≠', '!=')
    expr = expr.replace('⊕', ' ^ ').replace('↔', ' == ').replace('≡', ' == ')
    return expr

def parse_logic_call(statement: str, labels=LOGIC_LABELS, system_parser=None):
    """Calls LOGIC_STATEMENT with LOGIC_LABELS via defined system_parser or Python's conventional AST flow."""
    if callable(system_parser):
        return system_parser(statement, labels)

    env = {"True": True, "False": False, "bool": bool, "int": int, "float": float}
    for name, kind, raw_val in labels:
        val_str = str(raw_val).strip()
        if kind == 'boolean':
            low = val_str.lower()
            if low in ('true', '⊤', '1'):
                env[name] = True
            elif low in ('false', '⊥', '0'):
                env[name] = False
            else:
                env[name] = bool(eval(compile(ast.parse(_normalize_to_python_expr(val_str), mode='eval'), '<label>', 'eval'), {"__builtins__": {}}, env))
        elif kind == 'number':
            try:
                env[name] = int(val_str) if val_str.lstrip('-').isdigit() else float(val_str)
            except ValueError:
                env[name] = eval(compile(ast.parse(_normalize_to_python_expr(val_str), mode='eval'), '<label>', 'eval'), {"__builtins__": {}}, env)
        else:
            env[name] = eval(compile(ast.parse(_normalize_to_python_expr(val_str), mode='eval'), '<callback>', 'eval'), {"__builtins__": {}}, env)

    py_expr = _normalize_to_python_expr(statement)
    parsed_ast = ast.parse(py_expr, mode='eval')
    return eval(compile(parsed_ast, '<LOGIC_STATEMENT>', 'eval'), {"__builtins__": {}}, env)

def evaluate_logic(statement: str = LOGIC_STATEMENT, labels=LOGIC_LABELS, system_parser=None):
    return parse_logic_call(statement, labels, system_parser=system_parser)

def evaluate_logic_compiled():
    return ${astExprPy}
${cauchyPyBlock}
if __name__ == '__main__':
    print('Result:', evaluate_logic(LOGIC_STATEMENT, LOGIC_LABELS))${cauchy?.enabled ? "\n    print('Cauchy Limit:', evaluate_cauchy_sequence()[-1])" : ''}
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
      'x-named-callbacks': translation.callbacks.map((cb) => ({
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
    const labelLines = allLabels.map((l) => {
      if (l.kind === 'boolean') {
        const lower = l.value.trim().toLowerCase();
        if (lower === 'true' || l.value.trim() === '⊤' || l.value.trim() === '1') {
          return `    let ${l.name}: bool = true;`;
        }
        if (lower === 'false' || l.value.trim() === '⊥' || l.value.trim() === '0') {
          return `    let ${l.name}: bool = false;`;
        }
        const parsedExpr = parseLogicExpression(l.value);
        return `    let ${l.name}: bool = ${parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : 'false'};`;
      }
      if (l.kind === 'number') {
        const n = Number(l.value.trim());
        if (l.value.trim() !== '' && !Number.isNaN(n)) {
          return `    let ${l.name}: f64 = ${Number.isInteger(n) ? `${n}.0` : n};`;
        }
        const parsedExpr = parseLogicExpression(l.value);
        return `    let ${l.name}: f64 = ${parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : '0.0'};`;
      }
      const unwrapped = extractLambdaParamsAndBody(l.value);
      if (unwrapped) {
        return `    let ${l.name} = |${unwrapped.params.join(', ')}| ${astToRustExpr(unwrapped.body, namedArity)};`;
      }
      const parsedCb = parseLogicExpression(l.value);
      return `    let ${l.name} = ${parsedCb.ok ? astToRustExpr(parsedCb.ast, namedArity) : '|x: f64| x'};`;
    });

    const specTuples = allLabels.map(
      (l) => `    ("${l.name}", "${l.kind}", r#"${l.value}"#),`
    );

    const retType = evalRes.valueType === 'number' ? 'f64' : 'bool';
    const content = `// Auto-generated Rust Logic & Named Lambda Callbacks Module
pub const LOGIC_STATEMENT: &str = r#"${translation.translatedStatement}"#;

pub const LOGIC_LABELS: &[(&str, &str, &str)] = &[
${specTuples.join('\n')}
];

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
    let _ = (statement, labels);
${labelLines.join('\n')}
    ${astExprRs}
}

pub fn evaluate_logic() -> ${retType} {
    evaluate_logic_with::<fn(&str, &[(&str, &str, &str)]) -> ${retType}>(
        LOGIC_STATEMENT,
        LOGIC_LABELS,
        None,
    )
}
`;
    return { content, filename: 'logic_lambda_calc.rs', mime: 'text/plain' };
  }

  if (target === 'typescript' || target === 'javascript') {
    const isTs = target === 'typescript';
    const labelTuples = allLabels.map(
      (l) => `  [${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}],`
    );
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
    const content = `// Auto-generated ${isTs ? 'TypeScript' : 'JavaScript (ESM)'} Logic, Lambda & Cauchy Module
export const LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};

export const LOGIC_LABELS${isTs ? ': Array<[string, "number" | "boolean" | "lambda", string]>' : ''} = [
${labelTuples.join('\n')}
];
${cauchyBlock}
export function evaluateLogic(
  statement${isTs ? ': string' : ''} = LOGIC_STATEMENT,
  labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS,
  systemParser${isTs ? '?: (stmt: string, lbls: Array<[string, string, string]>) => unknown' : ''}
) {
  if (typeof systemParser === 'function') {
    return systemParser(statement, labels);
  }
  return ${JSON.stringify(evalRes.value?.kind === 'closure' ? evalRes.displayValue : evalRes.value?.value ?? null)};
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
    const content = `// Auto-generated Go Logic & Lambda Module
package logiccalc

type LogicLabel struct {
	Name  string
	Kind  string
	Value string
}

const LogicStatement = ${JSON.stringify(translation.translatedStatement)}

var LogicLabels = []LogicLabel{
${entries.join('\n')}
}

func EvaluateLogic(statement string, labels []LogicLabel, systemParser func(string, []LogicLabel) any) any {
	if systemParser != nil {
		return systemParser(statement, labels)
	}
	return ${JSON.stringify(evalRes.displayValue)}
}
`;
    return { content, filename: 'logic_lambda_calc.go', mime: 'text/plain' };
  }

  if (target === 'java') {
    const entries = allLabels.map(
      (l) => `        new LogicLabel(${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)})`
    );
    const content = `// Auto-generated Java Logic & Lambda Module
import java.util.List;
import java.util.function.BiFunction;

public final class LogicLambdaCalc {
    public record LogicLabel(String name, String kind, String value) {}

    public static final String LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
    public static final List<LogicLabel> LOGIC_LABELS = List.of(
${entries.join(',\n')}
    );

    public static Object evaluateLogic(
        String statement,
        List<LogicLabel> labels,
        BiFunction<String, List<LogicLabel>, Object> systemParser
    ) {
        if (systemParser != null) {
            return systemParser.apply(statement, labels);
        }
        return ${JSON.stringify(evalRes.displayValue)};
    }
}
`;
    return { content, filename: 'LogicLambdaCalc.java', mime: 'text/plain' };
  }

  if (target === 'cpp') {
    const entries = allLabels.map(
      (l) => `    {${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}},`
    );
    const content = `// Auto-generated C++20 Logic & Lambda Header
#pragma once
#include <functional>
#include <string>
#include <vector>

namespace logic_calc {

struct LogicLabel {
    std::string name;
    std::string kind;
    std::string value;
};

inline const std::string LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
inline const std::vector<LogicLabel> LOGIC_LABELS = {
${entries.join('\n')}
};

inline std::string evaluate_logic(
    const std::string& statement = LOGIC_STATEMENT,
    const std::vector<LogicLabel>& labels = LOGIC_LABELS,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    if (system_parser) return system_parser(statement, labels);
    return ${JSON.stringify(evalRes.displayValue)};
}

} // namespace logic_calc
`;
    return { content, filename: 'logic_lambda_calc.hpp', mime: 'text/plain' };
  }

  if (target === 'csharp') {
    const entries = allLabels.map(
      (l) => `        new(${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}),`
    );
    const content = `// Auto-generated C# (.NET) Logic & Lambda Module
using System;
using System.Collections.Generic;

namespace GrammarStudio;

public sealed record LogicLabel(string Name, string Kind, string Value);

public static class LogicLambdaCalc
{
    public const string LogicStatement = ${JSON.stringify(translation.translatedStatement)};

    public static readonly IReadOnlyList<LogicLabel> LogicLabels = new List<LogicLabel>
    {
${entries.join('\n')}
    };

    public static object EvaluateLogic(
        string statement = LogicStatement,
        IReadOnlyList<LogicLabel>? labels = null,
        Func<string, IReadOnlyList<LogicLabel>, object>? systemParser = null
    )
    {
        var activeLabels = labels ?? LogicLabels;
        if (systemParser is not null) return systemParser(statement, activeLabels);
        return ${JSON.stringify(evalRes.displayValue)};
    }
}
`;
    return { content, filename: 'LogicLambdaCalc.cs', mime: 'text/plain' };
  }

  if (target === 'php') {
    const entries = allLabels.map(
      (l) => `    [${JSON.stringify(l.name)}, ${JSON.stringify(l.kind)}, ${JSON.stringify(l.value)}],`
    );
    const content = `<?php
// Auto-generated PHP 8 Logic & Lambda Module
declare(strict_types=1);

const LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};
const LOGIC_LABELS = [
${entries.join('\n')}
];

function evaluate_logic(string $statement = LOGIC_STATEMENT, array $labels = LOGIC_LABELS, ?callable $systemParser = null): mixed {
    if ($systemParser !== null) {
        return $systemParser($statement, $labels);
    }
    return ${JSON.stringify(evalRes.displayValue)};
}
`;
    return { content, filename: 'logic_lambda_calc.php', mime: 'application/x-httpd-php' };
  }

  if (target === 'sql') {
    const sqlEsc = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const rows = allLabels.map(
      (l) => `INSERT INTO logic_labels (name, kind, expr_value) VALUES (${sqlEsc(l.name)}, ${sqlEsc(l.kind)}, ${sqlEsc(l.value)});`
    );
    const content = `-- Auto-generated SQL Logic, Labels & Evaluation Record
CREATE TABLE IF NOT EXISTS logic_statements (
  statement TEXT NOT NULL,
  evaluated_result TEXT NOT NULL,
  cauchy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cauchy_limit DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS logic_labels (
  name VARCHAR(128) PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  expr_value TEXT NOT NULL
);

INSERT INTO logic_statements (statement, evaluated_result, cauchy_enabled, cauchy_limit)
VALUES (${sqlEsc(translation.translatedStatement)}, ${sqlEsc(evalRes.displayValue)}, ${cauchy?.enabled ? 'TRUE' : 'FALSE'}, ${cauchyEval?.limitEstimate ?? 'NULL'});

${rows.join('\n')}
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
    const content = `${commentPrefix} Auto-generated ${target.toUpperCase()} Logic, Arithmetic, Lambda & Cauchy Module${commentSuffix}
${commentPrefix} Invokes LOGIC_STATEMENT with LOGIC_LABELS bindings${commentSuffix}
${cauchyNote}
${target === 'swift' ? `public let LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\npublic let LOGIC_LABELS: [String: String] = [\n${allLabels.map((l) => `    ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)}`).join(',\n') || '    :'}\n]\npublic func evaluateLogic() -> String { ${JSON.stringify(evalRes.displayValue)} }` : ''}${target === 'kotlin' ? `const val LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nval LOGIC_LABELS = mapOf(\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} to ${JSON.stringify(l.value)}`).join(',\n')}\n)\nfun evaluateLogic(): String = ${JSON.stringify(evalRes.displayValue)}` : ''}${target === 'ruby' ? `LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nLOGIC_LABELS = {\n${allLabels.map((l) => `  ${JSON.stringify(l.name)} => ${JSON.stringify(l.value)}`).join(",\n")}\n}.freeze\ndef evaluate_logic(labels = LOGIC_LABELS)\n  { statement: LOGIC_STATEMENT, labels: labels, result: ${JSON.stringify(evalRes.displayValue)} }\nend` : ''}${target === 'scala' ? `object LogicModule:\n  val LOGIC_STATEMENT: String = ${JSON.stringify(translation.translatedStatement)}\n  val LOGIC_LABELS: Map[String, String] = Map(\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} -> ${JSON.stringify(l.value)}`).join(',\n')}\n  )\n  def evaluateLogic(): String = ${JSON.stringify(evalRes.displayValue)}` : ''}${target === 'haskell' ? `module LogicLambdaCalc where\nlogicStatement :: String\nlogicStatement = ${JSON.stringify(translation.translatedStatement)}\nlogicLabels :: [(String, String)]\nlogicLabels = [\n${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(',\n')}\n]\nevaluateLogic :: String\nevaluateLogic = ${JSON.stringify(evalRes.displayValue)}` : ''}${target === 'elixir' ? `defmodule LogicLambdaCalc do\n  @logic_statement ${JSON.stringify(translation.translatedStatement)}\n  @logic_labels %{\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} => ${JSON.stringify(l.value)}`).join(',\n')}\n  }\n  def evaluate_logic, do: %{statement: @logic_statement, labels: @logic_labels, result: ${JSON.stringify(evalRes.displayValue)}}\nend` : ''}${target === 'lua' ? `local M = {}\nM.LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nM.LOGIC_LABELS = {\n${allLabels.map((l) => `  [${JSON.stringify(l.name)}] = ${JSON.stringify(l.value)}`).join(',\n')}\n}\nfunction M.evaluate_logic() return ${JSON.stringify(evalRes.displayValue)} end\nreturn M` : ''}${target === 'zig' ? `pub const LOGIC_STATEMENT: []const u8 = ${JSON.stringify(translation.translatedStatement)};\npub const EVALUATED_RESULT: []const u8 = ${JSON.stringify(evalRes.displayValue)};\n// Labels:\n${allLabels.map((l) => `// ${l.name} = ${l.value}`).join('\n')}` : ''}${target === 'dart' ? `const String logicStatement = ${JSON.stringify(translation.translatedStatement)};\nconst Map<String, String> logicLabels = {\n${allLabels.map((l) => `  ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)},`).join('\n')}\n};\nString evaluateLogic() => ${JSON.stringify(evalRes.displayValue)};` : ''}${target === 'ocaml' ? `let logic_statement = ${JSON.stringify(translation.translatedStatement)}\nlet logic_labels = [\n${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(';\n')}\n]\nlet evaluate_logic () = ${JSON.stringify(evalRes.displayValue)}` : ''}
${commentPrefix} Bound labels summary:\n${labelsText
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
  const serializedLabels = labels
    .map((l) => `${l.name}:${l.kind}=${l.value.replace(/["\\;|]/g, '')}`)
    .join(';');
  const cleanData = `stmt=${cleanStmt.replace(/["\\]/g, '')}|labels=${serializedLabels}`;

  const wat = `(module
  ;; Logic, Arithmetic & Lambda Calculus WABT Module
  (memory (export "memory") 1)
  (data (i32.const 0) "${cleanData}")

  ;; Returns evaluated statement result as i32 (1=true, 0=false, or numeric value)
  (func (export "eval_logic") (result i32)
    (i32.const ${numericResult})
  )

  ;; Returns number of bound labels and lambda callbacks
  (func (export "label_count") (result i32)
    (i32.const ${labels.length})
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
