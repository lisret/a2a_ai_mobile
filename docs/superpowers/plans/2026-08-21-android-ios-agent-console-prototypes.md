# Android / iOS Agent Console Prototypes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the root interaction prototype into explicit Android and iOS variants and replace the OpenClaw-specific capability with a provider-neutral Agent console supporting OpenClaw and DSH.

**Architecture:** Keep `nono-app-prototype.html` as the Android source of truth, then create a standalone iOS derivative. Both remain single-file offline HTML prototypes; the iOS derivative changes only product semantics and demo state, not application runtime code.

**Tech Stack:** HTML, CSS, vanilla JavaScript, static shell assertions.

## Global Constraints

- Do not modify React Native, Android native, or iOS native runtime code.
- Keep both prototypes standalone and offline.
- Preserve the established Pearl Orbit visual language and navigation.
- Agent console must show OpenClaw and DSH without making either the capability name.

---

### Task 1: Android prototype identity and Agent console

**Files:**
- Modify: `nono-app-prototype.html`

**Interfaces:**
- Consumes: Existing prototype state, routes, capability cards, and settings UI.
- Produces: Android-labelled prototype with provider-neutral Agent console state and OpenClaw/DSH selection.

- [x] **Step 1: Run static assertions and verify they fail before implementation**

Run: `rg -q '<title>NoNo Android 全应用交互原型</title>' nono-app-prototype.html && rg -q 'Agent 控制台' nono-app-prototype.html && rg -q 'DSH' nono-app-prototype.html`

Expected: nonzero exit before the feature exists.

- [x] **Step 2: Apply the minimal Android prototype changes**

Change the document identity, generic capability state, provider selector, routing, privacy copy, and settings labels while retaining Android-only execution capabilities.

- [x] **Step 3: Verify Android assertions pass**

Run: `rg -q '<title>NoNo Android 全应用交互原型</title>' nono-app-prototype.html && rg -q 'Agent 控制台' nono-app-prototype.html && rg -q 'OpenClaw' nono-app-prototype.html && rg -q 'DSH' nono-app-prototype.html`

Expected: exit 0.

### Task 2: Standalone iOS prototype

**Files:**
- Create: `nono-app-prototype-ios.html`

**Interfaces:**
- Consumes: The completed Android prototype structure and visual system.
- Produces: Standalone App Store-compatible iOS product prototype.

- [x] **Step 1: Verify the iOS prototype assertion fails before creation**

Run: `rg -q '<title>NoNo iOS 全应用交互原型</title>' nono-app-prototype-ios.html`

Expected: nonzero exit because the file is absent.

- [x] **Step 2: Create the iOS derivative and change platform semantics**

Retain companion, model, memory, errand, activity, privacy, and Agent console flows. Replace phone operation and overlay claims with system actions, shared content, notifications, Live Activities, and remote Agent execution.

- [x] **Step 3: Verify iOS product-boundary assertions pass**

Run: `rg -q '<title>NoNo iOS 全应用交互原型</title>' nono-app-prototype-ios.html && rg -q 'Agent 控制台' nono-app-prototype-ios.html && rg -q 'OpenClaw' nono-app-prototype-ios.html && rg -q 'DSH' nono-app-prototype-ios.html && ! rg -q 'ADB 兜底|无障碍服务|在其他应用上显示 NoNo 任务球' nono-app-prototype-ios.html`

Expected: exit 0.

### Task 3: Visual and syntax verification

**Files:**
- Verify: `nono-app-prototype.html`
- Verify: `nono-app-prototype-ios.html`

**Interfaces:**
- Consumes: Both completed prototypes.
- Produces: Evidence that both prototypes parse, render, navigate, and expose the requested platform differences.

- [x] **Step 1: Parse embedded JavaScript**

Extract the final inline script from each file and run `node --check` on the extracted temporary files.

Expected: both commands exit 0.

- [x] **Step 2: Render both prototypes in a browser**

Open each file, exercise Home → Capabilities → Agent Console → Settings, switch OpenClaw/DSH, and inspect the platform-specific execution copy.

Expected: no blank screens or console syntax errors; Android retains Android execution controls and iOS shows only public-platform alternatives.

- [x] **Step 3: Review the final diff**

Run: `git diff --check && git diff -- nono-app-prototype.html nono-app-prototype-ios.html`

Expected: no whitespace errors and only prototype-scoped changes.
