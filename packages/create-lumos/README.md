# create-lumos

Scaffolds a new site from [Lumos For Astro](https://github.com/lumosframework/lumos-for-astro).

```sh
npm create lumos@latest my-site
```

Run it without a directory name and it will ask for one.

The new site is a full copy of the framework with its own package name and a
Cloudflare config pointing at itself.

You are asked whether to install dependencies, using whichever package manager
invoked the command — `npm`, `pnpm`, `yarn` or `bun`. Pass `--install` or
`--no-install` to answer up front, which is also what non-interactive runs need,
since those skip the install unless told otherwise.

```sh
cd my-site
npm run dev
```

Set your site name and URL in `src/consts.ts`.
