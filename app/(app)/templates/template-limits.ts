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
