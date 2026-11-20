export interface LabelConventionMeta {
  id: string;
  label: string;
  standardRef: string;
  tooltip: string;
}

/** Industry-standard naming conventions and explanatory tooltips for every calculator panel. */
export const CALCULATOR_LABEL_CONVENTIONS: Record<string, LabelConventionMeta> = {
  preInput: {
    id: 'preInput',
    label: 'Pre-Input · Valuation (Γ)',
    standardRef: 'Valuation / Interpretation Environment (ISO/IEC 80000-2)',
    tooltip:
      'Industry Convention: Valuation / Interpretation Environment (Γ). Accepts ONLY line-separated literal boolean or numeric assignments (e.g., e=true, x=1, y=0 where 1=true and 0=false). Injected into scope prior to execution.',
  },
  programInput: {
    id: 'programInput',
    label: 'Input · Formula & Lambda Buffer',
    standardRef: 'Well-Formed Formula (WFF), Lambda Calculus & SSA Binding Sequence',
    tooltip:
      'Industry Convention: Well-Formed Formula (WFF) & Lambda Program Buffer. Supports named callables (a(b,c)=b & c), lambda assignments (f = λ(x,y). x + y or (x,y) => x + y), value assignments (d=false), numeric/logic crossovers (1=true, 0=false), and multiline blocks.',
  },
  pointerOutput: {
    id: 'pointerOutput',
    label: 'Condensed Pointer-Annotated Output Stream (SSA Value Trace)',
    standardRef: 'Static Single Assignment (SSA) Value Numbering & Dereference Trace',
    tooltip:
      'Industry Convention: SSA Value-Pointer Output Stream. Callable definitions are unreferenceable compile-time signatures ("true or false") and are excluded from pointer numbering; assignments and entrypoint calls receive sequential pointer indices ([line#1], [line#2], ...).',
  },
  alignedOutput: {
    id: 'alignedOutput',
    label: 'Output · Evaluation Trace',
    standardRef: 'Operational Semantics Trace & Codomain Range Analysis',
    tooltip:
      'Industry Convention: Operational Semantics Trace. Callable definitions evaluate their codomain range ordered by first definite occurrence left-to-right. Hover any row to highlight its source block; hover an orange [line#N] pointer to highlight the referenced line in orange while keeping the current line highlighted in blue.',
  },
  postOutput: {
    id: 'postOutput',
    label: 'Post-Output · Entrypoint Result',
    standardRef: 'Postcondition Register / Program Entrypoint Return Value',
    tooltip:
      'Industry Convention: Terminal Evaluation / Entrypoint Result. Displays the final resolved boolean, numeric, or callable value of the last executable expression in the buffer.',
  },
  truthTable: {
    id: 'truthTable',
    label: 'Live Truth Table (Semantic Valuation Matrix)',
    standardRef: 'IEEE Std 91 / ISO 80000-2 Complete Truth-Function Enumeration',
    tooltip:
      'Industry Convention: Semantic Truth Table. Exhaustively enumerates all 2^n boolean valuations for the hovered, selected, or entrypoint expression. The row matching your current Pre-Input and assignments is highlighted.',
  },
  symbolPalette: {
    id: 'symbolPalette',
    label: 'Operator Taxonomy Palette (Drag & Drop)',
    standardRef: 'Formal Logic, Arithmetic, Lambda Calculus & Argumentation Schemes',
    tooltip:
      'Industry Convention: Formal & Informal Operator Taxonomy. Organized across Classical Boolean, Lambda Calculus, Arithmetic/Relational (1/0 crossover), First-Order Predicate, Modal/Temporal, Many-Valued, Substructural, Paraconsistent, and Informal Argumentation. Drag or click any symbol to insert.',
  },
};

export interface LogicSymbolSpec {
  id: string;
  unicode: string;
  codePoint: string;
  name: string;
  textRepresentation: string;
  outputEffect: string;
  insert: string;
  arity: 'nullary' | 'unary' | 'binary' | 'binder' | 'prefix-call';
}

export interface LogicCategorySpec {
  id: string;
  title: string;
  tradition: 'formal' | 'informal';
  description: string;
  items: LogicSymbolSpec[];
}

/** Known world of formal logic, arithmetic/relational crossover, lambda calculus, and informal logic. */
export const LOGIC_SYSTEM_CATEGORIES: LogicCategorySpec[] = [
  {
    id: 'classical',
    title: '1. Classical Propositional & Boolean Algebra',
    tradition: 'formal',
    description: 'Two-valued truth-functional connectives (ISO/IEC 80000-2 & IEEE Std 91).',
    items: [
      {
        id: 'not',
        unicode: '¬',
        codePoint: 'U+00AC',
        name: 'Logical Negation (NOT)',
        textRepresentation: '¬x  (ASCII text: !x, ~x, not x)',
        outputEffect: 'Inverts truth value (¬1 → false, ¬0 → true).',
        insert: '¬',
        arity: 'unary',
      },
      {
        id: 'and',
        unicode: '∧',
        codePoint: 'U+2227',
        name: 'Conjunction (AND)',
        textRepresentation: 'a ∧ b  (ASCII text: a & b, a && b, a and b, a /\\ b)',
        outputEffect: 'Returns true iff both operands are truthy.',
        insert: ' ∧ ',
        arity: 'binary',
      },
      {
        id: 'or',
        unicode: '∨',
        codePoint: 'U+2228',
        name: 'Disjunction (Inclusive OR)',
        textRepresentation: 'a ∨ b  (ASCII text: a | b, a || b, a or b, a \\/ b)',
        outputEffect: 'Returns true if at least one operand is truthy.',
        insert: ' ∨ ',
        arity: 'binary',
      },
      {
        id: 'xor',
        unicode: '⊕',
        codePoint: 'U+2295',
        name: 'Exclusive Disjunction (XOR)',
        textRepresentation: 'a ⊕ b  (ASCII text: a ^ b, a xor b)',
        outputEffect: 'Returns true iff operands have differing truth values.',
        insert: ' ⊕ ',
        arity: 'binary',
      },
      {
        id: 'implies',
        unicode: '→',
        codePoint: 'U+2192',
        name: 'Material Implication (IF–THEN)',
        textRepresentation: 'a → b  (ASCII text: a -> b, a implies b)',
        outputEffect: 'False only when antecedent is truthy and consequent is falsy.',
        insert: ' → ',
        arity: 'binary',
      },
      {
        id: 'iff',
        unicode: '↔',
        codePoint: 'U+2194',
        name: 'Material Biconditional (IFF)',
        textRepresentation: 'a ↔ b  (ASCII text: a <-> b, a <=> b, a iff b)',
        outputEffect: 'Returns true iff both operands share the same truth value.',
        insert: ' ↔ ',
        arity: 'binary',
      },
      {
        id: 'nand',
        unicode: '⊼',
        codePoint: 'U+22BC',
        name: 'Sheffer Stroke (NAND)',
        textRepresentation: 'a ⊼ b  (ASCII text: a ↑ b, a !& b, a nand b)',
        outputEffect: 'Functionally complete negated AND: false only when both operands are truthy.',
        insert: ' ↑ ',
        arity: 'binary',
      },
      {
        id: 'nor',
        unicode: '⊽',
        codePoint: 'U+22BD',
        name: 'Peirce Arrow (NOR)',
        textRepresentation: 'a ⊽ b  (ASCII text: a ↓ b, a !| b, a nor b)',
        outputEffect: 'Functionally complete negated OR: true only when both operands are falsy.',
        insert: ' ↓ ',
        arity: 'binary',
      },
      {
        id: 'top',
        unicode: '⊤',
        codePoint: 'U+22A4',
        name: 'Verum / Tautology Constant',
        textRepresentation: '⊤  (ASCII text: true, 1)',
        outputEffect: 'Logical truth; coerces to 1 in arithmetic.',
        insert: 'true',
        arity: 'nullary',
      },
      {
        id: 'bottom',
        unicode: '⊥',
        codePoint: 'U+22A5',
        name: 'Falsum / Contradiction Constant',
        textRepresentation: '⊥  (ASCII text: false, 0)',
        outputEffect: 'Logical falsehood; coerces to 0 in arithmetic.',
        insert: 'false',
        arity: 'nullary',
      },
    ],
  },
  {
    id: 'lambda_calculus',
    title: '2. Lambda Calculus & Callables',
    tradition: 'formal',
    description: 'First-class closures, arrow lambdas, named callables, and curried higher-order functions.',
    items: [
      {
        id: 'lambda_abs',
        unicode: 'λ',
        codePoint: 'U+03BB',
        name: 'Lambda Abstraction',
        textRepresentation: 'λx. expr , λ(x,y). expr , \\x. expr',
        outputEffect: 'Constructs an anonymous first-class function closure.',
        insert: 'λ(x, y). ',
        arity: 'binder',
      },
      {
        id: 'arrow_lambda',
        unicode: '⇒',
        codePoint: 'U+21D2',
        name: 'Arrow Lambda',
        textRepresentation: 'x => expr , (x, y) => expr',
        outputEffect: 'ES-style anonymous lambda expression returning a closure.',
        insert: '(x, y) => ',
        arity: 'binder',
      },
      {
        id: 'named_callable',
        unicode: 'f(x)',
        codePoint: 'Signature',
        name: 'Named Callable',
        textRepresentation: 'name(p1, p2) = expr',
        outputEffect: 'Binds an unreferenceable named callable and computes its codomain range.',
        insert: 'f(x, y) = x & y',
        arity: 'prefix-call',
      },
      {
        id: 'curried_lambda',
        unicode: 'λx.λy',
        codePoint: 'Curried',
        name: 'Curried Lambda',
        textRepresentation: 'λx. λy. expr',
        outputEffect: 'Higher-order function returning another callable.',
        insert: 'λx. λy. x + y',
        arity: 'binder',
      },
    ],
  },
  {
    id: 'arithmetic',
    title: '3. Arithmetic & Relational (1/0 Crossover)',
    tradition: 'formal',
    description: 'Numeric operators with automatic boolean↔number coercion (true→1, false→0) and relational bridges.',
    items: [
      { id: 'add', unicode: '+', codePoint: 'U+002B', name: 'Addition', textRepresentation: 'a + b', outputEffect: 'Sums operands; coerces true→1, false→0.', insert: ' + ', arity: 'binary' },
      { id: 'sub', unicode: '−', codePoint: 'U+2212', name: 'Subtraction', textRepresentation: 'a - b  (or unary -x)', outputEffect: 'Subtracts right from left (true→1, false→0).', insert: ' - ', arity: 'binary' },
      { id: 'mul', unicode: '×', codePoint: 'U+00D7', name: 'Multiplication', textRepresentation: 'a * b  (or ×)', outputEffect: 'Multiplies operands (true→1, false→0).', insert: ' * ', arity: 'binary' },
      { id: 'div', unicode: '÷', codePoint: 'U+00F7', name: 'Division', textRepresentation: 'a / b  (or ÷)', outputEffect: 'Divides left operand by right operand (throws on 0).', insert: ' / ', arity: 'binary' },
      { id: 'mod', unicode: '%', codePoint: 'U+0025', name: 'Modulo', textRepresentation: 'a % b', outputEffect: 'Returns remainder of division.', insert: ' % ', arity: 'binary' },
      { id: 'pow', unicode: '**', codePoint: 'Exponent', name: 'Exponentiation', textRepresentation: 'a ** b', outputEffect: 'Raises base to exponent power (right-associative).', insert: ' ** ', arity: 'binary' },
      { id: 'eq', unicode: '==', codePoint: 'Equality', name: 'Equal (1==true)', textRepresentation: 'a == b', outputEffect: 'Equality with 1==true and 0==false boolean crossover.', insert: ' == ', arity: 'binary' },
      { id: 'noteq', unicode: '≠', codePoint: 'U+2260', name: 'Not Equal (1!=false)', textRepresentation: 'a != b  (or ≠)', outputEffect: 'Inequality with 1/0 boolean crossover.', insert: ' != ', arity: 'binary' },
      { id: 'lt', unicode: '<', codePoint: 'U+003C', name: 'Less Than', textRepresentation: 'a < b', outputEffect: 'Numeric comparison (false=0 < true=1).', insert: ' < ', arity: 'binary' },
      { id: 'lte', unicode: '≤', codePoint: 'U+2264', name: 'Less or Equal', textRepresentation: 'a <= b  (or ≤)', outputEffect: 'Returns true if left <= right.', insert: ' <= ', arity: 'binary' },
      { id: 'gt', unicode: '>', codePoint: 'U+003E', name: 'Greater Than', textRepresentation: 'a > b', outputEffect: 'Returns true if left > right.', insert: ' > ', arity: 'binary' },
      { id: 'gte', unicode: '≥', codePoint: 'U+2265', name: 'Greater or Equal', textRepresentation: 'a >= b  (or ≥)', outputEffect: 'Returns true if left >= right.', insert: ' >= ', arity: 'binary' },
    ],
  },
  {
    id: 'predicate',
    title: '4. First-Order Predicate Logic',
    tradition: 'formal',
    description: 'Quantifiers over boolean domains, equivalence, and definitional equality.',
    items: [
      {
        id: 'forall',
        unicode: '∀',
        codePoint: 'U+2200',
        name: 'Universal Quantifier (For All)',
        textRepresentation: '∀x. P(x)  (ASCII text: forall x. ...)',
        outputEffect: 'Evaluates body across x=false AND x=true; outputs true only if both hold.',
        insert: '∀x. ',
        arity: 'binder',
      },
      {
        id: 'exists',
        unicode: '∃',
        codePoint: 'U+2203',
        name: 'Existential Quantifier (There Exists)',
        textRepresentation: '∃x. P(x)  (ASCII text: exists x. ...)',
        outputEffect: 'Evaluates body across x=false OR x=true; outputs true if at least one holds.',
        insert: '∃x. ',
        arity: 'binder',
      },
      {
        id: 'exists_unique',
        unicode: '∃!',
        codePoint: 'U+2203+0021',
        name: 'Uniqueness Quantifier (Exists Exactly One)',
        textRepresentation: '∃!x. P(x)  (ASCII text: exists! x. ...)',
        outputEffect: 'Outputs true iff P(false) ⊕ P(true).',
        insert: '∃!x. ',
        arity: 'binder',
      },
      {
        id: 'defeq',
        unicode: '≜',
        codePoint: 'U+225C',
        name: 'Definitional Equality',
        textRepresentation: 'a(b,c) ≜ b ∧ c  (ASCII text: a(b,c)=b & c, :=)',
        outputEffect: 'Declares a callable or referenceable binding.',
        insert: ' ≜ ',
        arity: 'binary',
      },
      {
        id: 'equiv',
        unicode: '≡',
        codePoint: 'U+2261',
        name: 'Logical Equivalence',
        textRepresentation: 'a ≡ b  (ASCII text: a == b, a equiv b)',
        outputEffect: 'Tests truth-value equivalence.',
        insert: ' ≡ ',
        arity: 'binary',
      },
    ],
  },
  {
    id: 'modal',
    title: '5. Modal, Alethic, Epistemic & Deontic Logic',
    tradition: 'formal',
    description: 'Necessity, possibility, strict implication, knowledge (K), and obligation (O).',
    items: [
      { id: 'box', unicode: '□', codePoint: 'U+25A1', name: 'Necessity / Globally (Box)', textRepresentation: '□p  (box(p), []p, nec p)', outputEffect: 'Modal necessity projection (true when proposition holds).', insert: '□(', arity: 'unary' },
      { id: 'diamond', unicode: '◇', codePoint: 'U+25C7', name: 'Possibility / Eventually (Diamond)', textRepresentation: '◇p  (dia(p), pos p)', outputEffect: 'Modal possibility dual ¬□¬p.', insert: '◇(', arity: 'unary' },
      { id: 'strict_implies', unicode: '⥽', codePoint: 'U+297D', name: 'Strict Implication (Fishhook)', textRepresentation: 'a ⥽ b  (a -< b)', outputEffect: 'Interpreted as □(a → b).', insert: ' ⥽ ', arity: 'binary' },
      { id: 'knows', unicode: '𝐊', codePoint: 'U+1D40A', name: 'Epistemic Knowledge Kₐ', textRepresentation: '𝐊(p)  (knows(p))', outputEffect: 'Veridical knowledge projection.', insert: '𝐊(', arity: 'unary' },
      { id: 'obligatory', unicode: '𝐎', codePoint: 'U+1D40E', name: 'Deontic Obligation', textRepresentation: '𝐎(p)  (obligatory(p))', outputEffect: 'Deontic normative satisfaction check.', insert: '𝐎(', arity: 'unary' },
      { id: 'forbidden', unicode: '𝐅', codePoint: 'U+1D405', name: 'Deontic Prohibition', textRepresentation: '𝐅(p)  (forbidden(p))', outputEffect: 'Prohibition dual ¬p.', insert: '𝐅(', arity: 'unary' },
    ],
  },
  {
    id: 'temporal',
    title: '6. Temporal & Dynamic Logic (LTL / CTL)',
    tradition: 'formal',
    description: 'Linear and branching-time trace operators over state sequences.',
    items: [
      { id: 'next', unicode: '◯', codePoint: 'U+25EF', name: 'Temporal Next (LTL X)', textRepresentation: '◯p  (next p)', outputEffect: 'Immediate state projection.', insert: '◯(', arity: 'unary' },
      { id: 'until', unicode: '𝒰', codePoint: 'U+1D4B0', name: 'Temporal Strong Until (LTL U)', textRepresentation: 'a 𝒰 b  (a until b)', outputEffect: 'Satisfied when consequent b holds or a ∧ b.', insert: ' 𝒰 ', arity: 'binary' },
      { id: 'release', unicode: 'ℛ', codePoint: 'U+211B', name: 'Temporal Release (LTL R)', textRepresentation: 'a ℛ b  (a release b)', outputEffect: 'Holds whenever consequent b holds.', insert: ' ℛ ', arity: 'binary' },
      { id: 'weak_until', unicode: '𝒲', codePoint: 'U+1D4B2', name: 'Temporal Weak Until (LTL W)', textRepresentation: 'a 𝒲 b  (a weak_until b)', outputEffect: 'Satisfied when a ∨ b holds.', insert: ' 𝒲 ', arity: 'binary' },
    ],
  },
  {
    id: 'many_valued',
    title: '7. Many-Valued, Kleene, Łukasiewicz & Fuzzy Logic',
    tradition: 'formal',
    description: 'Intermediate truth degrees projected cleanly onto boolean decision boundaries.',
    items: [
      { id: 'luk_and', unicode: '⊗ₗ', codePoint: 'U+2297+2097', name: 'Łukasiewicz Strong Conjunction', textRepresentation: 'a ⊗ₗ b  (a luk_and b)', outputEffect: 'Bounded t-norm max(0, a + b - 1).', insert: ' ⊗ₗ ', arity: 'binary' },
      { id: 'luk_imp', unicode: '→ₗ', codePoint: 'U+2192+2097', name: 'Łukasiewicz Implication', textRepresentation: 'a →ₗ b  (a luk_implies b)', outputEffect: 'Residuated implication min(1, 1 - a + b).', insert: ' →ₗ ', arity: 'binary' },
      { id: 'kleene_not', unicode: '∼', codePoint: 'U+223C', name: 'Kleene Complement', textRepresentation: '∼p  (~p, fuzzy_not p)', outputEffect: 'Truth inversion.', insert: '∼', arity: 'unary' },
      { id: 'undef', unicode: '½', codePoint: 'U+00BD', name: 'Indeterminate Threshold', textRepresentation: '½  (indeterminate)', outputEffect: 'Conservative projection to false.', insert: '½', arity: 'nullary' },
    ],
  },
  {
    id: 'substructural',
    title: '8. Intuitionistic, Linear & Substructural Logic',
    tradition: 'formal',
    description: 'Constructive provability turnstiles and Girard linear resource connectives.',
    items: [
      { id: 'turnstile', unicode: '⊢', codePoint: 'U+22A2', name: 'Syntactic Turnstile (Proves)', textRepresentation: 'a ⊢ b  (a |- b, a proves b)', outputEffect: 'Deduction check ¬a ∨ b.', insert: ' ⊢ ', arity: 'binary' },
      { id: 'models', unicode: '⊨', codePoint: 'U+22A8', name: 'Semantic Entailment', textRepresentation: 'a ⊨ b  (a |= b, a entails b)', outputEffect: 'Semantic validity check ¬a ∨ b.', insert: ' ⊨ ', arity: 'binary' },
      { id: 'lolli', unicode: '⊸', codePoint: 'U+22B8', name: 'Linear Implication (Lollipop)', textRepresentation: 'a ⊸ b  (a -o b, a lolli b)', outputEffect: 'Consumes a to produce b.', insert: ' ⊸ ', arity: 'binary' },
      { id: 'tensor', unicode: '⊗', codePoint: 'U+2297', name: 'Multiplicative Conjunction (Tensor)', textRepresentation: 'a ⊗ b  (a tensor b)', outputEffect: 'Requires both resources simultaneously.', insert: ' ⊗ ', arity: 'binary' },
      { id: 'par', unicode: '⅋', codePoint: 'U+214B', name: 'Multiplicative Disjunction (Par)', textRepresentation: 'a ⅋ b  (a par b)', outputEffect: 'Parallel resource choice.', insert: ' ⅋ ', arity: 'binary' },
    ],
  },
  {
    id: 'paraconsistent',
    title: '9. Paraconsistent, Relevance & Non-Monotonic Logic',
    tradition: 'formal',
    description: 'Defeasible conditionals, forcing, and relevance connectives.',
    items: [
      { id: 'defeasible', unicode: '⇝', codePoint: 'U+21DD', name: 'Defeasible Default', textRepresentation: 'a ⇝ b  (a ~> b, a defaults_to b)', outputEffect: 'Normally-implies conditional.', insert: ' ⇝ ', arity: 'binary' },
      { id: 'forces', unicode: '⊩', codePoint: 'U+22A9', name: 'Cohen / Kripke Forcing', textRepresentation: 'a ⊩ b  (a ||- b, a forces b)', outputEffect: 'Condition a forces conclusion b.', insert: ' ⊩ ', arity: 'binary' },
      { id: 'rel_equiv', unicode: '≊', codePoint: 'U+224A', name: 'Relevance Co-Entailment', textRepresentation: 'a ≊ b  (a rel_equiv b)', outputEffect: 'Mutual relevance equivalence.', insert: ' ≊ ', arity: 'binary' },
    ],
  },
  {
    id: 'informal',
    title: '10. Informal Logic, Argumentation & Critical Reasoning',
    tradition: 'informal',
    description: 'Everyday deduction/abduction cues, warrant links, and Dung-style rebuttals.',
    items: [
      { id: 'therefore', unicode: '∴', codePoint: 'U+2234', name: 'Therefore (Deductive Marker)', textRepresentation: 'p ∴ c  (p therefore c)', outputEffect: 'Premise-to-conclusion validity test.', insert: ' ∴ ', arity: 'binary' },
      { id: 'because', unicode: '∵', codePoint: 'U+2235', name: 'Because (Explanatory Ground)', textRepresentation: 'c ∵ p  (c because p)', outputEffect: 'Reverse conditional p → c.', insert: ' ∵ ', arity: 'binary' },
      { id: 'rebut', unicode: '⊘', codePoint: 'U+2298', name: 'Undefeated After Rebuttal', textRepresentation: 'arg ⊘ defeater  (arg rebut defeater)', outputEffect: 'True only when argument stands and defeater is false.', insert: ' ⊘ ', arity: 'binary' },
      { id: 'co_support', unicode: '⊕ᵥ', codePoint: 'U+2295+1D65', name: 'Linked Warrant Support', textRepresentation: 'p ⊕ᵥ w  (p warrant w)', outputEffect: 'True iff both premise and warrant hold.', insert: ' ⊕ᵥ ', arity: 'binary' },
      { id: 'inductive', unicode: '⇒ᵢ', codePoint: 'U+21D2+1D62', name: 'Inductive Generalization Link', textRepresentation: 'evidence ⇒ᵢ claim  (evidence inductively claim)', outputEffect: 'Plausibility bridge ¬evidence ∨ claim.', insert: ' ⇒ᵢ ', arity: 'binary' },
    ],
  },
];

