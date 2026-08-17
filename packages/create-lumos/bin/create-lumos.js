#!/usr/bin/env node
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
  copyFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve, basename, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit, cwd } from "node:process";

const REPO = "lumosframework/lumos-for-astro";
const BRANCH = "main";
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

// Pinned rather than current-dated: it selects Workers runtime behaviour, and
// should be a date the framework was actually tested against.
const COMPAT_DATE = "2026-08-13";

const ESC = "\x1b[";
const dim = (s) => `${ESC}2m${s}${ESC}0m`;
const bold = (s) => `${ESC}1m${s}${ESC}0m`;
const green = (s) => `${ESC}32m${s}${ESC}0m`;
const red = (s) => `${ESC}31m${s}${ESC}0m`;

function die(message) {
  console.error(`\n${red("Error:")} ${message}\n`);
  exit(1);
}

/**
 * Walk a tar archive, yielding one entry per stored file.
 *
 * GitHub prefixes every path with `<repo>-<ref>/`, which is stripped so the
 * archive unpacks into the target directory rather than a nested one. Global
 * and extended headers carry metadata rather than content, so they are skipped.
 */
function* readTar(buf) {
  for (let off = 0; off + 512 <= buf.length; ) {
    const header = buf.subarray(off, off + 512);
    if (header[0] === 0) break;

    const field = (start, len) =>
      header.subarray(start, start + len).toString("utf8").replace(/\0.*$/, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const flag = header[156];
    const type = flag === 0 ? "0" : String.fromCharCode(flag);
    const prefix = field(345, 155);
    const name = (prefix ? `${prefix}/` : "") + field(0, 100);

    const start = off + 512;
    off = start + Math.ceil(size / 512) * 512;

    if (type === "g" || type === "x") continue;
    const path = name.split("/").slice(1).join("/");
    if (!path) continue;

    if (type === "5") yield { path, directory: true };
    else if (type === "2") yield { path, link: field(157, 100) };
    else if (type === "0") yield { path, data: buf.subarray(start, start + size) };
  }
}

async function main() {
  console.log(`\n${bold("Lumos For Astro")}\n`);

  let target = argv[2];
  if (!target) {
    const rl = createInterface({ input: stdin, output: stdout });
    target = (await rl.question("Directory name: ")).trim();
    rl.close();
  }
  if (!target) die("A directory name is required.");

  const dir = resolve(cwd(), target);
  if (existsSync(dir) && (await readdir(dir)).length > 0) {
    die(`${target} already exists and is not empty.`);
  }

  stdout.write(dim("Downloading template... "));
  const res = await fetch(TARBALL);
  if (!res.ok) die(`Could not download the template (HTTP ${res.status}).`);
  const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
  console.log(green("done"));

  stdout.write(dim("Writing files... "));
  let count = 0;
  for (const entry of readTar(tar)) {
    const dest = join(dir, entry.path);
    // An archive entry should never be able to write outside the target.
    if (dest !== dir && !dest.startsWith(dir + sep)) {
      die(`The template contains an unsafe path: ${entry.path}`);
    }
    if (entry.directory) {
      await mkdir(dest, { recursive: true });
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });

    if (entry.link) {
      // Windows refuses symlinks without elevation, so fall back to a copy of
      // whatever the link pointed at.
      await symlink(entry.link, dest).catch(() =>
        copyFile(resolve(dirname(dest), entry.link), dest),
      );
    } else {
      await writeFile(dest, entry.data);
    }
    count++;
  }
  if (count === 0) die("The template archive was empty.");
  console.log(green(`${count} files`));

  // The template ships under its own identity; the new site takes the folder name.
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");

  const manifest = join(dir, "package.json");
  if (existsSync(manifest)) {
    const pkg = JSON.parse(await readFile(manifest, "utf8"));
    pkg.name = name;
    pkg.version = "0.0.1";
    delete pkg.homepage;
    delete pkg.repository;
    delete pkg.bugs;
    await writeFile(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  // The framework's own Cloudflare config is withheld from the archive, since
  // it names a Worker and claims a domain that belong to this repository. A
  // generic one takes its place, deploying to a workers.dev subdomain.
  await writeFile(
    join(dir, "wrangler.jsonc"),
    `{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "${name}",
  "compatibility_date": "${COMPAT_DATE}",

  // The built site. There is no \`main\`, so this deploys as an assets-only
  // Worker: Cloudflare serves the files and no script runs per request.
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
  },

  // Add a \`routes\` entry to serve this on your own domain. Until then it is
  // reachable at https://${name}.<your-subdomain>.workers.dev.

  "observability": {
    "enabled": true,
  },
}
`,
  );

  console.log(
    [
      "",
      `${green("Ready.")} Next:`,
      "",
      `  ${bold("cd " + target)}`,
      `  ${bold("npm install")}`,
      `  ${bold("npm run dev")}`,
      "",
      `Set your site name and URL in ${bold("src/consts.ts")}.`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => die(err.message));
