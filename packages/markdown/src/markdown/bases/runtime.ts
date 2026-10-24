import { parseExpr, type ExprNode } from "./ast";
import {
  evalGlobalFunction,
  evalMemberAccess,
  evalMethodCall,
  readFileField,
  readNoteProperty,
} from "./methods";
import { normalizePropertyId, stripPropertyPrefix } from "./parse";
import type { BaseFilter, BaseNoteEntry } from "./types";
import {
  NULL_VAL,
  compareRuntimeVals,
  equalsRuntimeVals,
  fromRawValue,
  isTruthy,
  parseDurationMs,
  toNumberVal,
  toStringVal,
  type RuntimeVal,
} from "./values";

export interface EvalContext {
  entry: BaseNoteEntry;
  thisEntry?: BaseNoteEntry;
  formulas: Record<string, string>;
  formulaCache: Map<string, RuntimeVal>;
  formulaStack: Set<string>;
  nowMs: number;
}

export function createEvalContext(
  entry: BaseNoteEntry,
  formulas: Record<string, string>,
  thisEntry?: BaseNoteEntry,
  nowMs: number = Date.now(),
): EvalContext {
  return {
    entry,
    ...(thisEntry ? { thisEntry } : {}),
    formulas,
    formulaCache: new Map(),
    formulaStack: new Set(),
    nowMs,
  };
}

export function evalPropertyById(propId: string, ctx: EvalContext): RuntimeVal {
  const normalized = normalizePropertyId(propId);
  if (normalized.startsWith("file.")) {
    return readFileField(ctx.entry, stripPropertyPrefix(normalized));
  }
  if (normalized.startsWith("formula.")) {
    return evalFormula(stripPropertyPrefix(normalized), ctx);
  }
  return readNoteProperty(ctx.entry, stripPropertyPrefix(normalized));
}

export function evalFormula(name: string, ctx: EvalContext): RuntimeVal {
  const cached = ctx.formulaCache.get(name);
  if (cached) {
    return cached;
  }
  const source = ctx.formulas[name];
  if (!source || ctx.formulaStack.has(name)) {
    return NULL_VAL;
  }
  ctx.formulaStack.add(name);
  try {
    const val = evalAst(parseExpr(source), ctx);
    ctx.formulaCache.set(name, val);
    return val;
  } finally {
    ctx.formulaStack.delete(name);
  }
}

export function evalFilter(filter: BaseFilter, ctx: EvalContext): boolean {
  switch (filter.kind) {
    case "expr":
      return isTruthy(evalAst(parseExpr(filter.expr), ctx));
    case "and":
      return filter.items.every((item) => evalFilter(item, ctx));
    case "or":
      return filter.items.some((item) => evalFilter(item, ctx));
    case "not":
      return !filter.items.some((item) => evalFilter(item, ctx));
  }
}

export function evalAst(node: ExprNode, ctx: EvalContext): RuntimeVal {
  switch (node.kind) {
    case "literal":
      return fromRawValue(node.value);
    case "regexp":
      return evalRegexNode(node.pattern, node.flags);
    case "list":
      return {
        kind: "list",
        items: node.items.map((item) => evalAst(item, ctx)),
      };
    case "ident":
      return evalIdent(node.name, ctx);
    case "unary":
      return evalUnary(node.op, evalAst(node.arg, ctx));
    case "binary":
      return evalBinary(node, ctx);
    case "member":
      return evalMemberNode(node.object, node.property, ctx);
    case "index":
      return evalIndexNode(node.object, node.index, ctx);
    case "call":
      return evalCallNode(node.callee, node.args, ctx);
  }
}

function evalRegexNode(pattern: string, flags: string): RuntimeVal {
  try {
    return { kind: "regexp", regex: new RegExp(pattern, flags) };
  } catch {
    return NULL_VAL;
  }
}

function evalIdent(name: string, ctx: EvalContext): RuntimeVal {
  if (name === "file") {
    return { kind: "file", entry: ctx.entry };
  }
  if (name === "this") {
    return { kind: "file", entry: ctx.thisEntry ?? ctx.entry };
  }
  return readNoteProperty(ctx.entry, name);
}

function evalMemberNode(
  objectNode: ExprNode,
  property: string,
  ctx: EvalContext,
): RuntimeVal {
  if (objectNode.kind === "ident") {
    if (objectNode.name === "note") {
      return readNoteProperty(ctx.entry, property);
    }
    if (objectNode.name === "formula") {
      return evalFormula(property, ctx);
    }
    if (objectNode.name === "this") {
      const target = ctx.thisEntry ?? ctx.entry;
      const noteProp = readNoteProperty(target, property);
      return noteProp.kind !== "null"
        ? noteProp
        : readFileField(target, property);
    }
  }
  return evalMemberAccess(evalAst(objectNode, ctx), property);
}

function evalIndexNode(
  objectNode: ExprNode,
  indexNode: ExprNode,
  ctx: EvalContext,
): RuntimeVal {
  const target = evalAst(objectNode, ctx);
  const idxVal = evalAst(indexNode, ctx);
  if (target.kind === "list") {
    const idx = Math.trunc(toNumberVal(idxVal));
    const resolved = idx < 0 ? target.items.length + idx : idx;
    return target.items[resolved] ?? NULL_VAL;
  }
  if (target.kind === "string") {
    const idx = Math.trunc(toNumberVal(idxVal));
    const ch = target.value[idx < 0 ? target.value.length + idx : idx];
    return ch !== undefined ? { kind: "string", value: ch } : NULL_VAL;
  }
  if (target.kind === "file") {
    return readNoteProperty(target.entry, toStringVal(idxVal));
  }
  return NULL_VAL;
}

