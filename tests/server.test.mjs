import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("the local server exposes only game assets", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "paper-room-test-"));
  const root = path.join(temp, "paper-room");
  const sibling = path.join(temp, "paper-room-backup");
  await mkdir(root);
  await mkdir(sibling);
  await mkdir(path.join(root, ".git"));
  for (const file of ["server.mjs", "index.html", "app.js", "styles.css"]) {
    await copyFile(path.join(projectRoot, file), path.join(root, file));
  }
  await writeFile(path.join(root, ".env"), "PRIVATE_FIXTURE");
  await writeFile(path.join(root, ".git", "config"), "PRIVATE_FIXTURE");
  await writeFile(path.join(sibling, "private.txt"), "PRIVATE_FIXTURE");

  const server = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    await rm(temp, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 5000);
    const fail = (error) => { clearTimeout(timer); reject(error); };
    server.once("error", fail);
    server.once("exit", (code) => fail(new Error(`Server exited: ${code}`)));
    server.stdout.on("data", (data) => {
      const match = data.toString().match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });

  const get = (pathname, options = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: pathname, ...options }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });

  await t.test("serves the page, stylesheet, and game script", async () => {
    for (const asset of ["/", "/index.html", "/styles.css", "/app.js?version=1"]) {
      const response = await get(asset);
      assert.equal(response.status, 200, asset);
      assert.ok(response.body.length > 0, asset);
      assert.equal(response.headers["x-content-type-options"], "nosniff");
    }
    assert.equal((await get("/app.js", { method: "HEAD" })).body, "");
  });

  await t.test("rejects dotfiles, source files, and traversal", async () => {
    for (const pathname of [
      "/.env", "/.git/config", "/%2eenv", "/server.mjs", "/package.json",
      "/..%2fpaper-room-backup%2fprivate.txt", "/%2e%2e%2fpaper-room-backup/private.txt",
      "/../paper-room-backup/private.txt", "/%zz",
    ]) {
      const response = await get(pathname);
      assert.equal(response.status, 404, pathname);
      assert.ok(!response.body.includes("PRIVATE_FIXTURE"), pathname);
    }
  });

  await t.test("rejects nonlocal Host headers", async () => {
    for (const host of ["untrusted.example", "untrusted.example@127.0.0.1", "127.0.0.1/untrusted"]) {
      assert.equal((await get("/", { headers: { Host: host } })).status, 403);
    }
  });

  await t.test("rejects writes", async () => {
    assert.equal((await get("/app.js", { method: "POST" })).status, 405);
  });

  await t.test("does not follow a public asset symlink", async () => {
    await rm(path.join(root, "app.js"));
    await symlink(path.join(sibling, "private.txt"), path.join(root, "app.js"));
    assert.equal((await get("/app.js")).status, 404);
  });
});
