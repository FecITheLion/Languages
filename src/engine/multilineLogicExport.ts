import { SUPPORTED_LANGUAGES, type PrimaryLanguage } from '../types/studio';

/**
 * Ported Multi-Language Compiler (all 22 supported languages) & Zero-Dependency
 * WebAssembly (.wasm / .wat) Binary Encoder for the Formal Logic, Arithmetic & Lambda Workbench.
 */

type ExportAstNode =
  | { kind: 'lit'; val: boolean | number }
  | { kind: 'var'; name: string }
  | { kind: 'lambda'; params: string[]; body: ExportAstNode }
  | { kind: 'ternary'; cond: ExportAstNode; thenExpr: ExportAstNode; elseExpr: ExportAstNode }
  | { kind: 'unary'; op: string; arg: ExportAstNode }
  | { kind: 'bin'; op: string; left: ExportAstNode; right: ExportAstNode }
  | { kind: 'call'; callee: ExportAstNode; args: ExportAstNode[] };

type ExportStatement =
  | { kind: 'def'; name: string; params: string[]; bodyAst: ExportAstNode }
  | { kind: 'assign'; name: string; ast: ExportAstNode }
  | { kind: 'expr'; ast: ExportAstNode };

interface Token {
  type: string;
  val: string | number | boolean;
}

const ENDS_WITH_OP = /[&|^=,(?:¬!~∧∨⊕→↔↑↓⊼⊽∴∵⊢⊨↝+\-*/%<>.:λ\\]$|->$|=>$|<->$|\*\*$|==$|!=$|<=$|>=$/;
const STARTS_WITH_BINOP = /^(&|\||\^|∧|∨|⊕|→|↔|↑|↓|⊼|⊽|∴|∵|->|=>|<->|\*\*|==|!=|<=|>=|[+\-*/%<>?:)]|\b(?:AND|OR|XOR|NAND|NOR|IMPLIES|IFF)\b)/i;

function parseBlocks(rawText: string): string[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: string[] = [];
  let cur: string | null = null;
  let parenDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (cur && parenDepth === 0 && !ENDS_WITH_OP.test(cur.trim())) {
        blocks.push(cur);
        cur = null;
      }
      continue;
    }
    const shouldContinue =
      cur !== null &&
      (parenDepth > 0 || ENDS_WITH_OP.test(cur.trim()) || STARTS_WITH_BINOP.test(trimmed));
    if (shouldContinue && cur !== null) {
      cur += ' ' + trimmed;
    } else {
      if (cur !== null) blocks.push(cur);
      cur = trimmed;
    }
    for (const ch of trimmed) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    }
  }
  if (cur !== null) blocks.push(cur);
  return blocks;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] || ''))) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const numStr = expr.slice(i, j);
      if (Number.isNaN(Number(numStr))) throw new Error(`Invalid number '${numStr}'`);
      tokens.push({ type: 'NUM', val: Number(numStr) });
      i = j; continue;
    }

    const three = expr.slice(i, i + 3);
    const two = expr.slice(i, i + 2);
    if (three === '<->') { tokens.push({ type: 'OP', val: '↔' }); i += 3; continue; }
    if (two === '->') { tokens.push({ type: 'OP', val: '→' }); i += 2; continue; }
    if (two === '=>') { tokens.push({ type: 'ARROW', val: '=>' }); i += 2; continue; }
    if (two === '&&') { tokens.push({ type: 'OP', val: '∧' }); i += 2; continue; }
    if (two === '||') { tokens.push({ type: 'OP', val: '∨' }); i += 2; continue; }
    if (two === '**') { tokens.push({ type: 'OP', val: '**' }); i += 2; continue; }
    if (two === '==') { tokens.push({ type: 'OP', val: '==' }); i += 2; continue; }
    if (two === '!=') { tokens.push({ type: 'OP', val: '!=' }); i += 2; continue; }
    if (two === '<=') { tokens.push({ type: 'OP', val: '<=' }); i += 2; continue; }
    if (two === '>=') { tokens.push({ type: 'OP', val: '>=' }); i += 2; continue; }
    if (two === '∃!') { tokens.push({ type: 'UNARY', val: '∃!' }); i += 2; continue; }

    if (ch === 'λ' || ch === '\\') { tokens.push({ type: 'LAMBDA', val: 'λ' }); i++; continue; }
    if ('().,=?:'.includes(ch)) { tokens.push({ type: ch, val: ch }); i++; continue; }

    if ('+-*/%<>'.includes(ch)) { tokens.push({ type: 'OP', val: ch }); i++; continue; }
    if (ch === '×') { tokens.push({ type: 'OP', val: '*' }); i++; continue; }
    if (ch === '÷') { tokens.push({ type: 'OP', val: '/' }); i++; continue; }
    if (ch === '−') { tokens.push({ type: 'OP', val: '-' }); i++; continue; }
    if (ch === '≠') { tokens.push({ type: 'OP', val: '!=' }); i++; continue; }
    if (ch === '≤') { tokens.push({ type: 'OP', val: '<=' }); i++; continue; }
    if (ch === '≥') { tokens.push({ type: 'OP', val: '>=' }); i++; continue; }

    if ('!~¬∼'.includes(ch)) { tokens.push({ type: 'UNARY', val: '¬' }); i++; continue; }
    if ('□◇∀∃'.includes(ch)) { tokens.push({ type: 'UNARY', val: ch }); i++; continue; }
    if ('&∧⊗'.includes(ch)) { tokens.push({ type: 'OP', val: '∧' }); i++; continue; }
    if ('|∨'.includes(ch)) { tokens.push({ type: 'OP', val: '∨' }); i++; continue; }
    if ('^⊕'.includes(ch)) { tokens.push({ type: 'OP', val: '⊕' }); i++; continue; }
    if ('→⊢⊨∴↝'.includes(ch)) { tokens.push({ type: 'OP', val: '→' }); i++; continue; }
    if (ch === '∵') { tokens.push({ type: 'OP', val: '∵' }); i++; continue; }
    if ('↔≡'.includes(ch)) { tokens.push({ type: 'OP', val: '↔' }); i++; continue; }
    if (ch === '↑' || ch === '⊼') { tokens.push({ type: 'OP', val: '⊼' }); i++; continue; }
    if (ch === '↓' || ch === '⊽') { tokens.push({ type: 'OP', val: '⊽' }); i++; continue; }
    if (ch === '⊤') { tokens.push({ type: 'BOOL', val: true }); i++; continue; }
    if (ch === '⊥') { tokens.push({ type: 'BOOL', val: false }); i++; continue; }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      const word = expr.slice(i, j);
      const upper = word.toUpperCase();
      if (upper === 'TRUE') tokens.push({ type: 'BOOL', val: true });
      else if (upper === 'FALSE') tokens.push({ type: 'BOOL', val: false });
      else if (upper === 'NOT') tokens.push({ type: 'UNARY', val: '¬' });
      else if (upper === 'AND') tokens.push({ type: 'OP', val: '∧' });
      else if (upper === 'OR') tokens.push({ type: 'OP', val: '∨' });
      else if (upper === 'XOR') tokens.push({ type: 'OP', val: '⊕' });
      else if (upper === 'NAND') tokens.push({ type: 'OP', val: '⊼' });
      else if (upper === 'NOR') tokens.push({ type: 'OP', val: '⊽' });
      else if (upper === 'IMPLIES' || upper === 'IMP') tokens.push({ type: 'OP', val: '→' });
      else if (upper === 'IFF' || upper === 'XNOR') tokens.push({ type: 'OP', val: '↔' });
      else tokens.push({ type: 'IDENT', val: word });
      i = j; continue;
    }
    throw new Error(`Unexpected character '${ch}'`);
  }
  return tokens;
}

