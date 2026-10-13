import type { Page } from "@playwright/test";

/** Observe native navigation without altering submission, routing or fetch. */
export async function captureTrendsNavigation(page: Page) {
  const documents: unknown[] = [];
  const navigationReasons: unknown[] = [];
  const submits: string[] = [];
  const prefix = "ACCEPTANCE_TRENDS_SUBMIT ";
  const onConsole = (message: { text: () => string }) => {
    const text = message.text();
    if (text.startsWith(prefix)) submits.push(text.slice(prefix.length));
  };
  page.on("console", onConsole);
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Page.enable");
  session.on("Network.requestWillBeSent", (event) => {
    if (event.type !== "Document" || !event.request.url.includes("/trends"))
      return;
    documents.push({
      url: event.request.url,
      initiator: event.initiator,
      time: event.timestamp,
    });
  });
  session.on("Page.frameRequestedNavigation", (event) => {
    if (event.url.includes("/trends")) navigationReasons.push(event);
  });
  await page.addInitScript(() => {
    // Window bubbling follows React's document/root submit listeners. A
    // capture-phase microtask can run before those listeners prevent default.
    window.addEventListener("submit", (event) => {
      if (!location.pathname.endsWith("/trends")) return;
      const target = event.target;
      console.debug(
        "ACCEPTANCE_TRENDS_SUBMIT " +
          JSON.stringify({
            url: location.href,
            action: target instanceof HTMLFormElement ? target.action : null,
            defaultPrevented: event.defaultPrevented,
          }),
      );
    });
  });
  return async () => {
    page.off("console", onConsole);
    await session.detach();
    return { documents, navigationReasons, submits };
  };
}
