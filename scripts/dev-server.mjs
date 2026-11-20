/**
 * Lightweight zero-dependency static server for local development & preview.
 * Serves the Tazkeer web app on 0.0.0.0:3000 (or process.env.PORT).
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;

const BLOCKED_SEGMENTS = new Set([".git", "node_modules", "android", "scripts", "tests"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveRequestPath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const normalized = path.posix.normalize(pathname).replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === ".." || BLOCKED_SEGMENTS.has(seg))) {
    return null;
  }

  const fullPath = path.resolve(root, normalized);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    return null;
  }

  return fullPath;
}

async function serveFile(res, filePath, isHead) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const info = await stat(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": info.size,
    "Cache-Control": "no-cache",
  });

  if (isHead) {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const resolved = resolveRequestPath(req.url || "/");
  if (!resolved) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(resolved);
    if (info.isDirectory()) {
      await serveFile(res, path.join(resolved, "index.html"), method === "HEAD");
      return;
    }
    await serveFile(res, resolved, method === "HEAD");
  } catch {
    const hasExtension = path.extname(resolved) !== "";
    if (!hasExtension) {
      try {
        await serveFile(res, path.join(root, "index.html"), method === "HEAD");
        return;
      } catch {
        // fall through to 404
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[tazkeer] Dev server listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
