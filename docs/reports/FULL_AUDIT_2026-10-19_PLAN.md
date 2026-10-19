# خطة الإصلاح الجذرية — Veloria PoS (2026-10-19)

> مشتقّة من `docs/reports/FULL_AUDIT_2026-10-19.md` (228 finding، 23 High).
> **لا شيء في هذه الخطة مُنفَّذ.** كل موجة تُنفَّذ في جلسة منفصلة **بموافقة
> صريحة**، وتُنتج **commit واحد** + بوابات خضراء + ADR عند الحاجة + تحديث
> `handoff.md`.
>
> **قاعدة الخطة**: لا تُدمج موجتان في commit واحد · لا تُخلط ورشة مع ورشة ·
> كل migration جديدة = **ملف مرقّم جديد** (لا تعديل على ملف مطبَّق).

---

## 0. المبدأ

| القاعدة                                            | التطبيق العملي                                                                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **موجة = commit مستقل**                            | `fix(scope): …` واحد لكل موجة؛ لا `git add -A` (الألوان §10)                                                                                                                                                                             |
| **بوابات خضراء قبل وبعد**                          | `typecheck` · `typecheck:electron` · `typecheck:manager` · `lint` · `test` · `test:db` · `verify:migrations` · `verify:domain` · `verify:perf` · `license:scan` · `format:check` · `build` + `build:electron` · `test:coverage` (بعد W4) |
| **المال يُلمس فقط مع اختبار**                      | أي تغيير في حساب مبلغ أو في مسار mutation ⇒ اختبار انحدار إلزامي في نفس الموجة                                                                                                                                                           |
| **بلا حذف قبل المراجعة**                           | ADR-075: لا حذف/تعطيل في نفس الـ commit الذي يكتشف الـ finding. lot جديد = commit جديد بموافقة                                                                                                                                           |
| **الـ contracts المجمّدة تُفكّ في نفس الـ commit** | `FROZEN_SCHEMA_COUNT` · `ipc-channels.json` · `bridge-shape` snapshot ⇒ أي تغيير في الأرقام = تحديث الرقم + سطر في ADR + سطر في `handoff.md`                                                                                             |
| **كل موجة تُغلق بابًا**                            | يُقاس: كم «بابًا مفتوحًا» (حارسًا خاملًا / قناة بلا بوابة / استعلام بلا فهرس) أضافت الإغلاق                                                                                                                                              |

**قاعدة P0 لـ Veloria** (ممنوع التأجيل): مسار كتابة مال بلا transaction واحدة أو
بلا `operationId` · float في حساب مبلغ · قناة IPC حسّاسة بلا Zod أو بلا بوابة ·
تعديل على migration مطبَّقة · `contextIsolation=false` / `nodeIntegration=true` ·
`dangerouslySetInnerHTML` بمحتوى غير مموَّه · كود ميت في مسار نقدي بلا قرار.

**⇒ نتيجة التدقيق: صفر P0. 23 High موزّعة على الموجات W1…W4.**

---

## 1. خريطة التبعيات (Wave ← يعتمد على)

```
                ┌──────────────────────┐
                │  W0  تحضير إلزامي     │  (الشجرة، baselines، قرارات المالك)
                └──────────┬───────────┘
           ┌───────────────┼────────────────┬──────────────────┐
           ▼               ▼                ▼                  ▼
   ┌───────────────┐ ┌─────────────┐  ┌─────────────┐   ┌──────────────┐
   │ W1 المال      │ │ W2 الأمن    │  │ W3 قاعدة    │   │ W4 التغطية   │
   │ والمنطق المالي│ │ وRBAC/IPC   │  │ البيانات    │   │ والاختبارات  │
   │  (E-20..E-27) │ │ (K,G-13..)  │  │ (E-21,E-28, │   │ (I-01..I-05) │
   └───────┬───────┘ └──────┬──────┘  │  G-22/23)   │   └──────┬───────┘
           │                │         └──────┬──────┘          │
           │                │                │                 │
           └────────┬───────┴────────────────┴─────────────────┘
                    ▼
        ┌───────────────────────────┐
        │ W5 التصيير وواجهة الكاشيء │  (A-01, A-02, A-03, A-06..A-08)
        └────────────┬──────────────┘
                     ▼
        ┌───────────────────────────┐   ┌────────────────────┐
        │ W6 الكود الميت (ADR-075)  │   │ W7 التكرار والمعمارية│
        └────────────┬──────────────┘   └─────────┬──────────┘
                     ▼                            ▼
              ┌────────────────────┐   ┌────────────────────┐
              │ W8 الأداء والفهارس  │   │ W9 التوثيق والنظافة  │
              └─────────┬──────────┘   └─────────┬──────────┘
                        ▼                        ▼
              ┌────────────────────────────────────────┐
              │ W10 UX/a11y/الحالات + نقاء WAVES       │
              └────────────────────────────────────────┘
```

**لماذا هذا الترتيب**:

- **W0** أولًا: الشجرة غير نظيفة (ورشة impression) ⇒ كل موجة تالية تحتاج شجرة
  نظيفة تُعتمد عليها.
- **W1** (المال) قبل **W3** (المهاجرات):=E-21 يقفل الفترة يحتاج مهجرة 0048؛
  و=E-23 (avoir) قد يحتاج عمودًا جديدًا ⇒ **كل المهاجرات تُجمَّع في W3** بعد
  تثبيت منطق المال في W1 (وإلا استُعملت 0048/0049 على فرضية خاطئة).
- **W2** (الأمن) قبل **W4** (التغطية): الـ guard tests الجديدة (RBC) يجب أن
  تُكتب على السلوك المُصلَح لا على السلوك المكسور.
- **W4** (التغطية) بعد W1…W3: `test:coverage` يجب أن يمرّ على **الكود المُصلَح**.
- **W5** (التصيير) بعد W1: `formatDzd` المُصلَح يعتمد على اختيار
  `formatDzdSafe`-vs-`formatDzdStrict` الذي يقرره W1 (قاعدة المال).
- **W6** (الكود الميت) بعد W5: بعض الرموز الميتة (24 إعادة-تصدير) تصبح
  مرشّحة للحذف فقط بعد تثبيت الواجهة.
- **W7…W10** متوازية نسبيًا (لا تعتمد على بعضها) ⇒ يمكن تنفيذ أكثر من واحدة
  في نفس الجلسة **بشرط commits منفصلة**.

---

## 2. الموجات

### الموجة W0 — تحضير إلزامي (الشجرة + الـ baseline + قرارات المالك) | P1 | ~1h | files: 0

- **الهدف**: شجرة نظيفة + خط أساس متّفق عليه + القرارات المنتجية المحجوزة.
- **النطاق** (لا تعديل كود):
  - `docs/reports/maintenance/audit-raw/` (احذف من الشجرة أو أضِفه إلى `.gitignore`)
  - `handoff.md` (تحديث §1 + قسم جلسة)
  - `docs/reports/FULL_AUDIT_2026-10-19.md` + `..._PLAN.md` (commit `docs(audit)`)
  - `docs/INDEX.md` (إضافة رابط التقرير)
