import type { LogicAstNode, LogicLabelBinding } from './logicLambdaEngine.ts';

export type CompiledTargetLang =
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'sql'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'haskell'
  | 'elixir'
  | 'lua'
  | 'zig'
  | 'dart'
  | 'ocaml';

export interface LoweredLogicPlan {
  ast: LogicAstNode;
  resultType: 'boolean' | 'number';
  varTypes: Map<string, 'boolean' | 'number'>;
  usedVars: string[];
}

function substituteVar(node: LogicAstNode, param: string, replacement: LogicAstNode): LogicAstNode {
  switch (node.type) {
    case 'NumberLit':
    case 'BoolLit':
      return node;
    case 'Identifier':
      return node.name === param ? replacement : node;
    case 'UnaryOp':
      return { ...node, operand: substituteVar(node.operand, param, replacement) };
    case 'BinaryOp':
      return {
        ...node,
        left: substituteVar(node.left, param, replacement),
        right: substituteVar(node.right, param, replacement),
      };
    case 'Lambda':
      return node.param === param
        ? node
        : { ...node, body: substituteVar(node.body, param, replacement) };
    case 'Quantifier':
      return node.variable === param
        ? node
        : { ...node, body: substituteVar(node.body, param, replacement) };
    case 'Call':
      return {
        ...node,
        callee: substituteVar(node.callee, param, replacement),
        arg: substituteVar(node.arg, param, replacement),
      };
  }
}

function isSimpleLiteralString(val: string, kind: LogicLabelBinding['kind']): boolean {
  const t = val.trim().toLowerCase();
  if (kind === 'boolean') return t === 'true' || t === 'false' || t === '1' || t === '0' || t === '⊤' || t === '⊥';
  if (kind === 'number') return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(t);
  return false;
}

