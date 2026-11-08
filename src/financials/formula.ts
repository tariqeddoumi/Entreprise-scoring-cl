/**
 * Formules du paramétrage du bilan : indicateurs complémentaires et alertes.
 *
 * Langage volontairement réduit, évalué sans `eval` :
 *  - nombres (point décimal), postes et indicateurs par leur code
 *    (ex. CAPITAUX_PROPRES, GEARING), parenthèses ;
 *  - opérateurs + − × / ; comparaisons < <= > >= = <> ; ET, OU, NON ;
 *  - PREC(x) : x sur l'exercice précédent ; PREC(x; 2) : deux exercices avant ;
 *  - EVOL(x) : variation de x sur un an, en % (x / PREC(x) − 1) × 100 ;
 *  - ABS(x), MIN(a; b…), MAX(a; b…). Séparateur d'arguments : « ; » ou « , ».
 *
 * Une valeur indisponible (exercice absent, division par zéro) rend le
 * résultat indisponible ; « ET » est faux dès qu'un terme est faux, « OU »
 * vrai dès qu'un terme est vrai. Une condition vaut 1 (vraie) ou 0 (fausse).
 *
 * Module PUR : partagé par l'écran, le serveur et le paramétrage.
 */

export type Ast =
  | { t: "num"; v: number }
  | { t: "id"; name: string }
  | { t: "neg"; e: Ast }
  | { t: "not"; e: Ast }
  | { t: "bin"; op: string; a: Ast; b: Ast }
  | { t: "call"; fn: string; args: Ast[] };

export class FormulaError extends Error {}

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  PREC: { min: 1, max: 2 },
  EVOL: { min: 1, max: 1 },
  ABS: { min: 1, max: 1 },
  MIN: { min: 2, max: 10 },
  MAX: { min: 2, max: 10 },
};

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new FormulaError(`Nombre illisible : « ${src.slice(i, j)} ».`);
      out.push({ k: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_À-ÿ]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_À-ÿ]/.test(src[j])) j++;
      out.push({ k: "id", v: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>"].includes(two)) {
      out.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/()<>=;,×÷−".includes(c)) {
      const v = c === "×" ? "*" : c === "÷" ? "/" : c === "−" ? "-" : c === ";" ? "," : c;
      out.push({ k: "op", v });
      i++;
      continue;
    }
    throw new FormulaError(`Caractère non admis : « ${c} ».`);
  }
  return out;
}

