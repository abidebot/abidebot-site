// munu examples on the page: adds a Run or Check button to each runnable block.
// Nothing is downloaded until the first click: the click imports the client,
// which starts a Worker that loads the compiler.

const BUTTON = { run: "\u25B6 Run", check: "\u2713 Check", error: "\u2713 Check" };
const RUN_OPTS = { timeMs: 2000 };
let client = null;

function loadClient() {
    if (client === null) {
        client = import("./js/munu-client.js");
    }
    return client;
}

function exampleText(id) {
    const pre = document.querySelector(`pre[data-munu-id="${CSS.escape(id)}"]`);
    if (pre !== null) {
        return pre.querySelector("code").textContent;
    }
    const template = document.getElementById(id);
    if (template !== null && template.content !== undefined) {
        return template.content.textContent;
    }
    return null;
}

// Same assembly as check-examples.mjs: module line, preludes, the code, the run() wrapper.
function assemble(pre) {
    const code = pre.querySelector("code").textContent;
    let out = "";
    const module = pre.dataset.munuModule;
    if (module) {
        out += `module ${module}\n`;
    }
    for (const id of (pre.dataset.munuPrelude ?? "").split(/\s+/).filter(Boolean)) {
        const text = exampleText(id);
        if (text === null) {
            continue;
        }
        if (out.length > 0 && !out.endsWith("\n")) {
            out += "\n";
        }
        out += text.endsWith("\n") ? text : text + "\n";
    }
    if (out.length > 0 && !out.endsWith("\n")) {
        out += "\n";
    }
    const offset = out.length;
    out += code;
    const call = pre.dataset.munuCall;
    if (call && pre.dataset.munuType) {
        if (!out.endsWith("\n")) {
            out += "\n";
        }
        out += `mu run() -> ${pre.dataset.munuType} { _ => ${call} }\n`;
    }
    return { src: out, offset, length: code.length };
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function clearMarks(pre) {
    for (const mark of pre.querySelectorAll("mark[data-munu-mark]")) {
        mark.replaceWith(...mark.childNodes);
    }
    pre.querySelector("code").normalize();
}

// Wrap code text between two offsets in <mark>, across the highlight spans.
function markSpan(pre, start, end) {
    const code = pre.querySelector("code");
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const pieces = [];
    let at = 0;
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const len = node.data.length;
        const from = Math.max(start, at);
        const to = Math.min(end, at + len);
        if (from < to) {
            pieces.push([node, from - at, to - at]);
        }
        at += len;
    }
    let first = null;
    for (const [node, from, to] of pieces) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        const mark = el("mark");
        mark.dataset.munuMark = "";
        range.surroundContents(mark);
        first = first ?? mark;
    }
    return first;
}

function num(value) {
    return typeof value === "bigint" ? Number(value) : value;
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function showDiagnostics(out, pre, diagnostics, assembled) {
    let marked = false;
    for (const d of diagnostics) {
        const start = num(d.start) - assembled.offset;
        const end = num(d.end) - assembled.offset;
        const visible = start >= 0 && end <= assembled.length && end > start;
        const head = el("div", "bad", `${d.phase} error: ${d.kind}${visible ? "" : " (in hidden context)"}`);
        out.append(head, d.rendered ? el("pre", "", d.rendered) : el("div", "", d.message));
        if (visible && !marked) {
            markSpan(pre, start, end);
            marked = true;
        }
    }
}

function showRun(out, pre, result, assembled) {
    // The runtime reports 0 steps when it does not count them, so leave that out.
    const n = num(result.steps ?? 0);
    const ms = `${Math.round(num(result.ms ?? 0))} ms`;
    const steps = n > 0 ? `${plural(n, "step")} \u00B7 ${ms}` : ms;
    if (result.outcome === "halted") {
        const value = result.value === undefined ? "finished, no value" : `${result.value}${result.type ? " : " + result.type : ""}`;
        out.append(el("div", "ok", `Halted: ${value}`), el("div", "dim", `${steps}`));
    } else if (result.outcome === "crashed") {
        const where = result.crash?.func ? ` in ${result.crash.func}` : "";
        out.append(el("div", "bad", `Crashed${where}: ${result.crash?.reason ?? "unknown reason"}`), el("div", "dim", `${steps}`));
    } else if (result.outcome === "compile-error") {
        showDiagnostics(out, pre, result.diagnostics ?? [], assembled);
    } else {
        const why = {
            "fuel-exhausted": "Stopped: it used up its step limit",
            deadlock: "Stopped: nothing left could make progress",
            timeout: "Stopped: it ran past the time limit",
            "internal-error": `The compiler hit an internal error${result.error ? ": " + result.error : ""}`,
        }[result.outcome] ?? `Stopped: ${result.outcome}`;
        out.append(el("div", "bad", why), el("div", "dim", `${steps}`));
    }
    if (result.stdout) {
        out.append(el("pre", "", result.stdout));
    }
}

function showCheck(out, pre, result, assembled, mode) {
    const ms = `${Math.round(num(result.ms ?? 0))} ms`;
    if (result.status === "ok") {
        out.append(el("div", mode === "error" ? "bad" : "ok", `OK \u00B7 checked in ${ms}`));
    } else if (result.status === "typechecked-unverified") {
        out.append(el("div", "ok", `Type-checks \u00B7 checked in ${ms}`),
            el("div", "dim", "Its requires and ensures need the prover, which does not run in the browser."));
    } else if (result.error) {
        out.append(el("div", "bad", result.error));
    } else {
        showDiagnostics(out, pre, result.diagnostics ?? [], assembled);
    }
}

async function onClick(button, pre, out, mode) {
    button.disabled = true;
    clearMarks(pre);
    out.replaceChildren(el("div", "dim", client === null ? "Loading the compiler\u2026" : "Working\u2026"));
    try {
        const munu = await loadClient();
        const assembled = assemble(pre);
        const result = mode === "run"
            ? await munu.run(assembled.src, pre.dataset.munuEntry ?? null, RUN_OPTS)
            : await munu.check(assembled.src);
        out.replaceChildren();
        if (mode === "run") {
            showRun(out, pre, result, assembled);
        } else {
            showCheck(out, pre, result, assembled, mode);
        }
    } catch (error) {
        out.replaceChildren(el("div", "bad", "The in-browser compiler did not load."));
    }
    if (!document.querySelector("[data-munu-status]")?.textContent) {
        button.disabled = false;
    }
}

for (const pre of document.querySelectorAll("pre.xcode[data-munu]")) {
    const mode = pre.dataset.munu;
    const box = pre.closest(".mx");
    if (box === null || BUTTON[mode] === undefined) {
        continue;
    }
    const bar = box.querySelector(".mx-bar");
    const badge = bar.querySelector("[data-munu-badge]");
    if (mode === "run") {
        badge.textContent = "Runs in your browser";
    }
    const button = el("button", "mx-btn", BUTTON[mode]);
    button.type = "button";
    button.setAttribute("aria-label", `${mode === "run" ? "Run" : "Check"} this example in your browser`);
    bar.append(button);
    const out = el("div", "munu-out");
    out.setAttribute("aria-live", "polite");
    pre.after(out);
    button.addEventListener("click", () => onClick(button, pre, out, mode));
}
