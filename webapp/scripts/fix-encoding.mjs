// Some Windows editors/tools in this workspace write source files as UTF-16LE,
// which the TypeScript and Vite parsers reject with "Invalid character".
// This rewrites any UTF-16 file under src/ back to UTF-8 without a BOM.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const EXTS = [".ts", ".tsx", ".css", ".json"]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if ([...EXTS, ...EXTRA].some((e) => name.endsWith(e))) yield p
  }
}

const EXTRA = [".mjs"]

let fixed = 0
for (const file of [...walk("src"), ...walk("scripts")]) {
  const buf = readFileSync(file)
  const hasBom = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe
  const looksUtf16 = buf.length > 40 && buf[1] === 0 && buf[3] === 0
  if (!hasBom && !looksUtf16) continue
  let text = buf.toString("utf16le")
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  writeFileSync(file, text, "utf8")
  console.log("fixed encoding:", file)
  fixed++
}
console.log(fixed === 0 ? "encoding ok" : `fixed ${fixed} file(s)`)