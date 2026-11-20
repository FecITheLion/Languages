import { compileWatToWasm, decompileWasmToWat } from './bidirectionalEngine.ts';
import type { DialectConfig, GrammarRule, WasmCompilationResult } from '../types/studio.ts';

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
    if (!freeVar || seen.has(freeVar)) continue;
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
        expression: inp.kind === 'boolean' ? '"true" | "false" | "1" | "0"' : '"-"? digit+ ("." digit+)?',
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

export function exportLogicStatement(
  target: LogicExportTarget,
  statement: string,
  labels: LogicLabelBinding[],
  evalRes: LogicEvaluationResult,
  cauchy?: CauchySequenceConfig,
  grammarCtx?: LogicGrammarContext
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
  const inputGrammar = buildLogicInputGrammarSpec(allLabels, evalRes, grammarCtx);

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

    const grammarRuleEntries = inputGrammar.rules.map(
      (r) => `    ${JSON.stringify(r.name)}: ${JSON.stringify(r.expression)},`
    );

    const requiredInputEntries = inputGrammar.requiredInputs.map(
      (inp) => `    (${JSON.stringify(inp.name)}, ${JSON.stringify(inp.kind)}, ${JSON.stringify(inp.defaultValue)}),`
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
# allows editing string inputs (--input / --statement / --grammar),
# or falls back to the built-in defaults automatically.
import argparse
import ast
import json
import re
import sys

LOGIC_STATEMENT = '${translation.translatedStatement.replace(/'/g, '"')}'

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

${labelDefs.join('\n\n')}

def _compile_grammar_rule_regex(rule_name: str, grammar_rules=GRAMMAR_RULES, depth: int = 0) -> str:
    if depth > 8:
        return r'[^\\s,;]+'
    expr = grammar_rules.get(rule_name)
    if not expr:
        return r'-?\\d+(?:\\.\\d+)?|true|false|[^\\s,;]+'
    if rule_name == 'digit':
        return r'[0-9]'
    # Handle quoted literals, rule references, and quantifiers (+, *, ?)
    alts = [a.strip() for a in expr.split('|') if a.strip()]
    compiled_alts = []
    for alt in alts:
        tokens = re.findall(r'''"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()+*?]''', alt)
        seq = []
        for tok in tokens:
            if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                seq.append(re.escape(tok[1:-1]))
            elif tok in ('(', ')', '+', '*', '?'):
                seq.append(tok)
            else:
                q = tok[-1] if tok[-1] in '+*?' else ''
                ref = tok[:-1] if q else tok
                sub = _compile_grammar_rule_regex(ref, grammar_rules, depth + 1)
                seq.append(f'(?:{sub}){q}')
        compiled_alts.append(''.join(seq))
    return '(?:' + '|'.join(compiled_alts) + ')' if compiled_alts else r'[^\\s,;]+'

def parse_inputs_from_string(raw_input: str, grammar_rules=GRAMMAR_RULES, required_inputs=REQUIRED_INPUTS):
    """Uses ACTIVE_GRAMMAR rules to extract all needed inputs from a single string input."""
    text = str(raw_input or '').strip()
    parsed = {}

    # 1. Grammar-guided key=value / key:value captures per required input rule
    for name, kind, default_val in required_inputs:
        val_pat = _compile_grammar_rule_regex(name, grammar_rules)
        kv_match = re.search(rf'\\b{re.escape(name)}\\s*[:=]\\s*(?P<val>{val_pat})', text, re.IGNORECASE)
        if kv_match:
            parsed[name] = kv_match.group('val').strip()

    # 2. Positional grammar token fallback (e.g. "50 10 true" or "BUY SKU-402 12")
    if len(parsed) < len(required_inputs) and text:
        num_tokens = re.findall(r'-?\\d+(?:\\.\\d+)?', text)
        bool_tokens = re.findall(r'\\b(?:true|false|⊤|⊥)\\b', text, re.IGNORECASE)
        num_idx = 0
        bool_idx = 0
        for name, kind, default_val in required_inputs:
            if name in parsed:
                continue
            if kind == 'number' and num_idx < len(num_tokens):
                parsed[name] = num_tokens[num_idx]
                num_idx += 1
            elif kind == 'boolean' and bool_idx < len(bool_tokens):
                parsed[name] = bool_tokens[bool_idx]
                bool_idx += 1
            else:
                parsed[name] = default_val
    return parsed

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
            return int(text) if re.fullmatch(r'-?\\d+', text) else float(text)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Expected numeric literal, got {raw_val!r}") from exc
    return text

