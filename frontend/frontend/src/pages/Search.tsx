/**
 * Canonical Search uses the legacy app page.
 * This indirection ensures both /search and /app/search share one implementation.
 */
export { default } from "./app/Search";
