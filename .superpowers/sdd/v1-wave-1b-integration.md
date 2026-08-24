# V1 Wave 1B Integration (in progress)

- Base: `codex/checkpoint-v1-wave1a` = `b10515b49d2f12c72859d4b1e025f715425ecbd1`
- Cherry-picked:
  - config/catalog `344fb26` + `49479a2`
  - sessions `fc45daa`
  - runner `97739e7`
- Targeted gates (2026-08-21): model 37, config 23, visualAgent 32, session 36, runner 33, all PASS; `tsc --noEmit` exit 0
- Remaining coordinator serial work: CredentialReferenceGarbageCollector, Tasks 8–10 hotspot adapters, Task 11 foundation gate, then `codex/checkpoint-v1-wave1`
