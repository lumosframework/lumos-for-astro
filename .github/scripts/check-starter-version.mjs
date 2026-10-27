// Exercise the real installer and production build against the current template,
// without depending on GitHub or accidentally testing the already-published main.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const expected = `v${manifest.version}`;
const temporary = await mkdtemp(join(tmpdir(), "lumos-starter-version-"));
const template = join(temporary, "template");
const archive = join(temporary, "template.tar.gz");
const hook = join(temporary, "fetch-template.mjs");
const commit = "1".repeat(40);

function run(command, args, cwd, env = process.env) {
  try {
    return execFileSync(command, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    throw error;
  }
}

async function buildAndCheck(project, description) {
  run(
    process.execPath,
    [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
    project,
  );
  const html = await readFile(join(project, "dist/index.html"), "utf8");
  const labels = [...html.matchAll(/>\s*(v\d+\.\d+\.\d+)\s*</g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    labels,
    [expected],
    `${description}: incorrect release badge`,
  );
  console.log(`PASS: ${description} displays ${expected}`);
}

try {
  await mkdir(template);
  // Only the site inputs are needed; repository automation is not scaffolded.
  for (const path of [
    "src",
    "public",
    "package.json",
    "astro.config.mjs",
    "tsconfig.json",
  ]) {
    await cp(join(root, path), join(template, path), { recursive: true });
  }
  run("tar", ["-czf", archive, "-C", temporary, "template"], root);
  await writeFile(
    hook,
    `import { readFile } from "node:fs/promises";
const archive = await readFile(process.env.LUMOS_TEST_ARCHIVE);
globalThis.fetch = async (url) => {
  if (url === "https://api.github.com/repos/lumosframework/lumos-for-astro/commits/main") {
    return process.env.LUMOS_TEST_METADATA === "available"
      ? Response.json({ sha: ${JSON.stringify(commit)} })
      : new Response("API unavailable", { status: 503 });
  }
  if (url === "https://codeload.github.com/lumosframework/lumos-for-astro/tar.gz/${commit}"
      || url === "https://codeload.github.com/lumosframework/lumos-for-astro/tar.gz/refs/heads/main") {
    return new Response(archive);
  }
  throw new Error("Unexpected installer request: " + url);
};
`,
  );

  for (const metadata of ["available", "unavailable"]) {
    const project = join(temporary, `site-${metadata}`);
    run(
      process.execPath,
      [
        "--import",
        pathToFileURL(hook).href,
        join(root, "packages/create-lumos/bin/create-lumos.js"),
        project,
        "--no-install",
      ],
      root,
      {
        ...process.env,
        LUMOS_TEST_ARCHIVE: archive,
        LUMOS_TEST_METADATA: metadata,
      },
    );
    const packagePath = join(project, "package.json");
    const generated = JSON.parse(await readFile(packagePath, "utf8"));
    assert.equal(generated.version, "0.0.1");
    assert.equal(
      generated.lumos?.version,
      metadata === "available" ? manifest.version : undefined,
    );
    await symlink(
      join(root, "node_modules"),
      join(project, "node_modules"),
      "junction",
    );
    await buildAndCheck(project, `new site with metadata ${metadata}`);

    if (metadata === "available") {
      generated.version = "9.8.7";
      await writeFile(packagePath, JSON.stringify(generated, null, 2) + "\n");
      await buildAndCheck(project, "site with a changed project version");
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