function parseExpression(tokens: Token[]): ExportAstNode {
  let pos = 0;
  const peek = (o = 0) => tokens[pos + o];
  const consume = () => tokens[pos++];

  function tryParseArrowLambda(): ExportAstNode | null {
    const save = pos;
    if (peek()?.type === 'IDENT' && peek(1)?.type === 'ARROW') {
      const p = String(consume().val);
      consume();
      return { kind: 'lambda', params: [p], body: parseLambda() };
    }
    if (peek()?.type === '(') {
      consume();
      const params: string[] = [];
      let valid = true;
      if (peek()?.type !== ')') {
        while (true) {
          if (peek()?.type !== 'IDENT') { valid = false; break; }
          params.push(String(consume().val));
          if (peek()?.type === ',') { consume(); continue; }
          break;
        }
      }
      if (valid && peek()?.type === ')' && peek(1)?.type === 'ARROW') {
        consume(); consume();
        return { kind: 'lambda', params, body: parseLambda() };
      }
    }
    pos = save;
    return null;
  }

  function parseLambda(): ExportAstNode {
    if (peek()?.type === 'LAMBDA') {
      consume();
      const params: string[] = [];
      if (peek()?.type === '(') {
        consume();
        if (peek()?.type !== ')') {
          while (true) {
            if (peek()?.type !== 'IDENT') throw new Error('Expected parameter name');
            params.push(String(consume().val));
            if (peek()?.type === ',') { consume(); continue; }
            break;
          }
        }
        if (peek()?.type !== ')') throw new Error("Missing ')' in lambda parameters");
        consume();
      } else {
        if (peek()?.type !== 'IDENT') throw new Error('Expected parameter name after λ');
        params.push(String(consume().val));
      }
      if (peek()?.type === '.' || peek()?.type === 'ARROW') consume();
      else throw new Error("Expected '.' or '=>' after lambda parameters");
      return { kind: 'lambda', params, body: parseLambda() };
    }
    return tryParseArrowLambda() || parseTernary();
  }

  function parseTernary(): ExportAstNode {
    const cond = parseIff();
    if (peek()?.type === '?') {
      consume();
      const thenExpr = parseLambda();
      if (peek()?.type !== ':') throw new Error("Expected ':' in ternary expression");
      consume();
      const elseExpr = parseLambda();
      return { kind: 'ternary', cond, thenExpr, elseExpr };
    }
    return cond;
  }

  function parseIff(): ExportAstNode {
    let left = parseImp();
    while (peek()?.type === 'OP' && peek().val === '↔') left = { kind: 'bin', op: String(consume().val), left, right: parseImp() };
    return left;
  }
  function parseImp(): ExportAstNode {
    let left = parseOr();
    while (peek()?.type === 'OP' && (peek().val === '→' || peek().val === '∵')) {
      left = { kind: 'bin', op: String(consume().val), left, right: parseImp() };
    }
    return left;
  }
  function parseOr(): ExportAstNode {
    let left = parseXor();
    while (peek()?.type === 'OP' && (peek().val === '∨' || peek().val === '⊽')) left = { kind: 'bin', op: String(consume().val), left, right: parseXor() };
    return left;
  }
  function parseXor(): ExportAstNode {
    let left = parseAnd();
    while (peek()?.type === 'OP' && peek().val === '⊕') left = { kind: 'bin', op: String(consume().val), left, right: parseAnd() };
    return left;
  }
  function parseAnd(): ExportAstNode {
    let left = parseComparison();
    while (peek()?.type === 'OP' && (peek().val === '∧' || peek().val === '⊼')) left = { kind: 'bin', op: String(consume().val), left, right: parseComparison() };
    return left;
  }
  function parseComparison(): ExportAstNode {
    let left = parseAddSub();
    while (peek()?.type === 'OP' && ['==', '!=', '<', '<=', '>', '>='].includes(String(peek().val))) left = { kind: 'bin', op: String(consume().val), left, right: parseAddSub() };
    return left;
  }
  function parseAddSub(): ExportAstNode {
    let left = parseMulDiv();
    while (peek()?.type === 'OP' && (peek().val === '+' || peek().val === '-')) left = { kind: 'bin', op: String(consume().val), left, right: parseMulDiv() };
    return left;
  }
  function parseMulDiv(): ExportAstNode {
    let left = parsePow();
    while (peek()?.type === 'OP' && (peek().val === '*' || peek().val === '/' || peek().val === '%')) left = { kind: 'bin', op: String(consume().val), left, right: parsePow() };
    return left;
  }
  function parsePow(): ExportAstNode {
    const left = parseUnary();
    if (peek()?.type === 'OP' && peek().val === '**') return { kind: 'bin', op: String(consume().val), left, right: parsePow() };
    return left;
  }
  function parseUnary(): ExportAstNode {
    if (peek()?.type === 'UNARY') return { kind: 'unary', op: String(consume().val), arg: parseUnary() };
    if (peek()?.type === 'OP' && (peek().val === '-' || peek().val === '+')) return { kind: 'unary', op: String(consume().val), arg: parseUnary() };
    return parseCall();
  }
  function parseCall(): ExportAstNode {
    let node = parsePrimary();
    while (true) {
      if (peek()?.type === '.' && peek(1)?.type === 'IDENT') {
        consume();
        const subProp = String(consume().val);
        if (node.kind === 'var') {
          node = { kind: 'var', name: `${node.name}.${subProp}` };
        }
        continue;
      }
      if (peek()?.type === '(') {
        consume();
        const args: ExportAstNode[] = [];
        if (peek()?.type !== ')') {
          while (true) {
            args.push(parseLambda());
            if (peek()?.type === ',') { consume(); continue; }
            break;
          }
        }
        if (peek()?.type !== ')') throw new Error("Missing closing ')'");
        consume();
        node = { kind: 'call', callee: node, args };
        continue;
      }
      break;
    }
    return node;
  }
  function parsePrimary(): ExportAstNode {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.type === 'BOOL' || t.type === 'NUM') { consume(); return { kind: 'lit', val: t.val as boolean | number }; }
    if (t.type === '(') {
      consume();
      const inner = parseLambda();
      if (peek()?.type !== ')') throw new Error("Missing closing ')'");
      consume();
      return inner;
    }
    if (t.type === 'IDENT') { consume(); return { kind: 'var', name: String(t.val) }; }
    throw new Error(`Unexpected token '${String(t.val)}'`);
  }

  const ast = parseLambda();
  if (pos < tokens.length) throw new Error(`Unexpected trailing token '${String(tokens[pos].val)}'`);
  return ast;
}