export function lowerLogicAstForCodegen(
  rootAst: LogicAstNode,
  labels: LogicLabelBinding[],
  parseExpr: (src: string) => { ok: true; ast: LogicAstNode } | { ok: false; error: string }
): LoweredLogicPlan {
  const lambdaAsts = new Map<string, LogicAstNode>();
  const dependentExprAsts = new Map<string, LogicAstNode>();
  const declaredTypes = new Map<string, 'boolean' | 'number'>();

  for (const lbl of labels) {
    const name = lbl.name.trim();
    if (!name) continue;
    if (lbl.kind === 'lambda') {
      const parsed = parseExpr(lbl.value);
      if (parsed.ok) lambdaAsts.set(name, parsed.ast);
    } else {
      declaredTypes.set(name, lbl.kind);
      if (!isSimpleLiteralString(lbl.value, lbl.kind)) {
        const parsed = parseExpr(lbl.value);
        if (parsed.ok) dependentExprAsts.set(name, parsed.ast);
      }
    }
  }

  const reduce = (node: LogicAstNode, bound: Set<string>, depth: number): LogicAstNode => {
    if (depth > 32) return node;
    switch (node.type) {
      case 'NumberLit':
      case 'BoolLit':
        return node;
      case 'Identifier': {
        if (bound.has(node.name)) return node;
        const lam = lambdaAsts.get(node.name);
        if (lam) return reduce(lam, bound, depth + 1);
        const dep = dependentExprAsts.get(node.name);
        if (dep) return reduce(dep, bound, depth + 1);
        return node;
      }
      case 'UnaryOp':
        return { ...node, operand: reduce(node.operand, bound, depth + 1) };
      case 'BinaryOp':
        return {
          ...node,
          left: reduce(node.left, bound, depth + 1),
          right: reduce(node.right, bound, depth + 1),
        };
      case 'Lambda': {
        const nextBound = new Set(bound);
        nextBound.add(node.param);
        return { ...node, body: reduce(node.body, nextBound, depth + 1) };
      }
      case 'Quantifier': {
        const falseBranch = reduce(
          substituteVar(node.body, node.variable, { type: 'BoolLit', value: false }),
          bound,
          depth + 1
        );
        const trueBranch = reduce(
          substituteVar(node.body, node.variable, { type: 'BoolLit', value: true }),
          bound,
          depth + 1
        );
        return {
          type: 'BinaryOp',
          op: node.quantifier === '∀' ? '∧' : '∨',
          left: falseBranch,
          right: trueBranch,
        };
      }
      case 'Call': {
        const reducedCallee = reduce(node.callee, bound, depth + 1);
        const reducedArg = reduce(node.arg, bound, depth + 1);
        if (reducedCallee.type === 'Lambda') {
          return reduce(
            substituteVar(reducedCallee.body, reducedCallee.param, reducedArg),
            bound,
            depth + 1
          );
        }
        return { type: 'Call', callee: reducedCallee, arg: reducedArg };
      }
    }
  };

  const lowered = reduce(rootAst, new Set(), 0);
  const varTypes = new Map<string, 'boolean' | 'number'>();
  const usedOrder: string[] = [];

  const inferNodeType = (node: LogicAstNode, expected: 'boolean' | 'number' | null): 'boolean' | 'number' => {
    switch (node.type) {
      case 'BoolLit':
        return 'boolean';
      case 'NumberLit':
        return 'number';
      case 'Identifier': {
        if (!usedOrder.includes(node.name)) usedOrder.push(node.name);
        const t = declaredTypes.get(node.name) || expected || varTypes.get(node.name) || 'number';
        varTypes.set(node.name, t);
        return t;
      }
      case 'UnaryOp':
        if (node.op === '¬') {
          inferNodeType(node.operand, 'boolean');
          return 'boolean';
        }
        inferNodeType(node.operand, 'number');
        return 'number';
      case 'BinaryOp': {
        if (['∧', '∨', '⊕', '→', '↔', '≡'].includes(node.op)) {
          inferNodeType(node.left, 'boolean');
          inferNodeType(node.right, 'boolean');
          return 'boolean';
        }
        if (['<', '≤', '>', '≥'].includes(node.op)) {
          inferNodeType(node.left, 'number');
          inferNodeType(node.right, 'number');
          return 'boolean';
        }
        if (node.op === '=' || node.op === '≠') {
          const lt = inferNodeType(node.left, null);
          inferNodeType(node.right, lt);
          return 'boolean';
        }
        inferNodeType(node.left, 'number');
        inferNodeType(node.right, 'number');
        return 'number';
      }
      case 'Quantifier':
        inferNodeType(node.body, 'boolean');
        return 'boolean';
      case 'Lambda':
        return inferNodeType(node.body, expected);
      case 'Call':
        inferNodeType(node.callee, null);
        inferNodeType(node.arg, null);
        return expected || 'number';
    }
  };

  const resultType = inferNodeType(lowered, null);
  return { ast: lowered, resultType, varTypes, usedVars: usedOrder };
}

function fmtFloat(n: number, lang: CompiledTargetLang): string {
  if (lang === 'ocaml') {
    const s = String(n);
    return s.includes('.') || s.includes('e') || s.includes('E') ? s : `${s}.0`;
  }
  if (lang === 'go' || lang === 'zig' || lang === 'haskell' || lang === 'swift' || lang === 'dart' || lang === 'kotlin' || lang === 'scala' || lang === 'cpp' || lang === 'csharp' || lang === 'java') {
    const s = String(n);
    return s.includes('.') || s.includes('e') || s.includes('E') ? s : `${s}.0`;
  }
  return String(n);
}

function varRef(name: string, lang: CompiledTargetLang): string {
  if (lang === 'php') return `$v_${name}`;
  if (lang === 'sql') return `inputs.${name}`;
  return `v_${name}`;
}