- **الخطوات**:
  1. `git status --short` ⇒ تأكيد أنّ ورشة impression **لم تُمَسّ**.
  2. **قرار المالك**: `commit` ورشة impression أو `stash` (§4 Q5).
  3. تثبيت خط الأساس في `handoff.md` §1: `typecheck` 0 · `lint` 0 · `test`
     121 ملف/804 · `test:db` 0 (معزولًا) · `verify:*` VERIFIED · `build` +
     `build:electron` ✓ (214 ملفات) · **`test:coverage` = 1 (أحمر)** ·
     `vitest` 121 ملف · E2E 13 spec / 37 test.
  4. `docs/INDEX.md`: إضافة رابط التقريرين.
- **المخاطر + التخفيف**: الـ commit might sweep the impression workshop ⇒
  **staging بمسارات صريحة فقط** (`git add docs/... handoff.md`).
- **الـ Gates قبل/بعد**: لا تغيير كود ⇒ نفس الـ baseline.
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: لا شيء.

### الموجة W1 — منطق الأعمال المالية (7 High) | P1 | ~1–2 يوم | files: ~14

- **الهدف**: تصحيح 7 عيوب High في منطق المال/المخزون/الزكاة **دون لمس
  البنية** (لا migration في هذه الموجة).
- **النطاق** (مسارات صريحة):
  - `electron/ipc/handlers/proformas.repo.ts` (E-20)
  - `electron/ipc/handlers/finance.repo.ts` (E-22، E-35 جزئيًا)
  - `electron/ipc/handlers/returns.repo.ts` (E-23، E-24)
  - `electron/ipc/handlers/products.repo.ts` (E-26)
  - `electron/ipc/handlers/inventory.repo.ts` (E-27)
  - `electron/ipc/handlers/sales.repo.ts` (E-25 جزئيًا: `sales.cancel` يعكس الدفعة)
  - `src/domain/returns/return-policy.ts` · `src/domain/zakat/zakat-rules.ts`
  - `tests/integration/proforma-convert-discount.test.ts` (جديد)
  - `tests/integration/closing-z-formula.test.ts` (جديد)
  - `tests/integration/return-avoir-above-balance.test.ts` (جديد)
  - `tests/integration/stock-movement-journal.test.ts` (جديد)
- **الخطوات**:
  1. **E-20** — `proformas.repo.ts:500`: `discountType: "none"` دائمًا +
     توزيع `discount` على أسطر الـ proforma قبل `createSaleAtomic`.
     _اختبار_: proforma remise → conversion ⇒ البيع يُنشأ، `discount_amount_minor` مطابق.
  2. **E-22** — `finance.repo.ts:216-233`: `AND payment_method = 'cash'` ·
     `AND status = 'paid'` (expenses) · `AND status != 'cancelled'` (returns).
     _اختبار_: يوم فيه بيع شيك + بيع نقدي + مصروف pending + مرتجع ملغى.
  3. **E-23** — `returns.repo.ts:338-352`: `Math.min(creditMinor, outstanding)` +
     حفظ الفرق كـ avoir en cours (**يتطلّب عمودًا ⇒ يُنقل إلى W3**) أو رفض FR
     صريح **قبل** الـ UPDATE. ⇒ **قرار: نفّذ «رفض FR صريح» الآن، وعمود
     «avoir en cours» يُنشأ في W3 إن أراد المالك** (انظر §4 Q6).
  4. **E-24** — **قرار مطلوب** (§4 Q7): مصدر واحد للحقيقة للدَّين.
     الافتراضي المقترح: إعادة حساب `sales.remaining_balance_minor` عند المرتجع
     (يبقي العمود المادي مطابقًا) + محاذاة الاستعلامات الخمسة.
  5. **E-26** — `products.repo.ts:288-338`: تمرير تغيير الكمية عبر
     `adjustStockAtomic` (سطر `stock_movements` + `reason` + `operationId`).
  6. **E-25** (جزء `sales.cancel`) — `sales.repo.ts:614-626`: إمّا عكس سطر
     `sale_payments`، أو **تصحيح نصّ الواجهة** `sell-finalize.ts:283` ليقول
     الحقيقة. (قناة `payments.cancel` الجديدة ⇒ W2 أو W3 لأنّها تلمس الـ contracts.)
  7. **E-27** — `inventory.repo.ts:288-306`: `landing_cost_minor` = تكلفة
     موزَّعة على الأتعاب (توزيع محسوب في main، **لا** في renderer) + تحديث
     `IntakeDialog.tsx` لإرسال `landingCostMinor`.
  8. **E-34** — `src/domain/money/money.ts:118,131-139`: تصحيح التقريب
     (سنتيم واحد على مدخل 3 كسور).
  9. **E-36 (جزئي)** — `scripts/quality/verify-domain.ts`: استيراد
     `computeZakat` من `@domain/zakat/zakat-rules.ts` بدل إعادة حسابها inline
     - **تصحيح التعليق الكاذب** `:13-16`.
- **المخاطر + التخفيف**:
  - تغيير معادلة الإغلاق Z يغيّر **أرقامًا تاريخية** ⇒ إصلاح مُعلن + ADR
    «formule de clôture Z corrigée» + تحديث `tests/unit/closing-rules.test.ts`.
  - E-24 تغيير في دلالة «الدَّين» ⇒ قد يغيّر شاشات Dettes/Dashboard/Reports ⇒
    اختبار parité جديد يثبّت الأرقام.
- **الـ Gates قبل/بعد**: كل البوابات + `test:coverage` (يُتوقّع أن يظلّ أحمرًا
  حتى W4 ⇒ **لا يُعتبر فشلًا في W1** إن كان العدد ≤ 18؛ يُسجَّل).
- **اختبارات الانحدار**: 4 ملفات اختبار جديدة (أعلاه) + تعديل
  `tests/unit/closing-rules.test.ts`.
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W0.

### الموجة W2 — الأمن وRBAC وعقود IPC | P1 | ~1.5 يوم | files: ~12

- **الهدف**: إغلاق الأبواب المفتوحة (5 High + 9 Medium) فيWoRBAC/IPC/الترخيص.
- **النطاق**:
  - `electron/ipc/staff-gates.ts` (K-01: `customers.accessQrSvg` ⇒ `debts`)
  - `electron/ipc/registry.finance.ts` · `electron/ipc/registry.sales.ts`
    (K-04: `staffScope()` fail-closed)
  - `electron/ipc/registry.system.ts` (K-05: بوابة `database.optimize`)
  - `electron/ipc/raw-guards.ts` (A-09: قفل `must_change_code` على القنوات الخام)
  - `electron/ipc/handle.ts` (A-09: نفس المنطق في المسار الخام)
  - `electron/ipc/validators.print.ts` (A-11: `operationId` لـ `backup.restore`)
  - `electron/ipc/validators.finance.ts` (A-10: `operationId` إلزامي لـ `expenses.delete`)
  - `electron/ipc/validators.settings.ts` (A-13: `operationId` إلزامي لـ `database.relocate`)
  - `electron/ipc/ipc-errors.ts` (A-04: fall-through ⇒ رسالة FR عامة)
  - `src/shared/errors/fr-map.ts` (A-05: denylist ⇒ allowlist)
  - `electron/ipc/validators.catalog.ts` + `electron/services/logo.ts`
    (A-17: `logo_path` داخل `<userData>/logos` فقط)
  - `license-manager/main/window-manager.ts` (K-02: حارس `!app.isPackaged` +
    `will-redirect` + حارس webview)
  - `electron/licensing/public-key.ts` + `scripts/licensing/keygen.mjs` (G-14)
  - `license-manager/ipc/validators.ts` (G-15: `isRealCalendarDate`)
