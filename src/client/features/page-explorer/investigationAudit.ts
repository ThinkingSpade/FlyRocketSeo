export function selectInvestigationAudit<
  T extends { id: string; status: string; startUrl: string },
>(history: T[], url: string): T | undefined {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return undefined;
  }
  return history.find((audit) => {
    if (audit.status !== "completed") return false;
    try {
      return new URL(audit.startUrl).hostname === hostname;
    } catch {
      return false;
    }
  });
}
