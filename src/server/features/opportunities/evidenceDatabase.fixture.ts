import { applyOpportunityMigrations } from "./opportunityMigrations.fixture";
import { createClient } from "@libsql/client";

export async function openEvidenceDatabase() {
  const client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`PRAGMA foreign_keys=ON;
    CREATE TABLE organization(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY, organization_id TEXT, domain TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member(id TEXT PRIMARY KEY, organization_id TEXT, user_id TEXT, role TEXT);
    INSERT INTO organization VALUES('org-a'),('org-b');
    INSERT INTO projects VALUES('project-a','org-a','example.com'),('project-b','org-b','elsewhere.com');
    INSERT INTO user VALUES('user-a','Alice','alice@example.com'),('user-b','Bob','bob@example.com');
    INSERT INTO member VALUES('member-a','org-a','user-a','owner'),('member-b','org-b','user-b','owner');`);
  await applyOpportunityMigrations(client);
  return client;
}
