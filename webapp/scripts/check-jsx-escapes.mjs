// JSX attribute strings are not JavaScript string literals: React renders
// title="a \u00B7 b" as the seven characters "\u00B7", not as a middle dot.
// The UTF-16 repair pass writes escapes, so this catches the ones that landed
// in an attribute where they will be shown to the user verbatim.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (name.endsWith(".tsx")) yield p
  }
}

const ATTR_WITH_ESCAPE = /[a-zA-Z-]+\s*=\s*"[^"]*\\u[0-9A-Fa-f]{4}[^"]*"/g

const offences = []
for (const file of walk("src")) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const m of line.matchAll(ATTR_WITH_ESCAPE)) {
      offences.push(`${file}:${i + 1}  ${m[0].trim()}`)
    }
  })
}

if (offences.length > 0) {
  console.error(
    `\nEscape sequence inside a JSX attribute (renders literally). Use plain text, or move the string into braces:\n`,
  )
  for (const o of offences) console.error(`  ${o}`)
  console.error("")
  process.exit(1)
}
console.log("jsx attribute escapes ok")
