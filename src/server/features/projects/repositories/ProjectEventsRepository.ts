import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectEvents } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

type ProjectEventRecord = typeof projectEvents.$inferSelect;

// Hard ceiling so a runaway integration (e.g. an agent scripting the MCP) can't
// grow an unbounded journal payload; the UI treats the list as complete.
const MAX_EVENTS_PER_PROJECT = 500;

async function listEvents(projectId: string): Promise<ProjectEventRecord[]> {
  return db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(desc(projectEvents.eventDate), desc(projectEvents.createdAt))
    .limit(MAX_EVENTS_PER_PROJECT);
}

async function countEvents(projectId: string): Promise<number> {
  const rows = await db
    .select({ id: projectEvents.id })
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .limit(MAX_EVENTS_PER_PROJECT);
  return rows.length;
}

async function createEvent(
  projectId: string,
  input: { eventDate: string; title: string; note?: string },
): Promise<ProjectEventRecord> {
  if ((await countEvents(projectId)) >= MAX_EVENTS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `A project can hold at most ${MAX_EVENTS_PER_PROJECT} events. Delete old ones first.`,
    );
  }
  const [row] = await db
    .insert(projectEvents)
    .values({
      id: crypto.randomUUID(),
      projectId,
      eventDate: input.eventDate,
      title: input.title,
      note: input.note ?? null,
    })
    .returning();
  return row;
}

async function deleteEvent(projectId: string, eventId: string): Promise<void> {
  const deleted = await db
    .delete(projectEvents)
    .where(
      and(
        eq(projectEvents.id, eventId),
        eq(projectEvents.projectId, projectId),
      ),
    )
    .returning({ id: projectEvents.id });

  if (deleted.length === 0) {
    throw new AppError("NOT_FOUND");
  }
}

export const ProjectEventsRepository = {
  listEvents,
  createEvent,
  deleteEvent,
} as const;