function parseProgramForExport(preInput: string, program: string): {
  preEnv: Record<string, boolean | number>;
  statements: ExportStatement[];
} {
  const preEnv: Record<string, boolean | number> = {};
  for (const raw of preInput.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=\s*(true|false|⊤|⊥|-?\d+(?:\.\d+)?)$/i);
    if (!m) continue;
    const rawVal = m[2].toLowerCase();
    if (rawVal === 'true' || rawVal === '⊤') preEnv[m[1]] = true;
    else if (rawVal === 'false' || rawVal === '⊥') preEnv[m[1]] = false;
    else preEnv[m[1]] = Number(rawVal);
  }

  const statements: ExportStatement[] = [];
  for (const text of parseBlocks(program)) {
    const defMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(([^)]*)\)\s*=(?![=>])\s*(.+)$/);
    const assignMatch = !defMatch && text.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*=(?![=>])\s*(.+)$/);
    if (defMatch) {
      const name = defMatch[1];
      const params = defMatch[2].split(',').map((p) => p.trim()).filter(Boolean);
      statements.push({ kind: 'def', name, params, bodyAst: parseExpression(tokenize(defMatch[3])) });
    } else if (assignMatch) {
      statements.push({ kind: 'assign', name: assignMatch[1], ast: parseExpression(tokenize(assignMatch[2])) });
    } else {
      statements.push({ kind: 'expr', ast: parseExpression(tokenize(text)) });
    }
  }
  return { preEnv, statements };
}

function compileAstToPython(node: ExportAstNode): string {
  switch (node.kind) {
    case 'lit':
      return typeof node.val === 'boolean' ? (node.val ? 'True' : 'False') : String(node.val);
    case 'var':
      return node.name;
    case 'lambda':
      return `(lambda ${node.params.join(', ')}: ${compileAstToPython(node.body)})`;
    case 'ternary':
      return `(${compileAstToPython(node.thenExpr)} if bool(${compileAstToPython(node.cond)}) else ${compileAstToPython(node.elseExpr)})`;
    case 'unary': {
      const a = compileAstToPython(node.arg);
      if (node.op === '¬') return `(not bool(${a}))`;
      if (node.op === '-') return `(-(${a}))`;
      if (node.op === '+') return `(+(${a}))`;
      return `bool(${a})`;
    }
    case 'bin': {
      const l = compileAstToPython(node.left);
      const r = compileAstToPython(node.right);
      switch (node.op) {
        case '∧': return `(bool(${l}) and bool(${r}))`;
        case '∨': return `(bool(${l}) or bool(${r}))`;
        case '⊕': return `(bool(${l}) != bool(${r}))`;
        case '→': return `((not bool(${l})) or bool(${r}))`;
        case '∵': return `(bool(${l}) or (not bool(${r})))`;
        case '↔': return `(bool(${l}) == bool(${r}))`;
        case '⊼': return `(not (bool(${l}) and bool(${r})))`;
        case '⊽': return `(not (bool(${l}) or bool(${r})))`;
        default: return `(${l} ${node.op} ${r})`;
      }
    }
    case 'call':
      return `${compileAstToPython(node.callee)}(${node.args.map(compileAstToPython).join(', ')})`;
  }
}

interface PropertyTree {
  [key: string]: boolean | number | PropertyTree;
}

function buildPropertyTree(flatEnv: Record<string, boolean | number>): PropertyTree {
  const root: PropertyTree = {};
  for (const [path, value] of Object.entries(flatEnv)) {
    const parts = path.split('.');
    let cursor: PropertyTree = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const seg = parts[i];
      if (!cursor[seg] || typeof cursor[seg] !== 'object') {
        cursor[seg] = {};
      }
      cursor = cursor[seg] as PropertyTree;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return root;
}

function formatPythonPropertyValue(val: boolean | number | PropertyTree): string {
  if (typeof val === 'boolean') return val ? 'True' : 'False';
  if (typeof val === 'number') return String(val);
  const inner = Object.entries(val)
    .map(([k, v]) => `${k}=${formatPythonPropertyValue(v)}`)
    .join(', ');
  return `SimpleNamespace(${inner})`;
}

function formatJsPropertyValue(val: boolean | number | PropertyTree): string {
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  const inner = Object.entries(val)
    .map(([k, v]) => `${k}: ${formatJsPropertyValue(v)}`)
    .join(', ');
  return `{ ${inner} }`;
}

function formatPhpPropertyValue(val: boolean | number | PropertyTree): string {
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  const inner = Object.entries(val)
    .map(([k, v]) => `'${k}' => ${formatPhpPropertyValue(v)}`)
    .join(', ');
  return `(object)[${inner}]`;
}

function flatIdent(name: string): string {
  return name.replace(/\./g, '_');
}

export function compileMultilineLogicToPython(preInput: string, program: string): {
  code: string;
  statementCount: number;
} {
  const { preEnv, statements } = parseProgramForExport(preInput, program);
  const propTree = buildPropertyTree(preEnv);
  const hasSubprops =
    Object.keys(preEnv).some((k) => k.includes('.')) ||
    statements.some((s) => s.kind === 'assign' && s.name.includes('.'));
  const lines = [
    '#!/usr/bin/env python3',
    '"""Generated by Formal Logic, Arithmetic & Lambda Workbench"""',
    ...(hasSubprops ? ['from types import SimpleNamespace'] : []),
    '',
  ];
  const rootEntries = Object.entries(propTree);
  if (rootEntries.length) {
    lines.push('# Pre-Input Properties & Subproperties (Γ₀)');
    for (const [k, v] of rootEntries) {
      lines.push(`${k} = ${formatPythonPropertyValue(v)}`);
    }
    lines.push('');
  }
  const declaredRoots = new Set(Object.keys(propTree));
  lines.push('# Program Statements');
  let hasMainExpr = false;
  statements.forEach((stmt, idx) => {
    if (stmt.kind === 'def') {
      lines.push(`def ${flatIdent(stmt.name)}(${stmt.params.join(', ')}):`);
      lines.push(`    return ${compileAstToPython(stmt.bodyAst)}`);
      lines.push('');
    } else if (stmt.kind === 'assign') {
      if (stmt.name.includes('.')) {
        const parts = stmt.name.split('.');
        if (!declaredRoots.has(parts[0])) {
          declaredRoots.add(parts[0]);
          lines.push(`${parts[0]} = SimpleNamespace()`);
        }
      }
      lines.push(`${stmt.name} = ${compileAstToPython(stmt.ast)}`);
    } else {
      hasMainExpr = true;
      lines.push(`_result_${idx + 1} = ${compileAstToPython(stmt.ast)}`);
      lines.push(`print(_result_${idx + 1})`);
    }
  });
  if (!hasMainExpr) lines.push('print("No entrypoint expression evaluated.")');
  return { code: lines.join('\n') + '\n', statementCount: statements.length };
}

function encodeULEB128(val: number): number[] {
  const out: number[] = [];
  let v = val >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function encodeF64(val: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, val, true);
  return Array.from(new Uint8Array(buf));
}

function encodeString(str: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(str));
  return [...encodeULEB128(bytes.length), ...bytes];
}

function encodeSection(id: number, payload: number[]): number[] {
  return [id, ...encodeULEB128(payload.length), ...payload];
}

