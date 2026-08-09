import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/client/features/landing/LandingPage";

// TEMPORARY — development preview of the landing page, which "/" only shows to
// a signed-out visitor in hosted auth mode. Delete before committing.
export const Route = createFileRoute("/preview-landing")({
  component: LandingPage,
});
