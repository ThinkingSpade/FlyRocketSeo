import { createServerFn } from "@tanstack/react-start";
import { ProjectEventsRepository } from "@/server/features/projects/repositories/ProjectEventsRepository";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createProjectEventSchema,
  deleteProjectEventSchema,
  listProjectEventsSchema,
} from "@/types/schemas/project-events";

export const getProjectEvents = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listProjectEventsSchema)
  .handler(async ({ context }) =>
    ProjectEventsRepository.listEvents(context.projectId),
  );

export const createProjectEvent = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createProjectEventSchema)
  .handler(async ({ data, context }) =>
    ProjectEventsRepository.createEvent(context.projectId, {
      eventDate: data.eventDate,
      title: data.title,
      note: data.note,
    }),
  );

export const deleteProjectEvent = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteProjectEventSchema)
  .handler(async ({ data, context }) => {
    await ProjectEventsRepository.deleteEvent(context.projectId, data.eventId);
    return { ok: true as const };
  });