export interface FormalLogicPreset {
  id: 'boolean_default' | 'crossover' | 'lambda_currying' | 'multiline_block';
  label: string;
  description: string;
  preInput: string;
  program: string;
}

export const FORMAL_LOGIC_PRESETS: FormalLogicPreset[] = [
  {
    id: 'boolean_default',
    label: 'Boolean Default',
    description: 'Reference 3-line callable + assignment + SSA pointer entrypoint (a(e,d) -> false)',
    preInput: 'e=true',
    program: 'a(b,c)=b & c\nd=false\na(e,d)',
  },
  {
    id: 'crossover',
    label: '1/0 & Arithmetic Crossover',
    description: 'Mixes 1/0 numeric literals, arithmetic comparison, and boolean operators',
    preInput: 'e=1\nx=0',
    program: 'gate(b,c) = (b + c) >= 1\nd = ¬1\ngate(e, d) & (e == true)',
  },
  {
    id: 'lambda_currying',
    label: 'Lambda & Currying',
    description: 'Higher-order λ currying, partial application, and arrow lambdas',
    preInput: 'e=true\nx=10',
    program: 'makeAdder = λa. λb. a + b\nadd5 = makeAdder(5)\ncheck = (n, flag) => (n > 12) & flag\ncheck(add5(x), e)',
  },
  {
    id: 'multiline_block',
    label: 'Multiline Block',
    description: 'Whitespace-collapsed multiline callable & left-to-right range ordering (false or true)',
    preInput: 'e=true',
    program: 'a(b, c) =\n  ¬true ∨\n  c\nd = false\na(\n  e,\n  d\n)',
  },
];

export type BoolAstNode =
  | { type: 'Bool'; value: boolean }
  | { type: 'Number'; value: number }
  | { type: 'Var'; name: string }
  | { type: 'Unary'; op: string; arg: BoolAstNode }
  | { type: 'Binary'; op: string; left: BoolAstNode; right: BoolAstNode }
  | { type: 'Quantifier'; q: '∀' | '∃' | '∃!'; variable: string; body: BoolAstNode }
  | { type: 'Lambda'; params: string[]; body: BoolAstNode }
  | { type: 'Ternary'; cond: BoolAstNode; thenExpr: BoolAstNode; elseExpr: BoolAstNode }
  | { type: 'Call'; name?: string; callee: BoolAstNode; args: BoolAstNode[] };

export interface MultilineCallableValue {
  __callable: true;
  name?: string;
  params: string[];
  body: BoolAstNode;
  closureEnv: Record<string, MultilineRuntimeValue>;
  isNamedDefinition?: boolean;
}

export type MultilineRuntimeValue = boolean | number | MultilineCallableValue;

export interface PreInputParseResult {
  ok: boolean;
  values: Record<string, boolean>;
  rawValues: Record<string, boolean | number>;
  entries: Array<{ line: number; name: string; value: boolean; raw: string }>;
  typedEntries: Array<{ line: number; name: string; value: boolean | number; kind: 'boolean' | 'number'; raw: string }>;
  errors: Array<{ line: number; message: string }>;
}

/** Parses ONLY line-separated literal boolean or numeric assignments (e.g. "e=true\nx=1"). */
export function parsePreInputLiterals(raw: string): PreInputParseResult {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const values: Record<string, boolean> = {};
  const rawValues: Record<string, boolean | number> = {};
  const entries: PreInputParseResult['entries'] = [];
  const typedEntries: PreInputParseResult['typedEntries'] = [];
  const errors: PreInputParseResult['errors'] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:=|:=|≜)\s*(true|false|⊤|⊥|-?\d+(?:\.\d+)?)$/i.exec(trimmed);
    if (!match) {
      errors.push({
        line: idx + 1,
        message: `Line ${idx + 1}: Pre-input only allows boolean or numeric literals (e.g., e=true, order.price=45; not "${trimmed}").`,
      });
      continue;
    }
    const name = match[1];
    const lit = match[2].trim().toLowerCase();
    if (lit === 'true' || lit === '⊤') {
      values[name] = true;
      rawValues[name] = true;
      entries.push({ line: idx + 1, name, value: true, raw: trimmed });
      typedEntries.push({ line: idx + 1, name, value: true, kind: 'boolean', raw: trimmed });
    } else if (lit === 'false' || lit === '⊥') {
      values[name] = false;
      rawValues[name] = false;
      entries.push({ line: idx + 1, name, value: false, raw: trimmed });
      typedEntries.push({ line: idx + 1, name, value: false, kind: 'boolean', raw: trimmed });
    } else {
      const numVal = Number(lit);
      values[name] = numVal !== 0 && !Number.isNaN(numVal);
      rawValues[name] = numVal;
      entries.push({ line: idx + 1, name, value: values[name], raw: trimmed });
      typedEntries.push({ line: idx + 1, name, value: numVal, kind: 'number', raw: trimmed });
    }
  }
  return { ok: errors.length === 0, values, rawValues, entries, typedEntries, errors };
}

type BoolToken =
  | { kind: 'id'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'num'; value: number }
  | { kind: 'lambda'; value: 'λ' }
  | { kind: 'arrow'; value: '=>' }
  | { kind: 'op'; value: string }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'comma'; value: ',' }
  | { kind: 'dot'; value: '.' }
  | { kind: 'question'; value: '?' }
  | { kind: 'colon'; value: ':' }
  | { kind: 'eof'; value: '' };

const KEYWORD_OP_MAP: Record<string, { kind: 'op' | 'bool'; value: string | boolean }> = {
  true: { kind: 'bool', value: true },
  false: { kind: 'bool', value: false },
  not: { kind: 'op', value: '¬' },
  and: { kind: 'op', value: '∧' },
  or: { kind: 'op', value: '∨' },
  xor: { kind: 'op', value: '⊕' },
  nand: { kind: 'op', value: '↑' },
  nor: { kind: 'op', value: '↓' },
  implies: { kind: 'op', value: '→' },
  imp: { kind: 'op', value: '→' },
  iff: { kind: 'op', value: '↔' },
  xnor: { kind: 'op', value: '↔' },
  equiv: { kind: 'op', value: '≡' },
  forall: { kind: 'op', value: '∀' },
  exists: { kind: 'op', value: '∃' },
  box: { kind: 'op', value: '□' },
  nec: { kind: 'op', value: '□' },
  dia: { kind: 'op', value: '◇' },
  pos: { kind: 'op', value: '◇' },
  knows: { kind: 'op', value: '𝐊' },
  believes: { kind: 'op', value: '𝐊' },
  obligatory: { kind: 'op', value: '𝐎' },
  permitted: { kind: 'op', value: '◇' },
  forbidden: { kind: 'op', value: '𝐅' },
  next: { kind: 'op', value: '◯' },
  until: { kind: 'op', value: '𝒰' },
  release: { kind: 'op', value: 'ℛ' },
  weak_until: { kind: 'op', value: '𝒲' },
  fuzzy_not: { kind: 'op', value: '¬' },
  luk_and: { kind: 'op', value: '⊗ₗ' },
  luk_implies: { kind: 'op', value: '→ₗ' },
  proves: { kind: 'op', value: '⊢' },
  entails: { kind: 'op', value: '⊨' },
  lolli: { kind: 'op', value: '⊸' },
  tensor: { kind: 'op', value: '⊗' },
  par: { kind: 'op', value: '⅋' },
  defaults_to: { kind: 'op', value: '⇝' },
  forces: { kind: 'op', value: '⊩' },
  rel_equiv: { kind: 'op', value: '≊' },
  therefore: { kind: 'op', value: '∴' },
  because: { kind: 'op', value: '∵' },
  rebut: { kind: 'op', value: '⊘' },
  defeated_by: { kind: 'op', value: '⊘' },
  warrant: { kind: 'op', value: '⊕ᵥ' },
  inductively: { kind: 'op', value: '⇒ᵢ' },
  indeterminate: { kind: 'bool', value: false },
};

