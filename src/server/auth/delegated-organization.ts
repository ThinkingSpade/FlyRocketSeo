import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { delegatedOrganizationId } from "@/server/auth/delegated-organization-id";
import { slugify, toHex } from "./org-slug";

function getDelegatedOrganizationName(email: string, userId: string) {
  return `${email.split("@")[0] || userId} workspace`;
}

function getDelegatedOrganizationSlug(email: string, userId: string) {
  const slugSource = email.split("@")[0] || userId;
  return `delegated-${slugify(slugSource)}-${toHex(userId)}`;
}

export async function ensureDelegatedOrganizationForUser(
  userId: string,
  email: string,
) {
  const organizationId = delegatedOrganizationId(userId);
  const name = getDelegatedOrganizationName(email, userId);
  const slug = getDelegatedOrganizationSlug(email, userId);

  await AuthRepository.upsertDelegatedOrganization({
    id: organizationId,
    name,
    slug,
  });

  return organizationId;
}
