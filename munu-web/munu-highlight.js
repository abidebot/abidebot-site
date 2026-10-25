// The page's munu highlighter: the same token classes as the static code on the page.
const KEYWORDS = new Set("mu nu eager lazy let if else pub contract substrate behaviour do must true false and or extern module use match transaction assert retract formula as_of since spawn children ports enum struct const cdf crash bound decreases ends ensures requires query relation type".split(" "));
const PRIMITIVES = new Set("f64 u64 i64 i32 u8 string bool".split(" "));
const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\d+(?:\.\d+)?(?:[ui](?:8|16|32|64)|f64|ms|s)?(?![A-Za-z0-9_]))|([A-Za-z_][A-Za-z0-9_]*)|(=>|->|>=|<=|\.\.|<|>|\||\+|-|~)|(\s+|[\s\S])/g;

function escape(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(src) {
    let out = "";
    for (const m of src.matchAll(TOKEN)) {
        const [, comment, string, number, word, op, other] = m;
        if (comment) {
            out += `<span class="c">${escape(comment)}</span>`;
        } else if (string) {
            out += `<span class="s">${escape(string)}</span>`;
        } else if (number) {
            out += `<span class="n">${number}</span>`;
        } else if (word) {
            if (KEYWORDS.has(word)) {
                out += `<span class="k">${word}</span>`;
            } else if (PRIMITIVES.has(word) || /^[A-Z]/.test(word)) {
                out += `<span class="t">${word}</span>`;
            } else {
                out += word;
            }
        } else if (op) {
            out += `<span class="o">${escape(op)}</span>`;
        } else {
            out += escape(other);
        }
    }
    return out;
}
