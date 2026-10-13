import type { EvidenceScope, OpportunityStatus } from "@/shared/opportunities";
import type { opportunities } from "@/db/schema";
export type Scope = Pick<
  EvidenceScope,
  "organizationId" | "projectId" | "target"
>;
export type Row = typeof opportunities.$inferSelect;
export type Update = {
  status?: OpportunityStatus;
  assigneeUserId?: string | null;
  implementedAt?: string;
  note?: string;
};
