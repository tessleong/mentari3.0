import { fetch } from "@tauri-apps/plugin-http";

import { sha256 } from "./hash";
import type { NormalizedEvidenceArticle } from "./sources";

// MedlinePlus Connect Web Service: free, no API key or registration required.
// https://medlineplus.gov/webservices.html
// NLM asks callers to identify their tool/contact and to cache results
// (12-24h) rather than re-querying; this module only fetches on explicit
// user-triggered ingestion, never automatically or in a loop.
const BASE_URL = "https://wsearch.nlm.nih.gov/ws/query";

export async function fetchMedlinePlusTopics({
  query,
  limit,
  email,
  signal,
}: {
  query: string;
  limit: number;
  email: string;
  signal?: AbortSignal;
}): Promise<NormalizedEvidenceArticle[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("db", "healthTopics");
  url.searchParams.set("term", query);
  url.searchParams.set("retmax", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("rettype", "all");
  url.searchParams.set("tool", "mentari");
  url.searchParams.set("email", email);

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`MedlinePlus search failed (${response.status})`);
  }
  return parseMedlinePlusXml(await response.text());
}

export async function parseMedlinePlusXml(
  xml: string,
): Promise<NormalizedEvidenceArticle[]> {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("MedlinePlus returned invalid XML");
  }

  return Promise.all(
    [...document.querySelectorAll("document")].map(async (node) => {
      const sourceUrl = node.getAttribute("url") ?? "";
      const title = content(node, "title");
      const fullSummary =
        content(node, "FullSummary") || content(node, "snippet");
      const serialized = new XMLSerializer().serializeToString(node);

      return {
        sourceId: "medline_plus",
        externalId: sourceUrl,
        title: stripHtml(title),
        abstractText: stripHtml(fullSummary),
        sourceUrl,
        publicationYear: 0,
        sourceSha256: await sha256(serialized),
      } satisfies NormalizedEvidenceArticle;
    }),
  );
}

function content(root: Element, name: string): string {
  return (
    root.querySelector(`content[name="${name}"]`)?.textContent?.trim() ?? ""
  );
}

// MedlinePlus content fields can contain inline HTML (e.g. <span
// class="qt1">); strip tags for storage as plain-text abstract/title.
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}
