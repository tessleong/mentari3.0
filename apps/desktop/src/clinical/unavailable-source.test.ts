import { describe, expect, it } from "vitest";

import { cdcSource } from "./cdc";
import { mayoClinicSource } from "./mayo-clinic";
import { SourceUnavailableError } from "./sources";
import { upToDateSource } from "./uptodate";

describe.each([
  ["cdc", cdcSource],
  ["mayo_clinic", mayoClinicSource],
  ["uptodate", upToDateSource],
] as const)("%s source", (sourceId, source) => {
  it("reports as not configured", () => {
    expect(source.isConfigured()).toBe(false);
  });

  it("throws SourceUnavailableError from search instead of returning results", async () => {
    await expect(source.search()).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    await expect(source.search()).rejects.toMatchObject({ sourceId });
  });
});