export function compileMultilineLogicToWasm(preInput: string, program: string): {
  binary: Uint8Array;
  wat: string;
} {
  const { preEnv, statements } = parseProgramForExport(preInput, program);
  interface WasmFuncDef {
    idx: number;
    name: string;
    params: string[];
    bodyAst: ExportAstNode;
  }
  const funcMap = new Map<string, WasmFuncDef>();
  const funcs: WasmFuncDef[] = [];

  for (const stmt of statements) {
    if (stmt.kind === 'def') {
      const fn: WasmFuncDef = { idx: funcs.length, name: stmt.name, params: stmt.params, bodyAst: stmt.bodyAst };
      funcMap.set(stmt.name, fn);
      funcs.push(fn);
    } else if (stmt.kind === 'assign' && stmt.ast.kind === 'lambda') {
      const fn: WasmFuncDef = { idx: funcs.length, name: stmt.name, params: stmt.ast.params, bodyAst: stmt.ast.body };
      funcMap.set(stmt.name, fn);
      funcs.push(fn);
    }
  }

  function compileExpr(node: ExportAstNode, localMap: Map<string, number>, watLines: string[], indent: string): number[] {
    const bytes: number[] = [];
    const emitToBool = (subNode: ExportAstNode) => {
      const sub = compileExpr(subNode, localMap, watLines, indent);
      bytes.push(...sub, 0x44, ...encodeF64(0), 0x62);
      watLines.push(`${indent}f64.const 0`, `${indent}f64.ne`);
    };

    switch (node.kind) {
      case 'lit': {
        const v = typeof node.val === 'boolean' ? (node.val ? 1 : 0) : node.val;
        bytes.push(0x44, ...encodeF64(v));
        watLines.push(`${indent}f64.const ${v}`);
        return bytes;
      }
      case 'var': {
        if (localMap.has(node.name)) {
          const idx = localMap.get(node.name)!;
          bytes.push(0x20, ...encodeULEB128(idx));
          watLines.push(`${indent}local.get $${node.name}`);
          return bytes;
        }
        if (node.name in preEnv) {
          const raw = preEnv[node.name];
          const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
          bytes.push(0x44, ...encodeF64(v));
          watLines.push(`${indent}f64.const ${v} ;; pre:${node.name}`);
          return bytes;
        }
        throw new Error(`WASM: Unbound variable '${node.name}'`);
      }
      case 'lambda':
        throw new Error('WASM export does not support returning higher-order closures/curried lambdas.');
      case 'ternary': {
        emitToBool(node.cond);
        bytes.push(0x04, 0x7c);
        watLines.push(`${indent}if (result f64)`);
        bytes.push(...compileExpr(node.thenExpr, localMap, watLines, indent + '  '));
        bytes.push(0x05);
        watLines.push(`${indent}else`);
        bytes.push(...compileExpr(node.elseExpr, localMap, watLines, indent + '  '));
        bytes.push(0x0b);
        watLines.push(`${indent}end`);
        return bytes;
      }
      case 'unary': {
        if (node.op === '¬') {
          emitToBool(node.arg);
          bytes.push(0x45, 0xb8);
          watLines.push(`${indent}i32.eqz`, `${indent}f64.convert_i32_u`);
          return bytes;
        }
        if (node.op === '-') {
          bytes.push(...compileExpr(node.arg, localMap, watLines, indent), 0x9a);
          watLines.push(`${indent}f64.neg`);
          return bytes;
        }
        return compileExpr(node.arg, localMap, watLines, indent);
      }
      case 'bin': {
        const op = node.op;
        if (['∧', '∨', '⊕', '→', '∵', '↔', '⊼', '⊽'].includes(op)) {
          if (op === '→') {
            emitToBool(node.left);
            bytes.push(0x45);
            watLines.push(`${indent}i32.eqz`);
            emitToBool(node.right);
            bytes.push(0x72, 0xb8);
            watLines.push(`${indent}i32.or`, `${indent}f64.convert_i32_u`);
            return bytes;
          }
          if (op === '∵') {
            emitToBool(node.left);
            emitToBool(node.right);
            bytes.push(0x45, 0x72, 0xb8);
            watLines.push(`${indent}i32.eqz`, `${indent}i32.or`, `${indent}f64.convert_i32_u`);
            return bytes;
          }
          emitToBool(node.left);
          emitToBool(node.right);
          if (op === '∧') { bytes.push(0x71, 0xb8); watLines.push(`${indent}i32.and`, `${indent}f64.convert_i32_u`); }
          else if (op === '∨') { bytes.push(0x72, 0xb8); watLines.push(`${indent}i32.or`, `${indent}f64.convert_i32_u`); }
          else if (op === '⊕') { bytes.push(0x73, 0xb8); watLines.push(`${indent}i32.xor`, `${indent}f64.convert_i32_u`); }
          else if (op === '↔') { bytes.push(0x46, 0xb8); watLines.push(`${indent}i32.eq`, `${indent}f64.convert_i32_u`); }
          else if (op === '⊼') { bytes.push(0x71, 0x45, 0xb8); watLines.push(`${indent}i32.and`, `${indent}i32.eqz`, `${indent}f64.convert_i32_u`); }
          else if (op === '⊽') { bytes.push(0x72, 0x45, 0xb8); watLines.push(`${indent}i32.or`, `${indent}i32.eqz`, `${indent}f64.convert_i32_u`); }
          return bytes;
        }
        if (['+', '-', '*', '/'].includes(op)) {
          bytes.push(...compileExpr(node.left, localMap, watLines, indent));
          bytes.push(...compileExpr(node.right, localMap, watLines, indent));
          const map: Record<string, [number, string]> = {
            '+': [0xa0, 'f64.add'], '-': [0xa1, 'f64.sub'],
            '*': [0xa2, 'f64.mul'], '/': [0xa3, 'f64.div'],
          };
          const [opcode, name] = map[op];
          bytes.push(opcode);
          watLines.push(`${indent}${name}`);
          return bytes;
        }
        if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
          bytes.push(...compileExpr(node.left, localMap, watLines, indent));
          bytes.push(...compileExpr(node.right, localMap, watLines, indent));
          const map: Record<string, [number, string]> = {
            '==': [0x61, 'f64.eq'], '!=': [0x62, 'f64.ne'],
            '<': [0x63, 'f64.lt'], '>': [0x64, 'f64.gt'],
            '<=': [0x65, 'f64.le'], '>=': [0x66, 'f64.ge'],
          };
          const [opcode, name] = map[op];
          bytes.push(opcode, 0xb8);
          watLines.push(`${indent}${name}`, `${indent}f64.convert_i32_u`);
          return bytes;
        }
        throw new Error(`WASM: Operator '${op}' is not supported in direct f64 WASM export.`);
      }
      case 'call': {
        if (node.callee.kind !== 'var' || !funcMap.has(node.callee.name)) {
          throw new Error('WASM: Dynamic or unknown callee is not supported.');
        }
        const fn = funcMap.get(node.callee.name)!;
        if (node.args.length !== fn.params.length) {
          throw new Error(`WASM: '${fn.name}' expects ${fn.params.length} args.`);
        }
        for (const a of node.args) bytes.push(...compileExpr(a, localMap, watLines, indent));
        bytes.push(0x10, ...encodeULEB128(fn.idx));
        watLines.push(`${indent}call $${fn.name}`);
        return bytes;
      }
    }
  }

  const watLines = ['(module'];
  const typeEntries: number[][] = [];
  const funcTypeIndices: number[] = [];
  const exportEntries: number[][] = [];
  const codeBodies: number[][] = [];

  funcs.forEach((fn, fIdx) => {
    typeEntries.push([0x60, ...encodeULEB128(fn.params.length), ...fn.params.map(() => 0x7c), 0x01, 0x7c]);
    funcTypeIndices.push(fIdx);
    exportEntries.push([...encodeString(fn.name), 0x00, ...encodeULEB128(fIdx)]);
    const localMap = new Map<string, number>();
    fn.params.forEach((p, i) => localMap.set(p, i));
    const paramStr = fn.params.map((p) => `(param $${p} f64)`).join(' ');
    watLines.push(`  (func $${fn.name} (export "${fn.name}") ${paramStr} (result f64)`);
    const bodyBytes = compileExpr(fn.bodyAst, localMap, watLines, '    ');
    bodyBytes.push(0x0b);
    watLines.push('  )');
    const fullBody = [0x00, ...bodyBytes];
    codeBodies.push([...encodeULEB128(fullBody.length), ...fullBody]);
  });

  const mainIdx = funcs.length;
  typeEntries.push([0x60, 0x00, 0x01, 0x7c]);
  funcTypeIndices.push(mainIdx);
  exportEntries.push([...encodeString('main'), 0x00, ...encodeULEB128(mainIdx)]);

  const mainLocals = new Map<string, number>();
  const preKeys = Object.keys(preEnv);
  preKeys.forEach((k) => mainLocals.set(k, mainLocals.size));
  for (const s of statements) {
    if (s.kind === 'assign' && s.ast.kind !== 'lambda' && !mainLocals.has(s.name)) {
      mainLocals.set(s.name, mainLocals.size);
    }
  }

  watLines.push('  (func $main (export "main") (result f64)');
  mainLocals.forEach((_, name) => watLines.push(`    (local $${name} f64)`));

  const mainBody: number[] = [];
  for (const k of preKeys) {
    const raw = preEnv[k];
    const v = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
    mainBody.push(0x44, ...encodeF64(v), 0x21, ...encodeULEB128(mainLocals.get(k)!));
    watLines.push(`    f64.const ${v}`, `    local.set $${k}`);
  }

  let lastExprStmt: { kind: 'expr'; ast: ExportAstNode } | null = null;
  for (const s of statements) {
    if (s.kind === 'assign' && s.ast.kind !== 'lambda') {
      mainBody.push(...compileExpr(s.ast, mainLocals, watLines, '    '));
      mainBody.push(0x21, ...encodeULEB128(mainLocals.get(s.name)!));
      watLines.push(`    local.set $${s.name}`);
    } else if (s.kind === 'expr') {
      lastExprStmt = s;
    }
  }

  if (lastExprStmt) {
    mainBody.push(...compileExpr(lastExprStmt.ast, mainLocals, watLines, '    '));
  } else {
    mainBody.push(0x44, ...encodeF64(0));
    watLines.push('    f64.const 0');
  }
  mainBody.push(0x0b);
  watLines.push('  )', ')');

  const localDecls = mainLocals.size > 0 ? [0x01, ...encodeULEB128(mainLocals.size), 0x7c] : [0x00];
  const fullMain = [...localDecls, ...mainBody];
  codeBodies.push([...encodeULEB128(fullMain.length), ...fullMain]);

  const typeSec = encodeSection(1, [...encodeULEB128(typeEntries.length), ...typeEntries.flat()]);
  const funcSec = encodeSection(3, [...encodeULEB128(funcTypeIndices.length), ...funcTypeIndices.flatMap(encodeULEB128)]);
  const expSec = encodeSection(7, [...encodeULEB128(exportEntries.length), ...exportEntries.flat()]);
  const codeSec = encodeSection(10, [...encodeULEB128(codeBodies.length), ...codeBodies.flat()]);

  const binary = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...typeSec, ...funcSec, ...expSec, ...codeSec,
  ]);
  return { binary, wat: watLines.join('\n') };
}

