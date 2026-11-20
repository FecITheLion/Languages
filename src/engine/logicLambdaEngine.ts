import { compileWatToWasm, decompileWasmToWat } from './bidirectionalEngine';
import type { WasmCompilationResult } from '../types/studio';

export type LogicExportTarget = 'python' | 'jsonld' | 'rust' | 'wat' | 'wasm';

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

  // Bind labels in declaration order so callbacks can reference earlier labels
  for (const lbl of labels) {
    const cleanName = lbl.name.trim();
    if (!cleanName) continue;
    const rawVal = lbl.value.trim();
    if (lbl.kind === 'boolean') {
      const b = rawVal.toLowerCase() === 'true' || rawVal === '⊤' || rawVal === '1';
      env.set(cleanName, { kind: 'boolean', value: b });
      trace.push({ step: trace.length + 1, kind: 'bind', expression: `${cleanName} := ${b ? '⊤' : '⊥'}`, result: b ? '⊤' : '⊥' });
    } else if (lbl.kind === 'number') {
      const n = Number(rawVal);
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
          error: `Label "${cleanName}" has non-numeric value "${rawVal}".`,
        };
      }
      env.set(cleanName, { kind: 'number', value: n });
      trace.push({ step: trace.length + 1, kind: 'bind', expression: `${cleanName} := ${n}`, result: String(n) });
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
 * 3. MULTI-LANGUAGE EXPORTERS (PYTHON, JSON-LD, RUST, WABT, REAL WASM BINARY)
 * ========================================================================== */

function astToPythonExpr(node: LogicAstNode): string {
  switch (node.type) {
    case 'NumberLit':
      return String(node.value);
    case 'BoolLit':
      return node.value ? 'True' : 'False';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return node.op === '¬' ? `(not ${astToPythonExpr(node.operand)})` : `(-${astToPythonExpr(node.operand)})`;
    case 'BinaryOp': {
      const l = astToPythonExpr(node.left);
      const r = astToPythonExpr(node.right);
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
      return `${fn}(${astToPythonExpr(node.body)} for ${node.variable} in (False, True))`;
    }
    case 'Lambda':
      return `(lambda ${node.param}: ${astToPythonExpr(node.body)})`;
    case 'Call':
      return `${astToPythonExpr(node.callee)}(${astToPythonExpr(node.arg)})`;
  }
}

function astToRustExpr(node: LogicAstNode): string {
  switch (node.type) {
    case 'NumberLit':
      return Number.isInteger(node.value) ? `${node.value}.0_f64` : `${node.value}_f64`;
    case 'BoolLit':
      return node.value ? 'true' : 'false';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return node.op === '¬' ? `(!${astToRustExpr(node.operand)})` : `(-${astToRustExpr(node.operand)})`;
    case 'BinaryOp': {
      const l = astToRustExpr(node.left);
      const r = astToRustExpr(node.right);
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
      return `[false, true].into_iter().${method}(|${node.variable}| ${astToRustExpr(node.body)})`;
    }
    case 'Lambda':
      return `(|${node.param}| ${astToRustExpr(node.body)})`;
    case 'Call':
      return `${astToRustExpr(node.callee)}(${astToRustExpr(node.arg)})`;
  }
}

export function exportLogicStatement(
  target: LogicExportTarget,
  statement: string,
  labels: LogicLabelBinding[],
  evalRes: LogicEvaluationResult
): {
  content: string;
  filename: string;
  mime: string;
  wasm?: WasmCompilationResult;
} {
  const cleanStmt = statement.trim();
  const astExprPy = evalRes.ast ? astToPythonExpr(evalRes.ast) : 'None';
  const astExprRs = evalRes.ast ? astToRustExpr(evalRes.ast) : 'false';

  if (target === 'python') {
    const labelDefs = labels.map((l) => {
      if (l.kind === 'boolean') {
        const b = l.value.toLowerCase() === 'true' || l.value === '⊤' ? 'True' : 'False';
        return `${l.name} = ${b}`;
      }
      if (l.kind === 'number') {
        return `${l.name} = ${l.value}`;
      }
      const parsedCb = parseLogicExpression(l.value);
      return `${l.name} = ${parsedCb.ok ? astToPythonExpr(parsedCb.ast) : 'lambda x: x'}`;
    });

    const metaEntries = labels.map(
      (l) => `    ("${l.name}", "${l.kind}", "${l.value.replace(/"/g, "'")}"),`
    );

    const content = `# Logic, Labeled Arithmetic & Lambda Calculus Module
LOGIC_STATEMENT = '${cleanStmt.replace(/'/g, '"')}'

LOGIC_LABELS = [
${metaEntries.join('\n')}
]

${labelDefs.join('\n')}

def evaluate_logic():
    return ${astExprPy}

if __name__ == '__main__':
    print('Result:', evaluate_logic())
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
      'x-labels': labels.map((l) => ({
        name: l.name,
        kind: l.kind,
        value: l.value,
      })),
      'x-evaluation': {
        ok: evalRes.ok,
        valueType: evalRes.valueType,
        displayValue: evalRes.displayValue,
      },
      'x-ast': evalRes.ast,
    };
    return {
      content: JSON.stringify(doc, null, 2),
      filename: 'logic_lambda_calc.jsonld',
      mime: 'application/ld+json',
    };
  }

  if (target === 'rust') {
    const labelLines = labels.map((l) => {
      if (l.kind === 'boolean') {
        const b = l.value.toLowerCase() === 'true' || l.value === '⊤' ? 'true' : 'false';
        return `    let ${l.name}: bool = ${b};`;
      }
      if (l.kind === 'number') {
        const n = Number(l.value);
        return `    let ${l.name}: f64 = ${Number.isInteger(n) ? `${n}.0` : n};`;
      }
      const parsedCb = parseLogicExpression(l.value);
      return `    let ${l.name} = ${parsedCb.ok ? astToRustExpr(parsedCb.ast) : '|x: f64| x'};`;
    });

    const specTuples = labels.map(
      (l) => `    ("${l.name}", "${l.kind}", r#"${l.value}"#),`
    );

    const retType = evalRes.valueType === 'number' ? 'f64' : 'bool';
    const content = `// Auto-generated Rust Logic & Lambda Calculus Module
pub const LOGIC_STATEMENT: &str = r#"${cleanStmt}"#;

pub const LOGIC_LABELS: &[(&str, &str, &str)] = &[
${specTuples.join('\n')}
];

pub fn evaluate_logic() -> ${retType} {
${labelLines.join('\n')}
    ${astExprRs}
}
`;
    return { content, filename: 'logic_lambda_calc.rs', mime: 'text/plain' };
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