function tokenizeBooleanExpr(src: string): { ok: true; tokens: BoolToken[] } | { ok: false; error: string } {
  const tokens: BoolToken[] = [];
  let i = 0;
  const multiOps: Array<[string, string]> = [
    ['<->', '↔'],
    ['<=>', '↔'],
    ['||-', '⊩'],
    ['->', '→'],
    ['-/->', '⊘'],
    ['!&', '↑'],
    ['!|', '↓'],
    ['**', '**'],
    ['==', '=='],
    ['!=', '!='],
    ['<>', '!='],
    ['<=', '<='],
    ['>=', '>='],
    ['&&', '∧'],
    ['||', '∨'],
    ['/\\', '∧'],
    ['\\/', '∨'],
    ['|-', '⊢'],
    ['|=', '⊨'],
    ['-o', '⊸'],
    ['-<', '⥽'],
    ['~>', '⇝'],
    ['∃!', '∃!'],
    ['[]', '□'],
    ['⊗ₗ', '⊗ₗ'],
    ['→ₗ', '→ₗ'],
    ['⊕ᵥ', '⊕ᵥ'],
    ['⇒ᵢ', '⇒ᵢ'],
  ];
  const singleOps = new Set([
    '¬', '!', '~', '∼', '&', '∧', '|', '∨', '⊕', '^', '→', '↔', '≡', '≠', '=', '⊼', '⊽', '↑', '↓',
    '∀', '∃', '□', '◇', '⥽', '𝐊', '𝐎', '𝐅', '◯', '𝒰', 'ℛ', '𝒲', '⊢', '⊨', '⊸', '⊗', '⅋',
    '⇝', '⊩', '≊', '∴', '∵', '⊘', '+', '-', '−', '*', '×', '/', '÷', '%', '<', '>', '≤', '≥',
  ]);

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ kind: 'paren', value: ch }); i += 1; continue; }
    if (ch === ',') { tokens.push({ kind: 'comma', value: ',' }); i += 1; continue; }
    if (ch === '.') { tokens.push({ kind: 'dot', value: '.' }); i += 1; continue; }
    if (ch === '?') { tokens.push({ kind: 'question', value: '?' }); i += 1; continue; }
    if (ch === ':') { tokens.push({ kind: 'colon', value: ':' }); i += 1; continue; }
    if (ch === '⊤') { tokens.push({ kind: 'bool', value: true }); i += 1; continue; }
    if (ch === '⊥' || ch === '½') { tokens.push({ kind: 'bool', value: false }); i += 1; continue; }
    if (ch === 'λ' || ch === '\\') {
      if (src.startsWith('\\/', i)) {
        tokens.push({ kind: 'op', value: '∨' });
        i += 2;
        continue;
      }
      tokens.push({ kind: 'lambda', value: 'λ' });
      i += 1;
      continue;
    }

    if (src.startsWith('=>', i)) {
      tokens.push({ kind: 'arrow', value: '=>' });
      i += 2;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const numStr = src.slice(i, j);
      const parsedNum = Number(numStr);
      if (Number.isNaN(parsedNum)) {
        return { ok: false, error: `Invalid number "${numStr}" in expression.` };
      }
      tokens.push({ kind: 'num', value: parsedNum });
      i = j;
      continue;
    }

    let matchedMulti = false;
    for (const [pat, mapped] of multiOps) {
      if (src.startsWith(pat, i)) {
        tokens.push({ kind: 'op', value: mapped });
        i += pat.length;
        matchedMulti = true;
        break;
      }
    }
    if (matchedMulti) continue;

    if (singleOps.has(ch)) {
      const normalizedOp =
        ch === '!' || ch === '~' || ch === '∼'
          ? '¬'
          : ch === '&'
            ? '∧'
            : ch === '|'
              ? '∨'
              : ch === '^'
                ? '⊕'
                : ch === '='
                  ? '≡'
                  : ch === '⊼'
                    ? '↑'
                    : ch === '⊽'
                      ? '↓'
                      : ch === '−'
                        ? '-'
                        : ch === '×'
                          ? '*'
                          : ch === '÷'
                            ? '/'
                            : ch === '≠'
                              ? '!='
                              : ch === '≤'
                                ? '<='
                                : ch === '≥'
                                  ? '>='
                                  : ch;
      tokens.push({ kind: 'op', value: normalizedOp });
      i += 1;
      continue;
    }

    if (src.startsWith('exists!', i)) {
      tokens.push({ kind: 'op', value: '∃!' });
      i += 'exists!'.length;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const kw = KEYWORD_OP_MAP[word.toLowerCase()];
      if (kw) {
        if (kw.kind === 'bool') tokens.push({ kind: 'bool', value: kw.value as boolean });
        else tokens.push({ kind: 'op', value: kw.value as string });
      } else {
        tokens.push({ kind: 'id', value: word });
      }
      i = j;
      continue;
    }
    return { ok: false, error: `Unsupported symbol "${ch}" in expression.` };
  }

  tokens.push({ kind: 'eof', value: '' });
  return { ok: true, tokens };
}

const BIN_PRECEDENCE: Record<string, number> = {
  '∴': 1, '∵': 1,
  '↔': 2, '≡': 2, '≊': 2,
  '⊢': 3, '⊨': 3, '⊩': 3, '⇝': 3, '⇒ᵢ': 3,
  '→': 4, '⥽': 4, '→ₗ': 4, '⊸': 4,
  '∨': 5, '↓': 5, '⅋': 5, '𝒲': 5, 'ℛ': 5,
  '⊕': 6,
  '∧': 7, '↑': 7, '⊗': 7, '⊗ₗ': 7, '⊕ᵥ': 7, '𝒰': 7, '⊘': 8,
  '==': 9, '!=': 9, '<': 9, '<=': 9, '>': 9, '>=': 9,
  '+': 10, '-': 10,
  '*': 11, '/': 11, '%': 11,
  '**': 12,
};

const RIGHT_ASSOC = new Set(['→', '⥽', '→ₗ', '⊸', '⇒ᵢ', '⇝', '**']);
const UNARY_OPS = new Set(['¬', '+', '-', '□', '◇', '𝐊', '𝐎', '𝐅', '◯']);

export function parseBooleanExprAst(
  src: string
): { ok: true; ast: BoolAstNode } | { ok: false; error: string; incomplete?: boolean } {
  const lexed = tokenizeBooleanExpr(src);
  if (!lexed.ok) return lexed;
  const tokens = lexed.tokens;
  let pos = 0;
  const peek = (offset = 0) => tokens[pos + offset];
  const take = () => tokens[pos++];

  const tryParseArrowLambda = (): BoolAstNode | null => {
    const saved = pos;
    if (peek()?.kind === 'id' && peek(1)?.kind === 'arrow') {
      const p = take().value as string;
      take();
      return { type: 'Lambda', params: [p], body: parseLambdaOrExpr() };
    }
    if (peek()?.kind === 'paren' && peek()?.value === '(') {
      take();
      const params: string[] = [];
      let valid = true;
      if (!(peek()?.kind === 'paren' && peek()?.value === ')')) {
        while (true) {
          if (peek()?.kind !== 'id') {
            valid = false;
            break;
          }
          params.push(take().value as string);
          if (peek()?.kind === 'comma') {
            take();
            continue;
          }
          break;
        }
      }
      if (valid && peek()?.kind === 'paren' && peek()?.value === ')' && peek(1)?.kind === 'arrow') {
        take();
        take();
        return { type: 'Lambda', params, body: parseLambdaOrExpr() };
      }
    }
    pos = saved;
    return null;
  };

  const parseLambdaOrExpr = (): BoolAstNode => {
    const tok = peek();
    if (tok?.kind === 'lambda') {
      take();
      const params: string[] = [];
      if (peek()?.kind === 'paren' && peek()?.value === '(') {
        take();
        if (!(peek()?.kind === 'paren' && peek()?.value === ')')) {
          while (true) {
            if (peek()?.kind !== 'id') throw new Error('Expected parameter name in λ(...).');
            params.push(take().value as string);
            if (peek()?.kind === 'comma') {
              take();
              continue;
            }
            break;
          }
        }
        const close = take();
        if (close?.kind !== 'paren' || close.value !== ')') {
          throw new Error('INCOMPLETE:Expected closing ")" in lambda parameter list.');
        }
      } else {
        if (peek()?.kind !== 'id') throw new Error('INCOMPLETE:Expected parameter name after λ.');
        params.push(take().value as string);
      }
      if (peek()?.kind === 'dot' || peek()?.kind === 'arrow') {
        take();
      } else if (peek()?.kind === 'eof') {
        throw new Error('INCOMPLETE:Expected "." or "=>" after lambda parameters.');
      } else {
        throw new Error('Expected "." or "=>" after lambda parameters.');
      }
      return { type: 'Lambda', params, body: parseLambdaOrExpr() };
    }
    const arrowLam = tryParseArrowLambda();
    if (arrowLam) return arrowLam;
    const cond = parseExpr(0);
    if (peek()?.kind === 'question') {
      take();
      const thenExpr = parseLambdaOrExpr();
      if (peek()?.kind !== 'colon') {
        throw new Error(
          peek()?.kind === 'eof'
            ? 'INCOMPLETE:Expected ":" in ternary expression.'
            : 'Expected ":" in ternary expression.'
        );
      }
      take();
      const elseExpr = parseLambdaOrExpr();
      return { type: 'Ternary', cond, thenExpr, elseExpr };
    }
    return cond;
  };

  const parsePrimary = (): BoolAstNode => {
    const tok = peek();
    if (!tok || tok.kind === 'eof') throw new Error('INCOMPLETE:Unexpected end of expression.');
    if (tok.kind === 'op' && (tok.value === '∀' || tok.value === '∃' || tok.value === '∃!')) {
      take();
      const q = tok.value as '∀' | '∃' | '∃!';
      const varTok = take();
      if (!varTok || varTok.kind !== 'id') throw new Error(`Expected quantified variable after ${q}.`);
      if (peek()?.kind === 'dot') take();
      return { type: 'Quantifier', q, variable: varTok.value, body: parseLambdaOrExpr() };
    }
    if (tok.kind === 'op' && UNARY_OPS.has(tok.value)) {
      take();
      return { type: 'Unary', op: tok.value, arg: parseUnaryOrCall() };
    }
    if (tok.kind === 'paren' && tok.value === '(') {
      take();
      const inner = parseLambdaOrExpr();
      const close = take();
      if (!close || close.kind !== 'paren' || close.value !== ')') {
        throw new Error('INCOMPLETE:Expected closing ")".');
      }
      return inner;
    }
    if (tok.kind === 'bool') {
      take();
      return { type: 'Bool', value: tok.value };
    }
    if (tok.kind === 'num') {
      take();
      return { type: 'Number', value: tok.value };
    }
    if (tok.kind === 'id') {
      take();
      return { type: 'Var', name: tok.value };
    }
    throw new Error(`Unexpected token "${tok.value}".`);
  };

  const parseUnaryOrCall = (): BoolAstNode => {
    let node = parsePrimary();
    while (true) {
      if (peek()?.kind === 'dot' && peek(1)?.kind === 'id') {
        take();
        const subProp = take().value as string;
        if (node.type === 'Var') {
          node = { type: 'Var', name: `${node.name}.${subProp}` };
        }
        continue;
      }
      if (peek()?.kind === 'paren' && peek()?.value === '(') {
        take();
        const args: BoolAstNode[] = [];
        if (!(peek()?.kind === 'paren' && peek()?.value === ')')) {
          args.push(parseLambdaOrExpr());
          while (peek()?.kind === 'comma') {
            take();
            args.push(parseLambdaOrExpr());
          }
        }
        const close = take();
        if (!close || close.kind !== 'paren' || close.value !== ')') {
          throw new Error('INCOMPLETE:Expected ")" to close call arguments.');
        }
        node = {
          type: 'Call',
          name: node.type === 'Var' ? node.name : undefined,
          callee: node,
          args,
        };
        continue;
      }
      break;
    }
    return node;
  };

  const parseExpr = (minPrec: number): BoolAstNode => {
    let left = parseUnaryOrCall();
    while (true) {
      const tok = peek();
      const rawOp =
        tok?.kind === 'arrow' ? '→' : tok?.kind === 'op' ? tok.value : null;
      if (!rawOp) break;
      const prec = BIN_PRECEDENCE[rawOp];
      if (!prec || prec < minPrec) break;
      take();
      const nextMin = RIGHT_ASSOC.has(rawOp) ? prec : prec + 1;
      const right = rawOp === '→' ? parseLambdaOrExpr() : parseExpr(nextMin);
      left = { type: 'Binary', op: rawOp, left, right };
    }
    return left;
  };

  try {
    const ast = parseLambdaOrExpr();
    if (peek()?.kind !== 'eof') {
      return { ok: false, error: `Unexpected trailing token "${peek().value}".` };
    }
    return { ok: true, ast };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Syntax error';
    if (msg.startsWith('INCOMPLETE:')) {
      return { ok: false, error: msg.slice('INCOMPLETE:'.length), incomplete: true };
    }
    return { ok: false, error: msg };
  }
}

export interface MultilineLogicalBlock {
  blockIndex: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  rawText: string;
  compactText: string;
}

const TRAILING_CONTINUATION_RE = /(?:=|:=|≜|->|=>|<->|<=>|\|\||&&|\/\\|\\\/|!&|!\|[ \t]*|\*\*|==|!=|<=|>=|[¬!~∼&∧|∨⊕→↔≡≠⊼⊽↑↓⊸⊗⅋⊢⊨⇝⊩∴∵⊘+\-*/%<>.,(?:λ\\])[ \t]*$/;
const LEADING_CONTINUATION_RE = /^(?:[)&|∧∨⊕→↔≡≠⊼⊽↑↓⊸⊗⅋⊢⊨⇝⊩∴∵⊘+\-*/%<>?:]|\*\*|==|!=|<=|>=|->|=>|<->|and\b|or\b|xor\b|implies\b|iff\b|therefore\b|because\b)/i;

function parenDelta(text: string): number {
  let d = 0;
  for (const ch of text) {
    if (ch === '(') d += 1;
    else if (ch === ')') d -= 1;
  }
  return d;
}

function tryValidSingleStatement(text: string): { valid: boolean; incomplete: boolean } {
  const defMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\(([^)]*)\)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/s.exec(text);
  if (defMatch) {
    const body = defMatch[3].trim();
    if (!body) return { valid: false, incomplete: true };
    const p = parseBooleanExprAst(body);
    return { valid: p.ok, incomplete: Boolean(!p.ok && p.incomplete) };
  }
  const assignMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/s.exec(text);
  if (assignMatch) {
    const rhs = assignMatch[2].trim();
    if (!rhs) return { valid: false, incomplete: true };
    const p = parseBooleanExprAst(rhs);
    return { valid: p.ok, incomplete: Boolean(!p.ok && p.incomplete) };
  }
  if (/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\s*\([^)]*\))?)\s*(?:=(?![=>])|:=|≜)\s*$/s.test(text)) {
    return { valid: false, incomplete: true };
  }
  const p = parseBooleanExprAst(text);
  return { valid: p.ok, incomplete: Boolean(!p.ok && p.incomplete) };
}

