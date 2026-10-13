// Selected only by the existing guarded acceptance serve mode. Local R2
// objects cannot be backdated, so age boundaries are tested natively with
// the production policy; this fixture exercises real R2 deletion immediately.
export const ORPHAN_GRACE_MS = 0;
export const CLEANUP_BATCH_SIZE = 5;
