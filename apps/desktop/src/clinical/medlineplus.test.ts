import { describe, expect, it } from "vitest";

import { parseMedlinePlusXml } from "./medlineplus";

const SAMPLE_XML = `<?xml version="1.0"?>
<nlmSearchResult>
  <document rank="1" url="https://medlineplus.gov/diabetes.html">
    <content name="title">&lt;span class="qt0"&gt;Diabetes&lt;/span&gt;</content>
    <content name="snippet">A short snippet.</content>
    <content name="FullSummary">&lt;p&gt;Diabetes is a disease.&lt;/p&gt;</content>
    <content name="mesh">Diabetes Mellitus</content>
  </document>
  <document rank="2" url="https://medlineplus.gov/hypertension.html">
    <content name="title">Hypertension</content>
    <content name="snippet">High blood pressure overview.</content>
  </document>
</nlmSearchResult>`;

describe("parseMedlinePlusXml", () => {
  it("parses documents into normalized evidence articles", async () => {
    const articles = await parseMedlinePlusXml(SAMPLE_XML);

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      sourceId: "medline_plus",
      externalId: "https://medlineplus.gov/diabetes.html",
      title: "Diabetes",
      sourceUrl: "https://medlineplus.gov/diabetes.html",
      publicationYear: 0,
    });
    expect(articles[0]!.abstractText).toBe("Diabetes is a disease.");
    expect(articles[0]!.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("strips inline HTML tags from title and summary", async () => {
    const articles = await parseMedlinePlusXml(SAMPLE_XML);
    expect(articles[0]!.title).not.toContain("<");
    expect(articles[0]!.abstractText).not.toContain("<");
  });

  it("falls back to the snippet when FullSummary is absent", async () => {
    const articles = await parseMedlinePlusXml(SAMPLE_XML);
    expect(articles[1]!.abstractText).toBe("High blood pressure overview.");
  });

  it("returns an empty list for a result set with no documents", async () => {
    const articles = await parseMedlinePlusXml(
      '<?xml version="1.0"?><nlmSearchResult></nlmSearchResult>',
    );
    expect(articles).toEqual([]);
  });

  it("throws on invalid XML", async () => {
    await expect(parseMedlinePlusXml("not xml at all <<<")).rejects.toThrow();
  });
});