/**
 * Segments a multiline program into logical statement blocks.
 * Blocks spanning multiple physical lines that form a valid single statement when
 * internal whitespace/newlines are removed are treated as ONE single logical line/block.
 */
export function segmentMultilineBlocks(rawProgram: string): MultilineLogicalBlock[] {
  const normalized = rawProgram.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const lineOffsets: number[] = [];
  let cursor = 0;
  for (const l of lines) {
    lineOffsets.push(cursor);
    cursor += l.length + 1;
  }

  const blocks: MultilineLogicalBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const firstTrimmed = lines[i].trim();
    if (!firstTrimmed || firstTrimmed.startsWith('//') || firstTrimmed.startsWith('#')) {
      i += 1;
      continue;
    }
    const startLine = i + 1;
    let endIdx = i;
    let combined = firstTrimmed;
    let depth = parenDelta(firstTrimmed);

    while (endIdx + 1 < lines.length) {
      const nextRaw = lines[endIdx + 1];
      const nextTrimmed = nextRaw.trim();
      if (!nextTrimmed) break;
      if (nextTrimmed.startsWith('//') || nextTrimmed.startsWith('#')) break;

      const curStatus = tryValidSingleStatement(combined);
      const shouldJoin =
        depth > 0 ||
        TRAILING_CONTINUATION_RE.test(combined) ||
        LEADING_CONTINUATION_RE.test(nextTrimmed) ||
        curStatus.incomplete;

      if (!shouldJoin) break;

      const candidate = `${combined} ${nextTrimmed}`;
      combined = candidate;
      depth += parenDelta(nextTrimmed);
      endIdx += 1;
      if (depth <= 0 && !TRAILING_CONTINUATION_RE.test(combined) && tryValidSingleStatement(combined).valid) {
        const afterNext = lines[endIdx + 1]?.trim() ?? '';
        if (!LEADING_CONTINUATION_RE.test(afterNext)) break;
      }
    }

    const startOffset = lineOffsets[i];
    const endOffset = lineOffsets[endIdx] + lines[endIdx].length;
    const rawText = normalized.slice(startOffset, endOffset);
    blocks.push({
      blockIndex: blocks.length,
      startLine,
      endLine: endIdx + 1,
      startOffset,
      endOffset,
      rawText,
      compactText: rawText.replace(/\s+/g, ' ').trim(),
    });
    i = endIdx + 1;
  }

  return blocks;
}

export interface OutputPointerRef {
  name: string;
  targetOutputLine: number | null;
  targetInputBlockIndex: number | null;
  fromPreInput: boolean;
}

export interface AlignedOutputLine {
  blockIndex: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  sourceCompact: string;
  kind: 'definition' | 'assignment' | 'expression' | 'error';
  referenceable: boolean;
  referenceName?: string;
  pointerLineNumber: number | null;
  outputText: string;
  annotatedText: string;
  value?: boolean;
  rawValue?: MultilineRuntimeValue;
  valueKind?: 'boolean' | 'number' | 'callable' | 'definition' | 'error';
  error?: string;
  referencedPointers: OutputPointerRef[];
  ast?: BoolAstNode;
  params?: string[];
  envSnapshot?: Record<string, MultilineRuntimeValue>;
}

export interface CondensedOutputLine {
  pointerLineNumber: number;
  blockIndex: number;
  startLine: number;
  endLine: number;
  kind: 'assignment' | 'expression' | 'error';
  text: string;
  valueText: string;
  referencedPointers: OutputPointerRef[];
}

export interface CallableDefinitionRecord {
  name: string;
  params: string[];
  bodyRaw: string;
  bodyAst: BoolAstNode;
  rangeText: string;
  blockIndex: number;
  startLine: number;
  endLine: number;
}

export interface MultilineEvaluationResult {
  ok: boolean;
  preInput: PreInputParseResult;
  blocks: MultilineLogicalBlock[];
  alignedLines: AlignedOutputLine[];
  condensedLines: CondensedOutputLine[];
  alignedOutputText: string;
  pointerOutputText: string;
  callables: CallableDefinitionRecord[];
  referencedVariables: string[];
  postOutput: {
    ok: boolean;
    displayValue: string;
    value: boolean | null;
    rawValue?: MultilineRuntimeValue | null;
    valueKind?: 'boolean' | 'number' | 'callable' | 'error' | null;
    sourceExpression: string;
    annotatedExpression: string;
    blockIndex: number | null;
    error?: string;
  };
  errors: string[];
}

export function isMultilineCallable(v: unknown): v is MultilineCallableValue {
  return Boolean(v && typeof v === 'object' && (v as MultilineCallableValue).__callable === true);
}

function toBoolVal(v: MultilineRuntimeValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  return true;
}

function toNumVal(v: MultilineRuntimeValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new Error('Cannot coerce callable to number.');
}

function crossoverEqual(a: MultilineRuntimeValue, b: MultilineRuntimeValue): boolean {
  if (typeof a === 'boolean' && typeof b === 'number') return (a ? 1 : 0) === b;
  if (typeof a === 'number' && typeof b === 'boolean') return a === (b ? 1 : 0);
  return a === b;
}

export function formatRuntimeValue(v: MultilineRuntimeValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  if (isMultilineCallable(v)) return formatCallableRange(v);
  return String(v);
}

function evalBinaryVal(op: string, l: MultilineRuntimeValue, r: MultilineRuntimeValue): MultilineRuntimeValue {
  switch (op) {
    case '∧':
    case '⊗':
    case '⊗ₗ':
    case '⊕ᵥ':
    case '𝒰':
      return toBoolVal(l) && toBoolVal(r);
    case '∨':
    case '⅋':
    case '𝒲':
      return toBoolVal(l) || toBoolVal(r);
    case '⊕':
      return toBoolVal(l) !== toBoolVal(r);
    case '→':
    case '⥽':
    case '→ₗ':
    case '⊸':
    case '⊢':
    case '⊨':
    case '⊩':
    case '⇝':
    case '⇒ᵢ':
    case '∴':
      return !toBoolVal(l) || toBoolVal(r);
    case '∵':
      return !toBoolVal(r) || toBoolVal(l);
    case '↔':
    case '≡':
    case '≊':
      return toBoolVal(l) === toBoolVal(r);
    case '↑':
    case '⊼':
      return !(toBoolVal(l) && toBoolVal(r));
    case '↓':
    case '⊽':
      return !(toBoolVal(l) || toBoolVal(r));
    case 'ℛ':
      return toBoolVal(r);
    case '⊘':
      return toBoolVal(l) && !toBoolVal(r);
    case '+':
      return toNumVal(l) + toNumVal(r);
    case '-':
      return toNumVal(l) - toNumVal(r);
    case '*':
      return toNumVal(l) * toNumVal(r);
    case '/': {
      const denom = toNumVal(r);
      if (denom === 0) throw new Error('Division by zero.');
      return toNumVal(l) / denom;
    }
    case '%': {
      const denom = toNumVal(r);
      if (denom === 0) throw new Error('Modulo by zero.');
      return toNumVal(l) % denom;
    }
    case '**':
      return Math.pow(toNumVal(l), toNumVal(r));
    case '==':
      return crossoverEqual(l, r);
    case '!=':
    case '≠':
      return !crossoverEqual(l, r);
    case '<':
      return toNumVal(l) < toNumVal(r);
    case '<=':
    case '≤':
      return toNumVal(l) <= toNumVal(r);
    case '>':
      return toNumVal(l) > toNumVal(r);
    case '>=':
    case '≥':
      return toNumVal(l) >= toNumVal(r);
    default:
      throw new Error(`Unsupported binary operator "${op}".`);
  }
}

function evalUnaryVal(op: string, v: MultilineRuntimeValue): MultilineRuntimeValue {
  switch (op) {
    case '¬':
    case '𝐅':
      return !toBoolVal(v);
    case '-':
      return -toNumVal(v);
    case '+':
      return +toNumVal(v);
    case '□':
    case '◇':
    case '𝐊':
    case '𝐎':
    case '◯':
      return toBoolVal(v);
    default:
      throw new Error(`Unsupported unary operator "${op}".`);
  }
}

function evalRuntimeAst(
  node: BoolAstNode,
  env: Record<string, MultilineRuntimeValue>,
  callables?: Map<string, MultilineCallableValue>,
  onFreeVar?: (name: string) => void,
  depth = 0
): MultilineRuntimeValue {
  if (depth > 64) throw new Error('Maximum recursion depth exceeded.');
  switch (node.type) {
    case 'Bool':
      return node.value;
    case 'Number':
      return node.value;
    case 'Var': {
      if (Object.prototype.hasOwnProperty.call(env, node.name)) {
        return env[node.name];
      }
      if (callables?.has(node.name)) {
        const fn = callables.get(node.name)!;
        if (fn.isNamedDefinition) {
          throw new Error(
            `Definition "${node.name}" outputs "true or false" and may not be referenced as a value; invoke it as ${node.name}(...).`
          );
        }
        return fn;
      }
      onFreeVar?.(node.name);
      throw new Error(`Unbound variable "${node.name}". Define it in Pre-Input or assign it above.`);
    }
    case 'Lambda':
      return {
        __callable: true,
        params: node.params,
        body: node.body,
        closureEnv: { ...env },
        isNamedDefinition: false,
      };
    case 'Ternary':
      return toBoolVal(evalRuntimeAst(node.cond, env, callables, onFreeVar, depth + 1))
        ? evalRuntimeAst(node.thenExpr, env, callables, onFreeVar, depth + 1)
        : evalRuntimeAst(node.elseExpr, env, callables, onFreeVar, depth + 1);
    case 'Unary':
      return evalUnaryVal(node.op, evalRuntimeAst(node.arg, env, callables, onFreeVar, depth + 1));
    case 'Binary':
      return evalBinaryVal(
        node.op,
        evalRuntimeAst(node.left, env, callables, onFreeVar, depth + 1),
        evalRuntimeAst(node.right, env, callables, onFreeVar, depth + 1)
      );
    case 'Quantifier': {
      const fVal = toBoolVal(
        evalRuntimeAst(node.body, { ...env, [node.variable]: false }, callables, onFreeVar, depth + 1)
      );
      const tVal = toBoolVal(
        evalRuntimeAst(node.body, { ...env, [node.variable]: true }, callables, onFreeVar, depth + 1)
      );
      if (node.q === '∀') return fVal && tVal;
      if (node.q === '∃') return fVal || tVal;
      return fVal !== tVal;
    }
    case 'Call': {
      let fn: MultilineRuntimeValue;
      if (node.callee.type === 'Var' && callables?.has(node.callee.name)) {
        fn = callables.get(node.callee.name)!;
      } else {
        fn = evalRuntimeAst(node.callee, env, callables, onFreeVar, depth + 1);
      }
      if (!isMultilineCallable(fn)) {
        throw new Error(`Target${node.name ? ` "${node.name}"` : ''} is not callable.`);
      }
      if (node.args.length !== fn.params.length) {
        throw new Error(
          `Callable "${fn.name || node.name || 'λ'}" expects ${fn.params.length} argument(s), got ${node.args.length}.`
        );
      }
      const localEnv: Record<string, MultilineRuntimeValue> = { ...fn.closureEnv };
      if (fn.name) localEnv[fn.name] = fn;
      fn.params.forEach((p, idx) => {
        localEnv[p] = evalRuntimeAst(node.args[idx], env, callables, onFreeVar, depth + 1);
      });
      return evalRuntimeAst(fn.body, localEnv, callables, onFreeVar, depth + 1);
    }
  }
}

export function collectAstFreeVars(
  node: BoolAstNode,
  boundLocals: Set<string>,
  callableNames: Set<string>,
  out: Set<string>
): void {
  switch (node.type) {
    case 'Bool':
    case 'Number':
      return;
    case 'Var':
      if (!boundLocals.has(node.name) && !callableNames.has(node.name)) out.add(node.name);
      return;
    case 'Unary':
      collectAstFreeVars(node.arg, boundLocals, callableNames, out);
      return;
    case 'Binary':
      collectAstFreeVars(node.left, boundLocals, callableNames, out);
      collectAstFreeVars(node.right, boundLocals, callableNames, out);
      return;
    case 'Quantifier': {
      const next = new Set(boundLocals);
      next.add(node.variable);
      collectAstFreeVars(node.body, next, callableNames, out);
      return;
    }
    case 'Lambda': {
      const next = new Set(boundLocals);
      node.params.forEach((p) => next.add(p));
      collectAstFreeVars(node.body, next, callableNames, out);
      return;
    }
    case 'Ternary':
      collectAstFreeVars(node.cond, boundLocals, callableNames, out);
      collectAstFreeVars(node.thenExpr, boundLocals, callableNames, out);
      collectAstFreeVars(node.elseExpr, boundLocals, callableNames, out);
      return;
    case 'Call':
      if (node.callee.type !== 'Var') {
        collectAstFreeVars(node.callee, boundLocals, callableNames, out);
      }
      node.args.forEach((a) => collectAstFreeVars(a, boundLocals, callableNames, out));
  }
}

function getNodeRange(
  node: BoolAstNode,
  env: Record<string, MultilineRuntimeValue>
): { type: 'bool'; val: 'true' | 'false' | 'both' } | { type: 'num'; val: number | 'number' } | { type: 'callable' } | { type: 'unknown' } {
  const free = new Set<string>();
  collectAstFreeVars(node, new Set(), new Set(), free);
  const vars = Array.from(free).filter((v) => !Object.prototype.hasOwnProperty.call(env, v));
  if (vars.length > 10) return { type: 'bool', val: 'both' };

  let seenTrue = false;
  let seenFalse = false;
  let seenNum = false;
  let seenCallable = false;
  const numVals = new Set<number>();
  const total = 1 << vars.length;

  for (let mask = 0; mask < total; mask += 1) {
    const localEnv: Record<string, MultilineRuntimeValue> = { ...env };
    for (let i = 0; i < vars.length; i += 1) {
      localEnv[vars[i]] = Boolean((mask >> i) & 1);
    }
    let res: MultilineRuntimeValue;
    try {
      res = evalRuntimeAst(node, localEnv);
    } catch {
      return { type: 'unknown' };
    }
    if (typeof res === 'boolean') {
      if (res) seenTrue = true;
      else seenFalse = true;
    } else if (typeof res === 'number') {
      seenNum = true;
      numVals.add(res);
    } else if (isMultilineCallable(res)) {
      seenCallable = true;
    }
    if (seenTrue && seenFalse && !seenNum && !seenCallable) {
      return { type: 'bool', val: 'both' };
    }
  }

  if (seenCallable) return { type: 'callable' };
  if (seenNum && !seenTrue && !seenFalse) {
    return { type: 'num', val: numVals.size === 1 ? Array.from(numVals)[0] : 'number' };
  }
  if (seenTrue && seenFalse) return { type: 'bool', val: 'both' };
  if (seenTrue) return { type: 'bool', val: 'true' };
  if (seenFalse) return { type: 'bool', val: 'false' };
  return { type: 'unknown' };
}

function findFirstDefiniteBool(
  node: BoolAstNode,
  env: Record<string, MultilineRuntimeValue>
): 'true' | 'false' | null {
  const r = getNodeRange(node, env);
  if (r.type === 'bool' && (r.val === 'true' || r.val === 'false')) return r.val;
  if (node.type === 'Unary') return findFirstDefiniteBool(node.arg, env);
  if (node.type === 'Binary') {
    return findFirstDefiniteBool(node.left, env) ?? findFirstDefiniteBool(node.right, env);
  }
  if (node.type === 'Ternary') {
    return (
      findFirstDefiniteBool(node.cond, env) ??
      findFirstDefiniteBool(node.thenExpr, env) ??
      findFirstDefiniteBool(node.elseExpr, env)
    );
  }
  if (node.type === 'Call') {
    for (const arg of node.args) {
      const found = findFirstDefiniteBool(arg, env);
      if (found) return found;
    }
  }
  return null;
}

