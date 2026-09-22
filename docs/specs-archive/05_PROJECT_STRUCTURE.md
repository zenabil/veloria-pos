# 05 — Target Project Structure

```text
veloria-pos/
├─ README.md
├─ AGENTS.md
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ electron-builder.yml
├─ .editorconfig
├─ .gitignore
├─ .npmrc
│
├─ docs/
│  ├─ 00_START_HERE.md
│  ├─ 01_PROJECT_VISION_AND_SCOPE.md
│  ├─ ...
│  └─ 19_AGENT_EXECUTION_RULES.md
│
├─ src/
│  ├─ app/
│  │  ├─ shell/
│  │  ├─ routes/
│  │  ├─ providers/
│  │  └─ styles/
│  │
│  ├─ features/
│  │  ├─ dashboard/
│  │  ├─ sales/
│  │  ├─ products/
│  │  ├─ customers/
│  │  ├─ inventory/
│  │  ├─ suppliers/
│  │  ├─ payments/
│  │  ├─ returns/
│  │  ├─ proformas/
│  │  ├─ expenses/
│  │  ├─ bread/
│  │  ├─ reports/
│  │  ├─ zakat/
│  │  ├─ company-profile/
│  │  ├─ settings/
│  │  └─ data-management/
│  │
│  ├─ domain/
│  │  ├─ common/
│  │  ├─ money/
│  │  ├─ product/
│  │  ├─ customer/
│  │  ├─ sales/
│  │  ├─ inventory/
│  │  ├─ supplier/
│  │  ├─ payment/
│  │  ├─ returns/
│  │  ├─ expenses/
│  │  ├─ bread/
│  │  └─ finance/
│  │
│  ├─ application/
│  │  ├─ sales/
│  │  ├─ products/
│  │  ├─ customers/
│  │  ├─ inventory/
│  │  ├─ suppliers/
│  │  ├─ payments/
│  │  ├─ returns/
│  │  ├─ proformas/
│  │  ├─ expenses/
│  │  ├─ bread/
│  │  ├─ reports/
│  │  └─ settings/
│  │
│  ├─ ports/
│  │  ├─ repositories/
│  │  ├─ printing/
│  │  ├─ backup/
│  │  ├─ clock/
│  │  └─ ids/
│  │
│  ├─ infrastructure/
│  │  ├─ persistence/
│  │  │  ├─ sqlite/
│  │  │  │  ├─ client/
│  │  │  │  ├─ migrations/
│  │  │  │  ├─ repositories/
│  │  │  │  ├─ transaction/
│  │  │  │  └─ queries/
│  │  ├─ backup/
│  │  ├─ printing/
│  │  ├─ imports/
│  │  ├─ ocr/
│  │  └─ diagnostics/
│  │
│  ├─ shared/
│  │  ├─ ui/
│  │  ├─ formatters/
│  │  ├─ validation/
│  │  ├─ dates/
│  │  └─ types/
│  │
│  └─ styles/
│
├─ electron/
│  ├─ main/
│  │  ├─ main.ts
│  │  ├─ app-lifecycle.ts
│  │  ├─ window-manager.ts
│  │  └─ crash-recovery.ts
│  ├─ preload/
│  │  ├─ preload.ts
│  │  └─ api-types.ts
│  ├─ ipc/
│  │  ├─ registry.ts
│  │  ├─ channels.ts
│  │  ├─ validators.ts
│  │  └─ handlers/
│  ├─ database/
│  │  ├─ sqlite.service.ts
│  │  ├─ database-path.service.ts
│  │  └─ migrations/
│  ├─ printing/
│  ├─ hardware/
│  ├─ backup/
│  ├─ filesystem/
│  └─ security/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  ├─ electron/
│  ├─ database/
│  └─ fixtures/
│
├─ scripts/
│  ├─ build/
│  ├─ quality/
│  ├─ release/
│  └─ database/
│
└─ public/
   ├─ icons/
   └─ branding/
```

## Structure rules

- Feature code owns feature UI and feature-specific presentation.
- Domain code is framework-free.
- Application code expresses use cases, not generic service dumping grounds.
- Infrastructure contains implementations of ports.
- Electron contains OS/process/native concerns.
- Shared is only for genuinely cross-feature code.
- Do not create `utils.ts` files that become dumping grounds; split by responsibility.
- Do not create a top-level `services/` folder for arbitrary business logic.
