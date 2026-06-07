/**
 * Template field bounds, shared between the server CRUD seam and the client
 * form dialog. Kept in a dependency-free module so client components can
 * import the limits without pulling the server seam graph (drizzle, zod,
 * schema metadata) into the browser bundle.
 */

/** Bounds keep a template body reasonable and bound the AI prompt size. */
export const TEMPLATE_NAME_MAX_LENGTH = 120;
export const TEMPLATE_BODY_MAX_LENGTH = 20_000;
export const TEMPLATE_VARIABLE_MAX_LENGTH = 60;
export const TEMPLATE_MAX_VARIABLES = 50;

/**
 * Max free-text the user may add in the adapt dialog ("instrucciones extra").
 * Bounded so it cannot blow up the AI prompt (or the persisted adaptation row).
 * 2000 chars is generous for a few sentences. Lives here (dependency-free) so
 * the client adapt dialog can import it without pulling the server stream seam
 * graph (zod, drizzle, the AI SDK) into the browser bundle — the same
 * bundle-leak class fixed in F7 PR4b for the template bounds above.
 */
export const EXTRA_INSTRUCTIONS_MAX = 2000;
