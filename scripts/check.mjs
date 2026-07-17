import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";

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

const jsFiles = (await walk(resolve("functions"))).filter((f) => extname(f) === ".js");
for (const file of jsFiles) {
  const source = await readFile(file, "utf8");
  if (!source.trim()) throw new Error(`Empty JavaScript file: ${file}`);
}
console.log(`Checked ${jsFiles.length} Pages Function modules.`);
