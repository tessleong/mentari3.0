# Patient-Side Clinical Encounter Intelligence — Scoping Note

Scoped against `PATIENT_SIDE_CLINICAL_ENCOUNTER_PRODUCT.md`. This is a new product surface (patient-facing), but its retrieval foundation is ~90% the same infrastructure already built for the clinician-facing product this session — see `docs/CLINICAL_ENCOUNTER_EVIDENCE_AUDIT.md`. This note identifies what's reusable, what's genuinely net-new, and what this pass builds.

## Reusable as-is

- **Encounter retrieval** — `apps/desktop/src/clinical/encounter-retrieval.ts` (`retrieveEncounterSegments`) already returns exactly the `{segment_id, speaker, start_ms, end_ms, text, score}` shape spec §3/§7/§25 want for "From your visit." No changes needed.
- **Medical evidence retrieval** — `apps/desktop/src/clinical/repository.ts` (`searchClinicalEvidence`) covers spec §11 Tier 3 (PubMed abstracts + PMC Open Access full text) end to end, including retraction/study-design signals.
- **Dual-provenance citation UI pattern** — `apps/desktop/src/chat/components/message/tool/search-clinical-evidence.tsx` and `search-encounter-transcript.tsx` (built via `defineTool()`) are the exact card-based "From your visit" / "Medical sources" rendering spec §3/§10/§25 describe. Reused directly for this pass's new tool.
- **BAA/PHI routing, local-first transcription, audit logging** — same infrastructure, product-agnostic.

## Net-new (not built this pass, documented for follow-up)

- **Tier 1 patient-friendly sources** (spec §11: MedlinePlus/NIH, FDA, DailyMed, CDC) — the evidence engine only has PubMed/PMC today. A patient asking "what is a D-dimer" gets a primary-literature abstract, not a plain-English definition. This is the single highest-leverage gap for the patient product specifically.
- **Visit summary screen** (spec §3) — a patient-framed view ("What brought you in" / "What you discussed" / "Your next steps" / "Things worth remembering") distinct from the clinician's `EnhancedEditor` note. Needs its own component.
- **Actionable next-steps extraction** (spec §19) — conceptually the same unbuilt gap flagged in the clinician audit doc (`reconcileEncounterEvidence()` has zero callers). A patient-side extractor would produce a similar but differently-typed structure (medication changes, labs, referrals, warning signs) rather than clinical facts.
- **Inline hover-to-explain UI** (spec §4/§18) — highlighting a term like "D-dimer" directly in rendered text and showing an inline popover. This requires ProseMirror decoration work on the patient summary view once that view exists. Out of scope until the visit summary screen exists to hover _over_.
- **Query router / retrieval planner** (spec §6/§24) — same gap flagged in the clinician audit; not built for either product yet.
- **Safety-boundary language enforcement** (spec §16/§17: never "you have X," only "X was discussed/considered") — belongs in the synthesis/system-prompt layer once a synthesis service exists; not enforceable in a pure retrieval function.

## This pass builds

**`explain_medical_term`** — the retrieval half of spec §4's "Understand This" interaction, reachable today through the existing chat surface (not yet through an inline hover, since there's no patient summary view to hover over). Given a term and a session, it returns:

```json
{
  "term": "D-dimer",
  "encounter_sources": [{ "segment_id", "speaker", "start_ms", "end_ms", "text" }],
  "medical_sources": [{ "pmid", "doi", "title", "journal", "excerpt", "source_url" }]
}
```

This is the same dual-provenance shape as spec §25, reusing `retrieveEncounterSegments` for "why did this come up in my visit" and `searchClinicalEvidence` for "what does this mean medically" — no new retrieval logic, just a thin combining layer plus a new chat tool and citation-card UI so both source types render together for one query, which neither existing tool does alone. This is a deliberately small, retrieval-only slice: it does not generate the plain-English explanation itself (that's an LLM synthesis step reading these sources, same as any other chat tool result) and it does not yet ship the medication-hover UI.

## Explicit non-goals for this pass

- No Tier-1 source ingestion (MedlinePlus/NIH/FDA/CDC) — separate, meaningful scope (new fetch/parse/store pipeline per source, licensing review per spec §11's own caveat).
- No visit summary screen, no hover UI, no next-steps extractor, no query router, no safety-language guardrails layer. Each is real, separate work.
