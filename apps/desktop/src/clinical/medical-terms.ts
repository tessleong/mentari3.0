// A curated, deliberately conservative dictionary for deciding whether a
// single transcript word is worth offering an inline explanation for.
// This is a heuristic gate, not a medical ontology — false negatives (a real
// term we don't recognize) are fine, false positives (flagging an ordinary
// word as clinical) are not, since every flagged word gets a distinct
// hover affordance in the transcript.
const MEDICAL_TERMS = new Set([
  // Conditions
  "hypertension",
  "hypotension",
  "diabetes",
  "prediabetes",
  "hyperglycemia",
  "hypoglycemia",
  "hyperlipidemia",
  "hypothyroidism",
  "hyperthyroidism",
  "arrhythmia",
  "tachycardia",
  "bradycardia",
  "atherosclerosis",
  "osteoporosis",
  "osteoarthritis",
  "arthritis",
  "asthma",
  "copd",
  "pneumonia",
  "bronchitis",
  "sinusitis",
  "anemia",
  "leukemia",
  "lymphoma",
  "melanoma",
  "carcinoma",
  "sepsis",
  "cellulitis",
  "pancreatitis",
  "hepatitis",
  "cirrhosis",
  "nephropathy",
  "neuropathy",
  "retinopathy",
  "embolism",
  "thrombosis",
  "aneurysm",
  "stenosis",
  "ischemia",
  "infarction",
  "fibrillation",
  "edema",
  "eczema",
  "psoriasis",
  "dermatitis",
  "vertigo",
  "migraine",
  "epilepsy",
  "seizure",
  "concussion",
  "fracture",
  "sprain",
  "hernia",
  "gallstones",
  "ulcer",
  "reflux",
  "colitis",
  "diverticulitis",
  "endometriosis",
  "fibroid",
  "fibroids",
  "menopause",
  "osteopenia",
  "scoliosis",

  // Symptoms
  "headache",
  "fever",
  "chills",
  "nausea",
  "vomiting",
  "dizziness",
  "fatigue",
  "insomnia",
  "constipation",
  "diarrhea",
  "bloating",
  "cramping",
  "wheezing",
  "palpitations",
  "numbness",
  "tingling",
  "congestion",
  "dehydration",
  "inflammation",

  // Labs / diagnostics
  "cholesterol",
  "triglycerides",
  "hemoglobin",
  "hematocrit",
  "creatinine",
  "electrolytes",
  "potassium",
  "sodium",
  "glucose",
  "hba1c",
  "a1c",
  "ldl",
  "hdl",
  "tsh",
  "psa",
  "bnp",
  "troponin",
  "ddimer",
  "cbc",
  "bmp",
  "cmp",
  "ekg",
  "ecg",
  "echocardiogram",
  "biopsy",
  "colonoscopy",
  "endoscopy",
  "mammogram",
  "ultrasound",
  "mri",
  "ct",
  "xray",
  "pet",
  "spirometry",

  // Medication classes / common drugs
  "metformin",
  "lisinopril",
  "atorvastatin",
  "simvastatin",
  "amlodipine",
  "metoprolol",
  "losartan",
  "levothyroxine",
  "omeprazole",
  "albuterol",
  "prednisone",
  "warfarin",
  "insulin",
  "statin",
  "statins",
  "diuretic",
  "diuretics",
  "betablocker",
  "ace inhibitor",
  "nsaid",
  "nsaids",
  "opioid",
  "opioids",
  "antibiotic",
  "antibiotics",
  "corticosteroid",
  "anticoagulant",
  "anticoagulants",

  // Anatomy commonly discussed clinically
  "pancreas",
  "gallbladder",
  "thyroid",
  "kidney",
  "kidneys",
  "liver",
  "spleen",
  "esophagus",
  "duodenum",
  "colon",
  "prostate",
  "uterus",
  "ovary",
  "ovaries",
  "aorta",
  "ventricle",
  "atrium",
  "cartilage",
  "tendon",
  "ligament",
]);

// Some entries are multi-word and can't be matched against a single
// tokenized word; keep them for future phrase-level matching but exclude
// them from the single-word set used today.
const SINGLE_WORD_TERMS = new Set(
  [...MEDICAL_TERMS].filter((term) => !term.includes(" ")),
);

/**
 * Normalizes a raw transcript word and checks it against the medical-term
 * dictionary. Returns the canonical lowercase term if it matches, or null.
 * Strips surrounding punctuation and a trailing possessive/plural "'s"/"s"
 * so "diabetes," and "statins" both resolve.
 */
export function detectMedicalTerm(rawWord: string): string | null {
  const stripped = rawWord
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (!stripped) return null;

  if (SINGLE_WORD_TERMS.has(stripped)) return stripped;

  const compact = stripped.replace(/[-_]/g, "");
  if (SINGLE_WORD_TERMS.has(compact)) return compact;

  const singularized = stripped.endsWith("s")
    ? stripped.slice(0, -1)
    : undefined;
  if (singularized && SINGLE_WORD_TERMS.has(singularized)) {
    return singularized;
  }

  return null;
}

/**
 * Whether text contains any word that would plausibly earn a research
 * citation, independent of whether generation actually produced one — lets
 * a summary UI distinguish "no citations because this isn't clinical
 * content" from "no citations despite clinical content" (usually a sign
 * generation or retrieval silently failed).
 */
export function hasPlausibleClinicalContent(text: string): boolean {
  const lower = text.toLowerCase();
  for (const rawWord of lower.match(/[a-z0-9][a-z0-9'-]*/g) ?? []) {
    if (detectMedicalTerm(rawWord)) return true;
  }
  return false;
}
