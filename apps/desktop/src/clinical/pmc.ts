import { fetch } from "@tauri-apps/plugin-http";

import { sha256 } from "./hash";

export type PmcOpenAccessDocument = {
  pmcid: string;
  licenseId: string;
  licenseUrl: string;
  commercialUseAllowed: boolean;
  redistributionAllowed: boolean;
  passages: { sectionKind: string; sectionTitle: string; content: string }[];
  contentSha256: string;
};

type BioCDocument = {
  id?: string;
  infons?: Record<string, unknown>;
  passages?: Array<{
    infons?: Record<string, unknown>;
    text?: string;
  }>;
};

export async function fetchPmcOpenAccessDocuments(
  pmcids: string[],
): Promise<PmcOpenAccessDocument[]> {
  if (pmcids.length === 0) return [];
  const url = `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/bioc_json/${pmcids.join(",")}/unicode`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PMC Open Access fetch failed (${response.status})`);
  }
  const payload: unknown = await response.json();
  const documents = collectDocuments(payload);
  return Promise.all(
    documents.map(async (document) => {
      const licenseId = stringInfon(document.infons, "license");
      const licenseUrl = stringInfon(document.infons, "license_url");
      const passages = (document.passages ?? [])
        .map((passage) => ({
          sectionKind:
            stringInfon(passage.infons, "section_type") ||
            stringInfon(passage.infons, "type") ||
            "body",
          sectionTitle: stringInfon(passage.infons, "section") || "",
          content: passage.text?.trim() ?? "",
        }))
        .filter((passage) => passage.content);
      const normalizedLicense = licenseId.toLowerCase();
      return {
        pmcid: document.id?.trim() ?? "",
        licenseId,
        licenseUrl,
        commercialUseAllowed:
          normalizedLicense.includes("cc by") &&
          !normalizedLicense.includes("-nc"),
        redistributionAllowed: Boolean(licenseId || licenseUrl),
        passages,
        contentSha256: await sha256(
          passages.map((passage) => passage.content).join("\n"),
        ),
      };
    }),
  );
}

function collectDocuments(payload: unknown): BioCDocument[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => collectDocuments(entry));
  }
  if (!payload || typeof payload !== "object") return [];
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.documents)) {
    return object.documents.filter(
      (document): document is BioCDocument =>
        Boolean(document) && typeof document === "object",
    );
  }
  return "id" in object && "passages" in object ? [object as BioCDocument] : [];
}

function stringInfon(
  infons: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = infons?.[key];
  return typeof value === "string" ? value.trim() : "";
}
