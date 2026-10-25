// Node checker. It loads the built wasm, assembles each example, and asserts the mode.
import { readFile } from "node:fs/promises";

import init, * as munu from "../pkg/munu_web.js";

const SEED_LEN = 32;
const DEFAULT_TIME_MS = 2000;
const FUEL_LIMIT = 40;
const VALUE_PREFIX = "value:";
const KIND_PREFIX = "kind:";
const EXPECT_OK = "ok";
const EXPECT_UNVERIFIED = "unverified";
const MODE_RUN = "run";
const MODE_CHECK = "check";
const MODE_ERROR = "error";
const MODE_EXCERPT = "excerpt";
const MODE_PENDING = "pending";

const ONE_I64 = "mu run() -> i64 { _ => 1 }\n";
const NON_EXHAUSTIVE = "mu handle(e: bool) -> i64 {\n    true => 1,\n}\n";
const TAIL_SPIN = "mu spin(n: i64) -> i64\n    decreases n\n{\n    n => spin(n + 1)\n}\nmu run() -> i64 { _ => spin(0) }\n";
const COUNT_FROM_READ = "nu count_from(n: i64) -> [i64] {\n    n => [n | count_from(n + 1)]\n}\nmu drain(xs: [i64]) -> i64\n    decreases xs\n{\n    [_ | t] => drain(t),\n    [] => 0\n}\nmu run() -> i64 { _ => drain(count_from(1)) }\n";

const htmlPath = process.argv[2];
if (htmlPath === undefined) {
    console.error("pass the HTML path");
    process.exit(1);
}

const failures = [];

function fail(message) {
    failures.push(message);
    console.error(message);
}

function num(value) {
    return typeof value === "bigint" ? Number(value) : value;
}

function seed() {
    const bytes = new Uint8Array(SEED_LEN);
    for (let index = 0; index < SEED_LEN; index += 1) {
        bytes[index] = index + 1;
    }
    return bytes;
}

function attrs(tag) {
    const out = new Map();
    let index = 0;
    while (index < tag.length) {
        while (index < tag.length && /\s/.test(tag[index])) {
            index += 1;
        }
        const start = index;
        while (index < tag.length && /[A-Za-z0-9-]/.test(tag[index])) {
            index += 1;
        }
        if (start === index) {
            index += 1;
            continue;
        }
        const name = tag.slice(start, index);
        while (index < tag.length && /\s/.test(tag[index])) {
            index += 1;
        }
        if (index >= tag.length || tag[index] !== "=") {
            continue;
        }
        index += 1;
        while (index < tag.length && /\s/.test(tag[index])) {
            index += 1;
        }
        if (index >= tag.length) {
            break;
        }
        const quote = tag[index];
        if (quote !== '"' && quote !== "'") {
            continue;
        }
        index += 1;
        const valueStart = index;
        while (index < tag.length && tag[index] !== quote) {
            index += 1;
        }
        out.set(name, tag.slice(valueStart, index));
        if (index < tag.length) {
            index += 1;
        }
    }
    return out;
}

function stripTags(input) {
    let out = "";
    for (let index = 0; index < input.length; index += 1) {
        const ch = input[index];
        if (ch === "<") {
            const next = input[index + 1];
            const tag = next !== undefined && /[A-Za-z/!]/.test(next);
            if (tag) {
                const end = input.indexOf(">", index + 1);
                if (end < 0) {
                    break;
                }
                index = end;
                continue;
            }
        }
        out += ch;
    }
    return out;
}

function unescape(input) {
    let out = "";
    let rest = input;
    while (rest.includes("&")) {
        const at = rest.indexOf("&");
        out += rest.slice(0, at);
        rest = rest.slice(at);
        const end = rest.indexOf(";");
        if (end < 0) {
            out += "&";
            rest = rest.slice(1);
            continue;
        }
        const entity = rest.slice(1, end);
        const text = {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " ",
        }[entity];
        if (text === undefined) {
            out += "&";
            rest = rest.slice(1);
            continue;
        }
        out += text;
        rest = rest.slice(end + 1);
    }
    return out + rest;
}