export interface CompiledLogicLanguageOutput {
  language: PrimaryLanguage;
  label: string;
  filename: string;
  mime: string;
  code: string;
  statementCount: number;
  wasmBinary?: Uint8Array;
}

type ExprStyle =
  | 'js'
  | 'php'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'swift'
  | 'kotlin'
  | 'ruby'
  | 'scala'
  | 'haskell'
  | 'elixir'
  | 'lua'
  | 'zig'
  | 'dart'
  | 'ocaml'
  | 'sql';

function compileAstForStyle(node: ExportAstNode, style: ExprStyle): string {
  const b = (expr: string): string => {
    switch (style) {
      case 'js': return `Boolean(${expr})`;
      case 'php': return `(bool)(${expr})`;
      case 'rust': return `((${expr}) != 0.0)`;
      case 'go': return `toBool(${expr})`;
      case 'java': return `toBool(${expr})`;
      case 'cpp': return `static_cast<bool>(${expr})`;
      case 'csharp': return `ToBool(${expr})`;
      case 'swift': return `toBool(${expr})`;
      case 'kotlin': return `toBool(${expr})`;
      case 'ruby': return `to_bool(${expr})`;
      case 'scala': return `toBool(${expr})`;
      case 'haskell': return `(toBool (${expr}))`;
      case 'elixir': return `to_bool.(${expr})`;
      case 'lua': return `to_bool(${expr})`;
      case 'zig': return `((${expr}) != 0.0)`;
      case 'dart': return `toBool(${expr})`;
      case 'ocaml': return `(to_bool (${expr}))`;
      case 'sql': return `((${expr}) <> 0)`;
    }
  };
  const n = (expr: string): string => {
    switch (style) {
      case 'js': return `Number(${expr})`;
      case 'php': return `(float)(${expr})`;
      case 'rust': return `(${expr})`;
      case 'go': return `toNum(${expr})`;
      case 'java': return `toNum(${expr})`;
      case 'cpp': return `static_cast<double>(${expr})`;
      case 'csharp': return `ToNum(${expr})`;
      case 'swift': return `toNum(${expr})`;
      case 'kotlin': return `toNum(${expr})`;
      case 'ruby': return `to_num(${expr})`;
      case 'scala': return `toNum(${expr})`;
      case 'haskell': return `(toNum (${expr}))`;
      case 'elixir': return `to_num.(${expr})`;
      case 'lua': return `to_num(${expr})`;
      case 'zig': return `(${expr})`;
      case 'dart': return `toNum(${expr})`;
      case 'ocaml': return `(to_num (${expr}))`;
      case 'sql': return `CAST(${expr} AS DOUBLE PRECISION)`;
    }
  };
  const boolLit = (v: boolean): string => {
    if (style === 'rust' || style === 'zig') return v ? '1.0' : '0.0';
    if (style === 'haskell') return v ? 'True' : 'False';
    if (style === 'sql') return v ? 'TRUE' : 'FALSE';
    return v ? 'true' : 'false';
  };
  const numLit = (v: number): string => {
    if (style === 'rust' || style === 'zig' || style === 'ocaml') {
      return Number.isInteger(v) ? `${v}.0` : String(v);
    }
    return String(v);
  };
  const varRef = (name: string): string => {
    if (style === 'php') {
      const parts = name.split('.');
      return `$${parts[0]}${parts.slice(1).map((p) => `->${p}`).join('')}`;
    }
    if (style === 'js' || style === 'lua') return name;
    return flatIdent(name);
  };

  switch (node.kind) {
    case 'lit':
      return typeof node.val === 'boolean' ? boolLit(node.val) : numLit(node.val);
    case 'var':
      return varRef(node.name);
    case 'lambda': {
      const body = compileAstForStyle(node.body, style);
      const ps = node.params;
      switch (style) {
        case 'js':
        case 'csharp':
        case 'scala':
        case 'dart':
          return `(${ps.join(', ')}) => (${body})`;
        case 'php':
          return `fn(${ps.map((p) => `$${p}`).join(', ')}) => (${body})`;
        case 'rust':
          return `|${ps.map((p) => `${p}: f64`).join(', ')}| (${body})`;
        case 'go':
          return `func(${ps.map((p) => `${p} float64`).join(', ')}) float64 { return ${body} }`;
        case 'java':
          return `(${ps.join(', ')}) -> (${body})`;
        case 'cpp':
          return `[=](${ps.map((p) => `double ${p}`).join(', ')}) { return ${body}; }`;
        case 'swift':
          return `{ (${ps.map((p) => `${p}: Double`).join(', ')}) -> Double in ${body} }`;
        case 'kotlin':
          return `{ ${ps.map((p) => `${p}: Double`).join(', ')} -> ${body} }`;
        case 'ruby':
          return `->(${ps.join(', ')}) { ${body} }`;
        case 'haskell':
          return `(\\${ps.join(' ')} -> ${body})`;
        case 'elixir':
          return `fn ${ps.join(', ')} -> ${body} end`;
        case 'lua':
          return `(function(${ps.join(', ')}) return ${body} end)`;
        case 'ocaml':
          return `(fun ${ps.join(' ')} -> ${body})`;
        case 'zig':
          return `/* lambda(${ps.join(', ')}) */ (${body})`;
        case 'sql':
          return `/* lambda(${ps.join(', ')}) */ (${body})`;
      }
    }
    case 'ternary': {
      const c = b(compileAstForStyle(node.cond, style));
      const t = compileAstForStyle(node.thenExpr, style);
      const e = compileAstForStyle(node.elseExpr, style);
      switch (style) {
        case 'rust':
        case 'zig':
        case 'kotlin':
        case 'scala':
          return `(if (${c}) { ${t} } else { ${e} })`;
        case 'haskell':
        case 'ocaml':
          return `(if ${c} then ${t} else ${e})`;
        case 'elixir':
          return `(if ${c}, do: ${t}, else: ${e})`;
        case 'lua':
          return `((${c}) and (${t}) or (${e}))`;
        case 'sql':
          return `(CASE WHEN ${c} THEN ${t} ELSE ${e} END)`;
        case 'go':
          return `ternary(${c}, ${t}, ${e})`;
        default:
          return `((${c}) ? (${t}) : (${e}))`;
      }
    }
    case 'unary': {
      const a = compileAstForStyle(node.arg, style);
      if (node.op === '¬') {
        if (style === 'haskell' || style === 'ocaml') return `(not ${b(a)})`;
        if (style === 'lua' || style === 'elixir' || style === 'sql') return `(not ${b(a)})`;
        if (style === 'rust' || style === 'zig') return `(if (${b(a)}) { 0.0 } else { 1.0 })`;
        return `(!${b(a)})`;
      }
      if (node.op === '-') return `(-(${n(a)}))`;
      if (node.op === '+') return `(${n(a)})`;
      return b(a);
    }
    case 'bin': {
      const l = compileAstForStyle(node.left, style);
      const r = compileAstForStyle(node.right, style);
      const isWordLogic = style === 'lua' || style === 'elixir' || style === 'sql';
      const andOp = isWordLogic ? 'and' : '&&';
      const orOp = isWordLogic ? 'or' : '||';
      const notFn = (x: string) => (isWordLogic || style === 'haskell' || style === 'ocaml' ? `(not (${x}))` : `!(${x})`);
      const wrapBoolRes = (expr: string) => (style === 'rust' || style === 'zig' ? `(if (${expr}) { 1.0 } else { 0.0 })` : `(${expr})`);

      switch (node.op) {
        case '∧': return wrapBoolRes(`${b(l)} ${andOp} ${b(r)}`);
        case '∨': return wrapBoolRes(`${b(l)} ${orOp} ${b(r)}`);
        case '⊕': return wrapBoolRes(`${b(l)} ${style === 'lua' ? '~=' : style === 'sql' || style === 'ocaml' ? '<>' : style === 'haskell' ? '/=' : '!='} ${b(r)}`);
        case '→': return wrapBoolRes(`${notFn(b(l))} ${orOp} ${b(r)}`);
        case '∵': return wrapBoolRes(`${b(l)} ${orOp} ${notFn(b(r))}`);
        case '↔': return wrapBoolRes(`${b(l)} ${style === 'sql' || style === 'ocaml' ? '=' : '=='} ${b(r)}`);
        case '⊼': return wrapBoolRes(notFn(`${b(l)} ${andOp} ${b(r)}`));
        case '⊽': return wrapBoolRes(notFn(`${b(l)} ${orOp} ${b(r)}`));
        case '**':
          if (style === 'js' || style === 'php' || style === 'ruby' || style === 'ocaml' || style === 'haskell') return `(${n(l)} ** ${n(r)})`;
          if (style === 'lua') return `(${n(l)} ^ ${n(r)})`;
          if (style === 'rust') return `(${n(l)}).powf(${n(r)})`;
          if (style === 'go') return `math.Pow(${n(l)}, ${n(r)})`;
          if (style === 'java' || style === 'csharp' || style === 'dart') return `Math.pow(${n(l)}, ${n(r)})`;
          if (style === 'cpp') return `std::pow(${n(l)}, ${n(r)})`;
          if (style === 'sql') return `POWER(${n(l)}, ${n(r)})`;
          return `pow(${n(l)}, ${n(r)})`;
        case '+':
        case '-':
        case '*':
        case '/':
        case '%': {
          if (style === 'ocaml') {
            const opMap: Record<string, string> = { '+': '+.', '-': '-.', '*': '*.', '/': '/.', '%': 'mod_float' };
            if (node.op === '%') return `(mod_float ${n(l)} ${n(r)})`;
            return `(${n(l)} ${opMap[node.op]} ${n(r)})`;
          }
          if (style === 'rust' || style === 'zig') return `(${n(l)} ${node.op} ${n(r)})`;
          return `(${n(l)} ${node.op} ${n(r)})`;
        }
        case '==':
          return wrapBoolRes(`${n(l)} ${style === 'sql' || style === 'ocaml' ? '=' : '=='} ${n(r)}`);
        case '!=':
          return wrapBoolRes(`${n(l)} ${style === 'lua' ? '~=' : style === 'sql' || style === 'ocaml' ? '<>' : style === 'haskell' ? '/=' : '!='} ${n(r)}`);
        case '<':
        case '<=':
        case '>':
        case '>=':
          return wrapBoolRes(`${n(l)} ${node.op} ${n(r)}`);
      }
      return `(${l} ${node.op} ${r})`;
    }
    case 'call': {
      const callee = compileAstForStyle(node.callee, style);
      const args = node.args.map((a) => compileAstForStyle(a, style));
      if (style === 'haskell' || style === 'ocaml') {
        return `(${callee} ${args.map((a) => `(${a})`).join(' ')})`;
      }
      if (style === 'elixir') {
        return `${callee}.(${args.join(', ')})`;
      }
      if (style === 'ruby') {
        return `${callee}.call(${args.join(', ')})`;
      }
      return `${callee}(${args.join(', ')})`;
    }
  }
}

