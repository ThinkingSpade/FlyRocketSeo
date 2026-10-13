import { expect, test, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Papa from "papaparse";

export async function readActualCsv(download: Download, filename: string) {
  await download.saveAs(test.info().outputPath(filename));
  const csv = await readFile(await download.path(), "utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
  expect(parsed.errors).toEqual([]);
  return { csv, rows: parsed.data };
}

export function expectCapturedAt(value: string | undefined) {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}
