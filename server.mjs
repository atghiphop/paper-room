import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);

const publicAssets = new Map([
  ["/index.html", "text/html; charset=utf-8"],
  ["/styles.css", "text/css; charset=utf-8"],
  ["/app.js", "text/javascript; charset=utf-8"],
]);
const localHostPattern = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

const server = createServer(async (request, response) => {
  try {
    if (!localHostPattern.test(request.headers.host || "")) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const contentType = publicAssets.get(safePath);
    if (!contentType) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const filePath = path.join(root, safePath);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Paper Room running at http://127.0.0.1:${server.address().port}`);
});