/** Analyse une formule ; lève FormulaError avec un message en français. */
export function parseFormula(src: string): Ast {
  if (src.length > 500) throw new FormulaError("Formule trop longue (500 caractères au plus).");
  const toks = tokenize(src);
  if (toks.length === 0) throw new FormulaError("Formule vide.");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === "op" && peek().v === v;
  const isWord = (v: string) => peek()?.k === "id" && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`« ${v} » attendu.`);
    p++;
  };

  function or(): Ast {
    let a = and();
    while (isWord("OU")) {
      p++;
      a = { t: "bin", op: "OU", a, b: and() };
    }
    return a;
  }
  function and(): Ast {
    let a = not();
    while (isWord("ET")) {
      p++;
      a = { t: "bin", op: "ET", a, b: not() };
    }
    return a;
  }
  function not(): Ast {
    if (isWord("NON")) {
      p++;
      return { t: "not", e: not() };
    }
    return cmp();
  }
  function cmp(): Ast {
    const a = add();
    const t = peek();
    if (t?.k === "op" && ["<", "<=", ">", ">=", "=", "<>"].includes(t.v)) {
      p++;
      return { t: "bin", op: t.v, a, b: add() };
    }
    return a;
  }
  function add(): Ast {
    let a = mul();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v as string;
      a = { t: "bin", op, a, b: mul() };
    }
    return a;
  }
  function mul(): Ast {
    let a = unary();
    while (isOp("*") || isOp("/")) {
      const op = toks[p++].v as string;
      a = { t: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Ast {
    if (isOp("-")) {
      p++;
      return { t: "neg", e: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return primary();
  }
  function primary(): Ast {
    const t = peek();
    if (!t) throw new FormulaError("Formule incomplète.");
    if (t.k === "num") {
      p++;
      return { t: "num", v: t.v };
    }
    if (t.k === "op" && t.v === "(") {
      p++;
      const e = or();
      expect(")");
      return e;
    }
    if (t.k === "id") {
      if (["ET", "OU", "NON"].includes(t.v)) throw new FormulaError(`« ${t.v} » mal placé.`);
      p++;
      if (isOp("(")) {
        const fn = FUNCTIONS[t.v];
        if (!fn) throw new FormulaError(`Fonction inconnue : ${t.v} (admises : ${Object.keys(FUNCTIONS).join(", ")}).`);
        p++;
        const args: Ast[] = [];
        if (!isOp(")")) {
          args.push(or());
          while (isOp(",")) {
            p++;
            args.push(or());
          }
        }
        expect(")");
        if (args.length < fn.min || args.length > fn.max) throw new FormulaError(`${t.v} : nombre d'arguments incorrect.`);
        if (t.v === "PREC" && args[1] && (args[1].t !== "num" || ![1, 2].includes(args[1].v))) {
          throw new FormulaError("PREC(x; k) : k vaut 1 ou 2.");
        }
        return { t: "call", fn: t.v, args };
      }
      return { t: "id", name: t.v };
    }
    throw new FormulaError(`« ${t.v} » inattendu.`);
  }

  const ast = or();
  if (p < toks.length) throw new FormulaError(`« ${String(toks[p].v)} » inattendu.`);
  return ast;
}

/** Codes cités par une formule (postes, indicateurs, variables). */
export function identifiers(ast: Ast, out = new Set<string>()): Set<string> {
  switch (ast.t) {
    case "id":
      out.add(ast.name);
      break;
    case "neg":
    case "not":
      identifiers(ast.e, out);
      break;
    case "bin":
      identifiers(ast.a, out);
      identifiers(ast.b, out);
      break;
    case "call":
      ast.args.forEach((a) => identifiers(a, out));
      break;
  }
  return out;
}

/** Valeur d'un code à l'exercice i (0 = N), null si indisponible. */
export type Resolver = (name: string, yearIndex: number) => number | null;

export function evaluate(ast: Ast, resolve: Resolver, yearIndex = 0): number | null {
  const ev = (a: Ast, i: number): number | null => {
    switch (a.t) {
      case "num":
        return a.v;
      case "id":
        return resolve(a.name, i);
      case "neg": {
        const x = ev(a.e, i);
        return x === null ? null : -x;
      }
      case "not": {
        const x = ev(a.e, i);
        return x === null ? null : x ? 0 : 1;
      }
      case "bin": {
        if (a.op === "ET") {
          const x = ev(a.a, i);
          if (x === 0) return 0;
          const y = ev(a.b, i);
          if (y === 0) return 0;
          return x === null || y === null ? null : 1;
        }
        if (a.op === "OU") {
          const x = ev(a.a, i);
          if (x !== null && x !== 0) return 1;
          const y = ev(a.b, i);
          if (y !== null && y !== 0) return 1;
          return x === null || y === null ? null : 0;
        }
        const x = ev(a.a, i);
        const y = ev(a.b, i);
        if (x === null || y === null) return null;
        switch (a.op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return y === 0 ? null : x / y;
          case "<":
            return x < y ? 1 : 0;
          case "<=":
            return x <= y ? 1 : 0;
          case ">":
            return x > y ? 1 : 0;
          case ">=":
            return x >= y ? 1 : 0;
          case "=":
            return Math.abs(x - y) < 1e-9 ? 1 : 0;
          case "<>":
            return Math.abs(x - y) < 1e-9 ? 0 : 1;
        }
        return null;
      }
      case "call": {
        if (a.fn === "PREC") {
          const k = a.args[1]?.t === "num" ? a.args[1].v : 1;
          return ev(a.args[0], i + k);
        }
        if (a.fn === "EVOL") {
          const now = ev(a.args[0], i);
          const prev = ev(a.args[0], i + 1);
          if (now === null || prev === null || prev === 0) return null;
          return (now / Math.abs(prev) - Math.sign(prev)) * 100;
        }
        const xs = a.args.map((x) => ev(x, i));
        if (xs.some((x) => x === null)) return null;
        const ns = xs as number[];
        if (a.fn === "ABS") return Math.abs(ns[0]);
        if (a.fn === "MIN") return Math.min(...ns);
        if (a.fn === "MAX") return Math.max(...ns);
        return null;
      }
    }
  };
  const r = ev(ast, yearIndex);
  return r === null || !Number.isFinite(r) ? null : r;
}
