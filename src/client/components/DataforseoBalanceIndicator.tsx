import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { getDataforseoAccountStatus } from "@/serverFunctions/config";

// Below the warning floor the balance turns amber; below the error floor, red.
// DataForSEO's minimum top-up is $50 and new accounts start with ~$1 of credit,
// so these flag "you're about to run dry" without crying wolf.
const LOW_BALANCE_WARNING_USD = 5;
const LOW_BALANCE_ERROR_USD = 1;

function formatBalance(balance: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(balance);
  } catch {
    // Guard against a non-ISO currency code from an upstream shape change.
    return `$${balance.toFixed(2)}`;
  }
}

/**
 * Shows the self-hoster's live DataForSEO prepaid balance in the sidebar footer.
 * Renders nothing in hosted mode, when no key is configured, or when the balance
 * can't be read — the server function gates all three (see
 * getDataforseoAccountStatus).
 */
export function DataforseoBalanceIndicator() {
  const { data } = useQuery({
    queryKey: ["dataforseoAccountStatus"],
    queryFn: () => getDataforseoAccountStatus(),
    // Balance drifts as calls are made; refetch on focus but don't hammer it.
    staleTime: 60_000,
  });

  if (!data || !data.supported || !data.configured || !data.balance) {
    return null;
  }

  const { balance, currency } = data.balance;
  const toneClass =
    balance < LOW_BALANCE_ERROR_USD
      ? "text-error"
      : balance < LOW_BALANCE_WARNING_USD
        ? "text-warning"
        : "font-medium text-base-content/70";

  return (
    <a
      href="https://app.dataforseo.com/"
      target="_blank"
      rel="noreferrer"
      title="Your DataForSEO account balance — open DataForSEO to top up"
      className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs text-base-content/50 transition-colors hover:bg-base-300/50 hover:text-base-content"
    >
      <Wallet className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        DataForSEO{" "}
        <span className={`font-medium ${toneClass}`}>
          {formatBalance(balance, currency)}
        </span>
      </span>
    </a>
  );
}
