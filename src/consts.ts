import pkg from "../package.json";

const manifest = pkg as { version: string; lumos?: { version: string } };

/**
 * The framework release. `package.json` is the only place it is written, and
 * anything showing a version to a person reads it from here — so a release
 * bumps one file.
 *
 * Which field depends on where this is running. In the framework itself the
 * package *is* Lumos, so `version` is the answer. In a site built from it,
 * `version` is the site's own and `create-lumos` records the release it came
 * from under `lumos`. A site scaffolded before stamping has neither, and falls
 * back to the `0.0.1` that `create-lumos` writes — which is also the baseline
 * `/lumos-upgrade-version` assumes for exactly those sites.
 */
export const LUMOS_VERSION = manifest.lumos?.version ?? manifest.version;

/** Site name. Appended to every page title and used as `og:site_name`. */
export const SITE_NAME = "Lumos Framework";
/** Fallback meta description for pages that don't set their own. */
export const SITE_DESCRIPTION =
  "Lumos is a cutting-edge framework for building Astro sites. It's designed with efficiency, scaleability, and accessibility at its core.";
/** Canonical origin. Resolves canonical URLs, social images, and the sitemap. */
export const SITE_URL = "https://preview.lumosframework.com";
/** BCP 47 locale tag used to format dates and numbers. */
export const SITE_LOCALE = "en-US";
/**
 * Routes kept out of search results. Each is excluded from the sitemap and
 * served with a `robots: noindex, nofollow` tag, so the two can't disagree.
 *
 * Surrounding slashes are optional: `"/thanks"`, `"thanks"` and `"/thanks/"`
 * all match the same route.
 */
export const NOINDEX_ROUTES: string[] = ["/404"];