function findTag(html) {
    const pre = html.indexOf("<pre");
    const template = html.indexOf("<template");
    let name = null;
    let at = -1;
    if (pre >= 0 && (template < 0 || pre < template)) {
        name = "pre";
        at = pre;
    } else if (template >= 0) {
        name = "template";
        at = template;
    } else {
        return null;
    }
    const tail = html.slice(at);
    const tagEnd = tail.indexOf(">");
    if (tagEnd < 0) {
        fail("a tag has no end");
        return null;
    }
    const close = name === "template" ? "</template>" : "</pre>";
    const closeAt = tail.indexOf(close);
    const innerEnd = closeAt < 0 ? tail.length : closeAt;
    const fullEnd = closeAt < 0 ? tail.length : closeAt + close.length;
    return { name, open: tail.slice(0, tagEnd + 1), inner: tail.slice(tagEnd + 1, innerEnd), next: at + fullEnd };
}

function takeExample(attributes, code, codes, examples) {
    if (!attributes.has("data-munu")) {
        fail("a pre has no data-munu");
        return;
    }
    const id = attributes.get("data-munu-id");
    if (id === undefined || id.length === 0) {
        fail("a pre has no data-munu-id");
        return;
    }
    if (codes.has(id)) {
        fail(`duplicate id ${id}`);
        return;
    }
    const prelude = attributes.get("data-munu-prelude") ?? "";
    const example = {
        id,
        mode: attributes.get("data-munu"),
        module: attributes.get("data-munu-module") ?? null,
        preludes: prelude.split(/\s+/).filter((item) => item.length > 0),
        entry: attributes.get("data-munu-entry") ?? null,
        call: attributes.get("data-munu-call") ?? null,
        ty: attributes.get("data-munu-type") ?? null,
        expect: attributes.get("data-munu-expect") ?? null,
        code,
    };
    codes.set(id, code);
    examples.push(example);
}

function page(html) {
    const examples = [];
    const codes = new Map();
    let rest = html;
    while (rest.length > 0) {
        const found = findTag(rest);
        if (found === null) {
            break;
        }
        if (found.name === "pre") {
            const attributes = attrs(found.open);
            const className = attributes.get("class") ?? "";
            if (className.split(/\s+/).includes("xcode")) {
                const codeAt = found.inner.indexOf("<code>");
                const codeEnd = found.inner.indexOf("</code>");
                if (codeAt < 0 || codeEnd < 0 || codeEnd < codeAt) {
                    fail("a pre holds no code");
                } else {
                    const raw = found.inner.slice(codeAt + "<code>".length, codeEnd);
                    takeExample(attributes, unescape(stripTags(raw)), codes, examples);
                }
            }
        } else {
            const attributes = attrs(found.open);
            const id = attributes.get("id");
            if (id !== undefined) {
                codes.set(id, unescape(stripTags(found.inner)));
            }
        }
        rest = rest.slice(found.next);
    }
    return { examples, codes };
}

function assemble(example, codes) {
    let out = "";
    if (example.module !== null) {
        out += `module ${example.module}\n`;
    }
    for (const id of example.preludes) {
        const text = codes.get(id);
        if (text === undefined) {
            fail(`prelude ${id} is missing`);
            continue;
        }
        if (out.length > 0 && !out.endsWith("\n")) {
            out += "\n";
        }
        out += text;
        if (!text.endsWith("\n")) {
            out += "\n";
        }
    }
    if (out.length > 0 && !out.endsWith("\n")) {
        out += "\n";
    }
    out += example.code;
    if (example.call !== null) {
        if (example.ty === null) {
            fail(`${example.id} has a call and no type`);
        } else {
            if (!out.endsWith("\n")) {
                out += "\n";
            }
            out += `mu run() -> ${example.ty} { _ => ${example.call} }\n`;
        }
    }
    return out;
}

