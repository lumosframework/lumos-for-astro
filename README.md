<p align="center">
  <img src=".github/assets/banner.png" alt="Lumos For Astro" width="720">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-lumos"><img alt="npm version" src="https://img.shields.io/npm/v/create-lumos?labelColor=1E1E1E&color=C6FB50"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/npm/l/create-lumos?labelColor=1E1E1E&color=C6FB50"></a>
  <a href="https://github.com/lumosframework/lumos-for-astro/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/lumosframework/lumos-for-astro/actions/workflows/ci.yml/badge.svg"></a>
</p>

A component and styling framework for building Astro sites, designed around
efficiency, scalability and accessibility.

Documentation lives at **[lumosframework.com](https://lumosframework.com)**.

> **Beta.** The component API is still settling, so expect prop names to move
> before `v0.1.0`. The badge above carries the current release.

## Getting started

```sh
npm create lumos@latest my-site
```

That scaffolds a new site from this repository and installs its dependencies
with whichever package manager you ran it with. Then:

```sh
cd my-site
npm run dev
```

| Script            | What it does                      |
| ----------------- | --------------------------------- |
| `npm run dev`     | Starts the dev server             |
| `npm run build`   | Builds the site to `dist/`        |
| `npm run preview` | Serves the built site             |
| `npm run check`   | Type-checks every `.astro` file   |
| `npm run format`  | Formats the project with Prettier |

Node 22.12 or newer is required.

## Documentation

Component reference, styling guides and examples are at
[lumosframework.com](https://lumosframework.com).

## Contributing

Read
[CONTRIBUTING.md](https://github.com/lumosframework/lumos-for-astro/blob/main/CONTRIBUTING.md)
first — a pull request needs the
[CLA](https://github.com/lumosframework/lumos-for-astro/blob/main/CLA.md)
signed before it can be merged.

## License

[MIT](LICENSE)