- **الخطوات** (بالترتيب):
  1. **K-01** (سطر واحد، أعلى قيمة/جهد): `staff-gates.ts` — إضافة
     `customers.accessQrSvg` ⇒ `debts`. _اختبار_: بلا جلسة ⇒ `STAFF_SESSION_REQUIRED`.
  2. **K-04**: `staffScope()` —Fail-closed: `null` ⇐ فقط لمدير مُصادَق؛ بلا جلسة
     ⇒ رفض أو نطاق فارغ. يُطبَّق على `history.*` · `sales.history` ·
     `dashboard.summary` · `reports.summary`.
  3. **K-05**: `database.optimize` ⇒ `settings` في `staff-gates.ts` + `settings`
     في `license-gates.ts` (PAGE) ⇒ يحاكي `database.reset`.
  4. **A-09**: `raw-guards.ts` — نفس منطق `must_change_code` + allowlist.
  5. **A-10 / A-11 / A-13**: `operationId` إلزامي في 3 مخططات ⇒ **تغيير
     `FROZEN_SCHEMA_COUNT`** (113 → 113، نفس العدد إن كان `optionalOperationId`
     ⇐ `z.string().uuid()` بلا تغيير في عدد المخططات) — انظر §16 «فكّ القفل».
  6. **A-04 / A-05**: messages FR افتراضية بدل pass-through.
  7. **A-17**: `logo_path` محصور في `<userData>/logos`.
  8. **K-02**: `license-manager/main/window-manager.ts` — نسخ حارس الـ POS.
  9. **G-15**: `license-manager/ipc/validators.ts` — `isRealCalendarDate`.
  10. **G-14**: قائمة مفاتيح عامة (keyring) + توصيل `verify:licensing` بالـ CI.
- **المخاطر + التخفيف**:
  - **K-04 قد يكسر قراءات المبيعات في POS**: يجب اختبار كل شاشة قبل/بعد
    (قاعدة «القراءة تُفلتر بالمؤلف» في `history.repo.ts:73-77`).
  - تغيير `operationId` إلزامي ⇒ **RPC قديم يتوقف** ⇒ إصلاح fail-closed مقبول
    (المستخدم يعيد العملية) + رسالة FR واضحة.
- **الـ Gates**: كل البوابات + `test:coverage` + **E2E `staff-session.spec.ts`**
  و`full-loop-client` (يتأثّران بـ K-04).
- **اختبارات الانحدار**: `tests/unit/staff-gates-matrix.test.ts` (جديد — مصفوفة
  canal×rôle) + `tests/unit/rbac-read-fail-closed.test.ts` (جديد).
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W0. (W1 مستقلة.)

### الموجة W3 — قاعدة البيانات والمهاجرات | P1 | ~1.5 يوم | files: ~10 + 3 SQL

- **الهدف**: سلامة الفترة المغلقة، تفرّد الهاتف، وتغطية المهاجرات 0045→0047.
- **النطاق**:
  - `database/migrations/0048_closing_period_lock.sql` (**جديد**)
  - `database/migrations/0049_customers_phone_unique.sql` (**جديد**)
  - `database/migrations/0050_*.sql` (**جديد** — فقط إن批准 E-24/E-23)
  - `electron/ipc/handlers/finance.repo.ts` (E-21: استدعاء الـ trigger)
  - `electron/ipc/validators.common.ts` (E-31: `page` max)
  - `scripts/database/verify-migrations.mjs` (E-36: تغطية 0045→0047 + فحوص
    الذرّية/نقاء المال/تغطية `operationId`)
  - `scripts/quality/verify-domain.ts` (تكملة E-36)
  - `electron/database/sqlite.service.ts` (F-08: pragmas على اتصال readonly)
- **الخطوات**:
  1. **E-21** — `0048_closing_period_lock.sql`: triggers على
     `sales`/`sale_payments`/`expenses`/`returns` ترفض الكتابة إذا
     `business_date` ∈ `daily_closings` (ما لم يكن `closings.create` هو
     المعاملة) + مسار «réouverture» صريح في `handle.ts`.
  2. **E-28** — `0049_customers_phone_unique.sql`: فهرس فريد جزئي
     `customers(phone) WHERE deleted_at IS NULL AND phone IS NOT NULL` +
     **فحص تعارضات مسبقة** (SELECT COUNT) قبل إنشاء الفهرس.
  3. **E-31** — `validators.common.ts:63-66`: `page` max (مثل 10 000) أو
     keyset pagination.
  4. **E-36** — `verify-migrations.mjs`: كتل تأكيد لـ 0045/0046/0047 + فحص
     «كل معالج mutation داخل db.transaction» + «كل معالج mutation يتلقّى
     operationId» + «أعمدة المال INTEGER».
  5. **F-08** — `sqlite.service.ts:328`: `applyPragmas` على اتصال readonly.
  6. **G-22/G-23** — توثيق (لا تعديل): جدول `app_meta` + الأعمدة يتيمة +
     `bread_orders` الميت ⇒ **قرار (§4 Q8)**: إبقاء (احتفاظ تاريخي) أم
     مهجرة جديدة تضيف `DEPRECATED` markers. **لا حذف أعمدة في SQLite عمليًا**.
- **المخاطر + التخفيف**:
  - `0048` قد يمنع عمليات مشروعة (تسجيل دفعة بتاريخ قديم) ⇒ لازم **نافذة
    استثناء موثّقة** + رسالة FR «Journée clôturée : réouverture requise».
  - `0049` قد يفشل إن وُجد تكرار في `customers.phone` ⇒ **فحص مسبق +
    تقرير لقائمة التكرارات** قبل الفهرس.
  - **قاعدة AGENTS §12**: `0048+` ملفات **جديدة** فقط. **لا** تُعدَّل `0001..0047`.
- **الـ Gates**: `verify:migrations` VERIFIED (إلزامي) + `test:db` + كل البوابات.
- **اختبارات الانحدار**: `tests/database/closing-period-lock.test.ts` (جديد) ·
  `tests/database/customers-phone-unique.test.ts` (جديد) · تحديث
  `tests/database/migrations.test.ts`.
- **Rollback**: `git revert <sha>` + (إن نُشر المخطط) حذف قاعدة التطوير
  وإعادة تشغيل المهاجرات.
- **الاعتماديات**: W1 (E-21/E-23 قراراتها محسومة) + W2 (A-10/A-13 تغيّر
  `operationId` ⇒ يجب أن يسبقها).

### الموجة W4 — التغطية والاختبارات | P1 | ~1.5 يوم | files: ~12

- **الهدف**: `npm run test:coverage` **أخضر** + حرّاسات **قابلة للفشل** +
  `test:coverage` **في CI**.
