/// <reference types="node" />
// ^ this test reads files from disk, so it needs Node's types (the rest of tests/ runs as browser code).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Design rule: icons come from lucide-react, never emoji. This guards against
// emoji creeping back into the UI source (and index.html).
const EMOJI = /\p{Extended_Pictographic}/u;
const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

describe("no emoji in the UI", () => {
  it("src/ and index.html contain no emoji characters", () => {
    const offenders = [...sourceFiles(join(ROOT, "src")), join(ROOT, "index.html")].flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => EMOJI.test(line))
        .map(({ line, i }) => `${relative(ROOT, file)}:${i + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
