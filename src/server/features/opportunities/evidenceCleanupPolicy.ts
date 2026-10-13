export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
// Worst-case legacy cleanup uses 36 D1 statements for five objects, leaving
// room for authentication under the Workers Free 50-query invocation limit.
export const CLEANUP_BATCH_SIZE = 5;