- **النطاق**:
  - `vitest.config.ts` (I-01: `coverage.exclude` لملفات الأنواع + توسيع `include`)
  - `tests/unit/validators-inventory.test.ts` (G-03: إضافة `validators.staff.ts`
    ⇒ `FROZEN_SCHEMA_COUNT` **113 → 120**)
  - `tests/unit/bridge-shape.test.ts` (G-04: تغطية كل تصديرات Zod؛ G-05: عتبة
    واقعية؛ G-06: Exceptions مبرَّرة)
  - `tests/unit/operation-id-coverage.test.ts` (I-02: **assertion متمّم** —
    كل مخطط إما REQUIRED أو OPTIONAL)
  - `tests/unit/raw-guarded-channels.test.ts` (**جديد** — G-01/B-01: تعداد
    القنوات الخام مقابل `RAW_GUARDED_CHANNELS` ⇒ **يجعل الثابت حيًّا**)
  - `tests/unit/ipc-channel-inventory.test.ts` (G-08: `ocr.progress` في `PUSH_ONLY`)
  - `tests/unit/a1-p0-boundary.test.ts` (C-05: إصلاح الاختبار الخاوري)
  - `tests/unit/pin-kdf-parity.test.ts` (I-04: parité **سلوكية** لا نصّية +
    parité KDF الفريق)
  - `tests/integration/operation-id-coverage.test.ts` (**جديد** — double-submit
    لـ `customers.recordPayment` · `suppliers.pay` · `returns.create` ·
    `returns.refund` · `stock.adjust` · `stock.intake` · `stock.inventory` ·
    `closings.create` · `zakat.save` · `products.import`)
  - `tests/integration/mirror-tests.test.ts` (**جديد** — استبدال 15 ملف اختبار
    «مرآة» بما يعكس الإنتاج)
  - `package.json` + `.github/workflows/ci.yml` (I-01: `test:coverage` في CI)
- **الخطوات**:
  1. **G-03** — `validators-inventory.test.ts`: أضِف `validators.staff.ts` إلى
     `MODULES` ⇒ `FROZEN_SCHEMA_COUNT` **113 → 120** (عدّاد مُجمَّد مُحدَّث =
     **تغيير contract** ⇒ سطر في ADR + `handoff.md`).
  2. **G-04/G-05/G-06** — `bridge-shape.test.ts`: (أ) استخرج **كل** تصديرات
     Zod (لا `*Schema` فقط)؛ (ب) عتبة `toBe(names.length)` لا `>10`؛
     (ج) الاستثناءات تُبرَّر بتعليق.
  3. **I-02** — `operation-id-coverage.test.ts`: أضِف assertion «كل مخطط
     ZodObject مصنَّف» (يكتشف 39 مخططًا غير مُدرج ⇒ تُصنَّف كلها).
  4. **B-01/G-01** — `raw-guarded-channels.test.ts` **جديد**: يستخرج كل
     `ipcMain.handle(IPC_CHANNELS["x"])` من `electron/` **بمسح شامل للملفات**
     (لا قائمة `SCANNED` ثابتة) ويقارنه بـ `RAW_GUARDED_CHANNELS` ⇒
     **الconstant يصبح مُطبَّقًا** ⇒ أو يُحذف.
  5. **I-01** — `vitest.config.ts`: `coverage.exclude: ["src/domain/ocr/types.ts",
"src/domain/**/*.types.ts"]` (ملفات أنواع فقط) + **رفع** تغطية
     `src/domain/{product,returns,suppliers,import,proforma,ocr}` + قرار
     §4 Q9 حول توسيع `include` إلى `src/features`.
  6. **I-04** — `pin-kdf-parity.test.ts`: استبدال grep النصّي ب parité سلوكية
     (استدعاء `pbkdf2CodeHex` الحقيقي) + parité `STAFF_KDF_*`.
  7. **I-03** — استبدال/تحويل 15 ملف اختبار «مرآة» (§3.I-03) ليعكسوا الإنتاج.
  8. **C-05** — `a1-p0-boundary.test.ts:151-166`: إصلاح العنوان/الجسم أو
     حذف الاختبار الخاوري.
  9. **G-08** — `ipc-channel-inventory.test.ts`: `PUSH_ONLY` += `ocr.progress`.
  10. **CI** — `.github/workflows/ci.yml`: `npm run test:coverage` + `npm run
typecheck:mobile` (مع W2/G-21) + `npm run verify:licensing` (مع W2/G-14).
- **المخاطر + التخفيف**:
  - رفع `FROZEN_SCHEMA_COUNT` 113→120 **يغيّر contract** ⇒ **تحديث في نفس
    الـ commit** + ADR + `handoff.md` (قاعدة §16).
  - تحويل 15 ملف اختبار قد **يكشف عللًا حقيقية** ⇒ توقّع_workaround: كل حالة
    تُنقل إلى «expected» موثّق، لا تُحذف بصمت.
- **الـ Gates**: `test:coverage` **EXIT=0** (شرط) + كل البوابات.
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W1، W2، W3.

### الموجة W5 — التصيير وواجهة الكاشيء | P1 | ~1 يوم | files: ~30

- **الهدف**: منع موت الشاشة + منع الإرسال المزدوج + رمي `operationId` ثابت.
- **النطاق**:
  - `src/shared/formatters/format.ts` · `src/domain/money/money.ts` (A-01: سياسة
    `formatDzd` vs `formatDzdSafe` vs `formatDzdStrict`)
  - `src/features/**` (A-01: 268 موقعًا)
  - `src/features/settings/bits.tsx` (A-02: `useBusyFlag` ⇒ `useRef`)
  - `src/features/staff/{UsersAdmin,ChangeCodeCard,StaffRecover}.tsx` (A-03)
  - `src/features/customers/dialogs/useClientDrawerData.ts` (A-04)
  - `src/features/sales/sell/PayDialog.tsx` (A-21)
  - `src/app/shell/App.tsx` (A-22: `clearTimeout`)
  - `src/shared/sound/sound.ts` (A-23)
  - `src/features/sales/sell/useSellState.ts` (A-24)
  - `src/shared/ui/primitives.tsx` (A-25, A-26, A-08: focus trap للـ Drawer)
- **الخطوات**:
  1. **A-01** — قرار: `formatDzd` **غير رامٍ** (يعيد `"—"`) + `formatDzdStrict`
     جديد للاستعمال في منطق txn. ⇒ آمن افتراضيًا (268 موقعًا تُصلَح دفعةً
     واحدة) + `formatDzdStrict` في `verify-domain.ts`.
     _اختبار_: قيمة `NaN` / `1.5` / `-1` / `1e12` ⇒ `"—"` بلا رمي.
  2. **A-02** — `bits.tsx:57-72`: `useRef` guard (نمط `useSellState.ts:46-48`).
  3. **A-03** — حذف النسخ الثلاث + `import { newOperationId } from
"@domain/common/ids.ts"`.
  4. **A-04** — `useClientDrawerData.ts`: `useCallback` + deps صحيحة.
  5. **A-08/A-25/A-26** — `primitives.tsx`: فخّ تركيز + تركيز ابتدائي للـ Drawer
     (نسخ من Modal) + `aria-labelledby` بدل `aria-label` + استعادة التركيز.
  6. **A-21/A-22/A-23/A-24** — إصلاحات صغيرة.
  7. **A-15** — (اختياري، P2) تحويل 10 شلالات `await` إلى `Promise.allSettled`
     مع مؤشّر تقدّم.
