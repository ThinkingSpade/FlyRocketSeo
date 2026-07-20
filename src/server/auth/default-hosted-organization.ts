import { AuthRepository } from "@/server/auth/repositories/AuthRepository";

type HostedOrganizationCreateInput = {
  name: string;
  slug: string;
  userId: string;
};

type HostedOrganizationCreator = (
  input: HostedOrganizationCreateInput,
) => Promise<{ id: string }>;

async function createSharedHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
) {
  try {
    const createdOrganization = await createOrganization({
      name: "Team workspace",
      slug: "team-workspace",
      userId,
    });

    return createdOrganization.id;
  } catch (error) {
    const organizationId =
      await AuthRepository.findFirstOrganizationIdForUser(userId);

    if (organizationId) {
      return organizationId;
    }

    throw error;
  }
}

export async function getOrJoinSharedHostedOrganization(
  userId: string,
  createOrganization: HostedOrganizationCreator,
) {
  const sharedOrganizationId = await AuthRepository.findSharedOrganizationId();

  if (sharedOrganizationId) {
    await AuthRepository.ensureMembership({
      userId,
      organizationId: sharedOrganizationId,
    });
    return sharedOrganizationId;
  }

  return createSharedHostedOrganization(userId, createOrganization);
}
