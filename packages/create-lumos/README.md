# create-lumos

Scaffolds a new site from [Lumos For Astro](https://github.com/lumosframework/lumos-for-astro).

```sh
npm create lumos@latest my-site
```

Run it without a directory name and it will ask for one.

The new site is a full copy of the framework with its own package name and a
Cloudflare config pointing at itself.

Dependencies are installed with whichever package manager invoked the command —
`npm`, `pnpm`, `yarn` or `bun`. Pass `--no-install` to skip that and set the
project up yourself.

```sh
cd my-site
npm run dev
```

Set your site name and URL in `src/consts.ts`.
