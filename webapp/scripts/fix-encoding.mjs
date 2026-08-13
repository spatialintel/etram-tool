// Some Windows editors/tools in this workspace write source files as UTF-16LE,
// which the TypeScript and Vite parsers reject with "Invalid character".
// This rewrites any UTF-16 file under src/, scripts/, or the repo's docs/ back
// to UTF-8. docs/ is an established UTF-8-with-BOM subtree — .md output keeps
// a BOM to match; every other extension stays BOM-less, matching webapp/src's
// existing convention.
//
// Paths are anchored to this script's location (webapp/scripts/), so it works
// from any CWD — including the C:\temp\etram-webapp mirror, which has no docs/.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEBAPP = join(HERE, "..")
const ROOT = join(WEBAPP, "..")

const EXTS = [".ts", ".tsx", ".css", ".json"]
const EXTRA = [".mjs"]
const DOCS_EXTS = [".md"]

function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p, exts)
    else if (exts.some((e) => name.endsWith(e))) yield p
  }
}

let fixed = 0
const targets = [
  ...walk(join(WEBAPP, "src"), [...EXTS, ...EXTRA]),
  ...walk(join(WEBAPP, "scripts"), [...EXTS, ...EXTRA]),
  ...(existsSync(join(ROOT, "docs")) ? walk(join(ROOT, "docs"), DOCS_EXTS) : []),
]
for (const file of targets) {
  const buf = readFileSync(file)
  const hasBom = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe
  const looksUtf16 = buf.length > 40 && buf[1] === 0 && buf[3] === 0
  if (!hasBom && !looksUtf16) continue
  let text = buf.toString("utf16le")
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const keepBom = file.endsWith(".md")
  writeFileSync(file, (keepBom ? "\uFEFF" : "") + text, "utf8")
  console.log("fixed encoding:", file)
  fixed++
}
console.log(fixed === 0 ? "encoding ok" : `fixed ${fixed} file(s)`)