function assertSmoke() {
    const checked = munu.check(ONE_I64);
    if (checked.status !== "ok") {
        fail(`check of a constant is ${checked.status}: ${JSON.stringify(checked)}`);
    }
    const bad = munu.check(NON_EXHAUSTIVE);
    const diagnostic = bad.diagnostics?.[0];
    const slice = diagnostic === undefined ? "" : NON_EXHAUSTIVE.slice(num(diagnostic.start), num(diagnostic.end));
    if (bad.status !== "error" || diagnostic === undefined || diagnostic.kind !== "NonExhaustiveMatch" || slice.length === 0 || !NON_EXHAUSTIVE.includes(slice)) {
        fail(`non-exhaustive span failed: ${JSON.stringify(bad)} slice=${JSON.stringify(slice)}`);
    }
    const openOpts = { fuel: FUEL_LIMIT, deterministic: true, timeMs: DEFAULT_TIME_MS };
    const spun = munu.run(TAIL_SPIN, null, openOpts);
    if (spun.outcome !== "fuel-exhausted" || num(spun.steps) !== FUEL_LIMIT) {
        fail(`tail spin did not exhaust fuel: ${JSON.stringify(spun)}`);
    }
    let read;
    try {
        read = munu.run(COUNT_FROM_READ, null, openOpts);
    } catch (error) {
        fail(`count_from read threw: ${error}`);
        read = null;
    }
    if (read !== null && read.outcome !== "fuel-exhausted" && read.outcome !== "timeout") {
        fail(`count_from read did not stop on fuel or time: ${JSON.stringify(read)}`);
    }
    const detOpts = { deterministic: true };
    const first = munu.run(ONE_I64, null, detOpts);
    const second = munu.run(ONE_I64, null, detOpts);
    if (first.outcome !== "halted" || first.value !== second.value || first.stdout !== second.stdout) {
        fail(`deterministic runs differ: ${JSON.stringify(first)} ${JSON.stringify(second)}`);
    }
}

function assertExample(example, source) {
    if (example.mode === MODE_EXCERPT || example.mode === MODE_PENDING) {
        console.log(`${example.id} ${example.mode}`);
        return;
    }
    if (example.mode === MODE_RUN) {
        const result = munu.run(source, example.entry, { deterministic: true });
        if (result.outcome !== "halted") {
            fail(`${example.id} outcome ${result.outcome}: ${JSON.stringify(result)}`);
            return;
        }
        if (example.expect !== null && example.expect.startsWith(VALUE_PREFIX)) {
            const want = example.expect.slice(VALUE_PREFIX.length);
            if (result.value !== want) {
                fail(`${example.id} value ${JSON.stringify(result.value)} != ${JSON.stringify(want)}`);
            }
        }
        return;
    }
    const result = munu.check(source);
    if (example.mode === MODE_CHECK) {
        if (result.status !== "ok" && result.status !== "typechecked-unverified") {
            fail(`${example.id} status ${result.status}: ${JSON.stringify(result)}`);
            return;
        }
        if (example.expect === EXPECT_OK && result.status !== "ok") {
            fail(`${example.id} status ${result.status}`);
        }
        if (example.expect === EXPECT_UNVERIFIED && result.status !== "typechecked-unverified") {
            fail(`${example.id} status ${result.status}`);
        }
        return;
    }
    if (example.mode === MODE_ERROR) {
        if (result.status !== "error") {
            fail(`${example.id} status ${result.status}: ${JSON.stringify(result)}`);
            return;
        }
        if (example.expect !== null && example.expect.startsWith(KIND_PREFIX)) {
            const want = example.expect.slice(KIND_PREFIX.length);
            const kind = result.diagnostics?.[0]?.kind;
            if (kind !== want) {
                fail(`${example.id} kind ${kind} != ${want}`);
            }
        }
        return;
    }
    fail(`${example.id} has unknown mode ${example.mode}`);
}

const wasmBytes = await readFile(new URL("../pkg/munu_web_bg.wasm", import.meta.url));
await init({ module_or_path: wasmBytes });
munu.init(seed());
console.log(munu.version());
assertSmoke();
const html = await readFile(htmlPath, "utf8");
const loaded = page(html);
for (const example of loaded.examples) {
    const source = assemble(example, loaded.codes);
    assertExample(example, source);
}
if (failures.length > 0) {
    console.error(`${failures.length} failure(s)`);
    process.exit(1);
}
console.log(`checked ${loaded.examples.length} examples`);
