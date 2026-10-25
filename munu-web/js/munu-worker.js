// The glue lives next to this directory, in pkg/.
import init, * as munu from "../pkg/munu_web.js";

const ready = init().then(() => munu.init(crypto.getRandomValues(new Uint8Array(32))));

self.onmessage = async ({ data: { id, op, src, entry, opts } }) => {
    await ready;
    try {
        const result = op === "run" ? munu.run(src, entry ?? null, opts ?? {}) : munu[op](src);
        self.postMessage({ id, result });
    } catch (e) {
        // A wasm trap leaves the instance unusable.
        self.postMessage({ id, error: String(e), fatal: true });
        self.close();
    }
};
