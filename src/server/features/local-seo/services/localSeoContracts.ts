import { z } from "zod";

export const fiveStarValue = z.number().finite().min(0).max(5).nullable();
export const observedCount = z.number().int().safe().nonnegative().nullable();
export const businessScopeSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  keyword: z.string(),
  locationCode: z.number().int().positive(),
  languageCode: z.string(),
});
export type BusinessScope = z.infer<typeof businessScopeSchema>;

export function reviewTimestamp(
  value: string | undefined | null,
): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T]/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