export function formatCallableRange(fn: MultilineCallableValue): string {
  const baseEnv: Record<string, MultilineRuntimeValue> = { ...fn.closureEnv };
  fn.params.forEach((p) => {
    delete baseEnv[p];
  });
  const overall = getNodeRange(fn.body, baseEnv);
  if (overall.type === 'callable') return 'callable';
  if (overall.type === 'num') return String(overall.val);
  if (overall.type === 'bool') {
    if (overall.val === 'true') return 'true';
    if (overall.val === 'false') return 'false';
    const firstDef = findFirstDefiniteBool(fn.body, baseEnv);
    return firstDef === 'false' ? 'false or true' : 'true or false';
  }
  return 'true or false';
}

function formatPointerAnnotatedAst(
  node: BoolAstNode,
  bindings: Map<string, { value: MultilineRuntimeValue; pointerLineNumber: number | null; inputBlockIndex: number | null; fromPreInput: boolean }>,
  refsOut: OutputPointerRef[]
): string {
  switch (node.type) {
    case 'Bool':
      return node.value ? 'true' : 'false';
    case 'Number':
      return String(node.value);
    case 'Var': {
      const bound = bindings.get(node.name);
      if (bound && !bound.fromPreInput && bound.pointerLineNumber !== null) {
        refsOut.push({
          name: node.name,
          targetOutputLine: bound.pointerLineNumber,
          targetInputBlockIndex: bound.inputBlockIndex,
          fromPreInput: false,
        });
        return `${node.name}[line#${bound.pointerLineNumber}]`;
      }
      if (bound && bound.fromPreInput) {
        refsOut.push({
          name: node.name,
          targetOutputLine: null,
          targetInputBlockIndex: null,
          fromPreInput: true,
        });
      }
      return node.name;
    }
    case 'Unary':
      return `${node.op}${formatPointerAnnotatedAst(node.arg, bindings, refsOut)}`;
    case 'Binary':
      return `${formatPointerAnnotatedAst(node.left, bindings, refsOut)} ${node.op} ${formatPointerAnnotatedAst(node.right, bindings, refsOut)}`;
    case 'Quantifier':
      return `${node.q}${node.variable}. ${formatPointerAnnotatedAst(node.body, bindings, refsOut)}`;
    case 'Lambda':
      return `λ(${node.params.join(',')}). ${formatPointerAnnotatedAst(node.body, bindings, refsOut)}`;
    case 'Ternary':
      return `${formatPointerAnnotatedAst(node.cond, bindings, refsOut)} ? ${formatPointerAnnotatedAst(node.thenExpr, bindings, refsOut)} : ${formatPointerAnnotatedAst(node.elseExpr, bindings, refsOut)}`;
    case 'Call': {
      const calleeStr =
        node.callee.type === 'Var'
          ? node.callee.name
          : formatPointerAnnotatedAst(node.callee, bindings, refsOut);
      return `${calleeStr}(${node.args.map((a) => formatPointerAnnotatedAst(a, bindings, refsOut)).join(',')})`;
    }
  }
}

/**
 * Evaluates a multiline boolean, arithmetic & lambda program with Pre-Input literals,
 * unreferenceable callable definitions (codomain range), referenceable SSA variable/lambda
 * bindings, numeric<->boolean crossovers (1=true, 0=false), and entrypoint outputs.
 */
