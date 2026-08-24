# Review — UI-plan Task 3 (PhoneOperate / VisualAgentTools / ModelConfig / Privacy Facades)

Base: `14f687efda5e08b43c6beaf4560f1dc1107856f1` · Head: `c6d890e`
Diff: `review-w3-t3.diff` (5 new files, 296 insertions, 0 deletions/modifications)

## Spec check

- **Files**: exactly the 5 listed files created (4 facades + `CapabilityFacades.test.ts`); no other files touched. PASS.
- **Four Default* facades only, no OpenClawFacade**: `DefaultPhoneOperateFacade`, `DefaultVisualAgentToolsFacade`, `DefaultModelConfigFacade`, `DefaultPrivacyFacade` — exactly these four, each `implements` the matching frozen `*Facade` interface with no extra/missing methods. No `OpenClawFacade`. PASS.
- **Import UiRuntimeContracts ports only**: all four facades import types/ports exclusively from `./UiRuntimeContracts`, plus type-only `AgentModeId`/`ModelListKey` from `shared/types/Model` (required because `UiRuntimeContracts` does not re-export those aliases, yet its own port/facade signatures reference them). Forbidden-import scan (`AsyncStorage|ModelService|NonoConfigService|providers/|react-native`) confirmed clean by report; diff shows no such imports. PASS.
- **No port/ViewState redeclaration**: none of the four files redeclare or extend a port/ViewState type; all typed via `import type {...} from './UiRuntimeContracts'`. PASS.
- **`PhoneOperateFacade.activateDraftMode`**: reads state first, throws `config_revision_conflict` on revision mismatch, throws the draft option's first blocker code (fallback `phone_operate_disabled`) when not runnable, only calls `port.activate(draftMode, expectedRevision)` on the runnable path. Matches brief Step 3 exactly; test 1 verifies `port.activate` is never called on the fail-closed path. PASS.
- **`VisualAgentToolsFacade`**: pure 1:1 delegation to the port for all 6 methods, forwarding `expectedRevision` on every mutation (no last-write-wins). The elaborate adapter/profile projection, five-built-ins, capability-negotiation, and `canOperate` rules in the brief are properties the *Application Port implementation* must satisfy (frozen/owned elsewhere per Task 1 + wave-3 context: "Consumes ... 不得在 worker 文件中复制或扩展签名"); this task's facade correctly does not recompute or duplicate that logic — test 2 confirms `getViewState()` is a verbatim pass-through of an already-computed state. PASS (in-scope).
- **`saveProfile`**: forwards `VisualAgentProfileDraftInput` + `expectedRevision` straight to `port.saveProfile`; no plaintext is stored, logged, or reflected outside the port's own response. Test 3 confirms no plaintext leak in the returned ViewState. PASS.
- **`ModelConfigFacade` staleness**: maintains latest `requestGeneration` per `{list, bindingId}` key; if a newer generation has started by the time a fetch resolves, forces `{status:'stale', models:[]}` with the request's own generation instead of letting a stale response overwrite a newer selection. Test 4 (out-of-order resolution: gen 2 resolves before gen 1) passes exactly as specified. Credential plaintext only flows into `port.fetchCatalog`, never into a returned ViewState. PASS.
- **`PrivacyFacade`**: no static copy generated; `setMemoryLocation('visual_agent')` reads state first and throws `visual_agent_not_ready` when `canUseVisualAgentMemory === false`; `device` and other calls delegate directly. PASS.
- **No hotspot edits**: diff is purely additive (new files only), no existing file modified. PASS.

**Spec: PASS**

## Quality check

- Guard errors (`PhoneOperateGuardError`, `PrivacyGuardError`) are simple `Error` subclasses whose `message` equals the stable blocker code — consistent with existing UI blocker-code conventions, ref-free, no shared error module needed for this scope.
- Test-snippet deviation is honestly disclosed: the brief's literal test omitted the required `baseUrlOverride` field on `ModelCatalogRefreshInput`'s `preset` variant; the report adds `baseUrlOverride: null` to both `refreshCatalog` calls to satisfy the frozen contract's type — a minimal, behavior-preserving fix, correctly flagged as a possible brief/contract discrepancy rather than silently "fixed."
- `DefaultModelConfigFacade.latestGeneration` is an unbounded `Map` keyed by `{list}::{bindingId}` that is never evicted for the lifetime of the facade instance. Not a spec violation (key space is small — one or two model lists times a handful of bindings) but worth noting as a minor long-lived-instance concern.
- Code is minimal, surgical, and matches the "thin translation/guard layer" intent — no speculative abstractions, no unrelated refactors.

**Quality: Approved**

## Findings

- Critical: none.
- Important: none.
- Minor: `DefaultModelConfigFacade.latestGeneration` map has no eviction/cleanup path; benign given expected key cardinality, but flagging for awareness if the facade instance is long-lived and `bindingId` cardinality grows.

⚠️ None — no blocking concerns. One disclosed, justified test-only deviation (`baseUrlOverride: null` added to satisfy the frozen `ModelCatalogRefreshInput` type) worth a quick sanity confirmation from the brief author that `baseUrlOverride` is intentionally required, not an oversight in the contract.