- **المخاطر + التخفيف**:
  - تغيير `formatDzd` إلى غير-رامٍ **يُخفي** أخطاء حقيقية ⇒ `formatDzdStrict`
    يبقى في كل مسار الكتابة + `verify:domain` يستعمله.
  - تغيير سلوك Drawer ⇒ **E2E `window-chrome.spec.ts`** قد يتأثر ⇒ تشغيله.
- **الـ Gates**: كل البوابات + E2E `sale-flow` · `scan-flow` · `window-chrome`.
- **اختبارات الانحدار**: `tests/unit/format-dzd-safe.test.ts` (جديد) ·
  `tests/unit/use-busy-flag.test.ts` (جديد) · `tests/unit/operation-id-unique.test.ts` (جديد).
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W1 (سياسة المال) + W4 (اختبارات جديدة).

### الموجة W6 — الكود الميت (ADR-075 — بحذر) | P2 | ~0.5 يوم | files: ~30

- **الهدف**: إغلاق جرد الكود الميت §3.B.
- **النطاق** (بعد موافقة المالك على كل لوت):
  - **لوت 1** (بلا مخاطرة): `RAW_GUARDED_CHANNELS` (B-01 — **إما يُربَط
    باختبار، أو يُحذف**؛ القرار في §4 Q9) · `clearSecureState` (B-02) ·
    `buildActivationQrPayload` V1 في electron (B-03).
  - **لوت 2** (ورشة): 24 إعادة-تصدير `receipt-documents*` (B-05..B-28) +
    `templates.get` (B-29) + `printer.get` (B-30) — **بعد commit ورشة
    impression**.
  - **لوت 3** (قرار منتج): `announcements.save` (B-31) ⇒ UI أو سحب.
  - **لوت 4** (بلا مخاطرة): `expo-constants` (B-32 — **يتطلّب `mobile/package-lock.json`
    ⇒ قرار مالك**) · `tailwindcss` من `knip.json` (B-36).
  - **لوت 5** (اختياري): `fromDzd` (B-33) · `clearCartDraftsAtomic` (B-34) —
    **يُبقيا** (TEST-ONLY + غطاء).
- **الخطوات**:
  1. `git status --short` ⇒ تأكيد نظافة الشجرة + commit الورشة إن وُجد.
  2. لوت 1: تطبيق + `knip` + `npm test` + `verify:domain`.
  3. لوت 2: بعد ورشة impression ⇒ نفس البوابات.
  4. لوت 3: **ينتظر قرار المالك** (بناء UI = tranche كاملة).
  5. تحديث `FROZEN_SCHEMA_COUNT` و`ipc-channels.json` إن لزم (قاعدة §16).
- **المخاطر + التخفيف**:
  - حذف قناة IPC = **تغيير contract** ⇒ `ipc-channels.json` + `FROZEN_SCHEMA_COUNT`
    - ADR في نفس الـ commit.
  - «مرآة removed ⇒ اختبار يفشل» ⇒ `knip` + `npm test` إلزاميان.
- **الـ Gates**: كل البوابات + `npm run knip` ⇒ `Unused files = 0` و`Unused exports = 0`.
- **اختبارات الانحدار**: لا جديد (الحذف لا يحتاج) — **لكن** `tests/unit/bridge-shape.test.ts`
  و`ipc-channel-inventory.test.ts` يجب أن يبقيا خضراء.
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W0 (نظافة) + W4 (الحراسات) + ورشة impression (لوت 2).

### الموجة W7 — التكرار والمعمارية | P2 | ~1 يوم | files: ~14

- **الهدف**: مصدر واحد للحقيقة في 6 قواعد (مال، كمية، تطبيع اسم، تاريخ، `operationId`).
- **النطاق**:
  - `src/features/staff/*.tsx` (D-01) + `src/domain/common/ids.ts`
  - `src/features/stock/types.ts` · `src/features/products/dialogs/common.ts` (D-02)
  - `src/features/sales/sell/sell-search.ts` · `sell-weight.ts` (D-03)
  - `src/domain/zakat/zakat-rules.ts` · `src/domain/returns/return-policy.ts` (D-04)
  - `src/features/returns/**` · `src/features/customers/dialogs/useClientDrawerActions.ts`
    · `src/features/suppliers/SupplierPOsDialog.tsx` (D-05)
  - `src/domain/customer/credit-policy.ts` · `src/domain/returns/return-policy.ts`
    · `src/features/debts/types.ts` (D-06)
  - `src/features/stock/dialogs/IntakeDialog.tsx` · `src/shared/money/parse.ts` (D-07)
  - `src/features/customers/client-matching.ts` (E-29 + D-08)
  - `src/domain/customer/credit-policy.ts` (E-30: `agingBucket` ميت)
  - `knip.json` (J-11: إضافة `license-manager/**` و`cloud/**` إلى `project`)
- **الخطوات**:
  1. D-04/D-05: توجيه كل حساب مبلغ عبر `percentOfMinor` / `multiplyMinorByQuantity`.
  2. D-02/D-03/D-06/D-07: استخراج helpers مشتركة.
  3. E-29: `client-matching.ts` ≡ مرآة main ⇒ **اختبار parité** جديد.
  4. E-30: **قرار** (§4 Q10): إمّا كتابة `debt_status='overdue'` (⇒ حالة APK
     تعمل)، أو حذف الحالة + `agingBucket`. الافتراضي: **الكتابة** (المعلومة
     موجودة في الـ domain وفي استعلام `debts.list`).
  5. J-11: توسيع `knip.json`.
- **المخاطر + التخفيف**: توحيد القواعد تغيير سلوك ⇒ اختبار parité لكل قاعدة.
- **الـ Gates**: كل البوابات.
- **اختبارات الانحدار**: `tests/unit/parity-normalisation.test.ts` (جديد) +
  `tests/unit/money-rule-convergence.test.ts` (جديد).
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W1 + W5.

### الموجة W8 — الأداء والفهارس | P2 | ~1 يوم | files: ~10 + 1 SQL

- **الهدف**: 6 استعلامات ساخنة بلا فهرس + 4 N+1 متوسّعة + عاصفة إعادة تصيير.
- **النطاق**:
  - `database/migrations/0051_perf_indexes.sql` (**جديد** — F-06)
  - `electron/ipc/handlers/finance.repo.ts` (فهرس `(is_cancelled, remaining_balance_minor)` ·
    `suppliers(outstanding_balance_minor)` · إزالة `substr(due_date,1,10)`)
  - `electron/ipc/handlers/inventory.repo.ts` (فهرس `products(name COLLATE NOCASE)`)
  - `electron/ipc/handlers/customers.repo.ts` (فهرس تطبيع البحث + إزالة
    `REPLACE()`×8 من المسار الساخن)
  - `electron/ipc/handlers/history-query.ts` (ترتيب `UNION ALL`)
  - `electron/ipc/handlers/returns.repo.ts` (J-01/N14: إخراج
    `consumptionsOfSale()` من الحلقة)
  - `electron/ipc/handlers/import.repo.ts` (J-01/N1: تجميع الـ SELECTs)
  - `src/shared/ui/use-count-up.ts` (J-08: bail-out بالتساوي)
  - `vite.config.ts` (J-04/J-05: `manualChunks` + `chunkSizeWarningLimit` 600)