export function evaluateMultilineBooleanProgram(
  preInputRaw: string,
  programRaw: string,
  overridePreValues?: Record<string, boolean | number>
): MultilineEvaluationResult {
  const preInput = parsePreInputLiterals(preInputRaw);
  const blocks = segmentMultilineBlocks(programRaw);
  const bindings = new Map<
    string,
    { value: MultilineRuntimeValue; pointerLineNumber: number | null; inputBlockIndex: number | null; fromPreInput: boolean }
  >();
  const envObj: Record<string, MultilineRuntimeValue> = {};

  for (const [k, v] of Object.entries(preInput.rawValues)) {
    bindings.set(k, { value: v, pointerLineNumber: null, inputBlockIndex: null, fromPreInput: true });
    envObj[k] = v;
  }
  if (overridePreValues) {
    for (const [k, v] of Object.entries(overridePreValues)) {
      bindings.set(k, { value: v, pointerLineNumber: null, inputBlockIndex: null, fromPreInput: true });
      envObj[k] = v;
    }
  }

  const callables = new Map<string, CallableDefinitionRecord>();
  const runtimeCallables = new Map<string, MultilineCallableValue>();
  const alignedLines: AlignedOutputLine[] = [];
  const condensedLines: CondensedOutputLine[] = [];
  const errors: string[] = preInput.errors.map((e) => e.message);
  const freeVars = new Set<string>(Object.keys(preInput.rawValues));
  let pointerLineCounter = 0;

  for (const block of blocks) {
    const text = block.compactText;
    const defMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/.exec(text);
    if (defMatch) {
      const fnName = defMatch[1];
      const rawParams = defMatch[2].trim();
      const params = rawParams ? rawParams.split(',').map((p) => p.trim()).filter(Boolean) : [];
      if (params.some((p) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) {
        const msg = `Invalid parameter list in "${fnName}(${rawParams})".`;
        errors.push(msg);
        alignedLines.push({
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          sourceCompact: text,
          kind: 'error',
          referenceable: false,
          pointerLineNumber: null,
          outputText: `Error: ${msg}`,
          annotatedText: `Error: ${msg}`,
          valueKind: 'error',
          error: msg,
          referencedPointers: [],
        });
        continue;
      }
      const parsedBody = parseBooleanExprAst(defMatch[3].trim());
      if (!parsedBody.ok) {
        errors.push(parsedBody.error);
        alignedLines.push({
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          sourceCompact: text,
          kind: 'error',
          referenceable: false,
          pointerLineNumber: null,
          outputText: `Error: ${parsedBody.error}`,
          annotatedText: `Error: ${parsedBody.error}`,
          valueKind: 'error',
          error: parsedBody.error,
          referencedPointers: [],
        });
        continue;
      }

      const fnObj: MultilineCallableValue = {
        __callable: true,
        name: fnName,
        params,
        body: parsedBody.ast,
        closureEnv: { ...envObj },
        isNamedDefinition: true,
      };
      const rangeText = formatCallableRange(fnObj);
      runtimeCallables.set(fnName, fnObj);
      callables.set(fnName, {
        name: fnName,
        params,
        bodyRaw: defMatch[3].trim(),
        bodyAst: parsedBody.ast,
        rangeText,
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
      });
      alignedLines.push({
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        sourceCompact: text,
        kind: 'definition',
        referenceable: false,
        referenceName: fnName,
        pointerLineNumber: null,
        outputText: rangeText,
        annotatedText: `def ${fnName}(${params.join(',')}) · unreferenceable`,
        rawValue: fnObj,
        valueKind: 'definition',
        referencedPointers: [],
        ast: parsedBody.ast,
        params,
        envSnapshot: { ...envObj },
      });
      continue;
    }

    const assignMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/.exec(text);
    if (assignMatch) {
      const varName = assignMatch[1];
      const rhsRaw = assignMatch[2].trim();
      const parsedRhs = parseBooleanExprAst(rhsRaw);
      if (!parsedRhs.ok) {
        errors.push(parsedRhs.error);
        alignedLines.push({
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          sourceCompact: text,
          kind: 'error',
          referenceable: false,
          pointerLineNumber: null,
          outputText: `Error: ${parsedRhs.error}`,
          annotatedText: `Error: ${parsedRhs.error}`,
          valueKind: 'error',
          error: parsedRhs.error,
          referencedPointers: [],
        });
        continue;
      }
      collectAstFreeVars(
        parsedRhs.ast,
        new Set([...bindings.keys()]),
        new Set(callables.keys()),
        freeVars
      );
      try {
        const refs: OutputPointerRef[] = [];
        formatPointerAnnotatedAst(parsedRhs.ast, bindings, refs);
        const val = evalRuntimeAst(
          parsedRhs.ast,
          envObj,
          runtimeCallables,
          (name) => freeVars.add(name)
        );
        if (isMultilineCallable(val)) {
          val.name = varName;
          val.isNamedDefinition = false;
        }
        pointerLineCounter += 1;
        bindings.set(varName, {
          value: val,
          pointerLineNumber: pointerLineCounter,
          inputBlockIndex: block.blockIndex,
          fromPreInput: false,
        });
        envObj[varName] = val;
        const valText = formatRuntimeValue(val);
        const valueKind: AlignedOutputLine['valueKind'] = isMultilineCallable(val)
          ? 'callable'
          : typeof val === 'number'
            ? 'number'
            : 'boolean';
        alignedLines.push({
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          sourceCompact: text,
          kind: 'assignment',
          referenceable: true,
          referenceName: varName,
          pointerLineNumber: pointerLineCounter,
          outputText: valText,
          annotatedText: isMultilineCallable(val)
            ? `λ ${varName}(${val.params.join(',')})`
            : valText,
          value: typeof val === 'boolean' ? val : typeof val === 'number' ? val !== 0 : undefined,
          rawValue: val,
          valueKind,
          referencedPointers: refs,
          ast: isMultilineCallable(val) ? val.body : parsedRhs.ast,
          params: isMultilineCallable(val) ? val.params : [],
          envSnapshot: { ...envObj },
        });
        condensedLines.push({
          pointerLineNumber: pointerLineCounter,
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          kind: 'assignment',
          text: valText,
          valueText: valText,
          referencedPointers: refs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Evaluation error.';
        errors.push(msg);
        alignedLines.push({
          blockIndex: block.blockIndex,
          startLine: block.startLine,
          endLine: block.endLine,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          sourceCompact: text,
          kind: 'error',
          referenceable: false,
          pointerLineNumber: null,
          outputText: `Error: ${msg}`,
          annotatedText: `Error: ${msg}`,
          valueKind: 'error',
          error: msg,
          referencedPointers: [],
        });
      }
      continue;
    }

    const parsedExpr = parseBooleanExprAst(text);
    if (!parsedExpr.ok) {
      errors.push(parsedExpr.error);
      alignedLines.push({
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        sourceCompact: text,
        kind: 'error',
        referenceable: false,
        pointerLineNumber: null,
        outputText: `Error: ${parsedExpr.error}`,
        annotatedText: `Error: ${parsedExpr.error}`,
        valueKind: 'error',
        error: parsedExpr.error,
        referencedPointers: [],
      });
      continue;
    }
    collectAstFreeVars(
      parsedExpr.ast,
      new Set([...bindings.keys()]),
      new Set(callables.keys()),
      freeVars
    );
    try {
      const refs: OutputPointerRef[] = [];
      const annotatedExpr = formatPointerAnnotatedAst(parsedExpr.ast, bindings, refs);
      const val = evalRuntimeAst(
        parsedExpr.ast,
        envObj,
        runtimeCallables,
        (name) => freeVars.add(name)
      );
      pointerLineCounter += 1;
      const valText = formatRuntimeValue(val);
      const annotatedText = `${annotatedExpr}=${valText}`;
      const valueKind: AlignedOutputLine['valueKind'] = isMultilineCallable(val)
        ? 'callable'
        : typeof val === 'number'
          ? 'number'
          : 'boolean';
      alignedLines.push({
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        sourceCompact: text,
        kind: 'expression',
        referenceable: false,
        pointerLineNumber: pointerLineCounter,
        outputText: valText,
        annotatedText,
        value: typeof val === 'boolean' ? val : typeof val === 'number' ? val !== 0 : undefined,
        rawValue: val,
        valueKind,
        referencedPointers: refs,
        ast: parsedExpr.ast,
        params: [],
        envSnapshot: { ...envObj },
      });
      condensedLines.push({
        pointerLineNumber: pointerLineCounter,
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
        kind: 'expression',
        text: annotatedText,
        valueText: valText,
        referencedPointers: refs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Evaluation error.';
      errors.push(msg);
      alignedLines.push({
        blockIndex: block.blockIndex,
        startLine: block.startLine,
        endLine: block.endLine,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        sourceCompact: text,
        kind: 'error',
        referenceable: false,
        pointerLineNumber: null,
        outputText: `Error: ${msg}`,
        annotatedText: `Error: ${msg}`,
        valueKind: 'error',
        error: msg,
        referencedPointers: [],
      });
    }
  }

  const exprOutputs = alignedLines.filter((l) => l.kind === 'expression');
  const assignOutputs = alignedLines.filter((l) => l.kind === 'assignment');
  const terminal = exprOutputs[exprOutputs.length - 1] ?? assignOutputs[assignOutputs.length - 1] ?? null;

  return {
    ok: errors.length === 0 && terminal !== null,
    preInput,
    blocks,
    alignedLines,
    condensedLines,
    alignedOutputText: alignedLines.map((l) => l.outputText).join('\r\n'),
    pointerOutputText: condensedLines.map((l) => l.text).join('\r\n'),
    callables: Array.from(callables.values()),
    referencedVariables: Array.from(freeVars),
    postOutput: terminal
      ? {
          ok: true,
          displayValue: terminal.outputText,
          value: terminal.value ?? null,
          rawValue: terminal.rawValue ?? null,
          valueKind:
            terminal.valueKind === 'number' || terminal.valueKind === 'callable'
              ? terminal.valueKind
              : 'boolean',
          sourceExpression: terminal.sourceCompact,
          annotatedExpression: terminal.annotatedText,
          blockIndex: terminal.blockIndex,
        }
      : {
          ok: false,
          displayValue: errors[0] ? `Error: ${errors[0]}` : 'No output',
          value: null,
          rawValue: null,
          valueKind: 'error',
          sourceExpression: '',
          annotatedExpression: '',
          blockIndex: null,
          error: errors[0] ?? 'Enter an expression or assignment to produce an entrypoint output.',
        },
    errors,
  };
}

export interface TruthTableView {
  title: string;
  headers: string[];
  rows: Array<{
    inputs: boolean[];
    outputs: Array<{ label: string; value: string; ok: boolean }>;
    isActiveRow: boolean;
  }>;
  classification: 'Tautology' | 'Contradiction' | 'Contingency' | 'Incomplete';
}

export interface RowTruthTableView {
  targetLabel: string;
  headers: string[];
  rows: Array<{
    inputs: boolean[];
    resultText: string;
    resultKind: 'boolean' | 'number' | 'callable' | 'error';
    boolValue?: boolean;
    isActiveRow: boolean;
  }>;
  classification:
    | 'Tautology (⊤)'
    | 'Contradiction (⊥)'
    | 'Contingency'
    | 'Mixed / Numeric'
    | 'Arithmetic'
    | 'Constant'
    | 'Capped'
    | 'None';
  constantSummary?: string;
}

/** Builds a focused truth table for any hovered, clicked/selected, or entrypoint line. */
export function buildRowTruthTable(
  line: AlignedOutputLine | null,
  result?: MultilineEvaluationResult
): RowTruthTableView {
  if (!line || !line.ast) {
    return { targetLabel: '', headers: [], rows: [], classification: 'None' };
  }
  const label = line.referenceName || line.sourceCompact;
  const env = line.envSnapshot ?? {};
  const callableMap = new Map<string, MultilineCallableValue>();
  for (const [k, v] of Object.entries(env)) {
    if (isMultilineCallable(v)) callableMap.set(k, v);
  }
  if (result) {
    for (const c of result.callables) {
      if (!callableMap.has(c.name)) {
        callableMap.set(c.name, {
          __callable: true,
          name: c.name,
          params: c.params,
          body: c.bodyAst,
          closureEnv: env,
          isNamedDefinition: true,
        });
      }
    }
  }

  const freeSet = new Set<string>();
  collectAstFreeVars(line.ast, new Set(), new Set(callableMap.keys()), freeSet);
  const paramSet = new Set(line.params ?? []);
  const vars = Array.from(freeSet).filter((v) => {
    if (paramSet.has(v)) return true;
    if (!Object.prototype.hasOwnProperty.call(env, v)) return true;
    const cur = env[v];
    return typeof cur === 'boolean' || cur === 0 || cur === 1;
  });

  if (vars.length === 0) {
    return {
      targetLabel: label,
      headers: [],
      rows: [],
      classification: line.valueKind === 'number' ? 'Arithmetic' : 'Constant',
      constantSummary: line.outputText,
    };
  }
  if (vars.length > 6) {
    return { targetLabel: label, headers: vars, rows: [], classification: 'Capped' };
  }

  const total = 1 << vars.length;
  let trueCount = 0;
  let allBool = true;
  const rows: RowTruthTableView['rows'] = [];

  for (let mask = 0; mask < total; mask += 1) {
    const rowEnv: Record<string, MultilineRuntimeValue> = { ...env };
    const inputs: boolean[] = [];
    let isActive = true;
    vars.forEach((v, idx) => {
      const bit = Boolean((mask >> idx) & 1);
      inputs.push(bit);
      rowEnv[v] = bit;
      if (Object.prototype.hasOwnProperty.call(env, v)) {
        if (toBoolVal(env[v]) !== bit) isActive = false;
      } else {
        isActive = false;
      }
    });

    try {
      const val = evalRuntimeAst(line.ast, rowEnv, callableMap);
      if (typeof val === 'boolean') {
        if (val) trueCount += 1;
        rows.push({ inputs, resultText: val ? 'true' : 'false', resultKind: 'boolean', boolValue: val, isActiveRow: isActive });
      } else {
        allBool = false;
        rows.push({
          inputs,
          resultText: formatRuntimeValue(val),
          resultKind: isMultilineCallable(val) ? 'callable' : 'number',
          isActiveRow: isActive,
        });
      }
    } catch {
      allBool = false;
      rows.push({ inputs, resultText: 'Error', resultKind: 'error', isActiveRow: isActive });
    }
  }

  const classification: RowTruthTableView['classification'] = !allBool
    ? 'Mixed / Numeric'
    : trueCount === total
      ? 'Tautology (⊤)'
      : trueCount === 0
        ? 'Contradiction (⊥)'
        : 'Contingency';

  return { targetLabel: label, headers: vars, rows, classification };
}

export function buildMultilineTruthTables(
  preInputRaw: string,
  programRaw: string,
  baseResult: MultilineEvaluationResult
): {
  programTable: TruthTableView;
  callableTables: TruthTableView[];
} {
  const preVars = Object.keys(baseResult.preInput.rawValues);
  const allFree = Array.from(new Set([...preVars, ...baseResult.referencedVariables])).slice(0, 5);
  const headers = allFree.length > 0 ? allFree : [];
  const rows: TruthTableView['rows'] = [];

  if (headers.length > 0) {
    const total = 1 << headers.length;
    for (let mask = 0; mask < total; mask += 1) {
      const inputs: boolean[] = [];
      const overrides: Record<string, boolean> = {};
      headers.forEach((name, idx) => {
        const val = Boolean((mask >> (headers.length - 1 - idx)) & 1);
        inputs.push(val);
        overrides[name] = val;
      });
      const res = evaluateMultilineBooleanProgram(preInputRaw, programRaw, overrides);
      const isActiveRow = headers.every(
        (name, idx) =>
          Object.prototype.hasOwnProperty.call(baseResult.preInput.values, name) &&
          baseResult.preInput.values[name] === inputs[idx]
      );
      const outCols = res.alignedLines
        .filter((l) => l.kind === 'assignment' || l.kind === 'expression')
        .map((l) => ({
          label: l.kind === 'assignment' && l.referenceName ? l.referenceName : l.sourceCompact,
          value: l.outputText,
          ok: l.kind !== 'error',
        }));
      rows.push({ inputs, outputs: outCols, isActiveRow });
    }
  } else {
    const outCols = baseResult.alignedLines
      .filter((l) => l.kind === 'assignment' || l.kind === 'expression')
      .map((l) => ({
        label: l.kind === 'assignment' && l.referenceName ? l.referenceName : l.sourceCompact,
        value: l.outputText,
        ok: true,
      }));
    rows.push({ inputs: [], outputs: outCols, isActiveRow: true });
  }

  const finalVals = rows
    .map((r) => r.outputs[r.outputs.length - 1]?.value)
    .filter((v) => v === 'true' || v === 'false');
  const classification: TruthTableView['classification'] =
    finalVals.length === 0
      ? 'Incomplete'
      : finalVals.every((v) => v === 'true')
        ? 'Tautology'
        : finalVals.every((v) => v === 'false')
          ? 'Contradiction'
          : 'Contingency';

  const callableTables: TruthTableView[] = baseResult.callables.map((fn) => {
    const params = fn.params.slice(0, 5);
    const fnRows: TruthTableView['rows'] = [];
    const total = 1 << params.length;
    for (let mask = 0; mask < total; mask += 1) {
      const inputs: boolean[] = [];
      const preLines: string[] = [];
      params.forEach((p, idx) => {
        const val = Boolean((mask >> (params.length - 1 - idx)) & 1);
        inputs.push(val);
        preLines.push(`${p}=${val}`);
      });
      const invoke = `${fn.name}(${params.join(', ')}) = ${fn.bodyRaw}\n${fn.name}(${params.join(', ')})`;
      const evalFn = evaluateMultilineBooleanProgram(preLines.join('\n'), invoke);
      fnRows.push({
        inputs,
        outputs: [
          {
            label: `${fn.name}(${params.join(',')})`,
            value: evalFn.postOutput.displayValue,
            ok: evalFn.postOutput.ok,
          },
        ],
        isActiveRow: false,
      });
    }
    const fnVals = fnRows.map((r) => r.outputs[0]?.value);
    const fnClass: TruthTableView['classification'] =
      fnVals.every((v) => v === 'true')
        ? 'Tautology'
        : fnVals.every((v) => v === 'false')
          ? 'Contradiction'
          : 'Contingency';
    return {
      title: `Callable ${fn.name}(${fn.params.join(', ')}) = ${fn.bodyRaw}`,
      headers: params,
      rows: fnRows,
      classification: fnClass,
    };
  });

  return {
    programTable: {
      title: 'Entrypoint & Binding Valuation Matrix',
      headers,
      rows,
      classification,
    },
    callableTables,
  };
}

/**
 * Generates a completely self-contained single-file HTML implementation of the
 * Formal Logic, Arithmetic & Lambda Workbench (drag & drop taxonomy, synchronized
 * syntax-highlighted gutter editors, dual blue/orange pointer highlighting, codomain
 * range analysis, and live row/entrypoint truth table). Zero external JS/CSS.
 */
export function generateStandaloneBooleanCalculatorHtml(
  initialPreInput = 'e=true',
  initialProgram = 'a(b,c)=b & c\nd=false\na(e,d)'
): string {
  const categoriesJson = JSON.stringify(LOGIC_SYSTEM_CATEGORIES).replace(/</g, '\\u003c');
  const presetsJson = JSON.stringify(FORMAL_LOGIC_PRESETS).replace(/</g, '\\u003c');
  const preEsc = initialPreInput.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const progEsc = initialProgram.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Formal Logic, Arithmetic & Lambda Workbench</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --panel-alt: #1c2128; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --accent-soft: rgba(88,166,255,0.16);
    --true-col: #3fb950; --false-col: #f85149; --def-col: #d2a8ff; --num-col: #79c0ff;
    --ptr-col: #ffa657; --warn-col: #e3b341;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.45; min-height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: var(--panel); border-bottom: 1px solid var(--border); gap: 12px; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); background: var(--panel-alt); font-family: var(--mono); white-space: nowrap; }
  .btn-sm { background: var(--panel-alt); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 9px; font-size: 11.5px; cursor: pointer; }
  .btn-sm:hover { border-color: var(--accent); color: var(--accent); }
  .shell { display: grid; grid-template-columns: 310px 1fr; gap: 14px; padding: 14px; flex: 1; align-items: start; }
  @media (max-width: 1100px) { .shell { grid-template-columns: 1fr; } }
  .sidebar { position: sticky; top: 14px; max-height: calc(100vh - 82px); }
  .palette-body { overflow-y: auto; padding: 8px; flex: 1; }
  details.cat { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; background: var(--bg); }
  details.cat summary { padding: 7px 10px; cursor: pointer; font-size: 12px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; }
  .chip-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 8px; border-top: 1px solid var(--border); }
  .op-chip { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: var(--panel); border: 1px solid var(--border); border-radius: 5px; color: var(--text); cursor: grab; font-size: 12px; min-width: 0; }
  .op-chip:hover { border-color: var(--accent); background: var(--panel-alt); }
  .op-sym { font-family: var(--mono); font-weight: 700; color: var(--accent); min-width: 22px; text-align: center; }
  .op-name { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; min-width: 0; }
  @media (max-width: 920px) { .grid-2col { grid-template-columns: 1fr; } }
  .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
  .panel-header { padding: 9px 12px; background: var(--panel-alt); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .panel-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px; cursor: help; }
  .info-dot { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; border: 1px solid var(--border); color: var(--muted); font-size: 10px; font-weight: 700; }
  .editor-wrap { position: relative; display: flex; background: var(--bg); font-family: var(--mono); font-size: 13.5px; line-height: 1.65; }
  .editor-wrap.tall { min-height: 220px; }
  .editor-wrap.drag-over { outline: 2px dashed var(--accent); outline-offset: -3px; }
  .gutter { width: 38px; padding: 10px 6px; text-align: right; color: var(--muted); background: #10141b; border-right: 1px solid var(--border); user-select: none; flex-shrink: 0; }
  .gutter-line { height: 22.275px; }
  .gutter-line.hl { color: var(--accent); font-weight: 700; background: var(--accent-soft); border-radius: 3px; }
  .gutter-line.hl-ptr { color: var(--ptr-col); font-weight: 700; background: rgba(255,166,87,0.2); border-radius: 3px; }
  .editor-stack { position: relative; flex: 1; min-height: 60px; }
  .editor-wrap.tall .editor-stack { min-height: 220px; }
  .editor-backdrop { position: absolute; inset: 0; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; pointer-events: none; overflow: hidden; }
  .code-textarea { position: relative; width: 100%; height: 100%; min-height: inherit; background: transparent; color: transparent; caret-color: var(--accent); border: none; outline: none; padding: 10px 12px; font-family: var(--mono); font-size: 13.5px; line-height: 1.65; resize: vertical; }
  .syn-true { color: var(--true-col); font-weight: 700; }
  .syn-false { color: var(--false-col); font-weight: 700; }
  .syn-num { color: var(--num-col); font-weight: 700; }
  .syn-op { color: var(--accent); font-weight: 600; }
  .syn-lam { color: var(--def-col); font-weight: 700; }
  .hl-span { background: rgba(88,166,255,0.22); border-bottom: 2px solid var(--accent); border-radius: 3px; }
  .hl-span-ptr { background: rgba(255,166,87,0.24); border-bottom: 2px solid var(--ptr-col); border-radius: 3px; }
  .output-list { padding: 8px; display: flex; flex-direction: column; gap: 6px; background: var(--bg); min-height: 115px; font-family: var(--mono); font-size: 13px; }
  .out-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); cursor: pointer; }
  .out-row:hover, .out-row.selected { border-color: var(--accent); background: var(--accent-soft); }
  .out-row.ptr-target { border-color: var(--ptr-col); background: rgba(255,166,87,0.14); }
  .out-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .line-tag { font-size: 11px; color: var(--muted); background: var(--bg); border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; }
  .tok-true { color: var(--true-col); font-weight: 700; }
  .tok-false { color: var(--false-col); font-weight: 700; }
  .tok-def { color: var(--def-col); font-weight: 600; }
  .tok-num { color: var(--num-col); font-weight: 700; }
  .tok-or { color: var(--muted); font-weight: 500; }
  .tok-ptr { color: var(--ptr-col); background: rgba(255,166,87,0.14); border: 1px solid rgba(255,166,87,0.4); padding: 0 5px; border-radius: 4px; font-size: 11.5px; cursor: pointer; }
  .tok-err { color: var(--warn-col); }
  .out-annotated { color: var(--muted); font-size: 12px; text-align: right; }
  .post-output-body { padding: 12px 14px; background: var(--bg); font-family: var(--mono); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .entrypoint-val { font-size: 22px; font-weight: 700; }
  .truth-body { overflow: auto; max-height: 320px; background: var(--bg); }
  table.tt { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 12.5px; }
  table.tt th, table.tt td { padding: 7px 10px; border-bottom: 1px solid var(--border); text-align: center; }
  table.tt th { position: sticky; top: 0; background: var(--panel-alt); color: var(--accent); font-weight: 600; }
  table.tt tr.active-row { background: rgba(88,166,255,0.18); outline: 1px solid var(--accent); }
  .err-banner { padding: 6px 12px; background: rgba(248,81,73,0.14); color: #ffa198; font-size: 12px; border-top: 1px solid rgba(248,81,73,0.35); font-family: var(--mono); display: none; }
  #tooltip { position: fixed; z-index: 9999; max-width: 330px; background: #1f242c; color: var(--text); border: 1px solid var(--accent); border-radius: 6px; padding: 9px 11px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.12s; }
  #tooltip.visible { opacity: 1; }
  #tooltip .tt-title { font-weight: 700; color: var(--accent); margin-bottom: 4px; }
  #tooltip .tt-code { font-family: var(--mono); background: #0d1117; padding: 1px 5px; border-radius: 4px; color: var(--ptr-col); }
</style>
</head>
<body>
<header>
  <h1><span>⊢</span> Formal Logic, Arithmetic &amp; Lambda Workbench <span class="badge">Live Evaluator + Range + Truth Table</span></h1>
  <div id="presetBtns" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
</header>
<div class="shell">
  <aside class="panel sidebar">
    <div class="panel-header">
      <span class="panel-title">Operator Taxonomy Palette <span class="info-dot" title="Drag symbols into the buffer or click to insert.">?</span></span>
      <span class="badge">Drag / Click</span>
    </div>
    <div class="palette-body" id="paletteContainer"></div>
  </aside>
  <div class="grid-2col">
    <div class="col">
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">Pre-Input · Valuation (Γ)</span>
          <span class="badge">Boolean &amp; Numeric Literals</span>
        </div>
        <div class="editor-wrap">
          <div class="gutter" id="preGutter"></div>
          <div class="editor-stack">
            <div class="editor-backdrop" id="preBackdrop"></div>
            <textarea id="preInput" class="code-textarea" rows="2" spellcheck="false">${preEsc}</textarea>
          </div>
        </div>
        <div id="preError" class="err-banner"></div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">Input · Formula &amp; Lambda Buffer</span>
          <span class="badge" id="blockCountBadge">0 blocks</span>
        </div>
        <div class="editor-wrap tall" id="editorWrap">
          <div class="gutter" id="editorGutter"></div>
          <div class="editor-stack">
            <div class="editor-backdrop" id="editorBackdrop"></div>
            <textarea id="mainInput" class="code-textarea" spellcheck="false">${progEsc}</textarea>
          </div>
        </div>
        <div id="mainError" class="err-banner"></div>
      </section>
    </div>
    <div class="col">
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">Output · Evaluation Trace</span>
          <span class="badge">Hover / Select to Highlight</span>
        </div>
        <div class="output-list" id="outputList"></div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">Post-Output · Entrypoint Result</span>
          <span class="badge" id="entrypointExprBadge"></span>
        </div>
        <div class="post-output-body">
          <div id="postOutputVal" class="entrypoint-val">—</div>
          <div id="postOutputMeta" style="color:var(--muted); font-size:12px;"></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <span class="panel-title">Live Truth Table <span id="ttTargetLabel" style="color:var(--muted);font-weight:500;"></span></span>
          <span class="badge" id="ttClassBadge">—</span>
        </div>
        <div class="truth-body" id="truthTableContainer"></div>
      </section>
    </div>
  </div>
</div>
<div id="tooltip"></div>
<script>
const CATEGORIES = ${categoriesJson};
const PRESETS = ${presetsJson};
const preInput = document.getElementById("preInput");
const mainInput = document.getElementById("mainInput");
const tooltipEl = document.getElementById("tooltip");
let currentBlocks = [], blockMeta = [], selectedBlockIdx = null, hoveredBlockIdx = null, hoveredPtrBlockIdx = null;

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function showTooltip(e, title, rows) {
  tooltipEl.innerHTML = '<div class="tt-title">' + esc(title) + '</div>' + rows.map(r => '<div style="margin-top:3px">' + r + '</div>').join('');
  tooltipEl.classList.add('visible');
  tooltipEl.style.left = Math.min(window.innerWidth - 340, e.clientX + 14) + 'px';
  tooltipEl.style.top = Math.min(window.innerHeight - 120, e.clientY + 14) + 'px';
}
function hideTooltip() { tooltipEl.classList.remove('visible'); }

document.getElementById("presetBtns").innerHTML = PRESETS.map(p => '<button class="btn-sm" data-preset="' + p.id + '">' + esc(p.label) + '</button>').join('');
document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
  const found = PRESETS.find(p => p.id === b.dataset.preset);
  if (found) { preInput.value = found.preInput; mainInput.value = found.program; selectedBlockIdx = null; evaluateProgram(); }
}));

const pal = document.getElementById("paletteContainer");
CATEGORIES.forEach((cat, idx) => {
  const det = document.createElement("details");
  det.className = "cat";
  if (idx < 3) det.open = true;
  det.innerHTML = '<summary>' + esc(cat.title) + '</summary><div class="chip-grid"></div>';
  const grid = det.querySelector(".chip-grid");
  cat.items.forEach(item => {
    const chip = document.createElement("div");
    chip.className = "op-chip"; chip.draggable = true;
    chip.innerHTML = '<span class="op-sym">' + esc(item.unicode) + '</span><span class="op-name">' + esc(item.name.split('(')[0].trim()) + '</span>';
    chip.addEventListener("mouseenter", e => showTooltip(e, item.unicode + ' — ' + item.name, ['<b>Syntax:</b> <span class="tt-code">' + esc(item.textRepresentation) + '</span>', '<b>Effect:</b> ' + esc(item.outputEffect)]));
    chip.addEventListener("mouseleave", hideTooltip);
    chip.addEventListener("click", () => insertAtCursor(item.insert));
    chip.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", item.insert); });
    grid.appendChild(chip);
  });
  pal.appendChild(det);
});

function insertAtCursor(txt) {
  const s = mainInput.selectionStart ?? mainInput.value.length, e = mainInput.selectionEnd ?? mainInput.value.length;
  mainInput.value = mainInput.value.slice(0, s) + txt + mainInput.value.slice(e);
  mainInput.focus(); mainInput.selectionStart = mainInput.selectionEnd = s + txt.length;
  evaluateProgram();
}
const wrap = document.getElementById("editorWrap");
wrap.addEventListener("dragover", e => { e.preventDefault(); wrap.classList.add("drag-over"); });
wrap.addEventListener("dragleave", () => wrap.classList.remove("drag-over"));
wrap.addEventListener("drop", e => { e.preventDefault(); wrap.classList.remove("drag-over"); const t = e.dataTransfer.getData("text/plain"); if (t) insertAtCursor(t); });

function parseMultilineBlocks(raw) {
  const lines = raw.split(/\\r?\\n/), blocks = []; let offset = 0, cur = null, pd = 0;
  const endsOp = s => /[&|^=,(¬!~∧∨⊕→↔↑↓⊢⊨↝+\\-*/%<>.:λ\\\\]$|->$|=>$|<->$|\*\*$|==$|!=$|<=$|>=$/.test(s.trim());
  const startsOp = s => /^(&|\\||\\^|∧|∨|⊕|→|↔|↑|↓|->|=>|<->|\*\*|==|!=|<=|>=|[+\\-*/%<>]|\\))/.test(s.trim());
  lines.forEach((line, idx) => {
    const start = offset, end = offset + line.length; offset = end + 1;
    const t = line.trim();
    if (!t) { if (cur && pd === 0 && !endsOp(cur.text)) { blocks.push(cur); cur = null; } return; }
    if (cur && (pd > 0 || endsOp(cur.text) || startsOp(t))) {
      cur.text += " " + t; cur.endLine = idx; cur.endOffset = end;
    } else {
      if (cur) blocks.push(cur);
      cur = { text: t, startLine: idx, endLine: idx, startOffset: start, endOffset: end };
    }
    for (const c of t) { if (c === "(") pd++; else if (c === ")") pd = Math.max(0, pd - 1); }
  });
  if (cur) blocks.push(cur);
  return blocks;
}

const isCallable = v => v && typeof v === "object" && v.__callable === true;
const toBool = v => typeof v === "boolean" ? v : typeof v === "number" ? (v !== 0 && !Number.isNaN(v)) : true;
const toNum = v => { if (typeof v === "number") return v; if (typeof v === "boolean") return v ? 1 : 0; throw new Error("Cannot coerce callable"); };
const crossEq = (a, b) => (typeof a === "boolean" && typeof b === "number") ? ((a ? 1 : 0) === b) : (typeof a === "number" && typeof b === "boolean") ? (a === (b ? 1 : 0)) : (a === b);

function tokenize(expr) {
  const t = []; let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(expr[i+1]||""))) {
      let j=i; while (j<expr.length && /[0-9.]/.test(expr[j])) j++; t.push({type:"NUM",val:Number(expr.slice(i,j))}); i=j; continue;
    }
    const three = expr.slice(i,i+3), two = expr.slice(i,i+2);
    if (three === "<->") { t.push({type:"OP",val:"↔"}); i+=3; continue; }
    if (two === "->") { t.push({type:"OP",val:"→"}); i+=2; continue; }
    if (two === "=>") { t.push({type:"ARROW",val:"=>"}); i+=2; continue; }
    if (two === "&&") { t.push({type:"OP",val:"∧"}); i+=2; continue; }
    if (two === "||") { t.push({type:"OP",val:"∨"}); i+=2; continue; }
    if (two === "**") { t.push({type:"OP",val:"**"}); i+=2; continue; }
    if (two === "==") { t.push({type:"OP",val:"=="}); i+=2; continue; }
    if (two === "!=") { t.push({type:"OP",val:"!="}); i+=2; continue; }
    if (two === "<=") { t.push({type:"OP",val:"<="}); i+=2; continue; }
    if (two === ">=") { t.push({type:"OP",val:">="}); i+=2; continue; }
    if (two === "∃!") { t.push({type:"UNARY",val:"∃!"}); i+=2; continue; }
    if (c === "λ" || c === "\\\\") { t.push({type:"LAMBDA",val:"λ"}); i++; continue; }
    if ("().,".includes(c)) { t.push({type:c,val:c}); i++; continue; }
    if ("+-*/%<>".includes(c)) { t.push({type:"OP",val:c}); i++; continue; }
    if ("×÷−≠≤≥".includes(c)) { const m = {"×":"*","÷":"/","−":"-","≠":"!=","≤":"<=","≥":">="}[c]; t.push({type:"OP",val:m}); i++; continue; }
    if ("!~¬∼□◇∀∃".includes(c)) { t.push({type:"UNARY",val:"!~¬∼".includes(c)?"¬":c}); i++; continue; }
    if ("&∧⊗".includes(c)) { t.push({type:"OP",val:"∧"}); i++; continue; }
    if ("|∨".includes(c)) { t.push({type:"OP",val:"∨"}); i++; continue; }
    if ("^⊕".includes(c)) { t.push({type:"OP",val:"⊕"}); i++; continue; }
    if ("→⊢⊨∴↝".includes(c)) { t.push({type:"OP",val:"→"}); i++; continue; }
    if ("↔≡".includes(c)) { t.push({type:"OP",val:"↔"}); i++; continue; }
    if (c==="↑"||c==="⊼") { t.push({type:"OP",val:"↑"}); i++; continue; }
    if (c==="↓"||c==="⊽") { t.push({type:"OP",val:"↓"}); i++; continue; }
    if (c==="⊤") { t.push({type:"BOOL",val:true}); i++; continue; }
    if (c==="⊥") { t.push({type:"BOOL",val:false}); i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j=i; while (j<expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      const w=expr.slice(i,j), u=w.toUpperCase();
      if (u==="TRUE") t.push({type:"BOOL",val:true}); else if (u==="FALSE") t.push({type:"BOOL",val:false});
      else if (u==="NOT") t.push({type:"UNARY",val:"¬"}); else if (u==="AND") t.push({type:"OP",val:"∧"});
      else if (u==="OR") t.push({type:"OP",val:"∨"}); else if (u==="XOR") t.push({type:"OP",val:"⊕"});
      else if (u==="NAND") t.push({type:"OP",val:"↑"}); else if (u==="NOR") t.push({type:"OP",val:"↓"});
      else if (u==="IMPLIES") t.push({type:"OP",val:"→"}); else if (u==="IFF") t.push({type:"OP",val:"↔"});
      else t.push({type:"IDENT",val:w});
      i=j; continue;
    }
    throw new Error("Unexpected character " + c);
  }
  return t;
}

function parseExpression(toks) {
  let pos = 0; const pk = (o=0) => toks[pos+o]; const tk = () => toks[pos++];
  function arrowLam() {
    const s = pos;
    if (pk()?.type==="IDENT" && pk(1)?.type==="ARROW") { const p = tk().val; tk(); return {kind:"lambda",params:[p],body:lam()}; }
    if (pk()?.type==="(") {
      tk(); const ps=[]; let ok=true;
      if (pk()?.type!==")") { while (true) { if (pk()?.type!=="IDENT") { ok=false; break; } ps.push(tk().val); if (pk()?.type===",") { tk(); continue; } break; } }
      if (ok && pk()?.type===")" && pk(1)?.type==="ARROW") { tk(); tk(); return {kind:"lambda",params:ps,body:lam()}; }
    }
    pos = s; return null;
  }
  function lam() {
    if (pk()?.type==="LAMBDA") {
      tk(); const ps=[];
      if (pk()?.type==="(") { tk(); if (pk()?.type!==")") { while (true) { ps.push(tk().val); if (pk()?.type===",") { tk(); continue; } break; } } tk(); }
      else ps.push(tk().val);
      if (pk()?.type==="." || pk()?.type==="ARROW") tk();
      return {kind:"lambda",params:ps,body:lam()};
    }
    return arrowLam() || iff();
  }
  const iff = () => { let l=imp(); while (pk()?.type==="OP"&&pk().val==="↔") l={kind:"bin",op:tk().val,left:l,right:imp()}; return l; };
  const imp = () => { let l=or(); while (pk()?.type==="OP"&&pk().val==="→") l={kind:"bin",op:tk().val,left:l,right:imp()}; return l; };
  const or = () => { let l=xor(); while (pk()?.type==="OP"&&(pk().val==="∨"||pk().val==="↓")) l={kind:"bin",op:tk().val,left:l,right:xor()}; return l; };
  const xor = () => { let l=and(); while (pk()?.type==="OP"&&pk().val==="⊕") l={kind:"bin",op:tk().val,left:l,right:and()}; return l; };
  const and = () => { let l=cmp(); while (pk()?.type==="OP"&&(pk().val==="∧"||pk().val==="↑")) l={kind:"bin",op:tk().val,left:l,right:cmp()}; return l; };
  const cmp = () => { let l=add(); while (pk()?.type==="OP"&&["==","!=","<","<=",">",">="].includes(pk().val)) l={kind:"bin",op:tk().val,left:l,right:add()}; return l; };
  const add = () => { let l=mul(); while (pk()?.type==="OP"&&(pk().val==="+"||pk().val==="-")) l={kind:"bin",op:tk().val,left:l,right:mul()}; return l; };
  const mul = () => { let l=pow(); while (pk()?.type==="OP"&&(pk().val==="*"||pk().val==="/"||pk().val==="%")) l={kind:"bin",op:tk().val,left:l,right:pow()}; return l; };
  const pow = () => { let l=un(); if (pk()?.type==="OP"&&pk().val==="**") return {kind:"bin",op:tk().val,left:l,right:pow()}; return l; };
  const un = () => { if (pk()?.type==="UNARY"||(pk()?.type==="OP"&&(pk().val==="-"||pk().val==="+"))) return {kind:"unary",op:tk().val,arg:un()}; return call(); };
  function call() {
    let n = prim();
    while (pk()?.type==="(") {
      tk(); const args=[]; if (pk()?.type!==")") { while (true) { args.push(lam()); if (pk()?.type===",") { tk(); continue; } break; } }
      if (tk()?.type!==")") throw new Error("Missing ')'");
      n = {kind:"call",callee:n,args};
    }
    return n;
  }
  function prim() {
    const t = pk();
    if (!t) throw new Error("Unexpected end");
    if (t.type==="BOOL"||t.type==="NUM") { tk(); return {kind:"lit",val:t.val}; }
    if (t.type==="(") { tk(); const i=lam(); if (tk()?.type!==")") throw new Error("Missing ')'"); return i; }
    if (t.type==="IDENT") { tk(); return {kind:"var",name:t.val}; }
    throw new Error("Unexpected " + t.val);
  }
  const ast = lam();
  if (pos < toks.length) throw new Error("Trailing " + toks[pos].val);
  return ast;
}

function evalAST(n, env, d=0) {
  if (d>40) throw new Error("Max depth");
  if (n.kind==="lit") return n.val;
  if (n.kind==="var") {
    if (!(n.name in env)) throw new Error("Undefined " + n.name);
    const v = env[n.name];
    if (isCallable(v) && v.isDef) throw new Error("Definition '" + n.name + "' may not be referenced");
    return v;
  }
  if (n.kind==="lambda") return {__callable:true,params:n.params,body:n.body,closureEnv:{...env}};
  if (n.kind==="unary") { const v=evalAST(n.arg,env,d+1); return n.op==="¬"?!toBool(v):n.op==="-"?-toNum(v):n.op==="+"?+toNum(v):toBool(v); }
  if (n.kind==="bin") {
    const a=evalAST(n.left,env,d+1), b=evalAST(n.right,env,d+1);
    const ops = {"∧":()=>toBool(a)&&toBool(b),"∨":()=>toBool(a)||toBool(b),"⊕":()=>toBool(a)!==toBool(b),"→":()=>!toBool(a)||toBool(b),"↔":()=>toBool(a)===toBool(b),"↑":()=>!(toBool(a)&&toBool(b)),"↓":()=>!(toBool(a)||toBool(b)),"+":()=>toNum(a)+toNum(b),"-":()=>toNum(a)-toNum(b),"*":()=>toNum(a)*toNum(b),"/":()=>toNum(a)/toNum(b),"%":()=>toNum(a)%toNum(b),"**":()=>Math.pow(toNum(a),toNum(b)),"==":()=>crossEq(a,b),"!=":()=>!crossEq(a,b),"<":()=>toNum(a)<toNum(b),"<=":()=>toNum(a)<=toNum(b),">":()=>toNum(a)>toNum(b),">=":()=>toNum(a)>=toNum(b)};
    return ops[n.op]();
  }
  if (n.kind==="call") {
    let fn = (n.callee.kind==="var" && (n.callee.name in env)) ? env[n.callee.name] : evalAST(n.callee,env,d+1);
    if (!isCallable(fn)) throw new Error("Not callable");
    if (n.args.length !== fn.params.length) throw new Error("Expected " + fn.params.length + " args");
    const loc = {...fn.closureEnv}; if (fn.name) loc[fn.name]=fn;
    fn.params.forEach((p,i)=>loc[p]=evalAST(n.args[i],env,d+1));
    return evalAST(fn.body,loc,d+1);
  }
}

function freeVars(n, bnd=new Set(), out=new Set()) {
  if (!n) return out;
  if (n.kind==="var") { if (!bnd.has(n.name)) out.add(n.name); }
  else if (n.kind==="unary") freeVars(n.arg,bnd,out);
  else if (n.kind==="bin") { freeVars(n.left,bnd,out); freeVars(n.right,bnd,out); }
  else if (n.kind==="call") { freeVars(n.callee,bnd,out); n.args.forEach(a=>freeVars(a,bnd,out)); }
  else if (n.kind==="lambda") { const nb=new Set(bnd); n.params.forEach(p=>nb.add(p)); freeVars(n.body,nb,out); }
  return out;
}

function getRange(node, env) {
  const vs = Array.from(freeVars(node)).filter(v=>!(v in env));
  if (vs.length > 8) return {type:"bool",val:"both"};
  let t=false,f=false,num=false,cal=false; const ns=new Set();
  for (let m=0; m<(1<<vs.length); m++) {
    const le={...env}; vs.forEach((v,i)=>le[v]=Boolean((m>>i)&1));
    let r; try { r=evalAST(node,le); } catch { return {type:"unknown"}; }
    if (typeof r==="boolean") { if (r) t=true; else f=true; }
    else if (typeof r==="number") { num=true; ns.add(r); }
    else if (isCallable(r)) cal=true;
    if (t&&f&&!num&&!cal) return {type:"bool",val:"both"};
  }
  if (cal) return {type:"callable"};
  if (num&&!t&&!f) return {type:"num",val:ns.size===1?Array.from(ns)[0]:"number"};
  if (t&&f) return {type:"bool",val:"both"};
  if (t) return {type:"bool",val:"true"};
  if (f) return {type:"bool",val:"false"};
  return {type:"unknown"};
}

function firstDef(node, env) {
  const r = getRange(node, env);
  if (r.type==="bool"&&(r.val==="true"||r.val==="false")) return r.val;
  if (node.kind==="unary") return firstDef(node.arg,env);
  if (node.kind==="bin") return firstDef(node.left,env) ?? firstDef(node.right,env);
  return null;
}

function fmtRangeHtml(fn) {
  const be={...fn.closureEnv}; fn.params.forEach(p=>delete be[p]);
  const r=getRange(fn.body, be);
  if (r.type==="callable") return '<span class="tok-def">callable</span>';
  if (r.type==="num") return '<span class="tok-num">' + r.val + '</span>';
  if (r.type==="bool") {
    if (r.val==="true") return '<span class="tok-true">true</span>';
    if (r.val==="false") return '<span class="tok-false">false</span>';
    return firstDef(fn.body,be)==="false" ? '<span class="tok-false">false</span> <span class="tok-or">or</span> <span class="tok-true">true</span>' : '<span class="tok-true">true</span> <span class="tok-or">or</span> <span class="tok-false">false</span>';
  }
  return '<span class="tok-true">true</span> <span class="tok-or">or</span> <span class="tok-false">false</span>';
}

function fmtValHtml(v) {
  if (typeof v==="boolean") return '<span class="'+(v?"tok-true":"tok-false")+'">'+v+'</span>';
  if (typeof v==="number") return '<span class="tok-num">'+(Number.isInteger(v)?v:Number(v.toFixed(6)))+'</span>';
  if (isCallable(v)) return fmtRangeHtml(v);
  return esc(v);
}

function syntaxHighlight(code) {
  return esc(code).replace(/\\b(true|⊤)\\b|\\b(false|⊥)\\b|\\b(\\d+(?:\\.\\d+)?)\\b|(λ|=&gt;)|(&amp;|&lt;-&gt;|-&gt;|==|!=|&lt;=|&gt;=|[=¬∧∨⊕→↔↑↓+\\-*/%|]|&lt;|&gt;)/gi,
    (m,t,f,num,lam,op)=> t?'<span class="syn-true">'+t+'</span>':f?'<span class="syn-false">'+f+'</span>':num?'<span class="syn-num">'+num+'</span>':lam?'<span class="syn-lam">'+lam+'</span>':op?'<span class="syn-op">'+op+'</span>':m);
}

function renderEditors() {
  document.getElementById("preGutter").innerHTML = preInput.value.split(/\\r?\\n/).map((_,i)=>'<div class="gutter-line">'+(i+1)+'</div>').join("");
  document.getElementById("preBackdrop").innerHTML = syntaxHighlight(preInput.value);
  const text = mainInput.value, lines = text.split(/\\r?\\n/);
  const active = hoveredBlockIdx ?? selectedBlockIdx, ptr = hoveredPtrBlockIdx;
  const activeBlk = active!==null?currentBlocks[active]:null, ptrBlk = (ptr!==null&&ptr!==active)?currentBlocks[ptr]:null;
  document.getElementById("editorGutter").innerHTML = lines.map((_,i)=>{
    const cls = (ptrBlk&&i>=ptrBlk.startLine&&i<=ptrBlk.endLine)?"hl-ptr":(activeBlk&&i>=activeBlk.startLine&&i<=activeBlk.endLine)?"hl":"";
    return '<div class="gutter-line '+cls+'">'+(i+1)+'</div>';
  }).join("");
  document.querySelectorAll("#outputList .out-row").forEach((el,i)=>el.classList.toggle("ptr-target", ptr!==null&&i===ptr));
  const rs=[];
  if (activeBlk) rs.push({s:activeBlk.startOffset,e:activeBlk.endOffset,c:"hl-span"});
  if (ptrBlk) rs.push({s:ptrBlk.startOffset,e:ptrBlk.endOffset,c:"hl-span-ptr"});
  rs.sort((a,b)=>a.s-b.s);
  if (!rs.length) document.getElementById("editorBackdrop").innerHTML = syntaxHighlight(text);
  else {
    let h="", c=0;
    rs.forEach(r=>{ h += syntaxHighlight(text.slice(c,r.s)) + '<span class="'+r.c+'">' + syntaxHighlight(text.slice(r.s,r.e)) + '</span>'; c=r.e; });
    document.getElementById("editorBackdrop").innerHTML = h + syntaxHighlight(text.slice(c));
  }
}

function evaluateProgram() {
  const preEnv = {}, preErr = [];
  preInput.value.split(/\\r?\\n/).forEach((l,i)=>{
    const s=l.trim(); if (!s) return;
    const m=s.match(/^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(true|false|⊤|⊥|-?\\d+(?:\\.\\d+)?)$/i);
    if (!m) { preErr.push("Line "+(i+1)+": literal assignment only"); return; }
    const v=m[2].toLowerCase(); preEnv[m[1]]=(v==="true"||v==="⊤")?true:(v==="false"||v==="⊥")?false:Number(v);
  });
  const preErrEl = document.getElementById("preError");
  preErrEl.style.display = preErr.length ? "block" : "none";
  preErrEl.textContent = preErr.join(" ");

  const env = {...preEnv}, varLine = {}, blocks = parseMultilineBlocks(mainInput.value);
  currentBlocks = blocks; blockMeta = [];
  document.getElementById("blockCountBadge").textContent = blocks.length + " block" + (blocks.length===1?"":"s");
  const list = document.getElementById("outputList"); list.innerHTML = "";
  let ptrCounter = 0, lastMeta = null, lastVal = null, lastText = "", errs = [];

  blocks.forEach((blk, idx) => {
    const outIdx = idx + 1;
    const row = document.createElement("div");
    row.className = "out-row" + (selectedBlockIdx===idx ? " selected" : "");
    row.addEventListener("mouseenter", ()=>{ hoveredBlockIdx=idx; renderEditors(); if (blockMeta[idx]?.ast) renderTT(blockMeta[idx]); });
    row.addEventListener("mouseleave", ()=>{ hoveredBlockIdx=null; hoveredPtrBlockIdx=null; renderEditors(); renderTT((selectedBlockIdx!==null&&blockMeta[selectedBlockIdx]?.ast)?blockMeta[selectedBlockIdx]:lastMeta); });
    row.addEventListener("click", ()=>{ selectedBlockIdx = selectedBlockIdx===idx?null:idx; evaluateProgram(); });
    try {
      const dm = blk.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)\\s*=(?![=>])\\s*(.+)$/);
      const am = !dm && blk.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\\s*=(?![=>])\\s*(.+)$/);
      if (dm) {
        const ps = dm[2].split(",").map(p=>p.trim()).filter(Boolean);
        const body = parseExpression(tokenize(dm[3]));
        const fn = {__callable:true,name:dm[1],params:ps,body,closureEnv:{...env},isDef:true};
        env[dm[1]] = fn;
        blockMeta[idx] = {ast:body,label:dm[1]+"("+ps.join(",")+")",env:{...env},params:ps};
        row.innerHTML = '<div class="out-left"><span class="line-tag">line#'+outIdx+'</span><span>'+fmtRangeHtml(fn)+'</span></div><div class="out-annotated">def '+esc(dm[1])+'('+esc(ps.join(","))+') · unreferenceable</div>';
      } else if (am) {
        const ast = parseExpression(tokenize(am[2]));
        const val = evalAST(ast, env);
        if (isCallable(val)) val.name = am[1];
        env[am[1]] = val; ptrCounter++; varLine[am[1]] = {ptr:ptrCounter, blk:idx};
        blockMeta[idx] = {ast:isCallable(val)?val.body:ast,label:am[1],env:{...env},params:isCallable(val)?val.params:[]};
        row.innerHTML = '<div class="out-left"><span class="line-tag">line#'+outIdx+'</span>'+fmtValHtml(val)+'</div><div class="out-annotated">'+(isCallable(val)?'λ '+esc(am[1])+'('+val.params.join(",")+')':esc(am[1])+' = '+esc(am[2]))+'</div>';
      } else {
        const ast = parseExpression(tokenize(blk.text));
        const val = evalAST(ast, env); ptrCounter++;
        lastVal = val; lastText = blk.text;
        lastMeta = {ast,label:blk.text,env:{...env},params:[]}; blockMeta[idx] = lastMeta;
        const ann = esc(blk.text).replace(/\\b([A-Za-z_][A-Za-z0-9_]*)\\b/g,(m,n)=> n in varLine ? n+'<span class="tok-ptr" data-ptr-idx="'+varLine[n].blk+'">[line#'+varLine[n].ptr+']</span>' : m);
        row.innerHTML = '<div class="out-left"><span class="line-tag">line#'+outIdx+'</span>'+fmtValHtml(val)+'</div><div class="out-annotated">'+ann+' = '+fmtValHtml(val)+'</div>';
      }
    } catch (e) {
      errs.push("Block "+outIdx+": "+e.message);
      row.innerHTML = '<div class="out-left"><span class="line-tag">line#'+outIdx+'</span><span class="tok-err">Error: '+esc(e.message)+'</span></div>';
    }
    row.querySelectorAll(".tok-ptr").forEach(b => {
      b.addEventListener("mouseenter", e => { e.stopPropagation(); hoveredBlockIdx = idx; hoveredPtrBlockIdx = Number(b.dataset.ptrIdx); renderEditors(); });
      b.addEventListener("mouseleave", () => { hoveredPtrBlockIdx = null; renderEditors(); });
    });
    list.appendChild(row);
  });

  const me = document.getElementById("mainError");
  me.style.display = errs.length ? "block" : "none";
  me.textContent = errs.join(" | ");

  const pv = document.getElementById("postOutputVal"), eb = document.getElementById("entrypointExprBadge"), pm = document.getElementById("postOutputMeta");
  if (lastVal !== null) {
    pv.innerHTML = fmtValHtml(lastVal); eb.textContent = lastText;
    pm.textContent = isCallable(lastVal) ? "Resolved to lambda(" + lastVal.params.join(", ") + ")" : "Resolved from entrypoint call";
  } else { pv.textContent = "—"; eb.textContent = "No entrypoint call"; pm.textContent = ""; }
  renderTT((selectedBlockIdx!==null&&blockMeta[selectedBlockIdx]?.ast)?blockMeta[selectedBlockIdx]:lastMeta);
  renderEditors();
}

