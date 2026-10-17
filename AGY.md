# @ostro/installer — Antigravity AI Architecture & Knowledge Base

> **Package Name**: `@ostro/installer`
> **Version**: `2.0.0-alpha.1`
> **Role in Ecosystem**: Modular Core Framework Library

---

## 1. Package Purpose & Overview
Ostro CLI tool to scaffold new full-featured OstroJS web applications.

- **Primary Architectural Patterns**: CLI scaffolding, git clone / template extraction.
- **Key Exported Entities**: `NewCommand`

---

## 2. Dependencies & Interoperability
- **Direct Dependencies**:
  - `@ostro/console`: `^1.0.5`
  - `@ostro/support`: `^1.2.1`
- **Framework Consumers**: Consumed across the OstroJS ecosystem via `@ostro/framework` and direct imports.

---

## 3. Directory & Source Layout
```text
origin/installer/
├── index.ts
├── newCommand.ts
```

---

## 4. TypeScript Typing & Code Standards
1. **Access Modifiers**: All class properties and methods declare explicit visibility (`public`, `protected`, `private`).
2. **Inheritance & Overrides**: Classes overriding base class methods use the `override` keyword to safeguard contracts.
3. **Immutability**: Constant lookup tables and static registries use `readonly` and strict record types.
4. **No Implicit Any**: Public APIs avoid `any` in favor of generics (`<T = unknown>`) and typed contracts from `@ostro/contracts`.
5. **Contract Binding**: Core managers implement contracts from `@ostro/contracts/installer/*`.

---

## 5. Development & Verification Guide
- **Compile / Build**: `npm run build` (runs `npx tsc -p tsconfig.build.json && chmod +x build/index.js`)
- **Run Tests**: `npm test` (executes Jest with 100% coverage target via `c8`)
- **Published Artifacts**: Target output compiled to `./build` with accompanying `.d.ts` declarations and source maps.

---
*Generated for Antigravity AI high-speed codebase comprehension with minimal token consumption.*