- **الخطوات**: (1) `0051` فهارس جديدة (لا تعديل على `0001..0047`)؛ (2)移除
  `substr()` من الفلاتر؛ (3) إخراج الاستعلامات الثابتة من الحلقات؛ (4) bail-out
  في `useCountUp`؛ (5) `manualChunks` (vendor)؛ (6) **قياس**: `npm run verify:perf`
  - `EXPLAIN QUERY PLAN` قبل/بعد.
- **المخاطر + التخفيف**: كل فهرس جديد = كتابة إضافية ⇒ قياس `verify:perf`
  بعد كل مجموعة.
- **الـ Gates**: كل البوابات + `verify:perf` VERIFIED.
- **اختبارات الانحدار**: `tests/database/query-plans.test.ts` (**جديد** — يفرض
  وجود الفهارس عبر `EXPLAIN QUERY PLAN`).
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W3 (الرقم التالي للمهاجرات) + W1.

### الموجة W9 — التوثيق والنظافة | P3 | ~0.5 يوم | files: ~25

- **الهدف**: تصحيح كل رقم قديم + إصلاح تلف الترميز + توثيق الهاوية.
- **النطاق**:
  - `docs/STRUCTURE.md` (N-02: «0001..0036» ⇒ 0047 · «0001..0034+» · «001→058» ⇒ 119 ·
    أسماء ملفات tsconfig)
  - `handoff.md` (N-03/N-04: 799 `it()` · 37 E2E · `docs/INDEX.md` مكتمل ·
    `test:coverage` أحمر · `mobile/tsconfig` موجود)
  - `docs/reports/FULL_PROJECT_QA_AUDIT.md:48` («21 migrations» ⇒ 47)
  - `electron/ipc/**` (O-01: **113 محرف U+FFFD** في 20 ملف) + `index.html:11` +
    `.gitignore` (تعليقات)
  - `scripts/quality/verify-domain.ts:13-16` (N-06: التعليق الكاذب — يُعالَج في W1)
  - `scripts/maintenance/elevated-step{1..8}.ps1` (M-03: إزالة المسارات المطلقة)
  - `scripts/maintenance/brand-veloria-*.jpg` (M-04: نقل إلى `docs/` أو حذف — قرار)
  - `electron/**` (O-04: 11 `console.*` تتجاوز `log()`)
- **الخطوات**:
  1. تصحيح الأرقام في `docs/STRUCTURE.md` و`handoff.md` و`FULL_PROJECT_QA_AUDIT.md`.
  2. **إصلاح التلف**: استبدال `U+FFFD` بالنص الأصلي (≥, ×, −, →, —) في 20 ملف
     - `index.html` + `.gitignore`. **تحقّق**: `node` scan على `U+FFFD` ⇒ 0.
  3. `elevated-step*.ps1`: `$PSScriptRoot` بدل المسار المطلق.
  4. `console.*` ⇒ `log()`.
- **المخاطر + التخفيف**: تعديل `.gitignore` (تعليقات فقط) — لا مساس بالأنماط.
- **الـ Gates**: `format:check` + `lint` + `typecheck` + `test`.
- **اختبارات الانحدار**: سكربت `scripts/quality/verify-encoding.mjs` (**جديد**) —
  يمنع عودة التلف (يفحص `U+FFFD` في كل نصّ مصدري).
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W1…W8 (أرقام نهائية).

### الموجة W10 — UX/a11y/الحالات + نقاء الموجات | P2/P3 | ~1 يوم | files: ~20

- **الهدف**: حالة خطأ دائمة في كل الشاشات + `PrintTemplatesScreen` + a11y.
- **النطاق**:
  - `src/app/shell/App.tsx` + `src/features/*/*Screen.tsx` (A-06: حالة خطأ دائمة)
  - `src/features/print-templates/PrintTemplatesScreen.tsx` (A-07 — **ورشة**)
  - `src/features/reports/widgets.tsx` · `src/shared/charts/BarChart.tsx` (A-27)
  - `src/features/settings/SettingsSectionsB.tsx:1240` (A-28)
  - `src/features/**` (L-05: `aria-*` الناقص)
- **الخطوات**: (1) نمط `error` دائم + `EmptyState` مميّز «لا بيانات» عن «فشل
  التحميل»؛ (2) `PrintTemplatesScreen`: `loading` + `EmptyState` + error؛
  (3) `key` مستقر بدل `key={i}`؛ (4) إزالة الهاتف الثابت.
- **المخاطر + التخفيف**: تغيير بصري ⇒ مراجعة لقطات + E2E.
- **الـ Gates**: كل البوابات + E2E كامل (اختياري) + مراجعة `ui-fr`.
- **Rollback**: `git revert <sha>`.
- **الاعتماديات**: W5.

---

## 3. الموجة W0 — تحضير إلزامي (تفصيل قائمة المهام)

- [ ] `git status --short` ⇒ **لا تلمس** ورشة impression (20 M + 3 جديد).
- [ ] **قرار المالك**: commit ورشة impression (بوابات خضراء + `build:electron`
      لإعادة توقيع المانيفست) أو `git stash push` مع رسالة.
- [ ] تثبيت خط الأساس رقميًا في `handoff.md` §1 (انظر §2/W0 الخطوة 3).
- [ ] `docs/INDEX.md` ← رابط `FULL_AUDIT_2026-10-19.md` + `..._PLAN.md`.
- [ ] `docs/ADR-120-*.md` (انظر §10) + سطر في `docs/INDEX.md`.
- [ ] `handoff.md` §1 + قسم جلسة جديد (رقم 18).
- [ ] **commit واحد** `docs(audit): audit complet 16 axes (0 correction) — 228 findings`.
- [ ] **commit ثانٍ** `docs(handoff): session 2026-10-19 — audit intégral (baseline
gelé, 0 changement de code)`.
- [ ] `graphify update .` بعد أي تغيير بنيوي لاحق (وليس بعد التوثيق).

---

## 4. بنود مؤجَّلة بقرار (تحتاج قرار منتج/ملك)

