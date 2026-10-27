// munu examples on the page: each run, check or error block can be edited in place
// and has a Run or Check button. Nothing is downloaded until the first click: the
// click imports the client, which starts a Worker that loads the compiler.

import { highlight } from "./munu-highlight.js";

const BUTTON = { run: "\u25B6 Run", check: "\u2713 Check", error: "\u2713 Check" };
const RUN_OPTS = { timeMs: 2000 };
const SHOWN_VALUES = 16;
const INDENT = "    ";
let client = null;
// The code each block had when the page loaded. Preludes always use this text.
const original = new Map();

function loadClient() {
    if (client === null) {
        client = import("./js/munu-client.js");
    }
    return client;
}

function exampleText(id) {
    if (original.has(id)) {
        return original.get(id);
    }
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
// The code is the block's current text, edited or not.
function assemble(pre, code) {
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
    } else if (result.outcome === "fuel-exhausted" && result.bounded && result.output?.values?.length) {
        // A stream that never ends: show the readings up to the limit, not a failure.
        const shown = result.output.values.slice(0, SHOWN_VALUES);
        const more = result.output.values.length > shown.length || result.output.truncated ? ", \u2026" : "";
        const type = result.type ? ` : ${result.type}` : "";
        out.append(el("div", "ok", `${plural(result.output.values.length, "value")} before the limit: [${shown.join(", ")}${more}]${type}`),
            el("div", "dim", `Stopped at its step limit, because the stream does not end. ${steps}`));
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
        out.append(el("div", "ok", `OK \u00B7 checked in ${ms}`));
    } else if (result.status === "typechecked-unverified") {
        out.append(el("div", "ok", `Type-checks \u00B7 checked in ${ms}`),
            el("div", "dim", "Its requires and ensures need the prover, which does not run in the browser."));
    } else if (result.error) {
        out.append(el("div", "bad", result.error));
    } else {
        showDiagnostics(out, pre, result.diagnostics ?? [], assembled);
    }
}

async function onClick(button, pre, out, mode, editor) {
    button.disabled = true;
    clearMarks(pre);
    out.replaceChildren(el("div", "dim", client === null ? "Loading the compiler\u2026" : "Working\u2026"));
    try {
        const munu = await loadClient();
        const assembled = assemble(pre, editor.value);
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

// Insert text at the selection, keeping the browser's undo history where it can.
function insertText(area, text) {
    area.focus();
    if (!document.execCommand("insertText", false, text)) {
        area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
        area.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

// A transparent textarea over the highlighted <pre>. The <pre> keeps its original
// markup until the first edit, so an untouched block looks exactly as it did.
function makeEditor(pre, onEdit) {
    const code = pre.querySelector("code");
    const startHtml = code.innerHTML;
    const startText = code.textContent;
    const stack = el("div", "mx-ed");
    pre.before(stack);
    stack.append(pre);
    pre.removeAttribute("tabindex");
    const area = document.createElement("textarea");
    area.className = "mx-ta";
    area.value = startText;
    area.spellcheck = false;
    area.wrap = "off";
    for (const [k, v] of [["autocapitalize", "off"], ["autocomplete", "off"], ["autocorrect", "off"], ["aria-label", "Example code, editable"]]) {
        area.setAttribute(k, v);
    }
    stack.append(area);

    let escaped = false;
    const render = () => {
        // A <pre> drops a final empty line, so give it one more character to keep heights equal.
        const text = area.value;
        code.innerHTML = highlight(text) + (text.endsWith("\n") ? " " : "");
        pre.scrollLeft = area.scrollLeft;
        onEdit(text !== startText);
    };
    area.addEventListener("input", render);
    area.addEventListener("scroll", () => {
        pre.scrollLeft = area.scrollLeft;
    });
    area.addEventListener("keydown", (event) => {
        if (event.isComposing) {
            return;
        }
        if (event.key === "Escape") {
            escaped = true;
            return;
        }
        if (event.key === "Tab" && !escaped && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            const lineStart = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;
            const column = area.selectionStart - lineStart;
            insertText(area, " ".repeat(INDENT.length - (column % INDENT.length)));
            return;
        }
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            const lineStart = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;
            const indent = /^[ \t]*/.exec(area.value.slice(lineStart, area.selectionStart))[0];
            insertText(area, "\n" + indent);
            return;
        }
        escaped = false;
    });
    area.addEventListener("blur", () => {
        escaped = false;
    });
    return {
        get value() {
            return area.value;
        },
        reset() {
            area.value = startText;
            code.innerHTML = startHtml;
            area.scrollLeft = 0;
            pre.scrollLeft = 0;
            onEdit(false);
        },
    };
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
    original.set(pre.dataset.munuId, pre.querySelector("code").textContent);
    const reset = el("button", "mx-btn mx-reset", "Reset");
    reset.type = "button";
    reset.hidden = true;
    reset.setAttribute("aria-label", "Put back the original code");
    const button = el("button", "mx-btn", BUTTON[mode]);
    button.type = "button";
    button.setAttribute("aria-label", `${mode === "run" ? "Run" : "Check"} this example in your browser`);
    bar.append(reset, button);
    const out = el("div", "munu-out");
    out.setAttribute("aria-live", "polite");
    const editor = makeEditor(pre, (edited) => {
        reset.hidden = !edited;
        box.classList.toggle("mx-edited", edited);
    });
    pre.parentElement.after(out);
    button.addEventListener("click", () => onClick(button, pre, out, mode, editor));
    reset.addEventListener("click", () => {
        editor.reset();
        out.replaceChildren();
    });
}
