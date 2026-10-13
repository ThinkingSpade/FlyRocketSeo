import * as cheerio from "cheerio";
import { fetchValidatingEveryHop } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import type { InternalLinkInput } from "./detectors";

export function parseLinkSource(
  html: string,
  url: string,
  capturedAt: string,
): InternalLinkInput["source"] {
  const $ = cheerio.load(html);
  let documentBase = url;
  const base = $("base[href]").first().attr("href");
  if (base != null) {
    try {
      const resolved = new URL(base, url);
      if (!["http:", "https:"].includes(resolved.protocol))
        throw new Error("Unsupported document base");
      documentBase = resolved.href;
    } catch {
      throw new AppError(
        "VALIDATION_ERROR",
        "The captured document base cannot establish complete link evidence.",
      );
    }
  }
  const links = new Set<string>();
  $("a[href]").each((_, element) => {
    try {
      const destination = new URL($(element).attr("href") ?? "", documentBase);
      if (["http:", "https:"].includes(destination.protocol)) {
        destination.hash = "";
        links.add(destination.href);
      }
    } catch {
      /* Malformed captured links have no usable URL. */
    }
  });
  $("script,style,noscript,svg,nav,header,footer").remove();
  const main = $("main").length
    ? $("main")
    : $("article").length
      ? $("article")
      : $("body");
  const locations: InternalLinkInput["source"]["locations"] = [];
  main.find("p,li").each((index, element) => {
    const part = $(element);
    // Conservatively skip mixed linked paragraphs rather than inventing a contiguous unlinked phrase.
    if (part.find("a").length) return;
    const text = part.text().trim().replace(/\s+/g, " ");
    if (text) locations.push({ location: `paragraph ${index + 1}`, text });
  });
  return {
    url,
    statusCode: 200,
    capturedAt,
    links: [...links].toSorted(),
    locations,
  };
}

export async function captureLinkSource(
  sourceUrl: string,
  targetUrl: string,
  domain: string | null,
) {
  if (!domain) throw new AppError("PROJECT_DOMAIN_MISSING");
  const project = new URL(
    /^https?:\/\//i.test(domain) ? domain : `https://${domain}`,
  );
  for (const input of [sourceUrl, targetUrl]) {
    const url = new URL(input);
    if (
      url.origin !== project.origin ||
      url.username ||
      url.password ||
      !["http:", "https:"].includes(url.protocol)
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose source and destination on this project's current website origin.",
      );
  }
  const { response, finalUrl } = await fetchValidatingEveryHop(
    sourceUrl,
    {
      headers: {
        "User-Agent": "FlyRocketSEO-Audit/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    },
    { allowHop: (hop) => hop.origin === project.origin },
  );
  if (response.status !== 200 || finalUrl !== sourceUrl)
    throw new AppError(
      "VALIDATION_ERROR",
      "Capture a successful source page without a redirect before proposing an exact link location.",
    );
  if (
    !/text\/html|application\/xhtml\+xml/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "The source did not return HTML evidence.",
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError(
      "VALIDATION_ERROR",
      "The source returned no captured content.",
    );
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 400000) {
      await reader.cancel();
      throw new AppError(
        "VALIDATION_ERROR",
        "The source exceeds the bounded content capture limit.",
      );
    }
    html += decoder.decode(chunk.value, { stream: true });
  }
  html += decoder.decode();
  return parseLinkSource(html, sourceUrl, new Date().toISOString());
}