export function compileMultilineLogicToLanguage(
  language: PrimaryLanguage,
  preInput: string,
  program: string
): CompiledLogicLanguageOutput {
  const spec = SUPPORTED_LANGUAGES.find((l) => l.id === language) ?? SUPPORTED_LANGUAGES[1];
  const filename = `logic_program${spec.extension}`;

  if (language === 'python') {
    const py = compileMultilineLogicToPython(preInput, program);
    return {
      language,
      label: spec.label,
      filename,
      mime: 'text/x-python',
      code: py.code,
      statementCount: py.statementCount,
    };
  }

  if (language === 'wasm') {
    const { binary, wat } = compileMultilineLogicToWasm(preInput, program);
    const { statements } = parseProgramForExport(preInput, program);
    return {
      language,
      label: spec.label,
      filename: 'logic_program.wat',
      mime: 'text/plain',
      code: wat,
      statementCount: statements.length,
      wasmBinary: binary,
    };
  }

  const { preEnv, statements } = parseProgramForExport(preInput, program);

  if (language === 'json') {
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'Formal Logic, Arithmetic & Lambda Program',
      programmingLanguage: 'JSON-LD Logic AST',
      properties: buildPropertyTree(preEnv),
      environment: preEnv,
      statementCount: statements.length,
      statements,
    };
    return {
      language,
      label: spec.label,
      filename,
      mime: 'application/ld+json',
      code: JSON.stringify(payload, null, 2) + '\n',
      statementCount: statements.length,
    };
  }

  const preEntries = Object.entries(preEnv);
  const propTree = buildPropertyTree(preEnv);
  const style: ExprStyle =
    language === 'javascript' || language === 'typescript'
      ? 'js'
      : (language as ExprStyle);
  const lines: string[] = [];

  if (language === 'javascript' || language === 'typescript') {
    const isTs = language === 'typescript';
    lines.push(`// Generated by Formal Logic, Arithmetic & Lambda Workbench (${spec.label})`);
    const declaredRoots = new Set<string>();
    for (const [k, v] of Object.entries(propTree)) {
      declaredRoots.add(k);
      lines.push(`const ${k}${isTs ? ': any' : ''} = ${formatJsPropertyValue(v)};`);
    }
    if (preEntries.length) lines.push('');
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') {
        const ps = isTs ? stmt.params.map((p) => `${p}: any`).join(', ') : stmt.params.join(', ');
        lines.push(`function ${flatIdent(stmt.name)}(${ps})${isTs ? ': any' : ''} { return ${compileAstForStyle(stmt.bodyAst, 'js')}; }`);
      } else if (stmt.kind === 'assign') {
        if (stmt.name.includes('.')) {
          const rootKey = stmt.name.split('.')[0];
          if (!declaredRoots.has(rootKey)) {
            declaredRoots.add(rootKey);
            lines.push(`const ${rootKey}${isTs ? ': any' : ''} = {};`);
          }
          lines.push(`${stmt.name} = ${compileAstForStyle(stmt.ast, 'js')};`);
        } else {
          lines.push(`const ${stmt.name}${isTs ? ': any' : ''} = ${compileAstForStyle(stmt.ast, 'js')};`);
        }
      } else {
        lines.push(`const _result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'js')};`);
        lines.push(`console.log(_result_${idx + 1});`);
      }
    });
  } else if (language === 'php') {
    lines.push('<?php', 'declare(strict_types=1);', '// Generated by Formal Logic, Arithmetic & Lambda Workbench (PHP 8)', '');
    const declaredRoots = new Set<string>();
    for (const [k, v] of Object.entries(propTree)) {
      declaredRoots.add(k);
      lines.push(`$${k} = ${formatPhpPropertyValue(v)};`);
    }
    if (preEntries.length) lines.push('');
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') {
        lines.push(`$${flatIdent(stmt.name)} = fn(${stmt.params.map((p) => `$${p}`).join(', ')}) => (${compileAstForStyle(stmt.bodyAst, 'php')});`);
      } else if (stmt.kind === 'assign') {
        if (stmt.name.includes('.')) {
          const parts = stmt.name.split('.');
          if (!declaredRoots.has(parts[0])) {
            declaredRoots.add(parts[0]);
            lines.push(`$${parts[0]} = (object)[];`);
          }
          lines.push(`$${parts[0]}${parts.slice(1).map((p) => `->${p}`).join('')} = ${compileAstForStyle(stmt.ast, 'php')};`);
        } else {
          lines.push(`$${stmt.name} = ${compileAstForStyle(stmt.ast, 'php')};`);
        }
      } else {
        lines.push(`$_result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'php')};`);
        lines.push(`var_export($_result_${idx + 1}); echo PHP_EOL;`);
      }
    });
  } else if (language === 'rust') {
    lines.push('// Generated by Formal Logic, Arithmetic & Lambda Workbench (Rust)', 'fn main() {');
    for (const [k, v] of preEntries) {
      const val = typeof v === 'boolean' ? (v ? '1.0' : '0.0') : (Number.isInteger(v) ? `${v}.0` : String(v));
      lines.push(`    let ${k}: f64 = ${val};`);
    }
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') {
        lines.push(`    let ${stmt.name} = |${stmt.params.map((p) => `${p}: f64`).join(', ')}| -> f64 { ${compileAstForStyle(stmt.bodyAst, 'rust')} };`);
      } else if (stmt.kind === 'assign') {
        lines.push(`    let ${stmt.name} = ${compileAstForStyle(stmt.ast, 'rust')};`);
      } else {
        lines.push(`    let _result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'rust')};`);
        lines.push(`    println!("{}", _result_${idx + 1});`);
      }
    });
    lines.push('}');
  } else if (language === 'go') {
    lines.push(
      '// Generated by Formal Logic, Arithmetic & Lambda Workbench (Go)',
      'package main',
      '',
      'import ("fmt"; "math")',
      'func toBool(v float64) bool { return v != 0 }',
      'func toNum(v float64) float64 { return v }',
      'func ternary(c bool, a, b float64) float64 { if c { return a }; return b }',
      'var _ = math.Pow',
      '',
      'func main() {'
    );
    for (const [k, v] of preEntries) {
      lines.push(`    ${k} := float64(${typeof v === 'boolean' ? (v ? 1 : 0) : v})`);
    }
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') {
        lines.push(`    ${stmt.name} := func(${stmt.params.map((p) => `${p} float64`).join(', ')}) float64 { return ${compileAstForStyle(stmt.bodyAst, 'go')} }`);
      } else if (stmt.kind === 'assign') {
        lines.push(`    ${stmt.name} := ${compileAstForStyle(stmt.ast, 'go')}`);
      } else {
        lines.push(`    _result_${idx + 1} := ${compileAstForStyle(stmt.ast, 'go')}`);
        lines.push(`    fmt.Println(_result_${idx + 1})`);
      }
    });
    lines.push('}');
  } else if (language === 'sql') {
    lines.push('-- Generated by Formal Logic, Arithmetic & Lambda Workbench (SQL)');
    const ctes: string[] = [];
    if (preEntries.length) {
      ctes.push(`pre_env AS (SELECT ${preEntries.map(([k, v]) => `${typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v} AS ${k}`).join(', ')})`);
    }
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') {
        lines.push(`-- Callable ${stmt.name}(${stmt.params.join(', ')}) = ${compileAstForStyle(stmt.bodyAst, 'sql')}`);
      } else if (stmt.kind === 'assign') {
        ctes.push(`step_${idx + 1} AS (SELECT ${compileAstForStyle(stmt.ast, 'sql')} AS ${stmt.name}${preEntries.length ? ' FROM pre_env' : ''})`);
      } else {
        if (ctes.length) lines.push(`WITH ${ctes.join(',\n     ')}`);
        lines.push(`SELECT ${compileAstForStyle(stmt.ast, 'sql')} AS result_${idx + 1}${preEntries.length ? ' FROM pre_env' : ''};`);
      }
    });
  } else if (language === 'ruby') {
    lines.push('# Generated by Formal Logic, Arithmetic & Lambda Workbench (Ruby 3)');
    lines.push('def to_bool(v); v.is_a?(Numeric) ? v != 0 : !!v; end');
    lines.push('def to_num(v); v == true ? 1 : (v == false ? 0 : v); end', '');
    for (const [k, v] of preEntries) lines.push(`${k} = ${v}`);
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') lines.push(`${stmt.name} = ->(${stmt.params.join(', ')}) { ${compileAstForStyle(stmt.bodyAst, 'ruby')} }`);
      else if (stmt.kind === 'assign') lines.push(`${stmt.name} = ${compileAstForStyle(stmt.ast, 'ruby')}`);
      else lines.push(`_result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'ruby')}\nputs _result_${idx + 1}`);
    });
  } else if (language === 'lua') {
    lines.push('-- Generated by Formal Logic, Arithmetic & Lambda Workbench (Lua 5.4)');
    lines.push('local function to_bool(v) if type(v) == "number" then return v ~= 0 end return not not v end');
    lines.push('local function to_num(v) if type(v) == "boolean" then return v and 1 or 0 end return v end', '');
    for (const [k, v] of preEntries) lines.push(`local ${k} = ${v}`);
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') lines.push(`local function ${stmt.name}(${stmt.params.join(', ')}) return ${compileAstForStyle(stmt.bodyAst, 'lua')} end`);
      else if (stmt.kind === 'assign') lines.push(`local ${stmt.name} = ${compileAstForStyle(stmt.ast, 'lua')}`);
      else lines.push(`local _result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'lua')}\nprint(_result_${idx + 1})`);
    });
  } else if (language === 'haskell') {
    lines.push('-- Generated by Formal Logic, Arithmetic & Lambda Workbench (Haskell)');
    lines.push('module LogicProgram where', '');
    for (const [k, v] of preEntries) lines.push(`${k} = ${typeof v === 'boolean' ? (v ? 'True' : 'False') : v}`);
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') lines.push(`${stmt.name} ${stmt.params.join(' ')} = ${compileAstForStyle(stmt.bodyAst, 'haskell')}`);
      else if (stmt.kind === 'assign') lines.push(`${stmt.name} = ${compileAstForStyle(stmt.ast, 'haskell')}`);
      else lines.push(`result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'haskell')}`);
    });
  } else if (language === 'ocaml') {
    lines.push('(* Generated by Formal Logic, Arithmetic & Lambda Workbench (OCaml) *)');
    for (const [k, v] of preEntries) lines.push(`let ${k} = ${typeof v === 'boolean' ? (v ? 'true' : 'false') : (Number.isInteger(v) ? `${v}.0` : v)}`);
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') lines.push(`let ${stmt.name} ${stmt.params.join(' ')} = ${compileAstForStyle(stmt.bodyAst, 'ocaml')}`);
      else if (stmt.kind === 'assign') lines.push(`let ${stmt.name} = ${compileAstForStyle(stmt.ast, 'ocaml')}`);
      else lines.push(`let _result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'ocaml')}`);
    });
  } else if (language === 'elixir') {
    lines.push('# Generated by Formal Logic, Arithmetic & Lambda Workbench (Elixir)');
    lines.push('to_bool = fn v when is_number(v) -> v != 0; v -> !!v end');
    lines.push('to_num = fn true -> 1; false -> 0; v -> v end', '');
    for (const [k, v] of preEntries) lines.push(`${k} = ${v}`);
    statements.forEach((stmt, idx) => {
      if (stmt.kind === 'def') lines.push(`${stmt.name} = fn ${stmt.params.join(', ')} -> ${compileAstForStyle(stmt.bodyAst, 'elixir')} end`);
      else if (stmt.kind === 'assign') lines.push(`${stmt.name} = ${compileAstForStyle(stmt.ast, 'elixir')}`);
      else lines.push(`result_${idx + 1} = ${compileAstForStyle(stmt.ast, 'elixir')}\nIO.inspect(result_${idx + 1})`);
    });
  } else {
    // C++, Java, C#, Swift, Kotlin, Scala, Zig, Dart
    lines.push(`// Generated by Formal Logic, Arithmetic & Lambda Workbench (${spec.label})`);
    for (const [k, v] of preEntries) {
      const kw = language === 'cpp' ? 'const auto' : language === 'java' || language === 'csharp' ? 'var' : language === 'kotlin' || language === 'scala' ? 'val' : language === 'zig' ? 'const' : language === 'swift' ? 'let' : 'final';
      const val = (language === 'zig') ? (typeof v === 'boolean' ? (v ? '1.0' : '0.0') : (Number.isInteger(v) ? `${v}.0` : v)) : v;
      lines.push(`${kw} ${k} = ${val};`);
    }
    if (preEntries.length) lines.push('');
    statements.forEach((stmt, idx) => {
      const expr = compileAstForStyle(stmt.kind === 'def' ? stmt.bodyAst : stmt.ast, style);
      if (stmt.kind === 'def') {
        if (language === 'cpp') lines.push(`auto ${stmt.name} = [&](${stmt.params.map((p) => `double ${p}`).join(', ')}) { return ${expr}; };`);
        else if (language === 'swift') lines.push(`func ${stmt.name}(${stmt.params.map((p) => `_ ${p}: Double`).join(', ')}) -> Double { return ${expr} }`);
        else if (language === 'kotlin') lines.push(`fun ${stmt.name}(${stmt.params.map((p) => `${p}: Double`).join(', ')}) = ${expr}`);
        else if (language === 'scala') lines.push(`def ${stmt.name}(${stmt.params.map((p) => `${p}: Double`).join(', ')}) = ${expr}`);
        else if (language === 'zig') lines.push(`fn ${stmt.name}(${stmt.params.map((p) => `${p}: f64`).join(', ')}) f64 { return ${expr}; }`);
        else if (language === 'dart') lines.push(`dynamic ${stmt.name}(${stmt.params.join(', ')}) => ${expr};`);
        else lines.push(`var ${stmt.name} = (${stmt.params.join(', ')}) => ${expr};`);
      } else if (stmt.kind === 'assign') {
        const kw = language === 'cpp' ? 'auto' : language === 'kotlin' || language === 'scala' ? 'val' : language === 'swift' ? 'let' : language === 'zig' ? 'const' : 'var';
        lines.push(`${kw} ${stmt.name} = ${expr};`);
      } else {
        const kw = language === 'cpp' ? 'auto' : language === 'kotlin' || language === 'scala' ? 'val' : language === 'swift' ? 'let' : language === 'zig' ? 'const' : 'var';
        lines.push(`${kw} _result_${idx + 1} = ${expr};`);
      }
    });
  }

  return {
    language,
    label: spec.label,
    filename,
    mime: 'text/plain;charset=utf-8',
    code: lines.join('\n') + '\n',
    statementCount: statements.length,
  };
}

