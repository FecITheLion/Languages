# Auto-generated Python AST module for server_config
SCHEMA_NAME = "server_config"
SCHEMA_TYPE = "DefinedTermSet"
RULE_COUNT = 5

GRAMMAR_RULES = {
    "server_config": "'{' host ',' port ',' tls '}' ;",
    "host": "'\"' [a-zA-Z0-9.-]+ '\"' ; (* minLength>=3 *)",
    "port": "digit+ ; (* min>=1, max<=65535 *)",
    "tls": "'true' | 'false' ;",
    "digit": "[0-9] ;",
}

def get_rule_count():
    return RULE_COUNT

def validate_rule(rule_name):
    return rule_name in GRAMMAR_RULES

ORDER_OF_OPERATIONS = [
    (1, "server_config", "left"),
    (2, "host", "left"),
    (3, "port", "left"),
    (4, "tls", "left"),
    (5, "digit", "left"),
]

RULE_PROPERTIES = {
    "server_config": {},
    "host": {},
    "port": {},
    "tls": {},
    "digit": {},
}

CLI_NAMED_PARAMETERS = [

]

def _coerce_cli_value(raw: str):
    t = raw.strip()
    if t.lower() == 'true':
        return True
    if t.lower() == 'false':
        return False
    try:
        return int(t) if t.lstrip('-').isdigit() else float(t)
    except ValueError:
        return t

def _split_ebnf_alts(expr: str):
    parts, buf, depth, quote, i = [], [], 0, None, 0
    while i < len(expr):
        ch = expr[i]
        if quote:
            buf.append(ch)
            if ch == '\\' and i + 1 < len(expr):
                i += 1
                buf.append(expr[i])
            elif ch == quote:
                quote = None
        elif ch in ('"', "'"):
            quote = ch
            buf.append(ch)
        elif ch in ('(', '['):
            depth += 1
            buf.append(ch)
        elif ch in (')', ']') and depth > 0:
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

def _strip_ebnf_comments(expr: str) -> str:
    import re
    cleaned = re.sub(r'\(\*.*?\*\)', '', expr).strip()
    return cleaned[:-1].strip() if cleaned.endswith(';') else cleaned

