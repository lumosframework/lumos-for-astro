/** Page metadata for `BaseHead` and layouts. */
export interface SeoProps {
  /** Page title. The site name is appended. */
  title?: string;
  /** Page and social description. Defaults to `SITE_DESCRIPTION`. */
  description?: string;
  /** Social image. Defaults to `/og-image.jpg`. */
  image?: string;
  /** Open Graph type. */
  type?: "website" | "article";
  /** Override `NOINDEX_ROUTES` for this page's robots tag. */
  noindex?: boolean;
  /** What kind of page this is, so search engines can describe it correctly. */
  schemaType?:
    /** A standard page. The safe default. */
    | "WebPage"
    /** Tells search engines this page is about your company or team. */
    | "AboutPage"
    /** Tells search engines this is where people contact you. */
    | "ContactPage"
    /** A page that lists things, like a blog index or product category. */
    | "CollectionPage"
    /** A news-style or long-form article. Includes the headline and social image. */
    | "Article"
    /** A blog post. Includes the headline and social image. */
    | "BlogPosting"
    /** A page of questions and answers. Search engines ignore it unless you also pass the questions through `schema`. */
    | "FAQPage";
  /**
   * Advanced override for the extra information search engines read about the
   * page. Leave it out to use the automatic version. An object adds to or
   * replaces parts of it, an array replaces it, and `false` turns it off.
   * Skipped on noindex pages.
   */
  schema?: Record<string, unknown> | Record<string, unknown>[] | false;
}