export function emitCompiledTargetExpr(node: LogicAstNode, lang: CompiledTargetLang): string {
  switch (node.type) {
    case 'NumberLit':
      return fmtFloat(node.value, lang);
    case 'BoolLit':
      if (lang === 'haskell') return node.value ? 'True' : 'False';
      if (lang === 'sql') return node.value ? 'TRUE' : 'FALSE';
      return node.value ? 'true' : 'false';
    case 'Identifier':
      return varRef(node.name, lang);
    case 'UnaryOp': {
      const inner = emitCompiledTargetExpr(node.operand, lang);
      if (node.op === '¬') {
        if (lang === 'sql') return `(NOT (${inner}))`;
        if (lang === 'haskell' || lang === 'ocaml' || lang === 'lua' || lang === 'elixir') {
          return `(not (${inner}))`;
        }
        return `(!(${inner}))`;
      }
      if (lang === 'ocaml') return `(-.(${inner}))`;
      return `(-(${inner}))`;
    }
    case 'BinaryOp': {
      const l = emitCompiledTargetExpr(node.left, lang);
      const r = emitCompiledTargetExpr(node.right, lang);
      switch (node.op) {
        case '∧':
          if (lang === 'sql') return `((${l}) AND (${r}))`;
          if (lang === 'lua' || lang === 'elixir' || lang === 'zig') return `((${l}) and (${r}))`;
          return `((${l}) && (${r}))`;
        case '∨':
          if (lang === 'sql') return `((${l}) OR (${r}))`;
          if (lang === 'lua' || lang === 'elixir' || lang === 'zig') return `((${l}) or (${r}))`;
          return `((${l}) || (${r}))`;
        case '⊕':
          if (lang === 'sql' || lang === 'ocaml') return `((${l}) <> (${r}))`;
          if (lang === 'haskell') return `((${l}) /= (${r}))`;
          if (lang === 'lua') return `((${l}) ~= (${r}))`;
          return `((${l}) != (${r}))`;
        case '→':
          if (lang === 'sql') return `((NOT (${l})) OR (${r}))`;
          if (lang === 'lua' || lang === 'elixir') return `((not (${l})) or (${r}))`;
          if (lang === 'haskell' || lang === 'ocaml') return `((not (${l})) || (${r}))`;
          if (lang === 'zig') return `((!(${l})) or (${r}))`;
          return `((!(${l})) || (${r}))`;
        case '↔':
        case '≡':
        case '=':
          if (lang === 'sql' || lang === 'ocaml') return `((${l}) = (${r}))`;
          return `((${l}) == (${r}))`;
        case '≠':
          if (lang === 'sql' || lang === 'ocaml') return `((${l}) <> (${r}))`;
          if (lang === 'haskell') return `((${l}) /= (${r}))`;
          if (lang === 'lua') return `((${l}) ~= (${r}))`;
          return `((${l}) != (${r}))`;
        case '<':
          return `((${l}) < (${r}))`;
        case '≤':
          return `((${l}) <= (${r}))`;
        case '>':
          return `((${l}) > (${r}))`;
        case '≥':
          return `((${l}) >= (${r}))`;
        case '+':
          return lang === 'ocaml' ? `((${l}) +. (${r}))` : `((${l}) + (${r}))`;
        case '-':
          return lang === 'ocaml' ? `((${l}) -. (${r}))` : `((${l}) - (${r}))`;
        case '*':
          return lang === 'ocaml' ? `((${l}) *. (${r}))` : `((${l}) * (${r}))`;
        case '/':
          return lang === 'ocaml' ? `((${l}) /. (${r}))` : `((${l}) / (${r}))`;
        case '%':
          if (lang === 'go') return `math.Mod((${l}), (${r}))`;
          if (lang === 'cpp') return `std::fmod((${l}), (${r}))`;
          if (lang === 'php') return `fmod((${l}), (${r}))`;
          if (lang === 'sql') return `MOD((${l}), (${r}))`;
          if (lang === 'swift') return `(${l}).truncatingRemainder(dividingBy: (${r}))`;
          if (lang === 'zig') return `@mod((${l}), (${r}))`;
          if (lang === 'ocaml') return `(mod_float (${l}) (${r}))`;
          if (lang === 'haskell') return `(fromIntegral (floor (${l}) \`mod\` floor (${r})))`;
          if (lang === 'elixir') return `(:math.fmod((${l}), (${r})))`;
          return `((${l}) % (${r}))`;
        case '^':
          if (lang === 'go') return `math.Pow((${l}), (${r}))`;
          if (lang === 'java' || lang === 'kotlin') return `Math.pow((${l}), (${r}))`;
          if (lang === 'cpp') return `std::pow((${l}), (${r}))`;
          if (lang === 'csharp') return `Math.Pow((${l}), (${r}))`;
          if (lang === 'php' || lang === 'haskell' || lang === 'ocaml') return `((${l}) ** (${r}))`;
          if (lang === 'sql') return `POWER((${l}), (${r}))`;
          if (lang === 'swift') return `pow((${l}), (${r}))`;
          if (lang === 'scala') return `math.pow((${l}), (${r}))`;
          if (lang === 'elixir') return `:math.pow((${l}), (${r}))`;
          if (lang === 'lua') return `((${l}) ^ (${r}))`;
          if (lang === 'zig') return `std.math.pow(f64, (${l}), (${r}))`;
          if (lang === 'dart') return `math.pow((${l}), (${r})).toDouble()`;
          return `((${l}) ** (${r}))`;
      }
    }
    case 'Quantifier':
    case 'Lambda':
    case 'Call':
      return lang === 'ocaml' ? '0.0' : '0';
  }
}