| #       | البند                                                     | السؤال                                               | الخيارات                                            | الأثر                          | الافتراضي المقترح                                                                          |
| ------- | --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| **Q1**  | `announcements.save` (B-31)                               | بناء UI أم سحب القناة + الدومين + الـ repo؟          | (أ) UI (ب) سحب                                      | functionalities للعميل النهائي | **(أ)** إن كانت مطلوبة قريبًا؛ **سحب** إن لم تكن                                           |
| **Q2**  | `mobile/` خارج بوابة typecheck (G-21)                     | إضافة `typecheck:mobile` + خطوة CI؟                  | (أ) نعم (ب) ترك                                     | 13 ملف APK غير مفحوصة          | **(أ)** — السكربت موجود وناجح                                                              |
| **Q3**  | `expo-constants` (B-32)                                   | إزالة + تحديث `mobile/package-lock.json`؟            | (أ) إزالة (ب) ترك                                   | اعتماديات                      | **(أ)** — الموافقة على تحديث lockfile mobile                                               |
| **Q4**  | `docs/INDEX.md` متوقف عند ADR-103 (ادّعاء handoff)        | —                                                    | —                                                   | —                              | **مُغلق**: `docs/INDEX.md` **كامل حتى 119** (ادّعاء handoff خطأ) — يُصحَّح في W9           |
| **Q5**  | ورشة impression غير المودَعة                              | commit أم stash؟                                     | (أ) commit (ب) stash                                | كل الموجات                     | **(أ)** مع بوابات خضراء                                                                    |
| **Q6**  | avoir أكبر من الرصيد (E-23)                               | رفض FR +Blocking، أم «avoir en cours» (عمود/جدول)؟   | (أ) رفض (ب) avoir en cours                          | تجربة الكاشيء                  | **(أ)** الآن؛ **(ب)** ⇒ مهجرة 0050 في W3                                                   |
| **Q7**  | مصدر الحقيقة للدَّين (E-24)                               | عمود مادي على `customers`، أم محسوب من `sales`؟      | (أ) عمود (ب) محسوب                                  | 5 شاشات + APK + سقف ائتمان     | **(ب)** — مصدر واحد = `sales.remaining_balance_minor` (يمنع التفرّق)؛ يُحذف المادي في 0050 |
| **Q8**  | `app_meta` + 10 أعمدة يتيمة + `bread_orders` الميت (G-22) | إبقاء أم مهجرة تعلّم `DEPRECATED`؟                   | (أ) إبقاء (ب) تعليمة                                | مخطّط                          | **(أ)** — حذف أعمدة SQLite عملية خطرة؛ توثيق فقط                                           |
| **Q9**  | `RAW_GUARDED_CHANNELS` (B-01)                             | تطبيق باختبار تعداد، أم حذف التعريف؟                 | (أ) اختبار (ب) حذف                                  | باب مفتوح                      | **(أ)** — الاختبار يجعله مُطبَّقًا (W4)                                                    |
| **Q10** | `debt_status='overdue'` (E-30)                            | الكتابة في الـ repos، أم حذف الحالة + `agingBucket`؟ | (أ) كتابة (ب) حذف                                   | APK «en retard»                | **(أ)** — المعلومة موجودة في الـ domain                                                    |
| **Q11** | `test:coverage` (I-01)                                    | ما العتبة لِـ `src/features` (119 ملف)؟              | (أ) 80/75/88/80 (ب) 60/50/60/60 (ج) توسيع بدون عتبة | تغطية                          | **(أ)** على domain+application، **(ب)** على features — بتغطية تدريجية                      |
| **Q12** | `electron@37.2.0` (P-02)                                  | ترقية إلى major حديث؟                                | (أ) ترقية (ب) إبقاء                                 | لا تصحيحات Chromium            | **(ب)** مع ADR موقَّع (المحتوى محلي، الأثر منخفض)                                          |
| **Q13** | تدوير مفتاح الترخيص (G-14)                                | keyring (مفاتيح عامة سابقة) أم إبقاء؟                | (أ) keyring (ب) إبقاء                               | إبطال الرخص                    | **(ب)** مع **توصيل `verify:licensing` بالـ CI** — الإبقاء قرار مقصود                       |
| **Q14** | تشفير قاعدة بيانات المانجر (G-16)                         | تشفير الحقل أم trust model؟                          | (أ) تشفير (ب) إبقاء                                 | سجلّ البائع                    | **(ب)** مع توثيق (جهاز البائع = جهاز موثوق)                                                |
| **Q15** | `maxDevices` غير مُطبَّق (G-17)                           | تطبيقه أم توثيقه؟                                    | (أ) تطبيق (ب) توثيق                                 | تراخيص عائمة                   | **(ب)** — ADR                                                                              |
| **Q16** | لا remote / لا CI فعّال (P-01)                            | `git bundle` عبر USB، أم remote + CI؟                | (أ) bundle (ب) remote                               | استرجاع + كشف التراجع          | **(أ)** فوريًا + (ب) لاحقًا                                                                |
| **Q17** | حدّ اليوم (E-35) UTC vs `Africa/Algiers`                  | «jour métier» بالإعدادات أم UTC؟                     | (أ)ienna (ب) UTC                                    | Z + APK                        | **(أ)** — تبرير المنتج (zakat)                                                             |
| **Q18** | `installer.spec` (UAC)                                    | spec إداري منفصل أم تجاهل؟                           | (أ) spec (ب) تجاهل                                  | بوابة لا تُخضر                 | **(ب)** مع توثيق صريح                                                                      |
| **Q19** | APK / EAS (P-05)                                          | حساب EAS؟                                            | (أ) نعم (ب) تجميد                                   | ميزة                           | قرار المالك                                                                                |
| **Q20** | `database.reset` بلا idempotency_key (G-09)               | `operationId` إلزامي؟                                | (أ) نعم (ب) لا                                      | إعادة التهيئة                  | **(أ)**                                                                                    |

> **لا تُتخَذ هذه القرارات بنفسك.** كل بند يُسجَّل في §4 أعلاه وينتظر تعليم المالك
> قبل أن يدخل أي موجة.

---

## 5. ترتيب التنفيذ (timeline تقديري)

| الموجة       |              المدة | الاعتماد     | Gate الإغلاق                   | المخرج                |
| ------------ | -----------------: | ------------ | ------------------------------ | --------------------- |
| **W0**       |                 1h | —            | baseline مثبَّت                | تقرير + خطة + ADR-120 |
| **W1**       |               1–2j | W0           | كل البوابات + 4 اختبارات جديدة | 7 High مالي           |
| **W2**       |               1.5j | W0           | كل البوابات + E2E staff        | 5 High أمن + 9 Medium |
| **W3**       |               1.5j | W1, W2       | `verify:migrations` VERIFIED   | 3 مهاجرات جديدة       |
| **W4**       |               1.5j | W1, W2, W3   | **`test:coverage` EXIT=0**     | 5 High تغطية          |
| **W5**       |                 1j | W1, W4       | كل البوابات + E2E caisse       | 4 High تصيير          |
| **W6**       |               0.5j | W0, W4, ورشة | `knip` = 0                     | 30 عنصرًا ميتًا       |
| **W7**       |                 1j | W1, W5       | كل البوابات                    | 9 تكرارات             |
| **W8**       |                 1j | W3, W1       | `verify:perf` VERIFIED         | 6 فهارس + 4 N+1       |
| **W9**       |               0.5j | W1…W8        | `format:check` + lint          | أرقام + ترميز         |
| **W10**      |                 1j | W5           | كل البوابات                    | UX/a11y               |
| **الإجمالي** | **~11–13 يوم عمل** |              |                                | **228 finding**       |

> **التوازي**: W2 وW8 وW9 وW10 مستقلة نسبيًا بعد W0/W1 ⇒ يمكن توزيعها على
> **جلستين متوازيتين** (وكيلان منفصلان) بشرط commits منفصلة + بوابات خضراء لكل
> commit.

---

## 6. معايير الاكتمال (DoD) لكل موجة