function evalUnary(op: string, arg: RuntimeVal): RuntimeVal {
  if (op === "!") {
    return { kind: "boolean", value: !isTruthy(arg) };
  }
  const num = toNumberVal(arg);
  if (!Number.isFinite(num)) {
    return NULL_VAL;
  }
  return { kind: "number", value: op === "-" ? -num : num };
}

function evalBinary(
  node: { op: string; left: ExprNode; right: ExprNode },
  ctx: EvalContext,
): RuntimeVal {
  if (node.op === "&&") {
    const left = evalAst(node.left, ctx);
    return isTruthy(left)
      ? { kind: "boolean", value: isTruthy(evalAst(node.right, ctx)) }
      : { kind: "boolean", value: false };
  }
  if (node.op === "||") {
    const left = evalAst(node.left, ctx);
    return isTruthy(left)
      ? { kind: "boolean", value: true }
      : { kind: "boolean", value: isTruthy(evalAst(node.right, ctx)) };
  }
  const left = evalAst(node.left, ctx);
  const right = evalAst(node.right, ctx);
  if (node.op === "==" || node.op === "!=") {
    const eq = equalsRuntimeVals(left, right);
    return { kind: "boolean", value: node.op === "==" ? eq : !eq };
  }
  if (
    node.op === "<" ||
    node.op === ">" ||
    node.op === "<=" ||
    node.op === ">="
  ) {
    return evalRelational(node.op, left, right);
  }
  return evalArithmetic(node.op, left, right);
}

function evalRelational(
  op: string,
  left: RuntimeVal,
  right: RuntimeVal,
): RuntimeVal {
  if (left.kind === "null" || right.kind === "null") {
    return { kind: "boolean", value: false };
  }
  const cmp = compareRuntimeVals(left, right);
  if (op === "<") {
    return { kind: "boolean", value: cmp < 0 };
  }
  if (op === ">") {
    return { kind: "boolean", value: cmp > 0 };
  }
  if (op === "<=") {
    return { kind: "boolean", value: cmp <= 0 };
  }
  return { kind: "boolean", value: cmp >= 0 };
}

function evalArithmetic(
  op: string,
  left: RuntimeVal,
  right: RuntimeVal,
): RuntimeVal {
  if (op === "+" || op === "-") {
    const dateMath = evalDateArithmetic(op, left, right);
    if (dateMath) {
      return dateMath;
    }
  }
  if (op === "+" && (left.kind === "string" || right.kind === "string")) {
    return { kind: "string", value: toStringVal(left) + toStringVal(right) };
  }
  const a = toNumberVal(left);
  const b = toNumberVal(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return NULL_VAL;
  }
  return computeNumericOp(op, a, b);
}

function evalDateArithmetic(
  op: string,
  left: RuntimeVal,
  right: RuntimeVal,
): RuntimeVal | undefined {
  if (left.kind === "date" && right.kind === "string") {
    const dur = parseDurationMs(right.value);
    if (dur !== undefined) {
      return {
        kind: "date",
        ms: op === "+" ? left.ms + dur : left.ms - dur,
        dateOnly: left.dateOnly,
      };
    }
  }
  if (left.kind === "date" && right.kind === "duration") {
    return {
      kind: "date",
      ms: op === "+" ? left.ms + right.ms : left.ms - right.ms,
      dateOnly: left.dateOnly,
    };
  }
  if (op === "-" && left.kind === "date" && right.kind === "date") {
    return { kind: "duration", ms: left.ms - right.ms };
  }
  return undefined;
}

function computeNumericOp(op: string, a: number, b: number): RuntimeVal {
  switch (op) {
    case "+":
      return { kind: "number", value: a + b };
    case "-":
      return { kind: "number", value: a - b };
    case "*":
      return { kind: "number", value: a * b };
    case "/":
      return b === 0 ? NULL_VAL : { kind: "number", value: a / b };
    case "%":
      return b === 0 ? NULL_VAL : { kind: "number", value: a % b };
    default:
      return NULL_VAL;
  }
}

function evalCallNode(
  callee: ExprNode,
  argNodes: ExprNode[],
  ctx: EvalContext,
): RuntimeVal {
  if (callee.kind === "ident" && callee.name === "if") {
    const cond = argNodes[0] ? evalAst(argNodes[0], ctx) : NULL_VAL;
    if (isTruthy(cond)) {
      return argNodes[1]
        ? evalAst(argNodes[1], ctx)
        : { kind: "boolean", value: true };
    }
    return argNodes[2] ? evalAst(argNodes[2], ctx) : NULL_VAL;
  }
  const args = argNodes.map((arg) => evalAst(arg, ctx));
  if (callee.kind === "member") {
    const receiver = evalAst(callee.object, ctx);
    return evalMethodCall(receiver, callee.property, args);
  }
  if (callee.kind === "ident") {
    return evalGlobalFunction(callee.name, args, ctx.entry, ctx.nowMs);
  }
  return NULL_VAL;
}