function renderTT(meta) {
  const c = document.getElementById("truthTableContainer"), tl = document.getElementById("ttTargetLabel"), cb = document.getElementById("ttClassBadge");
  if (!meta || !meta.ast) { tl.textContent=""; cb.textContent="—"; c.innerHTML='<div style="padding:14px;color:var(--muted);font-size:12px;">Enter an executable expression to view its truth table.</div>'; return; }
  tl.textContent = "· " + meta.label;
  const env = meta.env, vars = Array.from(freeVars(meta.ast)).filter(v => (meta.params&&meta.params.includes(v)) || !(v in env) || typeof env[v]==="boolean" || env[v]===0 || env[v]===1);
  if (!vars.length) { let r; try { r=evalAST(meta.ast,env); } catch { r="Error"; } cb.textContent = typeof r==="number"?"Arithmetic":"Constant"; c.innerHTML='<div style="padding:14px;color:var(--muted);font-size:12px;">Result: '+fmtValHtml(r)+'</div>'; return; }
  if (vars.length > 6) { cb.textContent="Capped"; c.innerHTML='<div style="padding:14px;color:var(--warn-col);font-size:12px;">Capped at 6 variables.</div>'; return; }
  const total = 1 << vars.length; let tc = 0, ab = true;
  let h = '<table class="tt"><thead><tr>' + vars.map(v=>'<th>'+esc(v)+'</th>').join('') + '<th>'+esc(meta.label)+'</th></tr></thead><tbody>';
  for (let m=0; m<total; m++) {
    const re = {...env}; let cur = true; const cells = [];
    vars.forEach((v,i)=>{ const b=Boolean((m>>i)&1); re[v]=b; if (!(v in env) || toBool(env[v])!==b) cur=false; cells.push('<td class="'+(b?"tok-true":"tok-false")+'">'+(b?"T":"F")+'</td>'); });
    let r; try { r=evalAST(meta.ast,re); } catch { r=false; }
    if (typeof r==="boolean") { if (r) tc++; } else ab=false;
    h += '<tr class="'+(cur?"active-row":"")+'">'+cells.join('')+'<td>'+fmtValHtml(r)+'</td></tr>';
  }
  c.innerHTML = h + '</tbody></table>';
  cb.textContent = !ab ? "Mixed / Numeric" : tc===total ? "Tautology (⊤)" : tc===0 ? "Contradiction (⊥)" : "Contingency";
}

preInput.addEventListener("input", evaluateProgram);
mainInput.addEventListener("input", evaluateProgram);
preInput.addEventListener("scroll", () => { document.getElementById("preBackdrop").scrollTop = preInput.scrollTop; document.getElementById("preGutter").scrollTop = preInput.scrollTop; });
mainInput.addEventListener("scroll", () => { document.getElementById("editorBackdrop").scrollTop = mainInput.scrollTop; document.getElementById("editorGutter").scrollTop = mainInput.scrollTop; });
evaluateProgram();
</script>
</body>
</html>`;
}
