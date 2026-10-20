import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";

const managed = ["astro", "@astrojs/check", "@astrojs/sitemap"];
const manifestPath = new URL("../../package.json", import.meta.url);
const lockPath = new URL("../../package-lock.json", import.meta.url);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const manifest = await readJson(manifestPath);
const lockBefore = await readJson(lockPath);

const lockedVersion = (lock, name) =>
  lock.packages?.[`node_modules/${name}`]?.version;
const before = Object.fromEntries(
  managed.map((name) => [name, lockedVersion(lockBefore, name)]),
);

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", ...managed.map((name) => `${name}@latest`), "--save"],
  { cwd: new URL("../../", import.meta.url), stdio: "inherit" },
);

const astroPackage = await readJson(
  new URL("../../node_modules/astro/package.json", import.meta.url),
);
const requiredNode = /^>=(\d+\.\d+\.\d+)$/.exec(
  astroPackage.engines?.node,
)?.[1];
if (!requiredNode) {
  throw new Error(
    `Astro declared an unsupported Node range: ${astroPackage.engines?.node ?? "none"}`,
  );
}

const updatedManifest = await readJson(manifestPath);
updatedManifest.engines = {
  ...updatedManifest.engines,
  node: `>=${requiredNode}`,
};
await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "--package-lock-only"],
  { cwd: new URL("../../", import.meta.url), stdio: "inherit" },
);

const lockAfter = await readJson(lockPath);
const after = Object.fromEntries(
  managed.map((name) => [name, lockedVersion(lockAfter, name)]),
);

const changes = managed.filter((name) => before[name] !== after[name]);
const parse = (version) => version.split(".").map(Number);
const needsReview = changes.some((name) => {
  const [oldMajor, oldMinor] = parse(before[name]);
  const [newMajor, newMinor] = parse(after[name]);
  return newMajor !== oldMajor || (oldMajor === 0 && newMinor !== oldMinor);
});
const summary = changes.length
  ? changes
      .map((name) => `${name} ${before[name]} -> ${after[name]}`)
      .join(", ")
  : "No dependency updates";

const outputs = {
  changed: String(
    changes.length > 0 || manifest.engines?.node !== `>=${requiredNode}`,
  ),
  review_required: String(needsReview),
  astro_version: after.astro,
  node_version: requiredNode,
  summary,
};

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
}

console.log(summary);
console.log(`Node >=${requiredNode}`);
