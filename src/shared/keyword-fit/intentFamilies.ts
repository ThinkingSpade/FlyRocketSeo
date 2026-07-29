/**
 * The commercial roles a searcher can occupy, and the words that reveal which
 * one they are in.
 *
 * A keyword is not wrong for a client because of its topic -- it is wrong
 * because of who is typing it. "vending machines for sale dfw" and "vending
 * service dfw" share a topic and a city; the first belongs to someone who
 * wants to OWN a machine and the second to someone who wants one PLACED. A
 * vending operator can serve only the second, and no amount of token overlap
 * tells the two apart.
 *
 * Each family is activated by what a client says they do NOT do (the profile's
 * `exclusions` field), then matched against result keywords by its surface
 * forms.
 *
 * `strong` vs `weak` is the guard against over-flagging, and the distinction
 * is load-bearing:
 *
 * - `strong` surfaces name the wrong role on their own. "for sale", "jobs"
 *   and "franchise" cannot plausibly belong to someone shopping for a service.
 * - `weak` surfaces are ambiguous and only count when the excluded OBJECT is
 *   also present. "price" is the clearest case: "vending machine price" is a
 *   purchase search, while "vending service price" is exactly the search the
 *   client wants to win. Flagging "price" unconditionally would demote the
 *   client's best commercial keywords -- the precise failure this whole
 *   feature exists to prevent, just pointed the other way.
 */

export type IntentFamilyId = "purchase" | "employment" | "diy" | "repair";

export type IntentFamily = {
  id: IntentFamilyId;
  /** Words in an exclusion line that activate this family. */
  triggers: readonly string[];
  /** Surfaces that identify the wrong role on their own. */
  strong: readonly string[];
  /** Surfaces that only count alongside the excluded object. */
  weak: readonly string[];
  /** Fills the "this looks like a ___ search" half of a reason string. */
  description: string;
};

export const INTENT_FAMILIES: readonly IntentFamily[] = [
  {
    id: "purchase",
    triggers: [
      "sell",
      "sells",
      "selling",
      "sale",
      "sales",
      "resell",
      "resale",
      "distribute",
      "distributor",
      "wholesale",
      "manufacture",
      "manufacturer",
      "supply",
      "supplier",
      "rent",
      "rental",
      "lease",
    ],
    strong: [
      "for sale",
      "for-sale",
      "buy",
      "buying",
      "purchase",
      "purchasing",
      "wholesale",
      "used",
      "refurbished",
      "second hand",
      "secondhand",
      "supplier",
      "suppliers",
      "distributor",
      "distributors",
      "manufacturer",
      "manufacturers",
      "for rent",
      "rental",
      "rent to own",
    ],
    weak: ["price", "prices", "pricing", "cost", "costs", "cheap", "discount"],
    description: "a purchase search",
  },
  {
    id: "employment",
    triggers: [
      "hire",
      "hiring",
      "job",
      "jobs",
      "employ",
      "employment",
      "staff",
    ],
    strong: [
      "jobs",
      "job openings",
      "careers",
      "hiring",
      "employment",
      "salary",
      "salaries",
      "wage",
      "wages",
      "pay rate",
      "resume",
    ],
    weak: [],
    description: "a job search",
  },
  {
    id: "diy",
    triggers: [
      "diy",
      "yourself",
      "teach",
      "train",
      "training",
      "course",
      "consult",
      "franchise",
    ],
    strong: [
      "how to start",
      "how to open",
      "start a",
      "starting a",
      "business plan",
      "franchise",
      "franchising",
      "diy",
      "yourself",
      "step by step",
    ],
    weak: ["guide", "tutorial", "course"],
    description: "a do-it-yourself search",
  },
  {
    id: "repair",
    triggers: ["repair", "fix", "part", "parts", "maintenance", "troubleshoot"],
    strong: [
      "repair",
      "repairs",
      "replacement parts",
      "spare parts",
      "troubleshooting",
      "troubleshoot",
      "error code",
      "not working",
      "manual pdf",
    ],
    weak: ["parts", "manual", "fix"],
    description: "a repair search",
  },
];