```
[ ] npm run format:check            → 0
[ ] npm run typecheck               → 0
[ ] npm run typecheck:electron      → 0
[ ] npm run typecheck:manager       → 0
[ ] npm run typecheck:mobile        → 0            (بعد W2/G-21)
[ ] npm run lint                    → exit 0
[ ] npm test                        → ≥ 804/804 (121 ملف)  (أو +N جديد)
[ ] npm run test:db                 → 0
[ ] npm run test:coverage           → EXIT 0       (بعد W4)
[ ] npm run verify:migrations       → MIGRATIONS VERIFIED
[ ] npm run verify:domain           → DOMAIN VERIFIED
[ ] npm run verify:perf             → PERF VERIFIED
[ ] npm run verify:licensing        → ACTIVE       (بعد W2/G-14)
[ ] npm run license:scan            → exit 0
[ ] npm run build && npm run build:electron → ✓ + مانيفست موقَّع
[ ] E2E المتأثر أخضر (sale-flow, scan-flow, staff-session, window-chrome)
[ ] ADR محدَّث إن كان هناك قرار بنيوي (+ سطر في docs/INDEX.md)
[ ] handoff.md §1 محدَّث + قسم جلسة جديد
[ ] commit نظيف (staging بمسارات صريحة) — الورشة غير المودَعة لم تُمَسّ
[ ] graphify update . بعد التغيير البنيوي
```

**قاعدة إضافية**: أي تغيير في **أرقام مجمّدة** (`FROZEN_SCHEMA_COUNT` ·
`ipc-channels.json` · `bridge-shape` snapshot · `IPC_CHANNELS` count) ⇒
**تحديث الرقم + سطر في ADR + سطر في `handoff.md` في نفس الـ commit**.

---

## 7. ما لا نلمسه (Out of scope) + السبب

| البند                                                            | السبب                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **`database/migrations/0001..0047`**                             | **قاعدة AGENTS §12 — IMMUTABLE.** كل تغيير = ملف مرقّم جديد (`0048+`)   |
| **`package-lock.json` · `mobile/package-lock.json`**             | قفل الإصدارات (قاعدة المالك). Q3 يحتاج موافقة صريحة                     |
| **`src/domain/money/money.ts` — تغيير دلالة `formatDzd`** قبل W1 | قرار في W1؛ تغييرُ دلالة دالة نقدية يحتاج ADR مستقل                     |
| **نصوص UI الفرنسية**                                             | «حدود Editorial»: لا إعادة كتابة نصوص؛ فقط **تصحيح أخطاء** (A-28، G-13) |
| **`installer.spec`**                                             | يتطلب UAC + حزمة Win ⇒ Q18                                              |
| **E2E كامل (30 دقيقة)**                                          | خارج مهلة كل موجة؛ يُشغَّل **مستهدفًا** على المسارات المتأثرة           |
| **تقييم ثغرات الاعتماديات**                                      | `npm audit` يحتاج شبكة ⇒ Q12 (قرار ترقية Electron)                      |
| **حذف أعمدة/جداول يتيمة**                                        | SQLite: عمليّة خطرة (rebuild) + أثر على نسخ المستخدم ⇒ Q8               |
| **`mobile/android/`**                                            | محلي (git-ignored) + قرار EAS (Q19)                                     |
| **ترقية `electron` / `vite` / `zod`**                            | تغييرات كبرى خارج نطاق الإصلاح الجذري ⇒ Q12                             |

---

## 8. سجلّ فكّ القفل للعقود المجمّدة

| العقد               | القيد الحالي                                                                  | مكان التحقّق                                                                              | عند التغيير                                                        |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| عدد قنوات IPC       | **177** (175 served + 2 push) · snapshot `ipc-channels.json` = **176**        | `tests/unit/ipc-channel-inventory.test.ts` + `tests/unit/__snapshots__/ipc-channels.json` | حدّث الـ snapshot + العدّاد + ADR                                  |
| عدد مخططات Zod      | `FROZEN_SCHEMA_COUNT = 113` (والحقيقي **120** — `validators.staff.ts` مستثنى) | `tests/unit/validators-inventory.test.ts:29`                                              | **W4**: أضِف `validators.staff.ts` ⇒ 113 → **120** + ADR + handoff |
| تغطية `operationId` | R1: 21 REQUIRED + 20 LWW = 41                                                 | `tests/unit/operation-id-coverage.test.ts`                                                | W4: أضِف assertion المتمم + صنّف الـ 19 الباقية                    |
| شكل الجسر           | `bridge-shape` (3 assertions)                                                 | `tests/unit/bridge-shape.test.ts`                                                         | W4: تغطية كل تصديرات Zod + عتبة واقعية                             |
| عدّاد `knip`        | `Unused files = 0` · `Unused exports = 27`                                    | `npx knip`                                                                                | W6: كل لوت يُحدّث الأرقام في ADR                                   |
| المانيفست           | توقيع على 214 ملفًا                                                           | `scripts/licensing/sign-integrity.mjs`                                                    | `npm run build:electron` إلزامي بعد أي build                       |
| المهاجرات           | checksum لكل ملف مطبَّق                                                       | `npm run verify:migrations`                                                               | ملف مرقّم جديد فقط                                                 |
| التكرارية           | `operationId` + `idempotency_keys` (PK) + UNIQUE على `operation_id`           | `tests/integration/*`                                                                     | كل مسار mutation جديد يُغطّى                                       |

---

## 9. ملخّص «من يفعل ماذا» (لتسليم الجلسات)

| الموجة | الوكيل المقترح   | مراجعة إلزامية                              |
| ------ | ---------------- | ------------------------------------------- |
| W1     | `db-guardian`    | مراجعة يدوية لكل diff مالي (base du domain) |
| W2     | `general` (أمن)  | مراجعة يدوية لكل بوابة قناة                 |
| W3     | `db-guardian`    | `verify:migrations` + `test:db`             |
| W4     | `qa`             | `test:coverage` + كل البوابات               |
| W5     | `ui-fr`          | مراجعة `craft-floor` قبل أي تعديل UI        |
| W6     | `qa`             | `knip` + مراجعة ADR-075 قبل كل حذف          |
| W7     | `qa`             | مراجعة parité                               |
| W8     | `general` (perf) | `verify:perf` + `EXPLAIN QUERY PLAN`        |
| W9     | `qa`             | `format:check` + scan `U+FFFD`              |
| W10    | `ui-fr`          | لقطات + E2E                                 |

---

## 10. ADR-120 المقترح (للموافقة)

`docs/ADR-120-guardes-de-contrat-auto-derivees.md` — انظر §11 من التقرير.
**الموضوع**: «الحرّاسات التي لا تستطيع أن تفشل ليست حرّاسات» — كل عقد مجمّد
(`FROZEN_SCHEMA_COUNT` · `operation-id-coverage` · `RAW_GUARDED_CHANNELS` ·
`bridge-shape` · `ipc-channel-inventory`) يجب أن يكون **مشتقًّا من مصدر
الحقيقة** (مسح الملفات) لا **قائمة مكتوبة يدويًا**؛ وأن تغطية
`src/features` (93% من الكود) تدخل في العتبات.

**الموافقة المطلوبة**: قبل W4.
