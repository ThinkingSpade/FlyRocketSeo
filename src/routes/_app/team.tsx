import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/client/features/team/TeamPage";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});
