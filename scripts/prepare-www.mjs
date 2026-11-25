/**
 * Tazkeer web-asset bundler & minifier.
 *
 * The application is a static (Vanilla JS) PWA that lives in the repository
 * root so it can keep being deployed to GitHub Pages unchanged. Capacitor,
 * however, syncs a single self-contained directory (`www/`) into the native
 * shells.
 *
 * This script copies runtime web assets into `www/` and minifies CSS & JS
 * safely with esbuild (preserving all global function names and inline
 * HTML handlers) without ever touching source files.
 */

import { cp, mkdir, rm, stat, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "www");

const FILES = [
  "index.html",
  "styles.css",
  "quran.css",
  "adhan-native.css",
  "dailyDuas.js",
  "prophets.js",
  "quran.js",
  "script.js",
  "sw.js",
  "manifest.json",
  "privacy-policy.html",
  "version.json",
];

const DIRECTORIES = ["js", "data", "images", "css", "assets"];

const clean = process.argv.includes("--clean");

async function walkFiles(dir) {
  let out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(await walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function minifyBuiltAssets(targetDir) {
  const allFiles = await walkFiles(targetDir);
  let rawBytes = 0;
  let minBytes = 0;
  let count = 0;

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    // Skip already-minified third-party sheets and ES test modules
    if (file.endsWith(".min.css") || file.endsWith(".min.js")) continue;
    if (ext !== ".css" && ext !== ".js") continue;

    const source = await readFile(file, "utf8");
    rawBytes += Buffer.byteLength(source, "utf8");

    try {
      const result =
        ext === ".css"
          ? await transform(source, {
              loader: "css",
              minify: true,
              charset: "utf8",
              legalComments: "none",
            })
          : await transform(source, {
              loader: "js",
              // Safe global-script minification: strips comments & whitespace
              // while keeping all global function names / onclick handlers intact
              // and preserving UTF-8 Arabic strings without \uXXXX bloat
              minifyWhitespace: true,
              minifyIdentifiers: false,
              minifySyntax: false,
              charset: "utf8",
              legalComments: "none",
            });
      await writeFile(file, result.code, "utf8");
      minBytes += Buffer.byteLength(result.code, "utf8");
      count++;
    } catch (err) {
      console.warn(`[prepare-www] Minify skipped for ${path.relative(targetDir, file)}:`, err.message);
      minBytes += Buffer.byteLength(source, "utf8");
    }
  }

  const savedKb = ((rawBytes - minBytes) / 1024).toFixed(1);
  const pct = rawBytes > 0 ? Math.round(((rawBytes - minBytes) / rawBytes) * 100) : 0;
  console.log(
    `[prepare-www] Minified ${count} CSS/JS files: ${(rawBytes / 1024).toFixed(1)} KB -> ${(minBytes / 1024).toFixed(1)} KB (saved ${savedKb} KB / ${pct}%).`
  );
}

async function main() {
  if (clean) {
    await rm(outDir, { recursive: true, force: true });
    console.log("[prepare-www] Removed www/");
    return;
  }

  // Always start from a clean www/ so deleted assets never linger in Capacitor sync
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of FILES) {
    const source = path.join(root, file);
    if (!existsSync(source)) {
      console.warn(`[prepare-www] Missing file, skipped: ${file}`);
      continue;
    }
    await cp(source, path.join(outDir, file));
  }

  for (const dir of DIRECTORIES) {
    const source = path.join(root, dir);
    if (!existsSync(source)) {
      console.warn(`[prepare-www] Missing directory, skipped: ${dir}`);
      continue;
    }
    const info = await stat(source);
    if (!info.isDirectory()) continue;
    await cp(source, path.join(outDir, dir), {
      recursive: true,
      filter: (src) => !src.endsWith("og-image.jpg"),
    });
  }

  await minifyBuiltAssets(outDir);

  const entries = await readdir(outDir);
  console.log(`[prepare-www] www/ ready (${entries.length} top-level entries).`);
}

main().catch((error) => {
  console.error("[prepare-www] Failed:", error);
  process.exitCode = 1;
});
