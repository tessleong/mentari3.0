import { fetch } from "@tauri-apps/plugin-http";

import { sha256 } from "./hash";

export type PubMedArticle = {
  pmid: string;
  pmcid: string;
  doi: string;
  title: string;
  abstractText: string;
  journal: string;
  publicationYear: number;
  publicationTypes: string[];
  authors: string[];
  meshTerms: string[];
  relatedArticles: { pmid: string; type: string }[];
  studyDesign: StudyDesign;
  retractionStatus:
    | "clear"
    | "corrected"
    | "expression_of_concern"
    | "retracted";
  sourceUrl: string;
  sourceRevision: string;
  sourceSha256: string;
};

export type StudyDesign =
  | "systematic_review"
  | "meta_analysis"
  | "practice_guideline"
  | "randomized_controlled_trial"
  | "clinical_trial"
  | "observational_study"
  | "case_report"
  | "review"
  | "other";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export async function fetchPubMedArticles({
  query,
  limit,
  email,
  apiKey,
  signal,
}: {
  query: string;
  limit: number;
  email: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<PubMedArticle[]> {
  const common = { tool: "mentari", email };
  const searchUrl = new URL(`${EUTILS}/esearch.fcgi`);
  Object.entries({
    ...common,
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: String(Math.min(Math.max(limit, 1), 200)),
    sort: "pub_date",
    ...(apiKey ? { api_key: apiKey } : {}),
  }).forEach(([key, value]) => searchUrl.searchParams.set(key, value));

  const searchResponse = await fetch(searchUrl.toString(), { signal });
  if (!searchResponse.ok) {
    throw new Error(`PubMed search failed (${searchResponse.status})`);
  }
  const search = (await searchResponse.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = search.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const fetchUrl = new URL(`${EUTILS}/efetch.fcgi`);
  Object.entries({
    ...common,
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml",
    ...(apiKey ? { api_key: apiKey } : {}),
  }).forEach(([key, value]) => fetchUrl.searchParams.set(key, value));
  const fetchResponse = await fetch(fetchUrl.toString(), { signal });
  if (!fetchResponse.ok) {
    throw new Error(`PubMed fetch failed (${fetchResponse.status})`);
  }
  return parsePubMedXml(await fetchResponse.text());
}

export async function parsePubMedXml(xml: string): Promise<PubMedArticle[]> {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error("PubMed returned invalid XML");

  return Promise.all(
    [...document.querySelectorAll("PubmedArticle")].map(async (node) => {
      const pmid = text(node, "MedlineCitation > PMID");
      const publicationTypes = texts(
        node,
        "PublicationTypeList > PublicationType",
      );
      const relatedArticles = [...node.querySelectorAll("CommentsCorrections")]
        .map((related) => ({
          pmid: text(related, "PMID"),
          type: related.getAttribute("RefType") ?? "",
        }))
        .filter((related) => related.pmid);
      const year = Number.parseInt(
        text(node, "PubDate > Year") ||
          text(node, "ArticleDate > Year") ||
          text(node, "DateCompleted > Year"),
        10,
      );
      const doi = [...node.querySelectorAll("ArticleId")].find(
        (element) => element.getAttribute("IdType") === "doi",
      )?.textContent;
      const pmcid = [...node.querySelectorAll("ArticleId")].find(
        (element) => element.getAttribute("IdType") === "pmc",
      )?.textContent;
      const sourceRevision =
        text(node, "DateRevised > Year") +
        text(node, "DateRevised > Month").padStart(2, "0") +
        text(node, "DateRevised > Day").padStart(2, "0");
      const serialized = new XMLSerializer().serializeToString(node);

      return {
        pmid,
        pmcid: pmcid?.trim() ?? "",
        doi: doi?.trim() ?? "",
        title: text(node, "ArticleTitle"),
        abstractText: texts(node, "Abstract > AbstractText").join("\n\n"),
        journal:
          text(node, "Journal > Title") ||
          text(node, "MedlineJournalInfo > MedlineTA"),
        publicationYear: Number.isFinite(year) ? year : 0,
        publicationTypes,
        authors: [...node.querySelectorAll("AuthorList > Author")]
          .map((author) =>
            [text(author, "ForeName"), text(author, "LastName")]
              .filter(Boolean)
              .join(" "),
          )
          .filter(Boolean),
        meshTerms: texts(node, "MeshHeading > DescriptorName"),
        relatedArticles,
        studyDesign: classifyStudyDesign(publicationTypes),
        retractionStatus: classifyRetraction(publicationTypes, relatedArticles),
        sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        sourceRevision,
        sourceSha256: await sha256(serialized),
      };
    }),
  );
}

export function classifyStudyDesign(types: string[]): StudyDesign {
  const normalized = new Set(types.map((type) => type.toLowerCase()));
  if (normalized.has("systematic review")) return "systematic_review";
  if (normalized.has("meta-analysis")) return "meta_analysis";
  if (normalized.has("practice guideline") || normalized.has("guideline")) {
    return "practice_guideline";
  }
  if (normalized.has("randomized controlled trial")) {
    return "randomized_controlled_trial";
  }
  if (normalized.has("clinical trial")) return "clinical_trial";
  if (normalized.has("observational study")) return "observational_study";
  if (normalized.has("case reports")) return "case_report";
  if (normalized.has("review")) return "review";
  return "other";
}

function classifyRetraction(
  types: string[],
  related: { type: string }[],
): PubMedArticle["retractionStatus"] {
  const values = [...types, ...related.map((item) => item.type)].map((value) =>
    value.toLowerCase(),
  );
  if (values.some((value) => value.includes("retract"))) return "retracted";
  if (values.some((value) => value.includes("expression of concern"))) {
    return "expression_of_concern";
  }
  if (values.some((value) => value.includes("correct"))) return "corrected";
  return "clear";
}

function text(root: Element, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? "";
}

function texts(root: Element, selector: string): string[] {
  return [...root.querySelectorAll(selector)]
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);
}
