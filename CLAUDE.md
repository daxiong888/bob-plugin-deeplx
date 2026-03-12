# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bob (macOS translation app) plugin that uses DeepLX as the translation backend. Pure JavaScript, no build tools or npm dependencies. Runs inside Bob's sandboxed plugin environment which provides `$http`, `$option`, and `$log` APIs.

## Commands

```bash
# Syntax check
node --check src/main.js

# Run all tests
node --test tests/main.test.js

# AI integration test (requires OpenRouter API key)
OPENROUTER_KEY=sk-or-... node tests/ai-integration.js

# Build .bobplugin (zip of src/)
zip -r -j bob-plugin-deeplx.bobplugin src/*
```

No package.json, no linter, no formatter configured.

## Architecture

### Runtime Environment

Bob plugins use **CommonJS modules** (`require`/`exports`) and must be **ES5-compatible** — no ES modules, no import/export syntax. Bob injects globals: `$http.request()` for HTTP, `$option.url` / `$option.token` etc. for user config, `$log` for logging.

### Source Files

- **`src/main.js`** — All plugin logic. Exports four Bob-required functions (`supportLanguages`, `translate`, `pluginTimeoutInterval`, `pluginValidate`) plus a `__test__` object exposing internal helpers for unit testing.
- **`src/lang.js`** — Language code mappings between Bob standard codes and DeepL codes. Exports `supportedLanguages` (pairs array), `langMap`, `langMapReverse`.
- **`src/info.json`** — Plugin metadata and configuration schema (options shown to users in Bob's UI).

### Test Files

- **`tests/main.test.js`** — Unit tests for `__test__` exported helpers using Node.js native test runner.
- **`tests/ai-integration.js`** — Integration test that calls OpenRouter API with both AI modes. Requires `OPENROUTER_KEY` env var.

### Key Design Patterns

**Multi-endpoint failover**: `translate()` parses comma/newline-separated URLs from config, tries each sequentially with per-endpoint timeout, collects errors, returns first success or aggregated failure.

**Smart paragraph mode** (`buildParagraphs`): Merges OCR-broken lines while preserving structural content — lists, code fences, URLs, command lines. The `format` mode preserves original line breaks verbatim.

**AI post-processing** (`aiPostEdit`): Optional OpenRouter API call after DeepLX translation. Two modes: `auto` (Translation Polish — fix mistranslations and unnatural phrasing with minimal changes), `polish` (Full Refine — deeper rewrite for native-level quality). Both modes automatically handle OCR line-break fixing. Short text (≤20 chars) skips AI. Failures are non-fatal — original translation is returned.

**Testing via `__test__` export**: Internal helpers are exposed through `module.exports.__test__` so tests can call them directly without mocking Bob globals.

### Translation Flow

`translate(query, completion)` → parse endpoints → try each endpoint via `$http.request()` → on success, optionally call OpenRouter for AI post-processing → apply `buildParagraphs()` formatting → deduplicate alternatives → call `completion({result})` or `completion({error})`.

## Release Process

Releases are automated via GitHub Actions on `v*` tags. The workflow runs `release.sh` which zips `src/*` into a `.bobplugin` file, computes SHA256, and updates `appcast.json`.
