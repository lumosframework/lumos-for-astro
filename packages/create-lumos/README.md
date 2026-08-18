<p align="center">
  <img src="https://raw.githubusercontent.com/lumosframework/lumos-for-astro/main/.github/assets/banner.png" alt="Lumos For Astro" width="720">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-lumos"><img alt="npm version" src="https://img.shields.io/npm/v/create-lumos?labelColor=1E1E1E&color=C6FB50"></a>
  <a href="https://github.com/lumosframework/lumos-for-astro/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/create-lumos?labelColor=1E1E1E&color=C6FB50"></a>
  <img alt="node" src="https://img.shields.io/node/v/create-lumos?labelColor=1E1E1E&color=C6FB50">
</p>

## Quick start

```sh
npm create lumos@latest my-site
```

```sh
cd my-site
npm run dev
```

That is the whole setup. The command copies the framework into `my-site`, names
the project after the folder, and installs dependencies with whichever package
manager you ran it with — `npm`, `pnpm`, `yarn` or `bun`.

Run it without a directory name and it asks for one. Pass `--no-install` to skip
the install and set the project up yourself.

## What you get

An [Astro](https://astro.build) site with a component library and a styling
system already in place:

- **Layout** — `Section`, `ContentWrapper`, `Grid`, `ButtonWrapper`
- **Content** — `Heading`, `Paragraph`, `RichText`, `Eyebrow`, `Card`, `Button`
- **Media** — `Img`, `Video`, `Icon`, `Overlay`
- **Chrome** — `Nav`, `Footer`, `SkipLink`, `BaseHead`, `FormattedDate`

Styles are organised into four cascade layers, so components override shared
patterns and utilities override components without specificity fights. Four
themes — light, dark, brand and invert — redeclare the same custom properties,
so anything nested inside one picks up the right colors on its own.

Every component takes a `render` prop, and components that would render nothing
skip themselves. Set your site name and URL in `src/consts.ts`.

## Documentation

[lumosframework.com](https://lumosframework.com)

Source and issues live in the
[repository](https://github.com/lumosframework/lumos-for-astro).

## License

[MIT](https://github.com/lumosframework/lumos-for-astro/blob/main/LICENSE)
