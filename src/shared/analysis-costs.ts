/**
 * Measured raw DataForSEO costs for analyses we can quote a figure for.
 *
 * These are MEASURED, not guessed — each is produced by a cost-profile script
 * (see `pnpm billing:brand-lookup`). Anything without a measured figure is
 * deliberately absent rather than estimated: showing an invented number right
 * before spending someone's money is worse than showing none.
 *
 * Raw = what DataForSEO charges. Hosted customers are billed the marked-up USD
 * (`applyBillingMarkupUsd`); self-hosted users pay DataForSEO directly.
 */

/**
 * Brand Lookup fans out aggregated_metrics + top_pages + mentions_search across
 * ChatGPT and Google AI Overview; mentions_search is row-priced at the full
 * 100-row sample per platform.
 */
export const BRAND_LOOKUP_RAW_COST_USD = 0.85;

/**
 * Adding competitors triggers 2 extra cross_aggregated_metrics calls (one per
 * platform). Measured live (Jun 2026) at $0.101 each — $0.202 total for a
 * 4-group comparison — via `pnpm billing:brand-lookup --competitors=...`.
 */
export const BRAND_LOOKUP_COMPETITOR_RAW_COST_USD = 0.2;
