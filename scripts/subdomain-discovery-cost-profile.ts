import process from "node:process";
import { fetchSubdomains } from "@/server/lib/dataforseo/labs-competitors";
import { loadLocalEnv, parseArgs } from "./cli-utils";

// Measures what one "Search organic results" subdomain discovery bills, so
// the button can quote a measured figure (see src/shared/analysis-costs.ts).
// Same request the app makes: Labs `subdomains`, top 1,000 by traffic.

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));

if (process.env.CI === "true" && args.allowCi !== "true") {
  printUsageAndExit(
    "Refusing to run live billing checks in CI without --allowCi=true.",
  );
}
if (args.confirmLive !== "true") {
  printUsageAndExit(
    "This command makes a live, billable DataForSEO request. Re-run with --confirmLive=true.",
  );
}
const target = args.target?.trim();
if (!target) printUsageAndExit("Missing --target=example.com");

const response = await fetchSubdomains({
  target,
  locationCode: Number(args.locationCode ?? 2840),
  languageCode: args.languageCode ?? "en",
  limit: 1000,
  orderBy: ["metrics.organic.etv,desc"],
});

console.log(
  JSON.stringify(
    {
      target,
      itemsReturned: response.data.items.length,
      totalCount: response.data.totalCount,
      rawCostUsd: response.billing.costUsd,
      path: response.billing.path,
    },
    null,
    2,
  ),
);

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error(
    "Usage: pnpm billing:subdomain-discovery --target=example.com --confirmLive=true [--locationCode=2840] [--languageCode=en] [--allowCi=true]",
  );
  process.exit(1);
}