def _compile_ebnf_expr(expr: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    import re
    alts = _split_ebnf_alts(expr)
    compiled = []
    for alt in alts:
        tokens = re.findall(r"""(?:"[^"]*"|'[^']*'|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()+*?])""", alt)
        seq = []
        for tok in tokens:
            if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                seq.append(re.escape(tok[1:-1]))
            elif tok.startswith('[') and tok.endswith(']'):
                inner = tok[1:-1].strip()
                if inner in rules or "'" in inner or '"' in inner:
                    seq.append(f'(?:{_compile_ebnf_expr(inner, rules, depth + 1, capture_names)})?')
                else:
                    seq.append(tok)
            elif tok in ('(', ')', '+', '*', '?'):
                seq.append(tok)
            else:
                q = tok[-1] if tok[-1] in '+*?' else ''
                ref = tok[:-1] if q else tok
                if ref in rules:
                    sub = _compile_ebnf_regex(ref, rules, depth + 1, capture_names)
                    if capture_names is not None and ref not in capture_names and depth == 0:
                        capture_names.add(ref)
                        seq.append(f'(?P<{ref}>{sub}){q}')
                    else:
                        seq.append(f'(?:{sub}){q}')
                else:
                    seq.append(re.escape(ref) + q)
        compiled.append(''.join(seq))
    return '(?:' + '|'.join(compiled) + ')' if len(compiled) > 1 else (compiled[0] if compiled else '')

def _compile_ebnf_regex(rule_name: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    if depth > 12:
        return r'[^,}\s]+'
    raw_expr = rules.get(rule_name)
    if not raw_expr:
        return r'[^,}\s]+'
    return _compile_ebnf_expr(_strip_ebnf_comments(raw_expr), rules, depth, capture_names)

def _check_rule_constraints(name: str, raw_value: str, raw_expr: str):
    import re
    errors = []
    val = raw_value.strip()
    unquoted = val[1:-1] if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'") else val
    for body in re.findall(r'\(\*(.*?)\*\)', raw_expr):
        for clause in [c.strip() for c in re.split(r'[,;]', body) if c.strip()]:
            m_re = re.match(r'^/(.+)/$', clause)
            if m_re:
                if not re.search(m_re.group(1), unquoted):
                    errors.append(f"{name}: constraint ({clause}) failed for {raw_value!r}")
                continue
            m_num = re.match(r'^(minLength|maxLength|min|minimum|max|maximum)\s*(>=|<=|>|<|=)\s*([+-]?\d+(?:\.\d+)?)$', clause, re.I)
            if m_num:
                key, op, num = m_num.group(1).lower(), m_num.group(2), float(m_num.group(3))
                if key == 'minlength' and len(unquoted) < int(num + (1 if op == '>' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} < {int(num)}")
                elif key == 'maxlength' and len(unquoted) > int(num - (1 if op == '<' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} > {int(num)}")
                elif key in ('min', 'minimum'):
                    n = float(unquoted)
                    if (op == '>' and n <= num) or (op != '>' and n < num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} < {num:g}")
                elif key in ('max', 'maximum'):
                    n = float(unquoted)
                    if (op == '<' and n >= num) or (op != '<' and n > num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} > {num:g}")
    return errors

def validate_payload(payload: str, start_rule: str = None, rules=GRAMMAR_RULES):
    """Validates an input payload against the compiled EBNF grammar and (* constraint *) comments."""
    import re
    entry = start_rule or (next(iter(rules)) if rules else '')
    captured_names = set()
    pattern = _compile_ebnf_regex(entry, rules, 0, captured_names)
    m = re.fullmatch(pattern, payload.strip())
    if not m:
        return {"matched": False, "startRule": entry, "captured": {}, "errors": [f"Payload did not match <{entry}>"]}
    captured = {k: v for k, v in m.groupdict().items() if v is not None}
    errors = []
    errors.extend(_check_rule_constraints(entry, payload.strip(), rules.get(entry, '')))
    for k, v in captured.items():
        errors.extend(_check_rule_constraints(k, v, rules.get(k, '')))
    return {"matched": len(errors) == 0, "startRule": entry, "captured": captured, "errors": errors}

def run_workspace_cli(argv=None):
    """Exposes named rule properties as literal CLI options, allows editing strings, or validates --input payloads."""
    import argparse, json, sys
    parser = argparse.ArgumentParser(description=f"Grammar2JSON Workspace CLI ({SCHEMA_NAME})")
    parser.add_argument("payload", nargs="?", default=None, help="Optional payload string to validate against the start rule")
    parser.add_argument("--input", dest="input_payload", default=None, help="Payload string to validate against the grammar")
    parser.add_argument("--start-rule", default=None, help="Start rule name (defaults to first rule)")
    parser.add_argument("--schema-name", default=SCHEMA_NAME, help=f"Edit SCHEMA_NAME string (default: {SCHEMA_NAME})")
    parser.add_argument("--rule", action="append", default=[], help="Override a rule string as name=expression")
    for p_name, p_default in CLI_NAMED_PARAMETERS:
        parser.add_argument(f"--{p_name}", dest=f"param__{p_name}", default=None, help=f"Literal value for '{p_name}' (default: {p_default})")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    resolved_params = {
        p_name: _coerce_cli_value(getattr(args, f"param__{p_name}") if getattr(args, f"param__{p_name}") is not None else p_default)
        for p_name, p_default in CLI_NAMED_PARAMETERS
    }
    edited_rules = dict(GRAMMAR_RULES) if "GRAMMAR_RULES" in globals() else {}
    for override in args.rule:
        if "=" in override:
            k, v = override.split("=", 1)
            edited_rules[k.strip()] = v.strip()
    raw_payload = args.input_payload if args.input_payload is not None else args.payload
    if raw_payload is not None:
        result = validate_payload(raw_payload, args.start_rule, edited_rules)
        print(json.dumps(result, indent=2))
        if not result["matched"]:
            sys.exit(1)
        return
    print(json.dumps({"schemaName": args.schema_name, "parameters": resolved_params, "ruleCount": len(ORDER_OF_OPERATIONS), "rules": edited_rules}, indent=2))

if __name__ == "__main__":
    run_workspace_cli()

