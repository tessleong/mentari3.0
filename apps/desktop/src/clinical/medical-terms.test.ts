import { describe, expect, it } from "vitest";

import {
  detectMedicalTerm,
  hasPlausibleClinicalContent,
} from "./medical-terms";

describe("detectMedicalTerm", () => {
  it("matches an exact clinical term", () => {
    expect(detectMedicalTerm("hypertension")).toBe("hypertension");
  });

  it("is case-insensitive", () => {
    expect(detectMedicalTerm("Hypertension")).toBe("hypertension");
    expect(detectMedicalTerm("METFORMIN")).toBe("metformin");
  });

  it("strips surrounding punctuation from a transcript word", () => {
    expect(detectMedicalTerm("diabetes,")).toBe("diabetes");
    expect(detectMedicalTerm("(cholesterol)")).toBe("cholesterol");
    expect(detectMedicalTerm("ligaments.")).toBe("ligament");
    expect(detectMedicalTerm("D-dimer")).toBe("ddimer");
  });

  it("resolves a simple plural that has no plural entry of its own", () => {
    expect(detectMedicalTerm("ligaments")).toBe("ligament");
    expect(detectMedicalTerm("tendons")).toBe("tendon");
  });

  it("matches a plural that has its own dictionary entry as-is", () => {
    expect(detectMedicalTerm("statins")).toBe("statins");
    expect(detectMedicalTerm("kidneys")).toBe("kidneys");
  });

  it("matches an irregular plural that has its own entry", () => {
    expect(detectMedicalTerm("ovaries")).toBe("ovaries");
  });

  it("returns null for ordinary conversational words", () => {
    expect(detectMedicalTerm("the")).toBeNull();
    expect(detectMedicalTerm("appointment")).toBeNull();
    expect(detectMedicalTerm("results")).toBeNull();
    expect(detectMedicalTerm("feeling")).toBeNull();
  });

  it("returns null for empty or punctuation-only input", () => {
    expect(detectMedicalTerm("")).toBeNull();
    expect(detectMedicalTerm("   ")).toBeNull();
    expect(detectMedicalTerm("--")).toBeNull();
  });

  it("does not false-positive on a word that merely contains a term as a substring", () => {
    // "statin" is a term but "statinesque" (hypothetical) shouldn't match —
    // matching is whole-word only, never substring.
    expect(detectMedicalTerm("statinesque")).toBeNull();
  });

  it("matches common symptom words, not just conditions and drugs", () => {
    expect(detectMedicalTerm("headache")).toBe("headache");
    expect(detectMedicalTerm("headaches")).toBe("headache");
    expect(detectMedicalTerm("Fever")).toBe("fever");
    expect(detectMedicalTerm("nausea")).toBe("nausea");
  });
});

describe("hasPlausibleClinicalContent", () => {
  it("returns true when the text contains a medical term", () => {
    expect(
      hasPlausibleClinicalContent(
        "Discussed the patient's headache and fever.",
      ),
    ).toBe(true);
  });

  it("returns false for text with no medical terms", () => {
    expect(
      hasPlausibleClinicalContent("We reviewed the quarterly budget."),
    ).toBe(false);
  });
});
