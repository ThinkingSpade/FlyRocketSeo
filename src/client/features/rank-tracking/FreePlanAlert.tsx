import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { Banner } from "@cloudflare/kumo/components/banner";

export function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <Banner variant="alert" className="text-sm py-2">
      <AlertTriangle className="size-4" />
      <span>
        We only start to track keyword positions once you{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="app-link font-medium"
        >
          upgrade to the paid plan
        </Link>
        .
      </span>
    </Banner>
  );
}