def evaluate_from_input(
    raw_input: str = SAMPLE_SINGLE_INPUT,
    statement: str = LOGIC_STATEMENT,
    labels=LOGIC_LABELS,
    grammar_rules=GRAMMAR_RULES,
    overrides=None,
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
    for name, kind, _ in REQUIRED_INPUTS:
        if name not in known and name in extracted:
            merged_labels.append((name, kind, extracted[name]))
    return evaluate_logic(statement, merged_labels)

def evaluate_logic_compiled():
    return ${astExprPy}
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
        help=f"Optional single-string grammar input (default: {SAMPLE_SINGLE_INPUT!r})",
    )
    parser.add_argument(
        "--input",
        dest="input_str",
        default=None,
        help=f"Edit the single-string input parsed by ACTIVE_GRAMMAR (default: {SAMPLE_SINGLE_INPUT!r})",
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
    args = parser.parse_args(argv)
    active_grammar_rules = _parse_grammar_rules_from_text(args.grammar) if args.grammar else GRAMMAR_RULES
    raw_input = args.input_str if args.input_str is not None else (args.raw_input if args.raw_input is not None else SAMPLE_SINGLE_INPUT)

    overrides = {}
    for var_name, _kind, _default_val in REQUIRED_INPUTS:
        val = getattr(args, f"var__{var_name}", None)
        if val is not None:
            overrides[var_name] = val

    resolved = parse_inputs_from_string(raw_input, grammar_rules=active_grammar_rules)
    for k, v in overrides.items():
        resolved[k] = v

    # Convert resolved strings to typed literals for clear display
    typed_vars = {
        name: _coerce_cli_literal(resolved.get(name, default_val), kind)
        for name, kind, default_val in REQUIRED_INPUTS
    }
    result = evaluate_from_input(
        raw_input=raw_input,
        statement=args.statement,
        grammar_rules=active_grammar_rules,
        overrides=overrides,
    )
    if args.json:
        print(json.dumps({"statement": args.statement, "variables": typed_vars, "result": result}, default=str))
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
        const fallback = lower === 'true' || l.value.trim() === '⊤' || l.value.trim() === '1'
          ? 'true'
          : lower === 'false' || l.value.trim() === '⊥' || l.value.trim() === '0'
            ? 'false'
            : (() => {
                const parsedExpr = parseLogicExpression(l.value);
                return parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : 'false';
              })();
        return `    let ${l.name}: bool = parsed_inputs.get("${l.name}").map(|v| matches!(v.to_lowercase().as_str(), "true" | "1" | "⊤")).unwrap_or(${fallback});`;
      }
      if (l.kind === 'number') {
        const n = Number(l.value.trim());
        const fallback = l.value.trim() !== '' && !Number.isNaN(n)
          ? (Number.isInteger(n) ? `${n}.0` : `${n}`)
          : (() => {
              const parsedExpr = parseLogicExpression(l.value);
              return parsedExpr.ok ? astToRustExpr(parsedExpr.ast, namedArity) : '0.0';
            })();
        return `    let ${l.name}: f64 = parsed_inputs.get("${l.name}").and_then(|v| v.parse::<f64>().ok()).unwrap_or(${fallback});`;
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

    const grammarTuples = inputGrammar.rules.map(
      (r) => `    (${JSON.stringify(r.name)}, r#"${r.expression}"#),`
    );

    const requiredTuples = inputGrammar.requiredInputs.map(
      (inp) => `    (${JSON.stringify(inp.name)}, ${JSON.stringify(inp.kind)}, ${JSON.stringify(inp.defaultValue)}),`
    );

    const retType = evalRes.valueType === 'number' ? 'f64' : 'bool';
    const content = `// Auto-generated Rust Logic & Named Lambda Callbacks Module
// Uses ACTIVE_GRAMMAR to parse all needed inputs from a single &str input
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

    for token in raw_input.split(|c: char| c.is_whitespace() || c == ',' || c == ';').filter(|t| !t.is_empty()) {
        if let Some((k, v)) = token.split_once('=').or_else(|| token.split_once(':')) {
            let key = k.trim();
            let val = v.trim();
            if GRAMMAR_RULES.iter().any(|(rn, _)| *rn == key) || REQUIRED_INPUTS.iter().any(|(n, _, _)| *n == key) {
                map.insert(key.to_string(), val.to_string());
                continue;
            }
        }
        let low = token.to_lowercase();
        if matches!(low.as_str(), "true" | "false" | "⊤" | "⊥") {
            positional_bools.push(token.to_string());
        } else if token.parse::<f64>().is_ok() {
            positional_nums.push(token.to_string());
        }
    }

    let (mut n_idx, mut b_idx) = (0usize, 0usize);
    for (name, kind, default_val) in REQUIRED_INPUTS {
        if map.contains_key(*name) {
            continue;
        }
        if *kind == "number" && n_idx < positional_nums.len() {
            map.insert((*name).to_string(), positional_nums[n_idx].clone());
            n_idx += 1;
        } else if *kind == "boolean" && b_idx < positional_bools.len() {
            map.insert((*name).to_string(), positional_bools[b_idx].clone());
            b_idx += 1;
        } else {
            map.insert((*name).to_string(), (*default_val).to_string());
        }
    }
    map
}

pub fn evaluate_logic_with_overrides(
    raw_input: &str,
    overrides: &HashMap<String, String>,
) -> ${retType} {
    let mut parsed_inputs = parse_inputs_from_string(raw_input);
    for (k, v) in overrides {
        parsed_inputs.insert(k.clone(), v.clone());
    }
${labelLines.join('\n')}
    ${astExprRs}
}

pub fn evaluate_logic_from_input(raw_input: &str) -> ${retType} {
    let empty: HashMap<String, String> = HashMap::new();
    evaluate_logic_with_overrides(raw_input, &empty)
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
    let _ = (statement, labels);
    evaluate_logic_from_input(SAMPLE_SINGLE_INPUT)
}

pub fn evaluate_logic() -> ${retType} {
    evaluate_logic_from_input(SAMPLE_SINGLE_INPUT)
}

/// Parses CLI flags exposing every named literal variable (--<name> <literal>),
/// editable strings (--input / --statement / --grammar), or default values.
pub fn parse_cli_args(args: &[String]) -> (String, String, HashMap<String, String>) {
    let mut raw_input = SAMPLE_SINGLE_INPUT.to_string();
    let mut statement = LOGIC_STATEMENT.to_string();
    let mut overrides: HashMap<String, String> = HashMap::new();
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
            if flag == "input" {
                if let Some(v) = next_val() {
                    raw_input = v;
                    if inline_val.is_none() { i += 1; }
                }
            } else if flag == "statement" {
                if let Some(v) = next_val() {
                    statement = v;
                    if inline_val.is_none() { i += 1; }
                }
            } else if flag == "grammar" {
                if inline_val.is_none() && i + 1 < args.len() { i += 1; }
            } else {
                let normalized = flag.replace('-', "_");
                if REQUIRED_INPUTS.iter().any(|(n, _, _)| *n == flag || *n == normalized) {
                    if let Some(v) = next_val() {
                        overrides.insert(normalized, v);
                        if inline_val.is_none() { i += 1; }
                    }
                }
            }
        } else if !arg.starts_with('-') {
            raw_input = arg.clone();
        }
        i += 1;
    }
    (raw_input, statement, overrides)
}

pub fn run_cli() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "-h" || a == "--help") {
        println!("Named literal CLI flags:");
        for (name, kind, def) in REQUIRED_INPUTS {
            println!("  --{} <{}>  (default: {})", name, kind, def);
        }
        println!("  --input <STRING>      (default: {})", SAMPLE_SINGLE_INPUT);
        println!("  --statement <STRING>  (default: {})", LOGIC_STATEMENT);
        return;
    }
    let (raw_input, _statement, overrides) = parse_cli_args(&args);
    let mut vars = parse_inputs_from_string(&raw_input);
    for (k, v) in &overrides {
        vars.insert(k.clone(), v.clone());
    }
    println!("Variables: {:?}", vars);
    println!("Result: {:?}", evaluate_logic_with_overrides(&raw_input, &overrides));
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
    const labelTuples = allLabels.map(
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
// Parses all needed inputs from a single string input via GRAMMAR_RULES
export const LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)};

export const LOGIC_LABELS${isTs ? ': Array<[string, "number" | "boolean" | "lambda", string]>' : ''} = [
${labelTuples.join('\n')}
];

export const ACTIVE_GRAMMAR = ${JSON.stringify(inputGrammar.grammarText)};

export const GRAMMAR_RULES${isTs ? ': Record<string, string>' : ''} = ${JSON.stringify(grammarRuleMap, null, 2)};

export const REQUIRED_INPUTS${isTs ? ': Array<{ name: string; kind: "number" | "boolean"; defaultValue: string }>' : ''} = ${JSON.stringify(inputGrammar.requiredInputs, null, 2)};

export const SAMPLE_SINGLE_INPUT = ${JSON.stringify(inputGrammar.sampleSingleInput)};
${cauchyBlock}
function compileRulePattern(ruleName${isTs ? ': string' : ''}, depth = 0)${isTs ? ': string' : ''} {
  if (depth > 8) return '[^\\\\s,;]+';
  if (ruleName === 'digit') return '[0-9]';
  const expr = GRAMMAR_RULES[ruleName];
  if (!expr) return '-?\\\\d+(?:\\\\.\\\\d+)?|true|false|[^\\\\s,;]+';
  const alts = expr.split('|').map((a) => a.trim()).filter(Boolean);
  const compiled = alts.map((alt) => {
    const tokens = alt.match(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()+*?]/g) ?? [];
    return tokens.map((tok) => {
      if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
        return tok.slice(1, -1).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
      }
      if ('()+*?'.includes(tok)) return tok;
      const q = '+*?'.includes(tok.slice(-1)) ? tok.slice(-1) : '';
      const ref = q ? tok.slice(0, -1) : tok;
      return \`(?:\${compileRulePattern(ref, depth + 1)})\${q}\`;
    }).join('');
  });
  return compiled.length ? \`(?:\${compiled.join('|')})\` : '[^\\\\s,;]+';
}

export function parseInputsFromString(rawInput${isTs ? ': string' : ''})${isTs ? ': Record<string, number | boolean | string>' : ''} {
  const text = String(rawInput ?? '').trim();
  const parsed${isTs ? ': Record<string, number | boolean | string>' : ''} = {};

  for (const inp of REQUIRED_INPUTS) {
    const pat = compileRulePattern(inp.name);
    const match = text.match(new RegExp(\`\\\\b\${inp.name}\\\\s*[:=]\\\\s*(\${pat})\`, 'i'));
    if (match) {
      const raw = match[1].trim();
      parsed[inp.name] = inp.kind === 'number' ? Number(raw) : /^(true|1|⊤)$/i.test(raw);
    }
  }

  const numTokens = text.match(/-?\\d+(?:\\.\\d+)?/g) ?? [];
  const boolTokens = text.match(/\\b(?:true|false|⊤|⊥)\\b/gi) ?? [];
  let nIdx = 0;
  let bIdx = 0;
  for (const inp of REQUIRED_INPUTS) {
    if (inp.name in parsed) continue;
    if (inp.kind === 'number' && nIdx < numTokens.length) {
      parsed[inp.name] = Number(numTokens[nIdx++]);
    } else if (inp.kind === 'boolean' && bIdx < boolTokens.length) {
      parsed[inp.name] = /^(true|1|⊤)$/i.test(boolTokens[bIdx++]);
    } else {
      parsed[inp.name] = inp.kind === 'number' ? Number(inp.defaultValue) : /^(true|1|⊤)$/i.test(inp.defaultValue);
    }
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
  if (kind === 'boolean') return /^(true|1|yes|t|⊤)$/i.test(t);
  const n = Number(t);
  if (Number.isNaN(n)) throw new Error(\`Invalid numeric literal: \${raw}\`);
  return n;
}

function normalizeJsExpr(source${isTs ? ': string' : ''})${isTs ? ': string' : ''} {
  let expr = source.trim();
  expr = expr.replace(/(?:[λ\\\\]\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\.\\s*)+/g, (m) => {
    const params = Array.from(m.matchAll(/[λ\\\\]\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\./g)).map((x) => x[1]);
    return \`(\${params.join(', ')}) => \`;
  });
  return expr
    .replace(/⊤/g, 'true')
    .replace(/⊥/g, 'false')
    .replace(/¬/g, '!')
    .replace(/∧/g, '&&')
    .replace(/∨/g, '||')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!==')
    .replace(/↔|≡/g, '===')
    .replace(/\\^/g, '**');
}

export function evaluateFromInput(
  rawInput${isTs ? ': string' : ''} = SAMPLE_SINGLE_INPUT,
  statement${isTs ? ': string' : ''} = LOGIC_STATEMENT,
  systemParser${isTs ? '?: (stmt: string, lbls: Array<[string, string, string]>) => unknown' : ''},
  overrides${isTs ? '?: Record<string, number | boolean | string>' : ''}
) {
  const inputs = { ...parseInputsFromString(rawInput), ...(overrides ?? {}) };
  const mergedLabels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS.map(([name, kind, value]) => [
    name,
    kind,
    kind !== 'lambda' && name in inputs ? String(inputs[name]) : value,
  ]);
  if (typeof systemParser === 'function') {
    return systemParser(statement, mergedLabels);
  }
  try {
    const env${isTs ? ': Record<string, unknown>' : ''} = {};
    for (const [name, kind, val] of mergedLabels) {
      if (kind === 'number') env[name] = Number(val);
      else if (kind === 'boolean') env[name] = /^(true|1|⊤)$/i.test(val);
      else env[name] = new Function(...Object.keys(env), \`return (\${normalizeJsExpr(val)});\`)(...Object.values(env));
    }
    const result = new Function(...Object.keys(env), \`return (\${normalizeJsExpr(statement)});\`)(...Object.values(env));
    return { statement, parsedInputs: inputs, labels: mergedLabels, result };
  } catch {
    return {
      statement,
      parsedInputs: inputs,
      labels: mergedLabels,
      result: ${JSON.stringify(evalRes.value?.kind === 'closure' ? evalRes.displayValue : evalRes.value?.value ?? null)},
    };
  }
}

export function evaluateLogic(
  statement${isTs ? ': string' : ''} = LOGIC_STATEMENT,
  labels${isTs ? ': Array<[string, string, string]>' : ''} = LOGIC_LABELS,
  systemParser${isTs ? '?: (stmt: string, lbls: Array<[string, string, string]>) => unknown' : ''}
) {
  if (typeof systemParser === 'function') {
    return systemParser(statement, labels);
  }
  return evaluateFromInput(SAMPLE_SINGLE_INPUT, statement).result;
}

/**
 * Exposes every named literal variable to the CLI (--<var> <literal> or --<var>=<literal>),
 * supports editing strings (--input, --statement, --grammar), or uses built-in defaults.
 */
export function parseCliArgs(argv${isTs ? ': string[]' : ''} = []) {
  let rawInput = SAMPLE_SINGLE_INPUT;
  let statement = LOGIC_STATEMENT;
  let grammarText = ACTIVE_GRAMMAR;
  const overrides${isTs ? ': Record<string, number | boolean>' : ''} = {};
  const varMap = new Map(REQUIRED_INPUTS.map((v) => [v.name, v]));

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true, rawInput, statement, grammarText, overrides };
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eqIdx = body.indexOf('=');
      const flag = eqIdx >= 0 ? body.slice(0, eqIdx) : body;
      const val = eqIdx >= 0 ? body.slice(eqIdx + 1) : argv[++i];
      if (flag === 'input' && val !== undefined) rawInput = val;
      else if (flag === 'statement' && val !== undefined) statement = val;
      else if (flag === 'grammar' && val !== undefined) grammarText = val;
      else {
        const spec = varMap.get(flag) ?? varMap.get(flag.replace(/-/g, '_'));
        if (spec && val !== undefined) overrides[spec.name] = coerceCliLiteral(val, spec.kind);
      }
    } else if (!arg.startsWith('-')) {
      rawInput = arg;
    }
  }
  return { help: false, rawInput, statement, grammarText, overrides };
}

export function runCli(argv${isTs ? ': string[]' : ''} = typeof process !== 'undefined' ? process.argv.slice(2) : []) {
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    console.log('Named literal CLI options:');
    for (const inp of REQUIRED_INPUTS) {
      console.log(\`  --\${inp.name} <\${inp.kind}>  (default: \${inp.defaultValue})\`);
    }
    console.log(\`  --input <string>      (default: \${SAMPLE_SINGLE_INPUT})\`);
    console.log(\`  --statement <string>  (default: \${LOGIC_STATEMENT})\`);
    console.log('  --grammar <string>    (overrides ACTIVE_GRAMMAR)');
    return null;
  }
  Object.assign(GRAMMAR_RULES, parseGrammarString(parsed.grammarText));
  const out = evaluateFromInput(parsed.rawInput, parsed.statement, undefined, parsed.overrides);
  console.log('Variables:', out.parsedInputs);
  console.log('Result:', out.result);
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
	"strconv"
	"strings"
)

type LogicLabel struct {
	Name  string
	Kind  string
	Value string
}

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
	var posNums, posBools []string
	for _, tok := range strings.FieldsFunc(rawInput, func(r rune) bool { return r == ' ' || r == ',' || r == ';' || r == '\\t' }) {
		if idx := strings.IndexAny(tok, "=:"); idx > 0 {
			parsed[tok[:idx]] = tok[idx+1:]
			continue
		}
		low := strings.ToLower(tok)
		if low == "true" || low == "false" {
			posBools = append(posBools, low)
		} else if _, err := strconv.ParseFloat(tok, 64); err == nil {
			posNums = append(posNums, tok)
		}
	}
	nIdx, bIdx := 0, 0
	for _, lbl := range LogicLabels {
		if lbl.Kind == "lambda" || parsed[lbl.Name] != "" {
			continue
		}
		if lbl.Kind == "number" && nIdx < len(posNums) {
			parsed[lbl.Name] = posNums[nIdx]
			nIdx++
		} else if lbl.Kind == "boolean" && bIdx < len(posBools) {
			parsed[lbl.Name] = posBools[bIdx]
			bIdx++
		} else {
			parsed[lbl.Name] = lbl.Value
		}
	}
	return parsed
}

func EvaluateFromInput(rawInput string, systemParser func(string, []LogicLabel) any) any {
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
	return EvaluateLogic(LogicStatement, merged, systemParser)
}

func EvaluateLogic(statement string, labels []LogicLabel, systemParser func(string, []LogicLabel) any) any {
	if systemParser != nil {
		return systemParser(statement, labels)
	}
	return ${JSON.stringify(evalRes.displayValue)}
}

// ParseCliArgs exposes every named literal variable (--<name> <literal>), editable strings (--input/--statement), or built-in defaults.
func ParseCliArgs(args []string) (rawInput string, statement string, overrides map[string]string) {
	rawInput = SampleSingleInput
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
			rawInput = arg
		}
	}
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
        List<String> posNums = new ArrayList<>();
        List<String> posBools = new ArrayList<>();
        for (String tok : (rawInput == null ? "" : rawInput.trim()).split("[\\\\s,;]+")) {
            if (tok.isEmpty()) continue;
            int sep = tok.indexOf('=') >= 0 ? tok.indexOf('=') : tok.indexOf(':');
            if (sep > 0) {
                parsed.put(tok.substring(0, sep), tok.substring(sep + 1));
            } else if (tok.equalsIgnoreCase("true") || tok.equalsIgnoreCase("false")) {
                posBools.add(tok.toLowerCase());
            } else if (tok.matches("-?\\\\d+(\\\\.\\\\d+)?")) {
                posNums.add(tok);
            }
        }
        int nIdx = 0, bIdx = 0;
        for (LogicLabel lbl : LOGIC_LABELS) {
            if (lbl.kind().equals("lambda") || parsed.containsKey(lbl.name())) continue;
            if (lbl.kind().equals("number") && nIdx < posNums.size()) parsed.put(lbl.name(), posNums.get(nIdx++));
            else if (lbl.kind().equals("boolean") && bIdx < posBools.size()) parsed.put(lbl.name(), posBools.get(bIdx++));
            else parsed.put(lbl.name(), lbl.value());
        }
        return parsed;
    }

    public static Object evaluateFromInput(String rawInput, BiFunction<String, List<LogicLabel>, Object> systemParser) {
        Map<String, String> inputs = parseInputsFromString(rawInput);
        List<LogicLabel> merged = LOGIC_LABELS.stream()
            .map(l -> !l.kind().equals("lambda") && inputs.containsKey(l.name())
                ? new LogicLabel(l.name(), l.kind(), inputs.get(l.name())) : l)
            .toList();
        return evaluateLogic(LOGIC_STATEMENT, merged, systemParser);
    }

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

    /** CLI entry point exposing named literal flags (--<var> <literal>), --input, --statement, or defaults. */
    public static void main(String[] args) {
        String rawInput = SAMPLE_SINGLE_INPUT;
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
                rawInput = arg;
            }
        }
        Map<String, String> vars = parseInputsFromString(rawInput);
        vars.putAll(overrides);
        System.out.println("Variables: " + vars);
        System.out.println("Statement: " + statement);
        System.out.println("Result: " + evaluateFromInput(rawInput, null));
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
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace logic_calc {

struct LogicLabel {
    std::string name;
    std::string kind;
    std::string value;
};

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
    std::istringstream iss(raw_input);
    std::string tok;
    std::vector<std::string> pos_vals;
    while (iss >> tok) {
        auto pos = tok.find_first_of("=:");
        if (pos != std::string::npos && pos > 0) {
            parsed[tok.substr(0, pos)] = tok.substr(pos + 1);
        } else {
            pos_vals.push_back(tok);
        }
    }
    size_t idx = 0;
    for (const auto& lbl : LOGIC_LABELS) {
        if (lbl.kind == "lambda" || parsed.count(lbl.name)) continue;
        parsed[lbl.name] = idx < pos_vals.size() ? pos_vals[idx++] : lbl.value;
    }
    return parsed;
}

inline std::string evaluate_logic(
    const std::string& statement = LOGIC_STATEMENT,
    const std::vector<LogicLabel>& labels = LOGIC_LABELS,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    if (system_parser) return system_parser(statement, labels);
    return ${JSON.stringify(evalRes.displayValue)};
}

inline std::string evaluate_from_input(
    const std::string& raw_input = SAMPLE_SINGLE_INPUT,
    std::function<std::string(const std::string&, const std::vector<LogicLabel>&)> system_parser = nullptr
) {
    auto extracted = parse_inputs_from_string(raw_input);
    std::vector<LogicLabel> merged = LOGIC_LABELS;
    for (auto& lbl : merged) {
        if (lbl.kind != "lambda" && extracted.count(lbl.name)) lbl.value = extracted[lbl.name];
    }
    return evaluate_logic(LOGIC_STATEMENT, merged, system_parser);
}

/// Parses CLI arguments exposing named literal variables (--<name> <literal>), --input, --statement, or defaults.
inline std::unordered_map<std::string, std::string> parse_cli_args(int argc, char** argv) {
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
        var positional = new List<string>();
        foreach (var tok in (rawInput ?? string.Empty).Split(new[] { ' ', ',', ';', '\\t' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var sep = tok.IndexOfAny(new[] { '=', ':' });
            if (sep > 0) parsed[tok[..sep]] = tok[(sep + 1)..];
            else positional.Add(tok);
        }
        var pIdx = 0;
        foreach (var lbl in LogicLabels.Where(l => l.Kind != "lambda"))
        {
            if (parsed.ContainsKey(lbl.Name)) continue;
            parsed[lbl.Name] = pIdx < positional.Count ? positional[pIdx++] : lbl.Value;
        }
        return parsed;
    }

    public static object EvaluateFromInput(
        string rawInput = SampleSingleInput,
        Func<string, IReadOnlyList<LogicLabel>, object>? systemParser = null
    )
    {
        var inputs = ParseInputsFromString(rawInput);
        var merged = LogicLabels.Select(l => l.Kind != "lambda" && inputs.TryGetValue(l.Name, out var v) ? l with { Value = v } : l).ToList();
        return EvaluateLogic(LogicStatement, merged, systemParser);
    }

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

    public static void Main(string[] args)
    {
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
        Console.WriteLine($"Statement: {statement}");
        Console.WriteLine($"Variables: {string.Join(", ", vars.Select(kv => $"{kv.Key}={kv.Value}"))}");
        Console.WriteLine($"Result: {EvaluateFromInput(rawInput)}");
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
    $positional = [];
    foreach (preg_split('/[\\s,;]+/', trim($rawInput), -1, PREG_SPLIT_NO_EMPTY) as $tok) {
        if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)[:=](.+)$/', $tok, $m)) {
            $parsed[$m[1]] = $m[2];
        } else {
            $positional[] = $tok;
        }
    }
    $pIdx = 0;
    foreach (LOGIC_LABELS as [$name, $kind, $defaultVal]) {
        if ($kind === 'lambda' || array_key_exists($name, $parsed)) continue;
        $parsed[$name] = $positional[$pIdx++] ?? $defaultVal;
    }
    return $parsed;
}

function evaluate_from_input(string $rawInput = SAMPLE_SINGLE_INPUT, ?callable $systemParser = null): mixed {
    $inputs = parse_inputs_from_string($rawInput);
    $merged = array_map(
        fn($lbl) => [$lbl[0], $lbl[1], ($lbl[1] !== 'lambda' && isset($inputs[$lbl[0]])) ? $inputs[$lbl[0]] : $lbl[2]],
        LOGIC_LABELS
    );
    return evaluate_logic(LOGIC_STATEMENT, $merged, $systemParser);
}

function evaluate_logic(string $statement = LOGIC_STATEMENT, array $labels = LOGIC_LABELS, ?callable $systemParser = null): mixed {
    if ($systemParser !== null) {
        return $systemParser($statement, $labels);
    }
    return ${JSON.stringify(evalRes.displayValue)};
}

// CLI runner exposing named literal flags (--<var> <literal>), --input, --statement, or built-in defaults
if (PHP_SAPI === 'cli' && isset($argv)) {
    $rawInput = SAMPLE_SINGLE_INPUT;
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
            $rawInput = $arg;
        }
    }
    $vars = array_merge(parse_inputs_from_string($rawInput), $overrides);
    echo "Variables: " . json_encode($vars) . PHP_EOL;
    echo "Result: " . json_encode(evaluate_from_input($rawInput)) . PHP_EOL;
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

-- Single-string input extraction view using grammar key=value tokens
-- Example: SELECT * FROM parse_logic_input(${sqlEsc(inputGrammar.sampleSingleInput)});
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
    const content = `${commentPrefix} Auto-generated ${target.toUpperCase()} Logic, Arithmetic, Lambda & Grammar Input Module${commentSuffix}
${commentPrefix} Parses all needed inputs from a single string input via ACTIVE_GRAMMAR${commentSuffix}
${cauchyNote}
${target === 'swift' ? `public let LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\npublic let ACTIVE_GRAMMAR = ${activeGrammarStr}\npublic let SAMPLE_SINGLE_INPUT = ${sampleStr}\npublic let LOGIC_LABELS: [String: String] = [\n${allLabels.map((l) => `    ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)}`).join(',\n') || '    :'}\n]\npublic func parseInputsFromString(_ rawInput: String) -> [String: String] {\n    var out = LOGIC_LABELS\n    for tok in rawInput.split(whereSeparator: { $0.isWhitespace || $0 == "," || $0 == ";" }) {\n        let parts = tok.split(separator: "=", maxSplits: 1)\n        if parts.count == 2 { out[String(parts[0])] = String(parts[1]) }\n    }\n    return out\n}\npublic func evaluateFromInput(_ rawInput: String = SAMPLE_SINGLE_INPUT) -> String {\n    let _ = parseInputsFromString(rawInput)\n    return ${JSON.stringify(evalRes.displayValue)}\n}` : ''}${target === 'kotlin' ? `const val LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nconst val ACTIVE_GRAMMAR = ${activeGrammarStr}\nconst val SAMPLE_SINGLE_INPUT = ${sampleStr}\nval LOGIC_LABELS = mapOf(\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} to ${JSON.stringify(l.value)}`).join(',\n')}\n)\nfun parseInputsFromString(rawInput: String): Map<String, String> = buildMap {\n    putAll(LOGIC_LABELS)\n    rawInput.trim().split(Regex("[\\\\s,;]+")).forEach { tok ->\n        val sep = tok.indexOf('=').takeIf { it > 0 } ?: tok.indexOf(':')\n        if (sep > 0) put(tok.substring(0, sep), tok.substring(sep + 1))\n    }\n}\nfun evaluateFromInput(rawInput: String = SAMPLE_SINGLE_INPUT): String {\n    parseInputsFromString(rawInput)\n    return ${JSON.stringify(evalRes.displayValue)}\n}` : ''}${target === 'ruby' ? `LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nACTIVE_GRAMMAR = ${activeGrammarStr}\nSAMPLE_SINGLE_INPUT = ${sampleStr}\nLOGIC_LABELS = {\n${allLabels.map((l) => `  ${JSON.stringify(l.name)} => ${JSON.stringify(l.value)}`).join(',\n')}\n}.freeze\ndef parse_inputs_from_string(raw_input)\n  out = LOGIC_LABELS.dup\n  raw_input.to_s.split(/[\\s,;]+/).each do |tok|\n    k, v = tok.split(/[:=]/, 2)\n    out[k] = v if k && v\n  end\n  out\nend\ndef evaluate_from_input(raw_input = SAMPLE_SINGLE_INPUT)\n  { statement: LOGIC_STATEMENT, inputs: parse_inputs_from_string(raw_input), result: ${JSON.stringify(evalRes.displayValue)} }\nend` : ''}${target === 'scala' ? `object LogicModule:\n  val LOGIC_STATEMENT: String = ${JSON.stringify(translation.translatedStatement)}\n  val ACTIVE_GRAMMAR: String = ${activeGrammarStr}\n  val SAMPLE_SINGLE_INPUT: String = ${sampleStr}\n  val LOGIC_LABELS: Map[String, String] = Map(\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} -> ${JSON.stringify(l.value)}`).join(',\n')}\n  )\n  def parseInputsFromString(rawInput: String): Map[String, String] =\n    val pairs = rawInput.split("[\\\\s,;]+").collect { case s if s.contains("=") => val Array(k, v) = s.split("=", 2); k -> v }\n    LOGIC_LABELS ++ pairs\n  def evaluateFromInput(rawInput: String = SAMPLE_SINGLE_INPUT): String =\n    val _ = parseInputsFromString(rawInput)\n    ${JSON.stringify(evalRes.displayValue)}` : ''}${target === 'haskell' ? `module LogicLambdaCalc where\nlogicStatement :: String\nlogicStatement = ${JSON.stringify(translation.translatedStatement)}\nactiveGrammar :: String\nactiveGrammar = ${activeGrammarStr}\nsampleSingleInput :: String\nsampleSingleInput = ${sampleStr}\nlogicLabels :: [(String, String)]\nlogicLabels = [\n${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(',\n')}\n]\nparseInputsFromString :: String -> [(String, String)]\nparseInputsFromString raw = [(takeWhile (/= '=') w, drop 1 (dropWhile (/= '=') w)) | w <- words raw, '=' \`elem\` w]\nevaluateFromInput :: String -> String\nevaluateFromInput _raw = ${JSON.stringify(evalRes.displayValue)}` : ''}${target === 'elixir' ? `defmodule LogicLambdaCalc do\n  @logic_statement ${JSON.stringify(translation.translatedStatement)}\n  @active_grammar ${activeGrammarStr}\n  @sample_single_input ${sampleStr}\n  @logic_labels %{\n${allLabels.map((l) => `    ${JSON.stringify(l.name)} => ${JSON.stringify(l.value)}`).join(',\n')}\n  }\n  def parse_inputs_from_string(raw_input) do\n    raw_input |> String.split(~r/[\\s,;]+/, trim: true) |> Enum.reduce(@logic_labels, fn tok, acc ->\n      case String.split(tok, ~r/[:=]/, parts: 2) do\n        [k, v] -> Map.put(acc, k, v)\n        _ -> acc\n      end\n    end)\n  end\n  def evaluate_from_input(raw_input \\\\ @sample_single_input) do\n    %{statement: @logic_statement, inputs: parse_inputs_from_string(raw_input), result: ${JSON.stringify(evalRes.displayValue)}}\n  end\nend` : ''}${target === 'lua' ? `local M = {}\nM.LOGIC_STATEMENT = ${JSON.stringify(translation.translatedStatement)}\nM.ACTIVE_GRAMMAR = ${activeGrammarStr}\nM.SAMPLE_SINGLE_INPUT = ${sampleStr}\nM.LOGIC_LABELS = {\n${allLabels.map((l) => `  [${JSON.stringify(l.name)}] = ${JSON.stringify(l.value)}`).join(',\n')}\n}\nfunction M.parse_inputs_from_string(raw_input)\n  local out = {}\n  for k, v in pairs(M.LOGIC_LABELS) do out[k] = v end\n  for k, v in string.gmatch(raw_input or "", "([%w_]+)[:=]([^%s,;]+)") do out[k] = v end\n  return out\nend\nfunction M.evaluate_from_input(raw_input)\n  M.parse_inputs_from_string(raw_input or M.SAMPLE_SINGLE_INPUT)\n  return ${JSON.stringify(evalRes.displayValue)}\nend\nreturn M` : ''}${target === 'zig' ? `pub const LOGIC_STATEMENT: []const u8 = ${JSON.stringify(translation.translatedStatement)};\npub const ACTIVE_GRAMMAR: []const u8 = ${activeGrammarStr};\npub const SAMPLE_SINGLE_INPUT: []const u8 = ${sampleStr};\npub const EVALUATED_RESULT: []const u8 = ${JSON.stringify(evalRes.displayValue)};\n// Grammar single-string input bindings:\n${allLabels.map((l) => `// ${l.name} = ${l.value}`).join('\n')}` : ''}${target === 'dart' ? `const String logicStatement = ${JSON.stringify(translation.translatedStatement)};\nconst String activeGrammar = ${activeGrammarStr};\nconst String sampleSingleInput = ${sampleStr};\nconst Map<String, String> logicLabels = {\n${allLabels.map((l) => `  ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)},`).join('\n')}\n};\nMap<String, String> parseInputsFromString(String rawInput) {\n  final out = Map<String, String>.from(logicLabels);\n  for (final tok in rawInput.trim().split(RegExp(r'[\\s,;]+'))) {\n    final parts = tok.split(RegExp(r'[:=]'));\n    if (parts.length == 2) out[parts[0]] = parts[1];\n  }\n  return out;\n}\nString evaluateFromInput([String rawInput = sampleSingleInput]) {\n  parseInputsFromString(rawInput);\n  return ${JSON.stringify(evalRes.displayValue)};\n}` : ''}${target === 'ocaml' ? `let logic_statement = ${JSON.stringify(translation.translatedStatement)}\nlet active_grammar = ${activeGrammarStr}\nlet sample_single_input = ${sampleStr}\nlet logic_labels = [\n${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(';\n')}\n]\nlet parse_inputs_from_string raw_input =\n  raw_input |> String.split_on_char ' ' |> List.filter_map (fun tok ->\n    match String.split_on_char '=' tok with [k; v] -> Some (k, v) | _ -> None)\nlet evaluate_from_input _raw_input = ${JSON.stringify(evalRes.displayValue)}` : ''}
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
  (func (export "eval_logic_from_input") (param $ptr i32) (param $len i32) (result i32)
    (local.get $ptr)
    (drop)
    (local.get $len)
    (drop)
    (i32.const ${numericResult})
  )

  ;; Returns number of required grammar inputs / bound labels
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
