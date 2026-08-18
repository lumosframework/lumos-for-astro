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
import { stdin, stdout, argv, exit, cwd, env, platform } from "node:process";
import { spawn } from "node:child_process";

const REPO = "lumosframework/lumos-for-astro";
const BRANCH = "main";
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

// Pinned rather than current-dated: it selects Workers runtime behaviour, and
// should be a date the framework was actually tested against.
const COMPAT_DATE = "2026-08-13";

// Lumi, drawn with half-block characters. The colour version sits on a dark
// card, since the mascot is white with transparent eyes and would vanish on a
// light terminal. Rebuild both with .github/assets/build-ascii.mjs.
const MASCOT = [
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;255;255;255m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;255;255;255m▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀\u001b[38;2;30;30;30m\u001b[48;2;194;245;47m▀\u001b[38;2;194;245;47m\u001b[48;2;194;245;47m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;30;30;30m\u001b[48;2;255;255;255m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;194;245;47m\u001b[48;2;30;30;30m▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;255;255;255m▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀\u001b[38;2;30;30;30m\u001b[48;2;255;255;255m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;30;30;30m▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀\u001b[38;2;255;255;255m\u001b[48;2;255;255;255m▀▀▀▀\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
  "\u001b[38;2;30;30;30m\u001b[48;2;30;30;30m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\u001b[0m",
];

const MASCOT_PLAIN = [
  "            ▄▄████▄",
  "          ▄██████▀▀▀       ▄▄",
  "         █████████     ▀█▄▄█▀",
  "        ▀█████▀▀▀▀     ▄▄█████▀▀",
  "      █▀▀▀▀▀▀▀▀▀███▄▄ ▀▀▀▀█▀█▄",
  "      ▄██████████▄▄▀▀    ██  ▀▀",
  "      ███  ███  ████    ▄█",
  "     ███████████████ ██ ██",
  "   █ ████████████████▀█▄█",
  "  ▄█ ████████████████  ▀▀",
  "  ▀█ ████████████████",
  "     ▀██████████████▀",
  "      ▄▄▄██▀▀▀▀█▄▄▄▄",
  "      ▀███▀    ████",
];

const ESC = "\x1b[";

// Escape codes only mean anything to a terminal, so piped output and NO_COLOR
// get plain text instead.
const styled = stdout.isTTY && !env.NO_COLOR;
const style = (code) => (s) => (styled ? `${ESC}${code}m${s}${ESC}0m` : s);
const dim = style("2");
const bold = style("1");
const green = style("32");
const red = style("31");

const CARD_COLS = 34;

function header() {
  const art = styled ? MASCOT : MASCOT_PLAIN;
  const middle = Math.floor(art.length / 2);
  const labels = [];
  labels[middle - 1] = bold("Lumos For Astro");
  labels[middle + 1] = dim("Components and styling for Astro sites.");

  // Only rows carrying a label are padded, so piped output keeps no trailing
  // blanks. Colour rows are already a full card wide.
  const rows = art.map((line, i) => {
    if (!labels[i]) return line;
    const pad = styled ? "" : " ".repeat(Math.max(0, CARD_COLS - line.length));
    return `${line}${pad}   ${labels[i]}`;
  });
  console.log(`\n${rows.join("\n")}\n`);
}

/**
 * The package manager that invoked this, taken from the user agent npm, pnpm,
 * yarn and bun all set. Installing with the wrong one would leave a lockfile
 * and `node_modules` from a tool the caller isn't using. Names are matched
 * against a fixed list, since the value ends up in a command.
 */
function packageManager() {
  const name = (env.npm_config_user_agent ?? "").split("/")[0];
  return ["npm", "pnpm", "yarn", "bun"].includes(name) ? name : "npm";
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    // On Windows these are .cmd shims, which need a shell to be found.
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: platform === "win32",
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

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
  for (let off = 0; off + 512 <= buf.length;) {
    const header = buf.subarray(off, off + 512);
    if (header[0] === 0) break;

    const field = (start, len) =>
      header
        .subarray(start, start + len)
        .toString("utf8")
        .replace(/\0.*$/, "");
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
    else if (type === "0")
      yield { path, data: buf.subarray(start, start + size) };
  }
}

async function main() {
  header();

  const args = argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const pm = packageManager();

  let target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    const rl = createInterface({ input: stdin, output: stdout });
    target = (await rl.question("Directory name: ")).trim();
    rl.close();
  }
  if (!target) die("A directory name is required.");

  // Installing is what nearly every caller wants, and asking put a keystroke
  // between them and a working site. --no-install covers the rest.
  const install = !flags.includes("--no-install");

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
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");

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

  let installed = false;
  if (install) {
    console.log(dim(`\nInstalling dependencies with ${pm}...\n`));
    installed = await run(pm, ["install"], dir);
    // The site itself is already written, so a failed install is worth
    // reporting without discarding the work.
    if (!installed) {
      console.log(red(`\n${pm} install failed. Try running it yourself.`));
    }
  }

  const steps = [`  ${bold("cd " + target)}`];
  if (!installed) steps.push(`  ${bold(pm + " install")}`);
  steps.push(`  ${bold(pm + " run dev")}`);

  console.log(
    [
      "",
      `${green("Ready.")} Next:`,
      "",
      ...steps,
      "",
      `Set your site name and URL in ${bold("src/consts.ts")}.`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => die(err.message));
