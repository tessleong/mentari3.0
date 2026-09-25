import { createUnavailableSource } from "./unavailable-source";

// Mayo Clinic does not publish a public content API. Registered in
// clinical_source_registry (access_mode 'unavailable') so it's a known,
// visible gap rather than silently absent. A future integration would need
// a licensing agreement with Mayo Foundation for Medical Education and
// Research, not just an API key.
export const mayoClinicSource = createUnavailableSource(
  "mayo_clinic",
  "Mayo Clinic has no public content API",
);
