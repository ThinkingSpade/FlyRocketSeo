export const ACCEPTANCE_PASSWORD = "LocalAcceptancePassword123!";
export const PROJECT_A = "00000000-0000-4000-8000-000000000101";
export const PROJECT_A2 = "00000000-0000-4000-8000-000000000102";
export const PROJECT_PAGING = "00000000-0000-4000-8000-000000000103";
export const PROJECT_OPERATIONS = "00000000-0000-4000-8000-000000000104";
export const OPERATION_RANK_CONFIG = "00000000-0000-4000-8000-000000000401";
export const PROJECT_B = "00000000-0000-4000-8000-000000000201";
export const ORG_A = "acceptance-org-a";
export const ORG_B = "acceptance-org-b";
export const PAGE_URL = "https://primary.example/guide";
export const PROJECT_DELETED = "00000000-0000-4000-8000-000000000109";
export const CLEANUP_ORPHAN_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"a".repeat(64)}.json`;
export const CLEANUP_DELETED_PROJECT_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_DELETED}/${"c".repeat(64)}.json`;
export const CLEANUP_FOREIGN_KEY = `opportunity-evidence/${ORG_B}/${PROJECT_B}/${"b".repeat(64)}.json`;
export const CLEANUP_BASELINE_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"d".repeat(64)}.json`;
export const CLEANUP_BUSY_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"e".repeat(64)}.json`;
export const CLEANUP_LEGACY_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"f".repeat(64)}.json`;
export const CLEANUP_AUTH_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"9".repeat(64)}.json`;
export const CLEANUP_RETRY_KEY = `opportunity-evidence/${ORG_A}/${PROJECT_A}/${"8".repeat(64)}.json`;
export const CLEANUP_QUOTA_KEYS = [1, 2, 3, 4, 5].map(
  (number) =>
    `opportunity-evidence/${ORG_B}/${PROJECT_B}/${String(number).repeat(64)}.json`,
);
