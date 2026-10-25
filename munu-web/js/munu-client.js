// Main-thread client. The first call creates the Worker. Import does not.

const DEFAULT_TIME_MS = 2000;
const TIMER_MARGIN_MS = 1000;
const LOAD_FAILURE_TEXT = "The in-browser compiler did not load.";

let worker = null;
let loadFailed = false;
let nextId = 1;
let pending = null;
let chain = Promise.resolve();

function workerUrl() {
    return new URL("./munu-worker.js", import.meta.url);
}

function makeWorker() {
    const next = new Worker(workerUrl(), { type: "module" });
    next.addEventListener("message", onMessage);
    next.addEventListener("error", onWorkerError);
    return next;
}

function ensureWorker() {
    if (worker === null) {
        worker = makeWorker();
    }
    return worker;
}

function replaceWorker() {
    if (worker !== null) {
        worker.terminate();
        worker = null;
    }
    worker = makeWorker();
}

function showLoadFailure() {
    if (typeof document === "undefined") {
        return;
    }
    const root = document.querySelector("[data-munu-root]") ?? document;
    for (const button of root.querySelectorAll("button")) {
        button.disabled = true;
    }
    const slot = document.querySelector("[data-munu-status]");
    if (slot !== null) {
        slot.textContent = LOAD_FAILURE_TEXT;
        return;
    }
    const note = document.createElement("p");
    note.textContent = LOAD_FAILURE_TEXT;
    document.body.append(note);
}

function settle(id) {
    if (pending === null || pending.id !== id) {
        return null;
    }
    clearTimeout(pending.timer);
    const resolve = pending.resolve;
    pending = null;
    return resolve;
}

function onMessage(event) {
    const data = event.data;
    const resolve = settle(data.id);
    if (resolve === null) {
        return;
    }
    if (data.fatal) {
        replaceWorker();
        resolve({
            outcome: "internal-error",
            error: data.error,
            stdout: "",
            steps: 0,
            diagnostics: [],
            ms: 0,
        });
        return;
    }
    resolve(data.result);
}

function onWorkerError() {
    loadFailed = true;
    const resolve = pending === null ? null : settle(pending.id);
    if (worker !== null) {
        worker.terminate();
        worker = null;
    }
    showLoadFailure();
    if (resolve !== null) {
        resolve({
            outcome: "internal-error",
            error: LOAD_FAILURE_TEXT,
            stdout: "",
            steps: 0,
            diagnostics: [],
            ms: 0,
        });
    }
}

function dispatch(op, src, entry, opts) {
    if (loadFailed) {
        showLoadFailure();
        return Promise.resolve({
            outcome: "internal-error",
            error: LOAD_FAILURE_TEXT,
            stdout: "",
            steps: 0,
            diagnostics: [],
            ms: 0,
        });
    }
    ensureWorker();
    const id = nextId;
    nextId += 1;
    const timeMs = opts !== null && opts !== undefined && typeof opts.timeMs === "number" ? opts.timeMs : DEFAULT_TIME_MS;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (pending === null || pending.id !== id) {
                return;
            }
            pending = null;
            replaceWorker();
            resolve({ outcome: "timeout", stdout: "", steps: 0, diagnostics: [], ms: timeMs });
        }, timeMs + TIMER_MARGIN_MS);
        pending = { id, timer, resolve };
        worker.postMessage({ id, op, src, entry: entry ?? null, opts: opts ?? {} });
    });
}

export function call(op, src, entry, opts) {
    const job = chain.then(() => dispatch(op, src, entry, opts));
    chain = job.then(() => {}, () => {});
    return job;
}

export function check(src) {
    return call("check", src, null, null);
}

export function compile(src) {
    return call("compile", src, null, null);
}

export function run(src, entry, opts) {
    return call("run", src, entry, opts);
}