export function buildLowerTargetExecutableModule(params: {
  target: 'swift' | 'kotlin' | 'scala' | 'haskell' | 'elixir' | 'lua' | 'zig' | 'dart' | 'ocaml';
  translatedStatement: string;
  activeGrammarStr: string;
  sampleStr: string;
  allLabels: LogicLabelBinding[];
  evalOk: boolean;
  evalDisplayValue: string;
  plan: LoweredLogicPlan | null;
}): string {
  const { target, translatedStatement, activeGrammarStr, sampleStr, allLabels, evalOk, plan } = params;
  const compiledExpr = plan ? emitCompiledTargetExpr(plan.ast, target) : null;
  const isBool = plan?.resultType === 'boolean';
  const vars = plan ? plan.usedVars : [];
  const varType = (name: string) => plan?.varTypes.get(name) || 'number';

  switch (target) {
    case 'swift': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `    let v_${v}: Bool = ["true", "1", "⊤"].contains((inputs[${JSON.stringify(v)}] ?? "false").lowercased())`
            : `    guard let v_${v} = Double(inputs[${JSON.stringify(v)}] ?? "") else { fatalError("Invalid or missing numeric input: ${v}") }`
        )
        .join('\n');
      return `import Foundation
public let LOGIC_STATEMENT = ${JSON.stringify(translatedStatement)}
public let ACTIVE_GRAMMAR = ${activeGrammarStr}
public let SAMPLE_SINGLE_INPUT = ${sampleStr}
public let LOGIC_LABELS: [String: String] = [
${allLabels.map((l) => `    ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)}`).join(',\n') || '    :'}
]
public func parseInputsFromString(_ rawInput: String) -> [String: String] {
    var out = LOGIC_LABELS
    for tok in rawInput.split(whereSeparator: { $0.isWhitespace || $0 == "," || $0 == ";" }) {
        let parts = tok.split(separator: "=", maxSplits: 1)
        if parts.count == 2 { out[String(parts[0])] = String(parts[1]) }
    }
    return out
}
public func evaluateFromInput(_ rawInput: String = SAMPLE_SINGLE_INPUT) -> String {
${evalOk && compiledExpr ? `    let inputs = parseInputsFromString(rawInput)
${bindings ? `${bindings}\n` : ''}    let result = ${compiledExpr}
    return String(describing: result)` : `    fatalError("Logic expression failed to compile")`}
}`;
    }

    case 'kotlin': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `    val v_${v}: Boolean = (inputs[${JSON.stringify(v)}] ?: "false").lowercase() in setOf("true", "1", "⊤")`
            : `    val v_${v}: Double = inputs[${JSON.stringify(v)}]?.toDoubleOrNull() ?: throw IllegalArgumentException("Invalid or missing numeric input: ${v}")`
        )
        .join('\n');
      return `const val LOGIC_STATEMENT = ${JSON.stringify(translatedStatement)}
const val ACTIVE_GRAMMAR = ${activeGrammarStr}
const val SAMPLE_SINGLE_INPUT = ${sampleStr}
val LOGIC_LABELS: Map<String, String> = mapOf(
${allLabels.map((l) => `    ${JSON.stringify(l.name)} to ${JSON.stringify(l.value)}`).join(',\n')}
)
fun parseInputsFromString(rawInput: String): Map<String, String> = buildMap {
    putAll(LOGIC_LABELS)
    rawInput.trim().split(Regex("[\\\\s,;]+")).filter { it.isNotEmpty() }.forEach { tok ->
        val sep = tok.indexOf('=').takeIf { it > 0 } ?: tok.indexOf(':')
        if (sep > 0) put(tok.substring(0, sep), tok.substring(sep + 1))
    }
}
fun evaluateFromInput(rawInput: String = SAMPLE_SINGLE_INPUT): String {
${evalOk && compiledExpr ? `    val inputs = parseInputsFromString(rawInput)
${bindings ? `${bindings}\n` : ''}    val result = ${compiledExpr}
    return result.toString()` : `    throw IllegalStateException("Logic expression failed to compile")`}
}`;
    }

    case 'scala': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `    val v_${v}: Boolean = Set("true", "1", "⊤").contains(inputs.getOrElse(${JSON.stringify(v)}, "false").toLowerCase)`
            : `    val v_${v}: Double = inputs.getOrElse(${JSON.stringify(v)}, "").toDouble`
        )
        .join('\n');
      return `object LogicModule:
  val LOGIC_STATEMENT: String = ${JSON.stringify(translatedStatement)}
  val ACTIVE_GRAMMAR: String = ${activeGrammarStr}
  val SAMPLE_SINGLE_INPUT: String = ${sampleStr}
  val LOGIC_LABELS: Map[String, String] = Map(
${allLabels.map((l) => `    ${JSON.stringify(l.name)} -> ${JSON.stringify(l.value)}`).join(',\n')}
  )
  def parseInputsFromString(rawInput: String): Map[String, String] =
    val pairs = rawInput.split("[\\\\s,;]+").collect { case s if s.contains("=") => val Array(k, v) = s.split("=", 2); k -> v }
    LOGIC_LABELS ++ pairs
  def evaluateFromInput(rawInput: String = SAMPLE_SINGLE_INPUT): String =
${evalOk && compiledExpr ? `    val inputs = parseInputsFromString(rawInput)
${bindings ? `${bindings}\n` : ''}    val result = ${compiledExpr}
    result.toString` : `    throw new IllegalStateException("Logic expression failed to compile")`}`;
    }

    case 'haskell': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `    v_${v} = maybe False (\\s -> s == "true" || s == "True" || s == "1") (lookup ${JSON.stringify(v)} inputs)`
            : `    v_${v} = maybe (error "Missing input ${v}") (read :: String -> Double) (lookup ${JSON.stringify(v)} inputs)`
        )
        .join('\n');
      return `module LogicLambdaCalc where
logicStatement :: String
logicStatement = ${JSON.stringify(translatedStatement)}
activeGrammar :: String
activeGrammar = ${activeGrammarStr}
sampleSingleInput :: String
sampleSingleInput = ${sampleStr}
logicLabels :: [(String, String)]
logicLabels = [
${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(',\n')}
]
parseInputsFromString :: String -> [(String, String)]
parseInputsFromString raw =
  [(takeWhile (/= '=') w, drop 1 (dropWhile (/= '=') w)) | w <- words raw, '=' \`elem\` w] ++ logicLabels
evaluateFromInput :: String -> String
evaluateFromInput raw =
${evalOk && compiledExpr ? `  let inputs = parseInputsFromString raw
${bindings ? `${bindings}\n` : ''}  in show (${compiledExpr})` : `  error "Logic expression failed to compile"`}`;
    }

    case 'elixir': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `    v_${v} = String.downcase(Map.get(inputs, ${JSON.stringify(v)}, "false")) in ["true", "1", "⊤"]`
            : `    {v_${v}, ""} = Float.parse(to_string(Map.fetch!(inputs, ${JSON.stringify(v)})))`
        )
        .join('\n');
      return `defmodule LogicLambdaCalc do
  @logic_statement ${JSON.stringify(translatedStatement)}
  @active_grammar ${activeGrammarStr}
  @sample_single_input ${sampleStr}
  @logic_labels %{
${allLabels.map((l) => `    ${JSON.stringify(l.name)} => ${JSON.stringify(l.value)}`).join(',\n')}
  }
  def parse_inputs_from_string(raw_input) do
    raw_input |> String.split(~r/[\\s,;]+/, trim: true) |> Enum.reduce(@logic_labels, fn tok, acc ->
      case String.split(tok, ~r/[:=]/, parts: 2) do
        [k, v] -> Map.put(acc, k, v)
        _ -> acc
      end
    end)
  end
  def evaluate_from_input(raw_input \\\\ @sample_single_input) do
${evalOk && compiledExpr ? `    inputs = parse_inputs_from_string(raw_input)
${bindings ? `${bindings}\n` : ''}    result = ${compiledExpr}
    %{statement: @logic_statement, inputs: inputs, result: result}` : `    raise "Logic expression failed to compile"`}
  end
end`;
    }

    case 'lua': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `  local v_${v} = (tostring(inputs[${JSON.stringify(v)}] or "false"):lower() == "true" or tostring(inputs[${JSON.stringify(v)}]) == "1")`
            : `  local v_${v} = tonumber(inputs[${JSON.stringify(v)}])\n  if v_${v} == nil then error("Invalid or missing numeric input: ${v}") end`
        )
        .join('\n');
      return `local M = {}
M.LOGIC_STATEMENT = ${JSON.stringify(translatedStatement)}
M.ACTIVE_GRAMMAR = ${activeGrammarStr}
M.SAMPLE_SINGLE_INPUT = ${sampleStr}
M.LOGIC_LABELS = {
${allLabels.map((l) => `  [${JSON.stringify(l.name)}] = ${JSON.stringify(l.value)}`).join(',\n')}
}
function M.parse_inputs_from_string(raw_input)
  local out = {}
  for k, v in pairs(M.LOGIC_LABELS) do out[k] = v end
  for k, v in string.gmatch(raw_input or "", "([%w_]+)[:=]([^%s,;]+)") do out[k] = v end
  return out
end
function M.evaluate_from_input(raw_input)
  if raw_input == nil then raw_input = M.SAMPLE_SINGLE_INPUT end
${evalOk && compiledExpr ? `  local inputs = M.parse_inputs_from_string(raw_input)
${bindings ? `${bindings}\n` : ''}  local result = ${compiledExpr}
  if type(result) == "number" and (result ~= result or result == math.huge or result == -math.huge) then error("Division by zero or non-finite result") end
  return tostring(result)` : `  error("Logic expression failed to compile")`}
end
return M`;
    }

    case 'zig': {
      const retType = isBool ? 'bool' : 'f64';
      const varDecls = vars
        .map((v) => {
          const defVal = allLabels.find((l) => l.name === v)?.value.trim() || (varType(v) === 'boolean' ? 'false' : '0.0');
          return varType(v) === 'boolean'
            ? `    var v_${v}: bool = ${defVal.toLowerCase() === 'true' || defVal === '1' ? 'true' : 'false'};`
            : `    var v_${v}: f64 = ${fmtFloat(Number(defVal) || 0, 'zig')};`;
        })
        .join('\n');
      const parseArms = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `            if (std.mem.eql(u8, key, ${JSON.stringify(v)})) v_${v} = std.mem.eql(u8, val, "true") or std.mem.eql(u8, val, "1");`
            : `            if (std.mem.eql(u8, key, ${JSON.stringify(v)})) v_${v} = try std.fmt.parseFloat(f64, val);`
        )
        .join('\n');
      return `const std = @import("std");
pub const LOGIC_STATEMENT: []const u8 = ${JSON.stringify(translatedStatement)};
pub const ACTIVE_GRAMMAR: []const u8 = ${activeGrammarStr};
pub const SAMPLE_SINGLE_INPUT: []const u8 = ${sampleStr};
pub const EVALUATED_RESULT: []const u8 = ${JSON.stringify(params.evalDisplayValue)};
pub fn evaluateFromInput(raw_input: []const u8) !${retType} {
${evalOk && compiledExpr ? `${varDecls ? `${varDecls}\n` : ''}    var it = std.mem.tokenizeAny(u8, raw_input, " ,;\\t");
    while (it.next()) |tok| {
        if (std.mem.indexOfAny(u8, tok, "=:")) |idx| {
            const key = tok[0..idx];
            const val = tok[idx + 1 ..];
${parseArms ? `${parseArms}\n` : '            _ = key;\n            _ = val;\n'}        }
    }
    return ${compiledExpr};` : `    _ = raw_input;
    return error.InvalidLogicExpression;`}
}`;
    }

    case 'dart': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `  final bool v_${v} = const {'true', '1', '⊤'}.contains((inputs[${JSON.stringify(v)}] ?? 'false').toLowerCase());`
            : `  final double v_${v} = double.parse(inputs[${JSON.stringify(v)}] ?? '');`
        )
        .join('\n');
      return `import 'dart:math' as math;
const String logicStatement = ${JSON.stringify(translatedStatement)};
const String activeGrammar = ${activeGrammarStr};
const String sampleSingleInput = ${sampleStr};
const Map<String, String> logicLabels = {
${allLabels.map((l) => `  ${JSON.stringify(l.name)}: ${JSON.stringify(l.value)},`).join('\n')}
};
Map<String, String> parseInputsFromString(String rawInput) {
  final out = Map<String, String>.from(logicLabels);
  for (final tok in rawInput.trim().split(RegExp(r'[\\s,;]+'))) {
    final parts = tok.split(RegExp(r'[:=]'));
    if (parts.length == 2) out[parts[0]] = parts[1];
  }
  return out;
}
String evaluateFromInput([String rawInput = sampleSingleInput]) {
${evalOk && compiledExpr ? `  final inputs = parseInputsFromString(rawInput);
${bindings ? `${bindings}\n` : ''}  final result = ${compiledExpr};
  return result.toString();` : `  throw StateError("Logic expression failed to compile");`}
}`;
    }

    case 'ocaml': {
      const bindings = vars
        .map((v) =>
          varType(v) === 'boolean'
            ? `  let v_${v} = match List.assoc_opt ${JSON.stringify(v)} inputs with Some s -> (String.lowercase_ascii s = "true" || s = "1") | None -> false in`
            : `  let v_${v} = match List.assoc_opt ${JSON.stringify(v)} inputs with Some s -> float_of_string s | None -> failwith "Missing input ${v}" in`
        )
        .join('\n');
      const toStr = isBool ? 'string_of_bool' : 'string_of_float';
      return `let logic_statement = ${JSON.stringify(translatedStatement)}
let active_grammar = ${activeGrammarStr}
let sample_single_input = ${sampleStr}
let logic_labels = [
${allLabels.map((l) => `  (${JSON.stringify(l.name)}, ${JSON.stringify(l.value)})`).join(';\n')}
]
let parse_inputs_from_string raw_input =
  let parsed = raw_input |> String.split_on_char ' ' |> List.filter_map (fun tok ->
    match String.split_on_char '=' tok with [k; v] -> Some (k, v) | _ -> None) in
  parsed @ logic_labels
let evaluate_from_input raw_input =
${evalOk && compiledExpr ? `  let inputs = parse_inputs_from_string raw_input in
${bindings ? `${bindings}\n` : ''}  ${toStr} (${compiledExpr})` : `  failwith "Logic expression failed to compile"`}`;
    }
  }
}
