import { z } from "zod";

// Calendar-date string ("YYYY-MM-DD"). The regex pins the shape; the refine
// rejects impossible dates like 2026-02-31 (Date.UTC would silently roll them
// over into March).
const eventDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Not a real calendar date");

const eventTitleField = z.string().trim().min(1, "Title is required").max(120);

const eventNoteField = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => value || undefined)
  .optional();

export const listProjectEventsSchema = z.object({
  projectId: z.string().min(1),
});

export const createProjectEventSchema = z.object({
  projectId: z.string().min(1),
  eventDate: eventDateField,
  title: eventTitleField,
  note: eventNoteField,
});

export const deleteProjectEventSchema = z.object({
  projectId: z.string().min(1),
  eventId: z.string().min(1),
});
