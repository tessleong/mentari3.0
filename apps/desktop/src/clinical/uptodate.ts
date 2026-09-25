import { createUnavailableSource } from "./unavailable-source";

// UpToDate (Wolters Kluwer) offers an institutional API, but only under a
// paid enterprise license with its own credentials - there is no free tier.
// Registered in clinical_source_registry (access_mode 'requires_license') so
// it's a known, visible gap rather than silently absent. A future
// integration would need an API key/institutional token supplied via
// settings before this can do anything beyond throwing.
export const upToDateSource = createUnavailableSource(
  "uptodate",
  "UpToDate requires a Wolters Kluwer institutional API license",
);
