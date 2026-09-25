import { createUnavailableSource } from "./unavailable-source";

// CDC publishes guidance as web pages and datasets (data.cdc.gov, a Socrata
// instance), not as a searchable clinical-literature API comparable to
// PubMed/MedlinePlus. Registered in clinical_source_registry (access_mode
// 'unavailable') so it's a known, visible gap rather than silently absent.
// A future integration would likely target a specific data.cdc.gov dataset
// or a curated set of guidance pages, not a general free-text search.
export const cdcSource = createUnavailableSource(
  "cdc",
  "CDC has no general-purpose clinical literature search API",
);
