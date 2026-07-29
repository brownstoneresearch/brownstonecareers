import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";
import { spawnSync } from "node:child_process";

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const roots = ["functions", "emails", "scripts", "public/onboarding_portal", "public/workforce_admin"];
const jsFiles = [];
for (const root of roots) {
  const files = await walk(resolve(root));
  jsFiles.push(...files.filter((file) => [".js", ".cjs", ".mjs"].includes(extname(file))));
}

const errors = [];
for (const file of jsFiles) {
  const source = await readFile(file, "utf8");
  if (!source.trim()) {
    errors.push(`Empty JavaScript file: ${relative(process.cwd(), file)}`);
    continue;
  }
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`${relative(process.cwd(), file)}: ${result.stderr || result.stdout}`.trim());
  }
}

if (errors.length) {
  console.error("JavaScript validation failed:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Syntax-checked ${jsFiles.length} JavaScript modules across Pages Functions, portal, admin, email, and build scripts.`);
