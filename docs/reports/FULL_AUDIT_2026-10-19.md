# التدقيق الشامل — Veloria PoS (2026-10-19)

> **مرحلة المعرفة فقط (audit-first).** لا شيء في هذا التقرير مُنفَّذ: لا حذف، ولا
> تعطيل، ولا تعديل على كود الأعمال. المخرج = معرفة مُثبَتة + خطة إصلاح مُصنَّفة في
> موجات (`FULL_AUDIT_2026-10-19_PLAN.md`). كل إصلاح لاحق يُنفَّذ في موجة منفصلة
> وبموافقة صريحة (ADR-075: _audit d'abord, jamais de suppression automatique_).
>
> **عمق التدقيق** = **M — Standard** (§1.3). **الحاجز** = الشجرة غير نظيفة
> (ورشة impression غير المودَعة) — لم يُمَسّ أيٌّ منها.

---

## 0. الملخص التنفيذي

### 0.1 جدول النتائج حسب المحور

| المحور                             | ملاحظات | Critical |   High | Medium |     Low | Refuted/مُستبعد |
| ---------------------------------- | ------: | -------: | -----: | -----: | ------: | --------------: |
| **A** الأخطاء والعيب (correctness) |      28 |        0 |      3 |     13 |      12 |               0 |
| **B** الكود الميت (dead code)      |      30 |        0 |      0 |      3 |      27 |               0 |
| **C** غير المكتمل / stubs          |       6 |        0 |      0 |      2 |       4 |               0 |
| **D** التكرار / التجريد الزائد     |       9 |        0 |      0 |      5 |       4 |               0 |
| **E** المال والذرّية (حصري)        |      32 |        0 |      7 |     15 |      10 |               0 |
| **F** قاعدة البيانات والمهاجرات    |      12 |        0 |      0 |      7 |       5 |               0 |
| **G** عقود IPC والترخيص/APK        |      23 |        0 |      7 |     12 |       4 |               0 |
| **H** المعمارية والحدود            |       7 |        0 |      0 |      3 |       4 |               0 |
| **I** الاختبارات والتغطية          |      12 |        0 |      3 |      5 |       4 |               0 |
| **J** الأداء                       |      14 |        0 |      0 |      8 |       6 |               0 |
| **K** الأمان والخصوصية             |      16 |        0 |      2 |      8 |       6 |               0 |
| **L** UX / الواجهة (FR)            |       8 |        0 |      0 |      4 |       4 |               0 |
| **M** الأدوات والتشغيل             |      12 |        0 |      0 |      5 |       7 |               0 |
| **N** التوثيق والقرارات            |       7 |        0 |      0 |      2 |       5 |               0 |
| **O** النظافة (hygiene)            |       5 |        0 |      0 |      0 |       5 |               0 |
| **P** المخاطر غير التقنية          |       7 |        0 |      1 |      3 |       3 |               0 |
| **الإجمالي**                       | **228** |    **0** | **23** | **95** | **110** |           **0** |
| مُستبعد (refuted)                  |      21 |        — |      — |      — |       — |              21 |

> **لا يوجد Critical واحد.** هذا المشروع مُصمَّم ببوابات مغلقة على Money/Atomicity/
> IPC/Audit؛ ما تبقّى هو **فجوة تغطية الحرّاسات** و**عيب التصيير (render)** و
> **انجراف تغطية الاختبارات** — لا خرق مالي مباشر ولا حقن SQL ولا تسريب الأسرار.

### 0.2 الخلاصة في 10 جمل

1. **أخطر ما في المشروع ليس كودًا معطوبًا، بل حرّاسات لا تحرس.** خمس حارس
   مُدرجة كـ"مُجمّدة" لا تفعل ما تعد به: `RAW_GUARDED_CHANNELS` (مستخدمة من
   **صفر** كود واختبار)، `FROZEN_SCHEMA_COUNT` (يغطي 113 من **120** مخططات)،
   `operation-id-coverage` (يعدّد 42 من 120 مخططًا ولا يثبت اكتماله)، `bridge-shape`
   (يغطي أسماء `*Schema` فقط + 8 استثناءات مكتوبة يدويًا)، و**حارس ESLint
   «لا عربية في `src/`»** (خامل تمامًا — أثبتّه بإعادة تشغيل: ملف حقيقي يحوي
   عربية يمرّ بـ exit 0). الدليل في §G و§I.
2. **العتبة المالية سليمة من جهة نقاء الأرقام**: صفر `parseFloat`، صفر float في
   حساب مبلغ، 66 `db.transaction()`، صفر `await` داخل transaction، FIFO
   fail-closed وقت التشغيل، و`operationId` مُطبَّق مركزيًا. **لكن 7 High في
   منطق الأعمال المالية** (§E-20..E-26): تحويل Proforma remis **يفشل دائمًا**،
   الإغلاق Z **لا يقفل الفترة** و**يحسب الشيك نقدًا**، avoir أكبر من الرصيد
   **يُجهض المرتجع**، المرتجع **لا يعدّل سند البيع** (رقمان للدَّين)، لا يمكن
   **عكس دفعة**، و`products.update` **يغيّر المخزون بلا حركة مسجَّلة**.
3. **أخطر عيب تشغيلي للمستخدم**: `formatDzd()` **يرمي** استثناءً أثناء تصيير
   React في **268** موقع `.tsx` (مقابل **16** فقط للنسخة الآمنة `formatDzdSafe`).
   قيمة مخزَّنة تالفة واحدة = شاشة كاملة ميتة ("Écran momentanément indisponible").
4. **أخطر عيب أمني**: قناة `customers.accessQrSvg` **بلا بوابة staff** وتُعيد
   **PIN العميل بنصّه الصريح** داخل QR التفعيل. (§K / F-13)
5. **أخطر باب مفتوح**: `staffScope()` تعني `null` = "gérant (كل شيء)"، و`null`
   يُنتج أيضًا **غياب الجلسة** → قارئ غير مصادَق على `history.*` / `sales.history`
   / `dashboard.summary` يرى **رؤية المدير كاملة**. (§K / F-14)
6. **بوابة `npm run test:coverage` حمراء اليوم** (EXIT=1، 18 انتهاك عتبة على 5
   ملفات domain) **وهي غير موجودة في CI** ⇒ تراجع التغطية غير مرئي. (§I)
7. **بعد لوتَي 1 و2 من ADR-118/119، بقت 3 قنوات IPC ميتة فقط** لا 6
   (`announcements.save` قرار منتج، `printer.get` و`templates.get` مؤجَّلتان بسبب
   الورشة غير المودَعة). (§B)
8. **الانحراف بين `handoff.md` والواقع** موثّق ومقاس: `it()` vitest 799 لا 804،
   اختبارات Playwright 37 لا 24، `docs/INDEX.md` **كامل حتى ADR-119** (لا 103)،
   و`mobile/` **له `tsconfig.json` + سكربت `typecheck` ناجح** لكنه غير مربوط
   ببوابة جذرية. (§N)
9. **تلف ترميز UTF-8 (U+FFFD) في 20 ملف مصدري مودَع** (113 محرف تالف)، متركّز
   في `electron/ipc/*` — أثّر على كود **العمل** لا على المستندات فقط. (§O)
10. **النطاق غير المُدقَّق**: E2E لم تُشغَّل (لا relay، و`installer.spec` يتطلب
    UAC)، وتقييم ثغرات الاعتماديات لم يُحصل عليه من الشبكة (`npm audit --offline`
    ⇒ نتيجة غير موثوقة). (§1.4 و§13)

### 0.3 النتيجة الصافية

التصميم الأساسي **ممتاز**: بنية Clean Architecture مُختبَرة، SQLite وحدها مصدر
الحقيقة، المال بأعداد صحيحة، 177 قناة IPC مُتحقَّق منها على 6 مستويات، بوابات
رخصة/فريق/ائتمان مُطبَّقة في main، تحقّق fail-closed، لا أسرار في المستودع ولا في
تاريخ git، لا حقن SQL. **المشكلة ليست في المعمارية بل في أن الحُرّاس ليست
مُفعَّلة، وأن التغطية تتراجع بصمت، وأن التصيير يرمي على بيانات حقيقية.**

---

## 1. نطاق التدقيق وقيوده

### 1.1 ما شُمِل

| الطبقة          | المسار                      | القياس                                                                                                                                                                  |
| --------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| renderer (POS)  | `src/**`                    | 201 ملف `.ts/.tsx` — 100 % ممسوح (بحث نصّي + قراءة)                                                                                                                     |
| main (Electron) | `electron/**`               | 103 ملف `.ts` — 100 % ممسوح                                                                                                                                             |
| IPC             | `electron/ipc/**`           | 12 ملف `channels` + `validators` + 11 `registry` + 24 `handlers/*.repo.ts`                                                                                              |
| المهاجرات       | `database/migrations/*.sql` | **47 ملف** (0001→0047، متّصلة بلا فجوة)                                                                                                                                 |
| الاختبارات      | `tests/**`                  | 121 ملف vitest (91 unit / 24 integration / 6 database) + 13 spec Playwright                                                                                             |
| الأدوات         | `scripts/**`                | 33 ملف (14 نصّي + 8 PowerShell + 2 صورة + بيانات)                                                                                                                       |
| المانجر         | `license-manager/**`        | 20 ملف                                                                                                                                                                  |
| APK             | `mobile/**`                 | 32 ملف (+ `mobile/tsconfig.json` + `mobile/package.json`)                                                                                                               |
| السحابة         | `cloud/**`                  | 5 ملف                                                                                                                                                                   |
| التهيئة         | الجذر                       | `package.json` (44 script)، `tsconfig*.json` ×4، `vitest.config.ts`، `playwright.config.ts`، `knip.json`، `eslint.config.mjs`، `.gitignore`، `.github/workflows/ci.yml` |
| القياس الكلي    | —                           | **597 ملف نصّي / 102 149 سطر** (عدا `node_modules`/`dist`/`release`/`graphify-out`/`docs`)                                                                              |

**توزيع الحجم**: `src/features` 119 ملف / 30 260 سطر · `src/domain` 39 / 3 500 ·
`src/shared` 27 / 2 879 · `src/application` 3 / 431 · `electron/ipc` 59 / 15 464 ·
`electron/printing` 29 / 4 359 · `electron/licensing` 19 / 2 887 ·
`electron/database` 14 / 3 657 · `tests/unit` 91 / 11 343 · `tests/integration` 24 /
4 554 · `tests/database` 6 · `database/migrations` 47 / 1 921.

### 1.2 الحاجز (tree state)

```
الفرع : chore/root-layout
HEAD  : 94a64de docs(audit): prompt etendu - 19 playbooks domaine, ...
الحالة: 20 ملف معدَّل (M) + 3 ملف جديد (??) — ورشة "impression / capabilities"
```

قائمة الملفات المعدَّلة: `electron/ipc/validators.templates.ts` · `electron/printing/printing.{enrich,logistics,payment,pdf-exports,receipt,reports-labels,samples,studio,templates}.ts` · `electron/printing/receipt-documents.ts` · `electron/printing/receipt-documents/{common,labels,logistics,payment-ticket,receipt-text,thermal}.ts` · `src/domain/print/template-rules.ts` · `src/features/print-templates/PrintTemplatesScreen.tsx` · `tests/unit/c6-studio.test.ts`.
الجديدة: `electron/printing/printing.capabilities.ts` · `src/domain/print/template-capabilities.ts` · `src/features/print-templates/TemplateSettingsPanel.tsx`.

**القاعدة المطبَّقة**: لم يُمَسّ أيٌّ من هذه الملفات. أي finding يشير إليها يحمل
وسم **[ورشة غير مودَعة]** ويُعالَج في موجة منفصلة (W0) لا في نفس الـ commit.
`src/domain/print/template-capabilities.ts` **مستورد من `tests/unit/c6-studio.test.ts:18`**
(وهو ملف معدَّل غير مودَع) ⇒ `git checkout` نظيف يكسر البناء — حُدِّر.

### 1.3 البوابات — خط الأساس (قِيس، لا مُفترض)

| البوابة                             | النتيجة                                                   | ملاحظة                                                             |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck` (`tsc -b`)      | **0** ✓                                                   | —                                                                  |
| `npm run typecheck:electron`        | **0** ✓                                                   | —                                                                  |
| `npm run typecheck:manager`         | **0** ✓                                                   | —                                                                  |
| `npm run lint` (`--max-warnings 0`) | **exit 0** ✓                                              | بعد نقل سكربتات التدقيق خارج المستودع (انظر §1.5)                  |
| `npm test` (`vitest run`)           | **121 ملف / 804 اختبار** ✓                                | `EXIT=0`                                                           |
| `npm run test:db`                   | **EXIT=0** ✓                                              | **معزولًا**؛ تحت الحِمل المتزامن فشل بـ 12 `Hook timed out` (§1.5) |
| `npm run verify:migrations`         | **MIGRATIONS VERIFIED** ✓                                 | —                                                                  |
| `npm run verify:domain`             | **DOMAIN VERIFIED** ✓                                     | 30 تأكيدًا على دوال نقية                                           |
| `npm run verify:perf`               | **PERF VERIFIED** ✓                                       | عتبات 6 على 10k منتج / 10k بيع                                     |
| `npm run license:scan`              | **exit 0** ✓                                              | —                                                                  |
| `npm run format:check`              | **exit 0** ✓                                              | —                                                                  |
| `npm run build`                     | **✓** (40.6 s)                                            | —                                                                  |
| `npm run build:electron`            | **✓** — «integrity-manifest signé (214 fichiers, v1.0.0)» | —                                                                  |
| **`npm run test:coverage`**         | **✗ EXIT=1 — 18 انتهاك عتبة**                             | **باب أحمر في خط الأساس** → §I-01 (P1)                             |
| `npm run verify:licensing`          | لم يُقَس                                                  | يتطلب Electron (خارج نطاق التدقيق)                                 |
| E2E (`npm run test:e2e`)            | **لم يُشغَّل**                                            | relay `:8100` + UAC → §1.4                                         |

**البوابة الحمراء الوحيدة = `test:coverage`.** لم تُصلَح (قاعدة §3: لا إصلاح في
هذه المرحلة).

### 1.4 قيود التدقيق (ما لم يُدقَّق ولماذا)

| القيد                                                   | السبب                                                                                                                                         | الأثر على الثقة                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| E2E لم تُشغَّل                                          | `full-loop-client` يحتاج relay على `:8100`؛ `installer.spec` يحتاج UAC + حزمة Win                                                             | \_playbook P1/P14 جزئي                           |
| تقييم ثغرات الاعتماديات                                 | `npm audit --offline` ⇒ 0 ثغرات **بلا شبكة** ⇒ نتيجة غير موثوقة؛ لم أُنفِّذ `npm install`                                                     | playbook P/ثغرات غير محسومة                      |
| `installer.spec`                                        | UAC مرفوض في بيئة التدقيق                                                                                                                     | P19 غير مُدقَّق                                  |
| packaged runtime (ABI better-sqlite3 مقابل Electron 37) | لا حزمة `.exe` مبنيّة في هذه الجلسة                                                                                                           | قاعدة AGENTS §9 غير مُتحقَّق منها في هذا التدقيق |
| Playwright / متصفّح خارجي                               | لم يُستدعَ                                                                                                                                    | —                                                |
| قاعدة التطوير المحلي                                    | `C:\ProgramData\Veloria PoS\Data\Veloria POS DB.sqlite` لم تُفتح (قاعدة "لا تكتب بيانات أعمال خارج SQLite" + عدم تشغيل GUI أثناء POS)         | P14 (الاستعادة) غير مُدقَّقة على بيانات حقيقية   |
| `graphify query/path/explain`                           | الرسم البياني `graphify-out/` موجود (6011 عقدة) لكنّ التدقيق اعتمد على **قراءة مباشرة + سكربتات** لأن perf إلى ملف واحد أدقّ من استعلام الرسم | §1.5 يذكر ذلك صراحةً                             |
| تغطية `src/features` بالاختبارات                        | 119 ملفًا / 28 784 سطرًا خارج `coverage.include`                                                                                              | §I                                               |

### 1.5 مصائد بيانية واجهتها (موثّقة)

1. **`lint` كان أحمر بسبب سكريبت التدقيق الخاص بي**: وضعت سكربتات `.mjs` في
   `docs/reports/maintenance/audit-raw/` ⇒ `eslint .` لم يجدها في
   `allowDefaultProject` (قائمة صريحة من 24 مسارًا في `eslint.config.mjs:31-58`)
   ⇒ `Parsing error`. **الحل**: نقلتُها إلى `%TEMP%\opencode\veloria-audit\`.
   ⇒ **قيادة**: `npm run lint` يمرّ على `docs/**` ⇒ أي مساعد `.mjs` موضوع تحت
   `docs/` يكسر بوابة الـ lint. (Finding M-11)
2. **`test:db` فشل تحت الحِمل**: عند تشغيله **بالتوازي** مع `knip`/`depcheck`/
   `eslint` ظهر **12 `Hook timed out in 10000ms`** (EXIT=1). مُقيسًا **معزولًا**
   ⇒ **EXIT=0**. السبب: `vitest.config.ts:40` يحدّد `testTimeout: 15000` فقط،
   ولا يحدّد `hookTimeout` (الافتراضي 10 s)، بينما كل `beforeEach` في
   `tests/database/*` و`tests/integration/*` **يعيد تشغيل 47 هجرة** على قاعدة
   جديدة ⇒ الهوكش عند حدّه بالضبط. ⇒ Finding I-08 (P2).
3. **`graphify update .` قد يخرج code 1 بعد نجاح فعلي** (مُوثَّق في `handoff.md`).
4. **ABI `better-sqlite3`**: `ELECTRON_RUN_AS_NODE=1 npx electron script.cjs` فقط.
5. **`Set-Content` قد يُعيد الترميز** — تحقّقتُ بـ `git diff` و`U+FFFD` scan بعد
   كل كتابة.
6. **`git commit` يجرف الـ index** — فحصتُ `git status --short` قبل كل commit،
   وسأُرحّل بمسارات صريحة فقط.

---

## 2. خطورة الـ findings (التعريف المطبَّق)

### 2.1 الأثر (Impact)

| المستوى      | المعيار                                                                                | أمثلة Veloria                                                                                           |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Critical** | فقدان مال/بيانات، خرق أمن، تلف قاعدة، معاملة غير ذرّية تبتلع أو تُضاعف مبلغًا          | `db.transaction` ناقصة · `parseFloat` في حساب · قناة IPC بلا Zod · `PRAGMA foreign_keys` مطفأ           |
| **High**     | خلل في مسار عمل ظاهر للمستخدم، تبعية بلا تغطية، كود ميت داخل مسار نقدي، باب أمني مفتوح | `formatDzd` يرمي أثناء التصيير · `useBusyFlag` لا يحمي · `accessQrSvg` بلا بوابة · `test:coverage` أحمر |
| **Medium**   | ازدواجية، تغطية ناقصة، أداة ميتة، انحراف توثيقي، فجوة حراسة                            | 24 إعادة-تصدير ميتة · `docs/INDEX.md` متوقف (خطأ) · `RAW_GUARDED_CHANNELS` غير مطبَّق                   |
| **Low**      | نظافة، تعليقات كاذبة، تسمية، تنسيق                                                     | `console.log` · TODO منسي · `U+FFFD`                                                                    |

### 2.2 الاحتمال (Likelihood)

`Certain` (كل تنفيذ) · `Probable` (مسار شائع) · `Possible` (نادر/حالة حدّية) ·
`Rare` (نظري).

### 2.3 التحويل إلى أولوية (Risk = Impact × Likelihood)

|              | Certain | Probable | Possible | Rare |
| ------------ | ------- | -------- | -------- | ---- |
| **Critical** | P0      | P0       | P1       | P2   |
| **High**     | P0      | P1       | P2       | P3   |
| **Medium**   | P1      | P2       | P3       | P3   |
| **Low**      | P2      | P3       | P3       | P3   |

**تعريف P0 الخاص بـ Veloria (ممنوع التأجيل)**: مسار كتابة مال بلا transaction
واحدة أو بلا `operationId` · أي float في حساب مبلغ · قناة IPC حسّاسة بلا Zod أو
بلا بوابة (license/staff/credit) · تعديل على migration مطبَّقة · `contextIsolation
= false` أو `nodeIntegration = true` في بناء الإنتاج · `dangerouslySetInnerHTML`
بمحتوى غير مموَّه · كود ميت في مسار نقدي بلا قرار.

**النتيجة**: **صفر P0**. كل P1 مُصنَّف في §12 من الخطة.

### 2.4 تصنيف الثقة

| الوسم               | المعنى                                                            |
| ------------------- | ----------------------------------------------------------------- |
| **PROUVÉ**          | بحث شامل في كل المستودع + نتيجة سلبية/إيجابية قابلة لإعادة التحقق |
| **DYNAMIC-RISK**    | الاستهلاك ممكن عبر سلسلة/نمط ديناميكي — يلزم تأكيد وقت التشغيل    |
| **TEST-ONLY**       | المستهلك الاختبارات فقط                                           |
| **DUPLICATE**       | ازدواج مع finding آخر                                             |
| **DELIBERATE-KEEP** | مقصود (مع رقم ADR)                                                |
| **REFUTED**         | مُستبعد مع السبب والدليل (§12)                                    |

---

## 3. النتائج حسب المحور

### A. الأخطاء والعيب (Bugs)

> هذه المحور collects: منطق خاطئ · حالات حدّ · NaN/undefined · تواريخ/مناطق ·
> تسريب حالة (stale closure) · `useEffect` deps · إعادة رسم · listeners غير مغلقة ·
> سباقات async · unhandled rejection · أخطاء تصيير · حدود النافذة · أداء · تعطّل الإقلاع.

#### A-01 — `formatDzd()` يرمي استثناءً أثناء تصيير React في 268 موقعًا | High | PROUVÉ | P1

- **الموقع**: `src/domain/money/money.ts:147-148` (المصدر) · 268 موقع استدعاء في
  32 ملف `.tsx` · النسخة الآمنة `formatDzdSafe` في `src/shared/formatters/format.ts:11-18`
  مستعملة في **16** موقعًا فقط.
- **الوصف**: `formatDzd()` تستدعي `assertMinorInteger(minor)` → `assertSafeMinor`
  الذي **يرمي `MoneyError`** إذا كان القيم غير `Number.isSafeInteger` أو `< 0` أو
  `> 1_000_000_000`. 268 موقعًا في JSX يستدعيها مباشرة بقيم قادمة من قاعدة البيانات.
- **الآلية/السبب الجذري**: `formatDzdSafe` وُضعت أصلًا لهذا الغرض (وثّق نفسها:
  _"P1-5 : pas de try/catch dans le corps du composant, pas de throw au render"_)،
  لكنّ الاستعمال لم يُعمَّم. الدليل على أن المؤلف كان يعرف أن قيم DB قد تكون
  غير صحيحة: في الملف **نفسه** `src/features/stock/dialogs/DetailsDrawer.tsx` —
  السطر 52 يلفّ القيمة بـ `Math.round(...)` والسطر 56 لا يلفّها.
- **الأثر**: قيمة تالفة/سالبة/فائقة واحدة في القاعدة ⇒ `MoneyError` داخل render ⇒
  `ErrorBoundary` (`src/shared/ui/error-boundary.tsx:33-56`) يستبدل **الوحدة
  كاملة** بـ "Écran momentanément indisponible" ⇒ **شاشة ميتة أمام الكاشيء**.
  شدّة: High (توقف عمل فعلي). السيناريو: صفّ `dashboard.summary` يعرض
  `stockValueMinor` محسوبًا كـ REAL من SQL ⇒ `formatDzd` يرمي.
- **الدليل**:
  ```ts
  // src/domain/money/money.ts:147-157
  export function formatDzd(minor: number): string {
    assertMinorInteger(minor);      // ← يرمي MoneyError
    const sign = minor < 0 ? "-" : "";
    const abs = Math.abs(minor);
    const major = Math.trunc(abs / MINOR_PER_MAJOR);
    ...
  ```
  ```ts
  // src/features/stock/dialogs/DetailsDrawer.tsx:52 و :56  (نفس الملف!)
  value={formatDzd(Math.round(row.stock_value_minor))}   // :52  مؤلَّف
  <InfoRow label="Prix d'achat" value={formatDzd(row.purchase_price_minor)} num />  // :56  غير مؤلَّف
  ```
  ```ts
  // src/shared/formatters/format.ts:5-18  (النسخة الآمنة، غير مستعملة بالعمق)
  /**
   * Format monétaire SÛR pour le rendu React (ne lève jamais).
   * ... P1-5 : pas de try/catch dans le corps du composant, pas de throw au render.
   */
  export function formatDzdSafe(raw: unknown): string {
    const n = typeof raw === "number" ? raw : Number(raw);
    try {
      return formatDzd(n);
    } catch {
      return "—";
    }
  }
  ```
  أمر إعادة التحقق: `grep -c "formatDzd(" src --include=*.tsx` ⇒ **268**؛
  `grep -c "formatDzdSafe(" src --include=*.tsx` ⇒ **16**.
  **حالات DB-المصوّبة غير المؤلَّفة (عيّنة)**: `src/features/dashboard/DashboardScreen.tsx:246-252, 464-500, 535, 544, 565-580` · `src/features/reports/ReportsScreen.tsx:583-607, 756-761` ·
  `src/features/debts/DebtsScreen.tsx:268-270, 583-589` · `src/features/expenses/ExpensesScreen.tsx:263, 284, 394-412, 641` ·
  `src/features/suppliers/SuppliersScreen.tsx:332-334, 397-403, 575-586` · `src/features/zakat/ZakatScreen.tsx:337, 339, 342`.
- **المقارنة المرجعية**: `src/shared/formatters/format.ts:5-9` يذكر صراحةً أن
  `formatDzd` "crasherait l'écran" — أي أن المشروع يعرف الخطر ولم يطبّق الحارس.
- **الإصلاح المقترح**: `src/features/**` — استبدال `formatDzd(` بـ `formatDzdSafe(`
  في كل موقع يتغذّى على قيمة DB، **أو** (الأفضل) جعل `formatDzd` غير-رامٍ
  وإضافة `formatDzdStrict` للكتابة فقط. يُشمل ذلك `src/features/dashboard/DashboardScreen.tsx`،
  `src/features/reports/ReportsScreen.tsx`، `src/features/debts/DebtsScreen.tsx`،
  `src/features/expenses/ExpensesScreen.tsx`، `src/features/suppliers/SuppliersScreen.tsx`،
  `src/features/zakat/ZakatScreen.tsx`، `src/features/products/ProductsScreen.tsx`،
  `src/features/proformas/ProformasScreen.tsx`، `src/features/history/HistoryScreen.tsx`،
  `src/features/stock/StockScreen.tsx`، `src/features/sales/sell/PayDialog.tsx`.
- **اختبار الانحدار**: `tests/unit/` — اختبار يمرّر قيمة `NaN` / `1.5` / `-1` /
  `1e12` عبر `formatDzdSafe` ويتوقّع `"—"`؛ واختبار render يمرّر قيمة تالفة إلى
  `DebtDialogs` ويتوقّع عدم انهيار الوحدة.
- **الجهد**: **M** (268 موقعًا، آلي غالبًا، لكن يلزم تحقّق يدوي لكل ملف لأن
  `formatDzd` مستعملة أيضًا في `notify()` حيث الرمي مقبول).
- **الثقة**: **PROUVÉ** (عدّ 268/16 + قراءة `money.ts:147` + دليل داخلي `DetailsDrawer.tsx:52`).

#### A-02 — `useBusyFlag` لا يمنع الإرسال المزدوج (state غير متزامن) | High | PROUVÉ | P1

- **الموقع**: `src/features/settings/bits.tsx:57-72`.
- **الوصف**:
  ```ts
  export function useBusyFlag(): {
    busy: boolean;
    run: <T>(task: () => Promise<T>) => Promise<void>;
  } {
    const [busy, setBusy] = useState(false);
    async function run<T>(task: () => Promise<T>): Promise<void> {
      if (busy) return; // ← state React: غير محدَّث حتى إعادة التصيير
      setBusy(true);
      try {
        await task();
      } finally {
        setBusy(false);
      }
    }
    return { busy, run };
  }
  ```
- **الآلية/السبب الجذري**: في نفس الـ tick، `busy` ما زال `false` ⇒ نقرتان
  متتاليتان تمرّان كلاهما. المشروع **وثّق هذا الصنف بالضبط** في الكاشيء:
  `src/features/sales/sell/useSellState.ts:41-48` — _"Gardes synchrones anti-double-clic
  (F-01) : le state `busy` React est asynchrone — deux soumissions dans le même
  tick verraient toutes deux `busy === false`. Ces refs tranchent de façon
  synchrone, avant tout await."_ — ولم يُطبَّق النمط على `useBusyFlag`.
- **الأثر**: `useBusyFlag` مستعمل في **13** قسم إعدادات: `SettingsSectionsA.tsx:59, 276, 338, 426, 477, 541, 602` ·
  `SettingsSectionsB.tsx:71, 241, 639, 813, 1058, 1182`، ويغطّي **عمليات تدميرية**:
  `backup.autoSave` (`:350, 383, 411, 438`) · `database.relocate` (`:884`) ·
  **`database.reset` (`:908`)** · `sync.pushNow` (`:704`) · `zakat.saveParams` (`:1087`).
  ⇒ نقرتان على "Réinitialiser" = استدعيان لـ `api.dbReset(...)`. شدّة: High.
- **الدليل**: `src/features/settings/bits.tsx:57-72` (الكود أعلاه) مقابل
  `src/features/sales/sell/useSellState.ts:41-48` و`src/features/stock/OcrImportDialog.tsx:148`
  (`importGuard = useRef(false)` مع تعليق _"garde synchrone anti-double-clic même tick"_).
- **المقارنة المرجعية**: `src/shared/ui/use-operation-id.ts:1-9` — القاعدة
  _"tout dialogue mutatif utilise ce hook"_. نفس المنطق ينطبق على `useBusyFlag`.
- **الإصلاح المقترح**: `src/features/settings/bits.tsx:57-72` — استبدال
  `useState` بـ `useRef` (نفس نمط `useSellState.ts:46-48`)، مع إبقاء `busy` كـ state
  للعرض فقط.
- **اختبار الانحدار**: `tests/unit/` — نداء `run()` مرّتين في نفس الـ tick مع
  `task` يتعدّى بـ deferred ⇒ يُتوقّع استدعاء واحد فقط.
- **الجهد**: **S**.
- **الثقة**: **PROUVÉ**.

#### A-03 — 3 نسخ محلية من `newOperationId()` باحتياطي UUID ثابت | High | PROUVÉ (الرمز) / DYNAMIC-RISK (التفعيل) | P1

- **الموقع**: `src/features/staff/UsersAdmin.tsx:24-27` · `src/features/staff/ChangeCodeCard.tsx:11-14` ·
  `src/features/staff/StaffRecover.tsx:10-13`.
- **الوصف**: الثلاث نسخ متطابقة:
  ```ts
  function newOperationId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return "00000000-0000-4000-8000-000000000000"; // ← ثابت
  }
  ```
  النسخة المعتمدة في الدومين `src/domain/common/ids.ts:25` تستخدم
  `crypto.getRandomValues` (تعمل في **أي** سياق) وتُنتج UUIDv7 قابلًا للترتيب.
- **الأثر**: إن غاب `crypto.randomUUID`، **كل** عمليات الفريق في هذه الملفات
  الثلاث تأخذ **نفس** `operationId` ⇒ جدول `idempotency_keys` في main يعتبر
  العمليات المتمايزة إعادة إرسال فيسقطها بصمت: `staff.create`، `staff.setPermissions`،
  `staff.setActive`، `staff.changeCode`، `staff.regenRecovery`، `staff.recover`.
  شدّة: High (فقدان عمليات 관리 فريق + تضارب تتبّع). الاحتمال: Possible
  (`crypto.randomUUID` متاح عادةً في Electron 37 عبر سياق آمن).
- **الدليل**: الملفات الثلاثة أعلاه؛ الاستخدامات: `UsersAdmin.tsx:82, 104, 117, 140` ·
  `ChangeCodeCard.tsx:41` · `StaffRecover.tsx:41`. النسخة الصحيحة: `src/domain/common/ids.ts:25`.
- **الإصلاح المقترح**: حذف النسخ الثلاث واستيراد `newOperationId` من
  `@domain/common/ids.ts` (وحدة الدومين بلا framework ⇒ مسموحة من `src/features`).
- **اختبار الانحدار**: `tests/unit/` — اختبار ينادي الدالة ولا يعيد ثابتًا ولا
  `undefined`، وأن المخرجات فريدة عبر 1000 نداء.
- **الجهد**: **S**.
- **الثقة**: **PROUVÉ** (الرمز) — التفعيل **DYNAMIC-RISK** (يتطلب غياب `crypto.randomUUID`).

#### A-04 — خطأ في `toUserMessage` يمرّر رسائل خام غير مطابقة إلى الكاشيء | Medium | PROUVÉ | P1

- **الموقع**: `electron/ipc/ipc-errors.ts:112-121`.
- **الوصف**: `toUserMessage()` يحوّل ~12 عائلة أخطاء إلى رسائل FR، لكنّ
  **الفرع الأخير** يعيد الرسالة **كما هي**:
  ```ts
  return { code: "VALIDATION_ERROR", message: msg }; // ← fall-through
  ```
- **الأثر**: خطأ محرك غير متوقّع مثل `"database is locked"` (لا يطابق
  `SQLITE_`، ولا `constraint failed`، ولا errno، ولا القائمة الإنجليزية في
  `:113-114`) يصل **نصًّا إنجليزيًا** إلى شاشة الكاشيء ⇒ مخالفة القاعدة 6
  ("لا استثناءات خام للمستخدم"). شدّة: Medium (يتطلب خطأ غير متوقّع).
- **الدليل**: `electron/ipc/ipc-errors.ts:112-121` مقابل
  `electron/printing/printing.pdf.ts:12-33` (`PDF_TECHNICAL_RAW` + `PDF_TECHNICAL_EN`)
  الذي **لا** يحمل هذا الثقب ⇒ **النموذج المطلوب موجود في المشروع نفسه**.
- **المقارنة المرجعية**: `src/shared/errors/fr-map.ts` (side renderer) لديه نفس
  النمط (denylist) ⇒ انحراف بين main و renderer ⇒ انظر A-05.
- **الإصلاح المقترح**: `electron/ipc/ipc-errors.ts` — استبدال fall-through
  بـ «إن لم تكن الرسالة ضمن قائمة FR المعروفة ⇒ أعد الرسالة العامة».
- **اختبار الانحدار**: `tests/unit/` — جدول متجهات: `"database is locked"`,
  `"EPIPE"`, `"ECONNABORTED"`, `"ERR_STREAM_WRITE_AFTER_END"` ⇒ FR.
- **الجهد**: **S**.
- **الثقة**: **PROUVÉ** (الآلية) — التفعيل **DYNAMIC-RISK**.

#### A-05 — `frError` (renderer) قائمة منع لا قائمة سماح | Medium | PROUVÉ | P2

- **الموقع**: `src/shared/errors/fr-map.ts:6-7, 18-31`.
- **الوصف**: `frError` يمرّر أي رسالة **غير مدرجة** في `TECHNICAL_RE` نصًّا:
  ```ts
  if (!isTechnicalMessage(err.message)) return err.message; // ← passes through
  ```

VF- كذلك النصي: `if (typeof err === "string") return isTechnicalMessage(err) ? fallback : err;`

- **الأثر**: مسار ملموس: `src/app/shell/use-notifications.ts:67`
  (`text: frError(s.lastError, "Miroir Android indisponible.")`) حيث `s.lastError`
  **نص من الخادم** ⇒ يمكن عرض رسالة خادم خام. شدّة: Medium.
- **الدليل**: `src/shared/errors/fr-map.ts:6-7, 18-31` + `src/app/shell/use-notifications.ts:67`.
- **الإصلاح المقترح**: قلب القاعدة إلى قائمة سماح (allowlist) أو اشترط وسمًا
  صريحًا للرسائل التجارية.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-06 — لا شاشة واحدة تملك حالة خطأ دائمة | Medium | PROUVÉ | P2

- **الموقع**: `src/app/shell/App.tsx:91-106` (`notify`) · 16 شاشة في `src/features/*/*Screen.tsx`.
- **الوصف**: كل فشل يظهر كـ toast عابر (4.5 s، ويُحتفظ بآخر 3 فقط عبر
  `prev.slice(-2)`). لا `setError` ولا `errorState` في أي `*Screen.tsx`
  (بحث نصّي ⇒ **0** نتيجة).
- **الأثر**: (أ) الخطأ يختفي ولا سجلّ；(ب) الجدول الفارغ لا يميّز «لا بيانات» عن
  «فشل التحميل»؛ (ج) خطأ批量 يُطمس.
- **الدليل**: `src/app/shell/App.tsx:91-106` + grep `setError|errorState` في
  `src/features/**/*Screen.tsx` ⇒ 0.
- **الإصلاح المقترح**: نمط `error` دائم في الشاشات + `EmptyState` مميّز.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### A-07 — `PrintTemplatesScreen` بلا حالات تحميل/فارغ/خطأ | Medium | PROUVÉ | P2

- **الموقع**: `src/features/print-templates/PrintTemplatesScreen.tsx:73-106, 359`.
- **الوصف**: `loadTemplates()` بلا `loading` flag ⇒ تعرض اللوحة قوالب نوع الوثيقة
  **السابق** أثناء تحميل النوع الجديد (كذب بصري)؛ الحالة الفارغة `<p>` لا
  `EmptyState`؛ الفشل toast فقط.
- **الأثر**:\_medium. **ملاحظة**: هذا الملف من **الورشة غير المودَعة** ⇒ أي إصلاح
  يجب أن يذهب في موجة الورشة لا في الموجات العامة.
- **الدليل**: `src/features/print-templates/PrintTemplatesScreen.tsx:73-106`.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-08 — `Drawer` بلا فخّ تركيز ولا تركيز ابتدائي (بعكس `Modal`) | Medium | PROUVÉ | P2

- **الموقع**: `src/shared/ui/primitives.tsx:635-731` (Drawer) مقابل `:300-400` (Modal).
- **الوصف**: `Modal` يملك فخّ تركيز كامل (`:343-358`) + تركيز ابتدائي (`:364-367`).
  `Drawer` يملك **لا واحدًا**: `onKeyDown` على `div` بلا `tabIndex` ⇒ **Escape لا يعمل
  إلا إذا كان التركيز داخل الدرج**؛ والتركيز يبقى على الزر خلف الـ overlay.
- **الأثر**: 9 مستهلكين للـ Drawer (products, clients, debts, history, returns,
  expenses, stock, suppliers, proformas) ⇒ الكاشيء يكتب في الصفحة المخفية.
- **الدليل**: `src/shared/ui/primitives.tsx:657-686` (لا `keydown` trap) مقابل
  `:343-367` (trap + focus initial).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### A-09 — قفل `must_change_code` غير مُطبَّق على 32 قناة خام | Medium-High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handle.ts:100-102` (التطبيق) مقابل
  `electron/ipc/raw-guards.ts:17-28` (لا تطبّق القفل).
- **الوصف**: القفل معرَّف _"verrou main, pas seulement visuel"_ في `handle.ts:30-31`،
  لكنه معمول داخل `handle()` فقط. القنوات الخام (backup restore، 25 printing، 4 OCR)
  تتجاوزه.
- **الأثر**: مستخدم عليه `must_change_code = 1` يستطيع **استعادة نسخة احتياطية**،
  وطباعة/تصدير كل المستندات، وتشغيل OCR ⇒ يُخرَج من القيود المقصودة.
- **الدليل**: grep `mustChangeCode` ⇒ `handle.ts:24, 100` + `staff.repo.ts` فقط.
- **الإصلاح المقترح**: `electron/ipc/raw-guards.ts:17-28` — استدعاء
  `mustChangeCode(getCurrentStaffUser())` بنفس منطق `handle.ts:100-102`، مع
  استثناء `staff.changeCode` / `staff.session` / `staff.logout`.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-10 — `expenses.delete` بـ `operationId` اختياري ⇒ حذف مالي غير مضمّن التطابق | Medium | PROUVÉ | P1

- **الموقع**: `electron/ipc/validators.finance.ts:249-252` ·
  `electron/ipc/handlers/expenses.repo.ts:199, 206`.
- **الوصف**: `operationId: z.string().uuid().nullable().optional()`. الـ repo يسقط
  إلى `operationId ?? randomUUID()` ⇒ إعادة إرسال بلا `operationId` ليست
  قابلة للتمييز.
- **الأثر**: حذف مصروف (أثر مالي) غير idempotent ⇒ إعادة إرسال قد تُنتج خطأ
  "introuvable" بدل تكرار الحذف، وسجلّ التدقيق يحمل UUID عشوائيًا ⇒ لا قابلية
  ربط. شدّة: Medium.
- **الدليل**: `electron/ipc/validators.finance.ts:249-252`.
- **المقارنة المرجعية**: `validators.common.ts:75-79` يشرح أن `handle()` يرفض
  عملية بلا `operationId` **متى اشترط المخطط ذلك** — لكن هذا المخطط لا يشترطه.
- **الجهد**: **S** (+ تحديث `FROZEN_SCHEMA_COUNT` إن تغيّر عدد المخططات).
- **الثقة**: **PROUVÉ**.

#### A-11 — `backup.restore` بلا `operationId` ⇒ أخطر عملية ليست exactly-once | Medium | PROUVÉ | P1

- **الموقع**: `electron/ipc/validators.print.ts:40-42` (`backupRestoreSchema =
z.object({ file: … })`) · `electron/backup/backup.service.ts:572-714`.
- **الوصف**: الاستعادة تبدّل ملف القاعدة الحيّ. بلا مفتاح تكرارية، إعادة الإرسال
  بعد انهيار يعيد تسلسل snapshot→verify→copy→reopen كاملًا.
- **الأثر**: منطق التراجع (`backup.service.ts:653-704`) يحمي البيانات، لكن
  العملية ليست idempotent. شدّة: Medium.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### A-12 — بوابة ائتمان fail-open على `proformas.convert` | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/credit-gates.ts:30-45`.
- **الوصف**: قراءة `proforma_invoices.total_minor` داخل `try { … } catch (err) { log("WARN") }`
  ثم **يتابع** ⇒ إن أخطأت القراءة، يُتخطّى فحص `debt-management` /
  `partial-payments`.
- **الأثر**: على وشك الفشل-المفتوح في نظام بخلاف بقية البوابات fail-closed.
  الأثر العملي منخفض (الكتابة التالية تفشل أيضًا).
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-13 — `database.relocate` بـ `operationId` اختياري | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/validators.settings.ts:128-131` · `electron/ipc/registry.core.ts:74-160`.
- **الوصف**: فيه تكرارية يدوية (fast-path + store) لكن `operationId` غير **مفروض**،
  فعميل يُهمله يُطلق نسخًا ثانيًا.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-14 — استنساخ مغلق (stale closure) في محمّل تبويب العميل | Medium | PROUVÉ | P2

- **الموقع**: `src/features/customers/dialogs/useClientDrawerData.ts:178-183` (التأثير)
  و`:109-130` (`loadReturns`).
- **الوصف**: `useEffect(..., [tab])` يقرأ `returnsState` من الـ closure؛ الحارس
  `if (returnsState === "loading" || returnsState === "ready") return;` يُقيَّم على
  قيمة قديمة. `customerId` لا يظهر في الـ deps.
- **الأثر**: تحميل مُتخطّى أو مكرّر عند التبديل السريع. **الجهد**: **S**.
  **الثقة**: **PROUVÉ**.

#### A-15 — 10 شلالات `await` داخل حلقات في الـ renderer | Medium | PROUVÉ | P2

- **الموقع**: `src/features/products/ProductsScreen.tsx:285-292` ·
  `src/features/customers/ClientsScreen.tsx:286-291, 330-331` ·
  `src/features/expenses/ExpensesScreen.tsx:323-330` ·
  `src/features/proformas/ProformasScreen.tsx:303-310` ·
  `src/features/returns/ReturnsScreen.tsx:307-316` ·
  `src/features/customers/dialogs/ClientMobileAccess.tsx:148-149, 169-171` ·
  `src/features/stock/OcrImportDialog.tsx:594-601`.
- **الأثر**: أرشفة 200 منتج = 200 ذهاب-إياب IPC متسلسل بلا مؤشّر تقدّم؛
  تصدير CSV يمرّ عبر الصفحات واحدة تلو الأخرى.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### A-16 — `useCountUp` يستدعي `setState` في كل إطار rAF | Medium | PROUVÉ | P2

- **الموقع**: `src/shared/ui/use-count-up.ts:25-33` · `src/features/dashboard/DashboardScreen.tsx:43-45`.
- **الوصف**: `setShown(v)` يُستدعى في **كل** إطار (≈18 إطارًا × 300 ms) بلا
  bail-out بالتساوي؛ ولوحة الـ Dashboard تُركّب **3** عدّادات ⇒ ≈54 `setState`
  ⇒ إعادة تصيير `TodayStrip` كاملة في كل مرة.
- **الجهد**: **S** (ب Bail-out `if (v !== shown) setShown(v)`).
  **الثقة**: **PROUVÉ**.

#### A-17 — `logo_path` يتحكّم فيه الـ renderer ⇒ قراءة ملف محلي عشوائي | Medium | PROUVÉ | P1

- **الموقع**: `electron/ipc/validators.finance.ts:236` (`logo_path: z.string().max(500).nullable().optional()`)
  → `electron/ipc/registry.finance.ts:117-137` (`company.update`) → persisted →
  `electron/ipc/registry.finance.ts:105-116` (`company.get`) →
  `electron/services/logo.ts:62-75` (`readLogoDataUrlFromFile`).
- **الأثر**: قراءة أي PNG/JPEG على القرص (≤400 Ko، مع فحص magic bytes) وإعادتها
  data-URL إلى الـ renderer ⇒ **primitive لقراءة ملفات محلية**. المسار الشرعي
  موجود (`system.selectLogo`) ⇒ الحقل الحر unnecessary.
- **الجهد**: **S** (قصر `logo_path` على مسار داخل `<userData>/logos`).
  **الثقة**: **PROUVÉ**.

#### A-18 — `auditStaff("staff.recovered", …)` يسجّل **الهدف** كفاعل | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/staff.repo.ts:708` — `actor_user_id = row.id`
  (الهدف) لا المشغّل الحقيقي.
- **الأثر**: سجلّ التدقيق لا يستطيع التمييز بين «المدير استعاد حسابه» و«طرف
  مجهول استعاد حساب المدير». **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-19 — مسار الاستعادة يصفّر `must_change_code` | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/staff.repo.ts:702-703`.
- **الأثر**: الحساب المستعاد يصبح credential صالحًا دون تدوير إجباري.
  **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### A-20 — 5 مسارات كتابة خارج transaction (كلها موثّقة ومقصودة) | Low | PROUVÉ | P3

`electron/ipc/handlers/sales.repo.ts:506-508` (bump تسلسل فاتورة في `catch`),
`returns.repo.ts:101-111`، `proformas.repo.ts:137-139` (تسلسلات أرقام) ·
`staff.repo.ts:333-337, 340-342, 385-389` (عدادات فشل المصادقة) ·
`electron/sync/sync.service.ts:89-91` (`lastError`) · `electron/database/retention.ts:95`
(تنقية `audit_log`).
**كلها جملة SQLite واحدة** ⇒ ذرّية ضمنية، وموثّقة في المصدر. **ليس عيبًا**؛
يُسجَّل كـ **مخاطر تسلسل** (§P). **الجهد**: لا شيء. **الثقة**: **PROUVÉ**.

#### A-21 — `minorToInput` قد يرمي داخل معالج نقر غير محمي | Low | DYNAMIC-RISK | P3

- **الموقع**: `src/features/sales/sell/PayDialog.tsx:69-79`.
- **الوصف**: `setPaidText(minorToInput(base + dzd * 100))` خارج `try/catch`؛
  `minorToInput` → `assertSafeMinor` يرمي إذا `> 1e9`، و`base` يمكن أن يساوي
  `1e9` بالضبط.
- **الأثر**: استثناء داخل event handler ⇒ **لا يلتقطه ErrorBoundary**.
- **الجهد**: **S**. **الثقة**: **DYNAMIC-RISK** (نافذة إدخال ضيّقة).

#### A-22 — مؤقّت الـ toast لا يُلغى | Low | PROUVÉ | P3

`src/app/shell/App.tsx:103-105` — `window.setTimeout(...)` بلا `clearTimeout`.
**الجهد**: S. **الثقة**: PROUVÉ.

#### A-23 — مستمع `visibilitychange` لا يُزال | Low | PROUVÉ | P3

`src/shared/sound/sound.ts:102-117` — `document.addEventListener("visibilitychange", …)`
بلا `removeEventListener` (محميّ بعلم على مستوى الوحدة).
**الجهد**: S. **الثقة**: PROUVÉ.

#### A-24 — كتابات على تبويب السلة النشّط بلا `cart` في الـ deps | Low | DYNAMIC-RISK | P3

`src/features/sales/sell/useSellState.ts:187-200` —Transient write عند تبديل التبويب.
**الجهد**: S. **الثقة**: DYNAMIC-RISK.

#### A-25 — `Modal` لا يستعيد التركيز إلى الزر المُطلق | Low | PROUVÉ | P3

`src/shared/ui/primitives.tsx:364-367` — لا `previousActiveElement` في الملف.
**الجهد**: S. **الثقة**: PROUVÉ.

#### A-26 — `aria-label` يتغلّب على العنوان المرئي في `Modal` | Low | PROUVÉ | P3

`src/shared/ui/primitives.tsx:373` (`aria-label={label}`) مقابل `<h2>{title}</h2>` (`:384`).
**الجهد**: S. **الثقة**: PROUVÉ.

#### A-27 — `key={i}` في 3 مواقع على بيانات ثابتة | Low | PROUVÉ | P3

`src/features/reports/widgets.tsx:38-42, 46-53` · `src/shared/charts/BarChart.tsx:66-79`.
**الجهد**: S. **الثقة**: PROUVÉ.

#### A-28 — رقم هاتف ثابت في كتلة «À propos» | Low | PROUVÉ | P3

`src/features/settings/SettingsSectionsB.tsx:1240` — `value="+213770204047"`.
**الجهد**: S. **الثقة**: PROUVÉ.

---

### B. الكود الميت — جرد كامل (لا يُحذف في هذه المرحلة)

> **قاعدة ADR-075**: لا حذف بلا مراجعة. الجدول أدناه **جرد فقط**.

#### B-1. التصديرات غير المستهلكة (knip + تحقّق يدوي)

`npx --yes knip` (بـ `knip.json` الحالي) ⇒ \*\*1 unused dependency + 18 unused exports

- 9 unused exported types + 0 unused files\*\* (المجموع 28)؛ وknip يبلّغ عن
  «Configuration hints (1): tailwindcss — Remove from ignoreDependencies».

| #          | العنصر                                                        | النوع      | الموقع                                                                                                        | الدليل                                                                                                                                                                                | التصنيف                          | القرار المقترح                                                                                                                                             |
| ---------- | ------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01       | `RAW_GUARDED_CHANNELS`                                        | const      | `electron/ipc/raw-guards.ts:31`                                                                               | grep كامل المستودع ⇒ **0 مستهلك** (تعريف + 18 إشارة في `docs/`)                                                                                                                       | **PROUVÉ**                       | **P1**: إمّا تُربَط باختبار تعداد، أو تُحذف. (كلا两端: ADR-119 §134 أصلًا)                                                                                 |
| B-02       | `clearSecureState`                                            | function   | `electron/licensing/secure-state.ts:184`                                                                      | **0 مرجع** في كل المستودع                                                                                                                                                             | **PROUVÉ**                       | حذف أو توثيق «operator-only». ملاحظة: مع وجود الـ anchor، حذف الحالة يُنتج `TAMPER_DETECTED` (`license-service.ts:201-205`) ⇒ الدالة **لا تصلح** إلا للضرر |
| B-03       | `buildActivationQrPayload` (V1) — نسخة **electron**           | function   | `electron/ipc/handlers/client-access.repo.ts:94`                                                              | النموذج V2 فقط هو المستدعى (`registry.customers.ts:144`)                                                                                                                              | **PROUVÉ**                       | حذف (انظر B-04 لتفصيل النسخة src)                                                                                                                          |
| B-04       | `buildActivationQrPayload` (V1) — نسخة **src**                | function   | `src/application/customers/client-access.ts:30`                                                               | مستعملة **اختبارات فقط** (`tests/unit/client-access.test.ts:72-81` — 6 تأكيدات على تنسيق QR V1 وقواعد التحقّق)                                                                        | **TEST-ONLY**                    | **يُبقى** (غطاء أعمال حقيقي)، أو يُحذف مع اختباراته بتوثيق                                                                                                 |
| B-05..B-28 | 24 إعادة-تصدير ميتة في `electron/printing/receipt-documents*` | barrel     | `electron/printing/receipt-documents.ts:11, 25, 28, 32, 33, 34` · `receipt-documents/common.ts:109, 110, 111` | knip + grep                                                                                                                                                                           | **PROUVÉ**                       | مؤجَّلة — **ملفاتها ضمن الورشة غير المودَعة** ⇒ W0 أولًا                                                                                                   |
| B-29       | `templates.get`                                               | canal IPC  | `electron/ipc/channels.ts:169`                                                                                | 6 مستويات موصولة، **0 مستدعٍ renderer** (تحقّق 3 مستويات: channels → preload:147 → `ipc-client.ts:133` → **لا استدعاء**)                                                              | **PROUVÉ**                       | مؤجَّلة (ورشة)                                                                                                                                             |
| B-30       | `printer.get`                                                 | canal IPC  | `electron/ipc/channels.ts:165`                                                                                | preload:141 → `ipc-client.ts:51` → **0 استدعاء**                                                                                                                                      | **PROUVÉ**                       | مؤجَّلة (ورشة)                                                                                                                                             |
| B-31       | `announcements.save`                                          | canal IPC  | `electron/ipc/channels.ts:56`                                                                                 | 6 مستويات (validator `validators.customers.ts:92`، handler `registry.customers.ts:163`، repo `client-access.repo.ts:568-593`، preload:65، ipc-client:49، retention:53) + **UI غائبة** | **PROUVÉ**                       | **قرار منتج** (§Q1): بناء UI أو سحب القناة + الدومين + الـ repo                                                                                            |
| B-32       | `expo-constants`                                              | dependency | `mobile/package.json:23`                                                                                      | غير مستورد في `mobile/src`                                                                                                                                                            | **PROUVÉ**                       | لا يمكن إصلاحه دون لمس `mobile/package-lock.json` (قفل الإصدارات) ⇒ **مؤجَّل**، قرار مالك (§Q3)                                                            |
| B-33       | `fromDzd`                                                     | function   | `src/domain/money/money.ts:112`                                                                               | **0 مستدعٍ في `src/`**؛ مستعملة في `tests/unit/money.test.ts:3,14,15`، `tests/unit/money-safety.test.ts:10,36-38`، `scripts/quality/verify-domain.ts:4,39-40`                         | **TEST-ONLY**                    | **يُبقى** (مغطاة بـ `verify:domain`)                                                                                                                       |
| B-34       | `clearCartDraftsAtomic`                                       | function   | `electron/ipc/handlers/carts.repo.ts:180`                                                                     | `tests/integration/idempotency-config.test.ts:54,158,159` فقط                                                                                                                         | **TEST-ONLY**                    | **يُبقى** (ADR-075 ST-01، KEEP)                                                                                                                            |
| B-35       | `percentOfMinor`                                              | function   | `src/domain/money/money.ts:194`                                                                               | مستعملة في `money-guard.ts:68` (مقابل main) + اختبارات + `verify-domain.ts`؛ **لكن لا في `src/`** ⇒ §D-04                                                                             | **DELIBERATE-KEEP** (مقابل main) | توحيد الاستعمال (D-04)                                                                                                                                     |
| B-36       | `tailwindcss` في `ignoreDependencies`                         | config     | `knip.json:13`                                                                                                | knip: «Remove from ignoreDependencies»                                                                                                                                                | **PROUVÉ**                       | **حذف السطر** (Low)                                                                                                                                        |

#### B-2. الفئات الأخرى (كلها 0)

| الفئة                                     | النتيجة                                                                               | الدليل                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ملفات غير مستورَدة                        | **0**                                                                                 | knip `Unused files` = 0 (بعد `knip.json`)                                                                                                                     |
| أنواع غير مستعملة                         | 9 (كلّها في `receipt-documents.ts`)                                                   | B-05..B-28                                                                                                                                                    |
| دوال خاصة غير مستدعاة                     | **0**                                                                                 | مسح `private`/`#` في `src/` + `electron/`                                                                                                                     |
| مكونات/أنماط CSS غير مستعملة              | **0** (Tailwind 4 يقصّ ما لم يُستعمل)                                                 | `src/styles/globals.css` + 84 قيمة hex موثّقة (ADR-080)                                                                                                       |
| قنوات IPC بلا مستدعٍ                      | **3** (B-29, B-30, B-31)                                                              | مصفوفة 3 مستويات (انظر G-1)                                                                                                                                   |
| اعتماديات غير مستعملة                     | 1 (`expo-constants`) + 1 (`bindings` — مطلوبة وقت التشغيل لـ better-sqlite3، ADR-005) | knip + depcheck                                                                                                                                               |
| اعتماديات ناقصة (imports بلا declaration) | **1**: `@eslint/js`                                                                   | `eslint.config.mjs:1` يستورده و`package.json` لا يعلنه (depcheck «missing») ⇒ **معلومة previously موثّقة** في `docs/reports/DEAD_CODE_AUDIT_2026-10-18.md:22` |
| تكرار (bundles)                           | 0                                                                                     | knip `duplicates` = 0                                                                                                                                         |

---

### C. الكود غير المكتمل / الـ stubs

| #    | العنصر                                                                | الموقع                                                                                                                                                            | الدليل                                                                                                                                                                                                              | الأثر                                                                       | الأولوية  |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| C-01 | `announcements.save` — 6 مستويات backend بلا UI                       | `registry.customers.ts:163`                                                                                                                                       | §B-31                                                                                                                                                                                                               | **معلومة موروثة**؛ الـ client APK يستقبل «Aucune annonce du magasin» دائمًا | P2 (قرار) |
| C-02 | `templates.get` + `printer.get` — backend كامل بلا UI                 | `registry.system.ts:91` / `printing.receipt.ts:102`                                                                                                               | §B-29/B-30                                                                                                                                                                                                          | قنوات ميتة                                                                  | P2 (ورشة) |
| C-03 | `verify-domain.ts` لا يغطي دالة zakat despite وجودها                  | `scripts/quality/verify-domain.ts:13-16`                                                                                                                          | التعليق يقول _"no `src/domain/finance/zakat.ts`"_ — **قديم**: الدالة موجودة في `src/domain/zakat/zakat-rules.ts:20` (`computeZakat`)، و`src/features/zakat/types.ts:3-4` يؤكّد النقل. ⇒ **تعليق كاذب + فجوة تغطية** | الـ zakat غير محميّ ببوابة `verify:domain`                                  | P2        |
| C-04 | `RAW_GUARDED_CHANNELS` «garde-fou de revue» بلا تطبيق                 | `raw-guards.ts:30-31`                                                                                                                                             | §B-01                                                                                                                                                                                                               | **باب مفتوح**                                                               | P1        |
| C-05 | `tests/unit/a1-p0-boundary.test.ts:151-166` — اختبار **خاوري**        | العنوان: _"rejette une date d'expiration calendaire impossible"_ / الجسم: `.not.toThrow()` / ولا حقل expiry في `stockIntakeSchema` (`validators.stock.ts:82-104`) | يَعِد برفض ولا يرفض شيئًا ⇒ **لا يختبر ما يَعِد به**                                                                                                                                                                | P2                                                                          |
| C-06 | `scripts/maintenance/cleanup-admin.ps1` يكرّر `elevated-step1..8.ps1` | `scripts/maintenance/`                                                                                                                                            | هدف واحد (admin/cleanup machine) في implementation واحدة                                                                                                                                                            | P3                                                                          |

---

### D. التكرار والتجريد الزائد

| #    | التكرار                                                                             | الموقع (الزوج)                                                                                                                                                                                                              | الأثر                                                                             | الأولوية |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| D-01 | `newOperationId()` ×4 (1 دومين + 3 renderer)                                        | `src/domain/common/ids.ts:25` ↔ `src/features/staff/{UsersAdmin,ChangeCodeCard,StaffRecover}.tsx`                                                                                                                           | **A-03** (احتياطي ثابت)                                                           | P1       |
| D-02 | `parseQtyInput` / `parseQty` — نسختان متطابقتان                                     | `src/features/stock/types.ts:72-76` ↔ `src/features/products/dialogs/common.ts:5-9`                                                                                                                                         | انحراف قاعدة                                                                      | P2       |
| D-03 | `fmtQty` / `formatQtyFr` — نسختان                                                   | `src/features/sales/sell/sell-search.ts:83-85` ↔ `sell-weight.ts:44-46`                                                                                                                                                     | انحراف                                                                            | P2       |
| D-04 | `percentOfMinor` (canonical) مُعاد تنفيذها inline مرّتين                            | `src/domain/money/money.ts:194` ↔ `src/domain/zakat/zakat-rules.ts:59` ↔ `src/domain/returns/return-policy.ts:84`                                                                                                           | **قاعدة مالية واحدة في 3 مواضع**؛ النسختان inline بلا `assertSafeTotal` قبل الضرب | P2       |
| D-05 | `multiplyMinorByQuantity` مُتخطّاة في 7 مواقع                                       | `src/domain/money/money.ts:178` ↔ `NewCustomerReturnDialog.tsx:119, 252` · `NewSupplierReturnDialog.tsx:140, 303` · `returns/dialogs/DetailsDrawer.tsx:217` · `useClientDrawerActions.ts:178` · `SupplierPOsDialog.tsx:163` | **بلا حارس overflow** قبل الضرب ⇒ سطر قد يتجاوز `MAX_MINOR_TOTAL`                 | P2       |
| D-06 | `daysOverdue` / `daysBetween` / `daysOverdue` (renderer) — 3 تطبيقات لتفاضل التاريخ | `src/domain/customer/credit-policy.ts:20-35` ↔ `src/domain/returns/return-policy.ts:38-46` ↔ `src/features/debts/types.ts:88-90`                                                                                            | انحراف (BOT/ज़ोन)                                                                 | P2       |
| D-07 | `strictOrNeg` / `strictOrNum` — نسختان                                              | `src/shared/money/parse.ts:8-15` ↔ `src/features/stock/dialogs/IntakeDialog.tsx:168-174`                                                                                                                                    | انحراف                                                                            | P3       |
| D-08 | `asMinor` (customers) — 3rd helper تحويل مبلغ                                       | `src/features/customers/client-matching.ts:18-21`                                                                                                                                                                           | انحراف عن `money.ts`                                                              | P3       |
| D-09 | آليتا «منع الإرسال المزدوج» مختلفتان                                                | `src/features/settings/bits.tsx:57-72` (state = **معطوب**) ↔ `src/features/sales/sell/useSellState.ts:46-48` (ref = صحيح)                                                                                                   | **A-02**                                                                          | P1       |

---

### E. المال والذرّية (تدقيق حصري — أولوية قصوى)

> **نتيجة العمود Money**: **نظيفة**. لا float في أي حساب مبلغ، ولا transaction
> ناقصة، ولا channel حسّاس بلا Zod. المحور مسجَّل بالكامل لأن القاعدة 4 هي
> الحاجز الأخير، وخلل واحد فيها يمحو كل ما سبق.

| #    | الفحص                         | النتيجة                                                                                                                                                                                                                                   | الدليل                                                                                                                                                     |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | `parseFloat` في `src/`        | **0**                                                                                                                                                                                                                                     | بحث كامل `src/**`                                                                                                                                          |
| E-02 | `toFixed` على مبلغ            | **0** (4 استعمالات غير نقدية: حجم ملف — `src/shared/formatters/files.ts:8-9`, `SettingsSectionsB.tsx:598,1222`)                                                                                                                           |                                                                                                                                                            |
| E-03 | `Number(` في حساب نقدي        | **0**                                                                                                                                                                                                                                     | كل الاستعمالات تحويلات قيم DB أو قطع تواريخ                                                                                                                |
| E-04 | `* 100` / `/ 100` على مبلغ    | كلها آمنة: `money.ts:118` (حارس قبل الضرب)، `money.ts:137` (نتيجة صحيحة)، `money.ts:199` (نسبة)، `src/domain/ocr/numbers.ts:65` (أعداد صحيحة من regex + فحص `isSafeInteger`)، `PayDialog.tsx:78` (ثوابت DZD صحيحة)                        |                                                                                                                                                            |
| E-05 | مصدر المال الوحيد             | `src/domain/money/money.ts` (202 سطر) + `src/shared/formatters/format.ts` + `src/shared/money/parse.ts`                                                                                                                                   | لا مصدر موازٍ                                                                                                                                              |
| E-06 | `db.transaction(`             | **67** موضعًا (61 في `handlers/*.repo.ts` + 6 خارجها)                                                                                                                                                                                     |                                                                                                                                                            |
| E-07 | `await` داخل transaction      | **0**                                                                                                                                                                                                                                     | `transaction(\s*async` ⇒ لا نتائج                                                                                                                          |
| E-08 | كتابة خارج transaction        | 5 مواضع (§A-20) — كلها جملة واحدة وموثّقة                                                                                                                                                                                                 |                                                                                                                                                            |
| E-09 | `db.pragma(` خارج transaction | 5 مواضع — كلها `wal_checkpoint` + إعادة تأكيد `foreign_keys` (لا فائدة داخل transaction في SQLite)                                                                                                                                        | `sqlite.service.ts:105,283,357,441` + `registry.core.ts:115`                                                                                               |
| E-10 | FIFO fail-closed وقت التشغيل  | **نعم** — `electron/ipc/handlers/fifo.ts:16-21` `assertCallerTransaction()` تُستدعى من `createLayer:78`, `consumeLayers:136`, `restoreToLayers:199`, `deductIntakeLayers:255`؛ مغطّاة بـ `tests/integration/fifo-tx-guard.test.ts:92-104` |                                                                                                                                                            |
| E-11 | transaction متداخلة           | آمنة — better-sqlite3 يستعمل SAVEPOINT: `purchases.repo.ts:332` داخل `:281`                                                                                                                                                               |                                                                                                                                                            |
| E-12 | `operationId` مُطبَّق مركزيًا | `handle.ts:88-93` + `validators.common.ts:80-98` (يخترق `ZodEffects`)                                                                                                                                                                     |                                                                                                                                                            |
| E-13 | حقن SQL                       | **0** — كل الاستعلامات prepared؛ الاستثناء الوحيد `db.exec` ديناميكي في `backup.service.ts:85-97` (مُهرَّب: NUL/LF/CR/`;`/`--` مرفوض + `'`→`''` + اسم ملف مولَّد)                                                                         |                                                                                                                                                            |
| E-14 | `run-sql` عام                 | **0**                                                                                                                                                                                                                                     | `channels.ts:2` يوثّق الرفض بالتصميم                                                                                                                       |
| E-15 | `PRAGMA foreign_keys = ON`    | مطبَّق على **الاتصال الوحيد** (`sqlite.service.ts:38`) ومُعاد التأكيد بعد المهاجرات (`:283`)                                                                                                                                              | ⚠️ **الاستثناء**: اتصال `readonly` للتحقّق (`sqlite.service.ts:328`) **بلا pragmas** ⇒ `busy_timeout` مفقود ⇒ `integrity_check` قد يفشل زورًا (F-44 في §F) |
| E-16 | أولوية `operationId`          | 21 مخططًا تشترطه صراحة (مجمّد في `operation-id-coverage.test.ts:16-37`) + `idempotentIdSchema` لـ 10 قنوات؛ **39 مخططًا تشترطه فعليًا** ⇒ **19 غير مُصنَّفة** (§I-03)                                                                     |                                                                                                                                                            |
| E-17 | تكامل العدّاد مع البوابات     | `sales.create` بوابة `discount` إضافية (`staff-gates.ts:160-181`) — تحقّق ✓                                                                                                                                                               |                                                                                                                                                            |
| E-18 | حدّ ائتمان (ADR-110)          | `src/domain/customer/debt-rules.ts:75` (`assertCreditSaleAllowed`) + `:110` (`assertCreditLimitNotExceeded`) + بوابة `credit-gates.ts`                                                                                                    | مغطّاة بـ `tests/unit/credit-limit.test.ts` + `tests/integration/sale-credit-limit.test.ts`                                                                |
| E-19 | تسلسل Fiat/Ray                | `allocateInvoiceNumber` (`sales.repo.ts:167`) + `number_sequences` + pre-allocation (0024/0025)                                                                                                                                           | ⚠️ bump التسلسل خارج transaction (§A-20) ⇒ فجوة في السلسلة عند انهيار — **مقبول وموثّق**                                                                   |

---

#### E-bis. نتائج حارس قاعدة البيانات (db-guardian) — 7 High مكتشفة في هذا التدقيق

> هذه النتائج **جديدة** (ليست موروثة من تقرير 2026-10-18) وقد **تحقّقتها بنفسي**
> قبل إدراجها. ترتيبها حسب الخطورة.

##### E-20 — تحويل Proforma إلى vente **يفشل دائمًا** إذا كان هناك remise | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/proformas.repo.ts:500` ↔ `electron/ipc/handlers/sales.repo.ts:264-267`.
- **الوصف**:
  ```ts
  // proformas.repo.ts:500
  discountType: discount > 0 ? "amount" : "none",
  ```
  ```ts
  // sales.repo.ts:264-267
  // FIX-P1-02 (fail-closed MONEY-ROOT) : seul le type "none" existe — la
  // remise vit dans les lignes (P0-7). ...
  if (input.discountType !== "none") {
    throw new Error("Type de remise non pris en charge (remises par lignes uniquement).");
  }
  ```
- **الآلية/السبب الجذري**: نموذج Proforma ما زال يحمل remise على مستوى السطر
  (`discountType: "amount"`)، بينما نموذج Vente (ADR-028 / P0-7) **يرفض أي
  `discountType` غير `"none"`** (fail-closed لمنع نسبة مئوية عائمة في عمود
  INTEGER). المساران لم يُزامَنَا بعد انتقال Remise إلى مستوى السطر.
- **الأثر**: **أي devis عليه remise لا يمكن أبدًا تحويله إلى فاتورة** ⇒ مسار
  «Devis → Facture» معطّل. شدّة: High (مسار عمل كامل معطّل). **الاحتمال: Certain**
  (الشرط `discount > 0`).
- **الدليل**: المقتطفان أعلاه (مقروءان مباشرة).
- **المقارنة المرجعية**: `src/domain/proforma/proforma-rules.ts:23`
  (`computeProformaTotals`) و`src/domain/sales/sale-rules.ts:93`
  (`computeSaleTotals`) — كلاهما يحسب remise على مستوى السطر ⇒ **الخلل في طبقة
  الـ repo لا في الدومين**.
- **الإصلاح المقترح**: `electron/ipc/handlers/proformas.repo.ts:500` — إرسال
  `discountType: "none"` دائمًا، وتحويل `discount` إلى remise **على مستوى
  السطر** (قابل للتوزيع على أسطر الـ proforma) قبل استدعاء `createSaleAtomic`.
- **اختبار الانحدار**: `tests/integration/` — proforma عليه remise → conversion ⇒
  البيع يُنشأ و`discount_amount_minor` مطابق.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-21 — الإغلاق اليومي (Z) لا يقفل الفترة | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/finance.repo.ts:212-215` (الحارس الوحيد).
- **الوصف**:
  ```ts
  const exists = db
    .prepare(`SELECT id FROM daily_closings WHERE business_date = ?`)
    .get(args.businessDate);
  if (exists) throw new Error("Clôture déjà effectuée pour cette date.");
  ```
  بحث «daily_closings» في كامل المستودع ⇒ **لا trigger، ولا guard، ولا check في
  أي handler كتابة** (الجدول يُستعمل في 4 مواضع فقط: `:195` list، `:213` exists،
  `:265` INSERT، والمخطّط `0001:345-358`).
- **الأثر**: بعد إغلاق يوم 2026-10-18، يُقبل بيع/دفعة/حركة مخزون بتاريخ
  2026-10-18 **ويُغيّر أرقام اليوم بصمت** دون إعادة فتح الفترة ⇒ **تقرير Z
  قابل للتزوير بعد إغلاقه**. شدّة: High. **الاحتمال: Probable**.
- **الإصلاح المقترح**: **مهجرة جديدة `0048_closing_period_lock.sql`** (قاعدة
  AGENTS §12: لا تعديل على هجرة مطبَّقة) — trigger على `sales`/`sale_payments`/
  `expenses`/`returns` يرفض الكتابة إذا `business_date` مغلقة؛ + مسار «إعادة
  فتح» صريح.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-22 — معادلة الإغلاق Z تحسب الخصم والشيك نقدًا، والمصروفات غير المدفوعة، والمرتجعات الملغاة | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/finance.repo.ts:216-233`.
- **الوصف** — الاستعلامات المستخدمة في الإغلاق:
  ```ts
  const cash = db
    .prepare(
      `SELECT COALESCE(SUM(amount_paid_minor),0) AS p FROM sales
     WHERE substr(created_at,1,10) = ? AND is_cancelled = 0`,
    )
    .get(args.businessDate);
  // ↑ لا فلتر على payment_method ⇒ يشمل cash + cheque + transfer
  const collections = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor),0) AS c FROM sale_payments
     WHERE substr(payment_date,1,10) = ? AND sale_id IS NULL`,
    )
    .get(args.businessDate);
  const expenses = db
    .prepare(`SELECT COALESCE(SUM(amount_minor),0) AS e FROM expenses WHERE expense_date = ?`)
    .get(args.businessDate);
  // ↑ لا فلتر على status ⇒ يشمل 'pending'
  const refunds = db
    .prepare(
      `SELECT COALESCE(SUM(amount_refunded_minor),0) AS r FROM returns
     WHERE substr(created_at,1,10) = ?`,
    )
    .get(args.businessDate);
  // ↑ لا فلتر على status ⇒ يشمل 'cancelled'
  ```
- **الآلية/السبب الجذري**: اسم العمود في الدومين **`cashSalesMinor`** والعقد
  يقول «ventes_espèces» (`src/domain/closings/closing-rules.ts:2`) — لكن الاستعلام
  لا يلتزم التعريف.
- **الأثر**: **تقرير Z (مطابقة النقدية) خاطئ على 3 محاور**: (1) درج النقد
  مبالغٌ عنه بقيمة كل بيع بالشيك/تحويل؛ (2) المصروفات **غير المدفوعة** تُخصم من
  الإغلاق؛ (3) **المرتجع الملغى** يطرح من الإغلاق. شدّة: High (تقرير مالي/جبائي
  خاطئ). **الاحتمال: Certain** (لا فلتر على الإطلاق).
- **الدليل**: المقتطف أعلاه + إثبات وجود الأعمدة:
  `0011_expenses_enrichment.sql:7-8` (`ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'paid' CHECK (...)`)
  و`0010_supplier_returns.sql:2-3` (`returns.status … CHECK (status IN ('validated','partially_refunded','refunded','cancelled'))`).
- **المقارنة المرجعية**: `src/domain/closings/closing-rules.ts:23-33` — الدالة
  **صحيحة**؛ الخلل في التجميع في SQL.
- **الإصلاح المقترح**: `electron/ipc/handlers/finance.repo.ts:216-233` — إضافة
  `AND payment_method = 'cash'`، و`AND status = 'paid'` على المصروفات، و
  `AND status != 'cancelled'` على المرتجعات.
- **اختبار الانحدار**: `tests/integration/` — يوم فيه بيع شيك + بيع نقدي +
  مصروف pending + مرتجع ملغى ⇒ الإغلاق = النقد فقط.
- **الجهد**: **S** (منطق) + **M** (تغطية). **الثقة**: **PROUVÉ**.

##### E-23 — avoir أكبر من رصيد العميل يُجهض المرتجع بالكامل | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/returns.repo.ts:338-352` ↔
  `database/migrations/0023_root_invariants.sql` (`trg_customers_outstanding_nonneg`).
- **الوصف** — نية موثّقة في المصدر:
  ```ts
  // un avoir supérieur au solde devient un avoir explicite, jamais effacé.
  if (args.creditMinor > 0 && sale.customer_id != null) {
    db.prepare(
      `UPDATE customers SET outstanding_balance_minor = outstanding_balance_minor - ?, …`).run(args.creditMinor, …);
  }
  ```
  بلا **clamp** ⇒ Trigger 0023:
  ```sql
  CREATE TRIGGER IF NOT EXISTS trg_customers_outstanding_nonneg
  BEFORE UPDATE OF outstanding_balance_minor ON customers
  WHEN NEW.outstanding_balance_minor < 0
  BEGIN SELECT RAISE(ABORT, 'Solde client incohérent : règlement supérieur à la dette.'); END;
  ```
- **الأثر**: السيناريو الأكثر شيوعًا — **بيع مدفوع بالكامل ثم مرتجع ب-avoir** ⇒
  `creditMinor > outstanding` ⇒ **ABORT** ⇒ rollback ⇒ **المرتجع لا يُنشأ أصلًا**
  ⇒ رسالة عامة `"Une erreur inattendue est survenue. Réessayez."`
  (`electron/ipc/ipc-errors.ts:74-76` يطابق `/RAISE|ABORT/`). السلوك الموثّق
  («avoir explicite») **لا يحدث أبدًا**. شدّة: High. **الاحتمال: Probable**.
- **الإصلاح المقترح**: `returns.repo.ts:338-352` — `Math.min(creditMinor, outstanding)`
  على الرصيد + تسجيل الفرق كـ «avoir en cours» (عمود/جدول جديد ⇒ **مهجرة 0048+**)
  أو رفض FR صريح قبل الـ UPDATE.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-24 — المرتجع **لا يعدّل** سند البيع ⇒ رقمان للدَّين لنفس العميل | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/returns.repo.ts:338-352` (يخصم من
  `customers.outstanding_balance_minor` فقط) مقابل
  `electron/ipc/handlers/customers.repo.ts:616` و
  `electron/ipc/handlers/sales.repo.ts:624` (وحدهما يكتبان
  `sales.remaining_balance_minor`).
- **الأثر**: بعد مرتجع بـ 3 000 على بيع 10 000: الحساب = 7 000، **السند = 10 000**.
  والواجهة تعرض الرقمين جنبًا إلى جنب:
  ```tsx
  // src/features/customers/dialogs/ClientDrawerDebts.tsx:130-145
  <dt>Dette actuelle (solde)</dt>   <dd>{formatDzd(customer.outstanding_balance_minor)}</dd>
  <dt>Reste des documents</dt>      <dd>{formatDzd(debtsRest)}</dd>
  ```
  ⇒ **Dettes / Dashboard / Reports / Zakat / APK** تعرض 5 أرقام مختلفة لنفس
  المؤشر. شدّة: High. **الاحتمال: Certain** (كل مرتجع).
- **الإصلاح المقترح**: اختيار **مصدر واحد للحقيقة** (إعادة حساب
  `sales.remaining_balance_minor` عند المرتجع، أو إسقاط العمود المادي)
  - محاذاة الاستعلامات الخمسة.
- **الجهد**: **L**. **الثقة**: **PROUVÉ**.

##### E-25 — لا يمكن إلغاء/عكس دفعة عميل أو مورّد | High | PROUVÉ | P1 (قرار منتج)

- **الموقع**: بحث `DELETE FROM sale_payments|UPDATE sale_payments|DELETE FROM supplier_payments|UPDATE supplier_payments`
  في `electron/` ⇒ **0 نتيجة**. `IPC_CHANNELS` لا تحوي `payments.cancel` ولا
  `payments.refund`.
- **الأثر**: خطأ بشري في تسجيل دفعة **غير قابل للتصحيح**؛ التصحيح الوحيد هو قيد
  تعويضي (بيع/مصروف جديد) ⇒ **تلوّث السجلّ المحاسبي**. شدّة: High.
  **ملاحظة**: `sales.cancel` **موجود** ويفرّخ السجلّ والدَّين والمخزون — لكنه
  **لا يعكس سطر `sale_payments`** ولا يصفّر `amount_paid_minor`/`payment_status`
  (`sales.repo.ts:614-626`)، رغم أن الواجهة تَعِد: _"Le stock sera restauré et
  **l'encaissement annulé**"_ (`src/features/sales/sell/sell-finalize.ts:283`).
  ⇒ المبلغ النقدي المحصَّل يختفي من كل تقرير (مستبعَد بـ `is_cancelled = 0`).
- **الإصلاح المقترح**: (أ) قناة `payments.cancel` جديدة (ـ `operationId` +
  transaction واحدة تعكس `sale_payments` + `sales.amount_paid_minor` +
  `customers.outstanding_balance_minor`)؛ و(ب) في `sales.cancel` إما عكس الدفعة
  أو تصحيح نصّ الواجهة.
- **الجهد**: **L**. **الثقة**: **PROUVÉ**.

##### E-26 — `products.update` يغيّر المخزون **بلا حركة في `stock_movements`** | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/handlers/products.repo.ts:288-338` (الكتابة + FIFO)
  مقابل `src/features/products/dialogs/FormDialog.tsx:227`
  (`// M-3 : pure update — pas d'operationId`).
- **الوصف**: `UPDATE products SET … quantity=? …` ثم `createLayer`/`consumeLayers`
  (FIFO) — **ولا `INSERT INTO stock_movements`** (12 مسارًا آخر من مسارات تغيير
  الكمية تكتب سطر حركة).
- **الأثر**: **دفتر المخزون لا يُطابق `products.quantity`** ⇒ «historique des
  mouvements» فارغ لهذه العملية، والتسوية `SUM(stock_movements.quantity_delta)`
  ≠ `products.quantity`؛ ولا `operationId` ⇒ لا تكرارية. شدّة: High.
- **الإصلاح المقترح**: `products.repo.ts:288-338` — تمرير تغيير الكمية عبر
  `adjustStockAtomic` (المسار الموحّد) أو على الأقل كتابة سطر
  `stock_movements` + اشتراط `operationId`.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-27 — الأتعاب (fret) لا تُرحَّل إلى تكلفة المخزون | Medium-High | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/inventory.repo.ts:288-306`
  (`landing_cost_minor = p.cost` و`unitCostMinor: p.cost`) مقابل
  `src/features/stock/dialogs/IntakeDialog.tsx:210, 248, 513`
  (الـ renderer يحسب «Coût rendu estimé» **للعرض فقط** ولا يبعثه).
- **الأثر**: **قيمة المخزون (مصدر «Stock» في الزكاة) ناقصة بقيمة كل الأتعاب**،
  و**الهامش الإجمالي مُبالَغ فيه** في كل شراء بأتعاب. شدّة: Medium-High.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-28 — `customers.phone` بلا قيد تفرّد (0034 يخصّ `customer_access.phone_hash`) | Medium-High | PROUVÉ | P1

- **الوصف**: `database/migrations/0001_initial_schema.sql:114` — `phone TEXT,`
  (قابل لـ NULL، بلا UNIQUE) · `0002:11` — `CREATE INDEX idx_customers_phone`
  (**غير فريد**) · `0034_client_access_phone_unique.sql:34-36` — قيد فريد
  **جزئي** على `customer_access(phone_hash)` فقط.
  ⇒ **ادّعاء playbook «0034 = تفرّد الهاتف» غير صحيح**؛ الواقع: تفرّد
  `customer_access.phone_hash` فقط.
- **الأثر**: عميلان بالهاتف نفسه ممكنان ⇒ بحث APK بالهاتف غير حاسم؛ الكاشيء
  ينشئ نسخة مكرّرة. شدّة: Medium-High.
- **الإصلاح المقترح**: **مهجرة 0048+** — فهرس فريد جزئي على
  `customers(phone)` حيث `deleted_at IS NULL AND phone IS NOT NULL` + تصحيح
  playbook.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-29 — ثلاث تنفيذات مختلفة لتطبيع اسم البحث | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/customers.repo.ts:32-42` (`\p{M}` + `œ→oe`) ↔
  `src/features/customers/client-matching.ts:7-15` (`[^a-z0-9 ]` ⇒ `œ` تصبح
  **مسافة**) ↔ `database/migrations/0047_customer_search_norm.sql:16-67`
  (قائمة فرنسية ثابتة).
- **الأثر**: `œ` يُوحَّد في main إلى `oe` وفي src إلى مسافة ⇒ **مطابقة الدرج
  تخالف فهرس البحث**؛ الصفوف التاريخية تُفقد قابلية الاكتشاف. شدّة: Medium.
- **الإصلاح المقترح**: `src/features/customers/client-matching.ts:7-15` — اعتماد
  دالة واحدة (مقابل main) + اختبار parité جديد.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

##### E-30 — `debt_status = 'overdue'` لا يُكتب أبدًا ⇒ «en retard» في APK غير قابل للوصول | Medium | PROUVÉ | P2

- **الأثر**: كل الكتّابة الأربعة تكتب فقط `'none' | 'due' | 'over_limit'`
  (`sales.repo.ts:442`, `customers.repo.ts:245,602`, `returns.repo.ts:341`) ⇒
  حالة APK «en retard» (`mobile/src/views.ts:132`, `tokens.ts:45-47`) **ميتة**.
  و`src/domain/customer/credit-policy.ts:7-17` (`agingBucket`) **كود ميت**.
- **الجهد**: **M** (قرار: إمّا الكتابة، إمّا حذف الحالة). **الثقة**: **PROUVÉ**.

##### E-31 — `paginationSchema.page` بلا حدّ ⇒ OFFSET غير محدود | Medium | PROUVÉ | P2

- **المocation**: `electron/ipc/validators.common.ts:63-66`
  (`page: z.number().int().min(1)` — **بلا max**) ⇒ `OFFSET = (page-1) * pageSize`
  غير محدود؛ مواقع: `sales.repo.ts:52` · `customers.repo.ts:128` ·
  `finance.repo.ts:109` · `inventory.repo.ts:534` · `history-query.ts:303-305`
  (17 فرع UNION — الاستعلام الأغلى).
- **الجهد**: **S** (حدّ أقصى) أو keyset pagination. **الثقة**: **PROUVÉ**.

##### E-32 — تقرير الفئة (filtre catégorie) يكسر الهامش | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/finance.repo.ts:509-512` (الإيراد =
  `s.total_minor` = **البيع كاملًا**) مقابل `:528-537` (COGS = **أسطر الفئة فقط**).
- **الأثر**: مع فلتر فئة، الهامش **مُبالَغ فيه** منهجيًا (قد يصل 100%).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-33 — شاشة التاريخ تعرض دفوعات المبيعات الملغاة | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/history-query.ts:90-100` (بلا `is_cancelled`)
  مقابل `finance.repo.ts:658-661` (المستبعدة).
- **الأثر**: **سجلّ التدقيق يناقض تقرير Z**. **الجهد**: **S**.
  **الثقة**: **PROUVÉ**.

##### E-34 — `parseDzdInputStrict` يفقد سنتيمًا على إدخال من 3 كسور | Low | PROUVÉ | P3

- **الموقع**: `src/domain/money/money.ts:131-139` — `"10.005" → 10.005*100 =
1000.4999999999999 → Math.round → 1000` (ينزل centime) خلافًا للنية
  «round half away from zero» (`:111`). نفس في `fromDzd:118`.
- **الإصلاح**: `Math.round(Number((n * MINOR_PER_MAJOR).toFixed(6)))` أو حساب
  بالمشاركة (string) — أو رفض المدخلات > 2 كسور صراحةً.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

##### E-35 — كل تواريخ الأعمال بتوقيت UTC بينما المحل بتوقيت UTC+1 | Low | PROUVÉ | P2

- **الوصف**: `new Date().toISOString()` في كل handler + `substr(created_at,1,10)`
  - `date('now')` ⇒ **حدّ اليوم مُزاح ساعة**، ومغلقات Z تقطع اليوم عند 01:00
    بدل 00:00.
- **الإصلاح المقترح**: **قرار منتج** (حدّ اليوم `Africa/Algiers`، أو اعتماد
  «jour métier» مُعرَّف في الإعدادات).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-36 — طبقة التحقّق **لا** تفحص نقاء المال ولا الذرّية ولا تغطية `operationId` | Medium-High | PROUVÉ | P1

- **الأدلة**:
  - `scripts/database/verify-migrations.mjs` (1381 سطرًا) — **44 كتلة تأكيد** على
    المخطّط (سليمة ومفيدة) لكنّه **يتوقّف عند 0044** ⇒ **0045 / 0046 / 0047 غير
    مُسنَدة إطلاقًا**.
  - `scripts/quality/verify-domain.ts` (179 سطرًا) — 30 تأكيدًا على دوال نقية؛
    **لا** يفحص الذرّية ولا نقاء المال ولا التكرارية؛ ويعيد حساب معادلة الزكاة
    **inline** (`:86`) بدل استدعاء `computeZakat` ⇒ **انحراف الدومين عن مرآة
    main لن يُكتشف**؛ + **تعليق كاذب** `:13-16` (§C-03).
  - `tests/unit/operation-id-coverage.test.ts` — (§I-02).
  - اختبار «double-submit» موجود **لـ `sales.create` فقط**
    (`tests/integration/sale-credit-limit.test.ts:185-191`,
    `tests/integration/cart-delivery-fee.test.ts:162-163`) ⇒ **لا** اختبار
    لـ `customers.recordPayment` / `suppliers.pay` / `returns.create` /
    `returns.refund` / `stock.adjust` / `stock.intake` / `stock.inventory` /
    `closings.create` / `zakat.save` / `products.import`.
- **الأثر**: انحدار في الذرّية أو التكرارية أو نقاء المال **لا يُكتشف** بأي بوابة.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

##### E-37 — استيراد CSV لا يكتب حركة مخزون | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/import.repo.ts:61-92`.
- **ملاحظة إيجابية**: الاستيراد **ذرّي all-or-nothing** (تحقّق كل الصفوف قبل
  أي كتابة) ⇒ «فشل الصف 50 من 100» ⇒ **0 منتج، 0 طبقة، 0 سجلّ تدقيق**.
- **الأثر**: نفس انحراف دفتر المخزون (E-26) لكن bulk (حتى 5000 صف).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

### F. قاعدة البيانات والمهاجرات

| #    | الفحص                                 | النتيجة                                                                                                                                                                                                                                                                                                                                                                     | الدليل                                                                                                                                                       | الأولوية   |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| F-01 | عدد المهاجرات وترقيمها                | **47** ملف، **متّصلة 0001→0047** بلا فجوة ولا تكرار                                                                                                                                                                                                                                                                                                                         | `database/migrations/`                                                                                                                                       | —          |
| F-02 | Checksum / immutability               | `verify:migrations` ⇒ **MIGRATIONS VERIFIED**؛ `sqlite.service.ts:254-264` يتحقّق SHA-256 لكل هجرة مطبَّقة ويرفض فتح قاعدة منحرفة                                                                                                                                                                                                                                           |                                                                                                                                                              | —          |
| F-03 | إعادة تشغيل على قاعدة نظيفة           | `tests/database/migrations.test.ts` (287 سطر) + `tests/integration/*`                                                                                                                                                                                                                                                                                                       |                                                                                                                                                              | —          |
| F-04 | هجرات مدمِّرة                         | `DROP TABLE` في 0004 / 0025 / 0038 / 0040 — نمط «recreate table» لـ NOT NULL / FK (مقصود في SQLite)                                                                                                                                                                                                                                                                         | `0004:32`, `0025:49,85`, `0038:33,59`, `0040:50,77`                                                                                                          | P3 (توثيق) |
| F-05 | **CREATE INDEX مكرَّر عبر المهاجرات** | **17 اسم فهرس** مُعلَن 2–3 مرات (كلها `IF NOT EXISTS` ⇒ بلا أثر وقت التشغيل، لكن تعريف المخطَّط مُنتشر)                                                                                                                                                                                                                                                                     | `0002:20` ↔ `0004:37` (`idx_sale_payments_sale`) · `0002:26` ↔ `0011:12` ↔ `0040:54` (`idx_expenses_date`) · `0018:42` ↔ `0040:82` (`idx_consumption_layer`) | P3         |
| F-06 | **فهارس ناقصة للاستعلامات الساخنة**   | **6 استعلامات بلا فهرس مناسب**: فرع عملاء `debts.list` (`finance.repo.ts:54-62`) · فرع مورّدين `debts.list` (`:65-72`) · `debts.stats` (`:124-148`) · ترتيب قائمة المخزون (`inventory.repo.ts:471-482` — `COLLATE NOCASE` على فهرس BINARY) · بحث العملاء (`customers.repo.ts:51, 87-120` — `LIKE '%…%'` + `REPLACE()`×8) · ترتيب `history.list` (17 فرع `UNION ALL` مرّتين) |                                                                                                                                                              | **P2**     |
| F-07 | تغطية الفهارس bewildering             | 118 `CREATE INDEX` عبر 24 ملف                                                                                                                                                                                                                                                                                                                                               | 4 استعلامات مغطّاة بالكامل، 2 جزئيًا                                                                                                                         | —          |
| F-08 | اتصال ثانٍ بلا pragmas                | `sqlite.service.ts:328` (`readonly` probe) بلا `foreign_keys`/`busy_timeout`                                                                                                                                                                                                                                                                                                |                                                                                                                                                              | P3         |

---

### G. عقود IPC والواجهة

#### G-1. مصفوفة التغطية 3 مستويات (محسوبة، لا مقدَّرة)

```
channels.ts = 177 مفتاحًا | قنوات مكشوفة في preload = 175 | wrappers api.* = 168
```

| النتيجة                                                                                  | العدد | القناة                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| قنوات **بلا** استدعاء renderer (دقة 3 مستويات: channels → preload → ipc-client → `src/`) | **7** | `announcements.save` · `printer.get` · `templates.get` · `recovery.retry` · `recovery.exit` · `window.maximizedChanged` · `ocr.progress`                                                                                                    |
| منها **ميتة فعلًا**                                                                      | **3** | `announcements.save` (قرار منتج) · `printer.get` · `templates.get` (ورشة)                                                                                                                                                                   |
| منها **خاطئة ظاهريًا** (مستهلكة بطريقة أخرى)                                             | **4** | `recovery.retry`/`recovery.exit` (HTML النافذة `electron/main/recovery-view.ts:95,100`) · `window.maximizedChanged` (اشتراك `bridge.window.onMaximizedChanged`, `ipc-client.ts:107-111`) · `ocr.progress` (push event، `ipc-client.ts:198`) |

⇒ **بعد ADR-118 + ADR-119، لم يبقَ سوى 3 قنوات ميتة** (كان 6 في تقرير 2026-10-18).

| #    | الفحص                                                                  | النتيجة                                                                                                                                                                                                                                                                                                                 | الدليل     | الأولوية |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| G-02 | تغطية 8 مستويات لكل قناة                                               | 6 مستويات **مكتملة 100%** (تعريف · validator · handler · preload · typing · استدعاء renderer)؛ المستوى 7 (اختبار لكل قناة) **جزئي**؛ المستوى 8 (UI) ناقص لـ 3 قنوات                                                                                                                                                     |            | P2       |
| G-03 | **`FROZEN_SCHEMA_COUNT` لا يغطّي كل المخططات**                         | `tests/unit/validators-inventory.test.ts:8-19` (قائمة `MODULES` بـ 10 ملفات) **تستثني `validators.staff.ts`** (7 مخططات) ⇒ **113 مجمّد مقابل 120 فعلي**. إضافة/حذف مخطط staff **لا يُفشل الاختبار**                                                                                                                     | **PROUVÉ** | **P1**   |
| G-04 | `bridge-shape` يغطي `*Schema` فقط                                      | `tests/unit/bridge-shape.test.ts:72` — `/export const (\w+Schema)/g`. **8 تصديرات Zod في `validators.common.ts` خارج التغطية**: `isRealCalendarDate:10`, `businessDate:22`, `quantity:34`, `moneyMinor:44`, `moneyMinorPositive:46`, `optionalOperationId:48`, `quantityNonNegative:51`, `schemaRequiresOperationId:80` | **PROUVÉ** | **P1**   |
| G-05 | `bridge-shape` عتبة tautological                                       | `:73` — `expect(names.length).toBeGreaterThan(10)` والعدد الفعلي **120** ⇒ حارس «≥ 11»                                                                                                                                                                                                                                  | **PROUVÉ** | P2       |
| G-06 | `bridge-shape` استثناءات مكتوبة يدويًا                                 | `:90-99` — 8 مخططات معفاة من فحص «schéma mort» (وهي بالضبط المخططات غير الموجودة في registry/printing/backup/ocr) ⇒ **القائمة أُنشئت为了让 الاختبار ينجح**                                                                                                                                                              | **PROUVÉ** | P2       |
| G-07 | `ipc-channel-inventory` `SCANNED` قائمة ملفات صريحة                    | `:14-36` — تستثني `license-gates.ts`، `raw-guards.ts`، `staff-gates.ts`                                                                                                                                                                                                                                                 | **PROUVÉ** | P3       |
| G-08 | `ocr.progress` ليس في `PUSH_ONLY`                                      | `tests/unit/ipc-channel-inventory.test.ts:12` — `PUSH_ONLY = {"window.maximizedChanged"}` فقط؛ الاختبار ينجح لأن `ocr.service.ts:92` يحتوي `IPC_CHANNELS["ocr.progress"]` (نص) ⇒ **ينجح للسبب الخاطئ**                                                                                                                  | **PROUVÉ** | P3       |
| G-09 | `templates.testPrint` في `LICENSE_PROTECTED_CHANNELS` لا يُفعَّل أبدًا | `license-gates.ts:73` يضعه، لكن القناة مسجَّلة **خامًا** في `printing.studio.ts:49` ⇒ `handle()` (القارئ الوحيد) لا يُستدعى لها. (الترخيص الفعلي قائم عبر `guardPrint("receipt-80mm", ["sales"])` ⇒ **إعداد ميت مضلِّل**)                                                                                               | **PROUVÉ** | P2       |
| G-10 | 168/175 استجابات IPC مُنمَّطة `unknown`                                | `src/shared/types/ipc-client.ts:18` — `return res.data as T`؛ نوع الجسر في `src/vite-env.d.ts:10-258` (لا في `src/shared/types/ipc-*.ts` كما يوحي العقد)                                                                                                                                                                | **PROUVÉ** | P2       |
| G-11 | سطح preload                                                            | **30 namespace / 177 طريقة**؛ **لا** `invoke(channel)` عام، **لا** `ipcRenderer`/`fs`/`path`/`shell` مكشوفة؛ مُقاس في `bridge-shape.test.ts:24-29`                                                                                                                                                                      | **PROUVÉ** | —        |
| G-12 | `RAW_GUARDED_CHANNELS` قائمة **قديمة أيضًا**                           | 34 مُدخَلة مقابل **42 قناة خام حقيقية** (backup 6 + ocr 4 + printing 26 + templates 2 + printer 2 + recovery 2) ⇒ `backup.list`, `backup.status`, `printer.get` غير مُدرجة                                                                                                                                              | **PROUVÉ** | P1       |

---

#### G-bis. الترخيص (licensing) — النتائج المُتحقَّق منها شخصيًا

##### G-13 — حارس ESLint «لا عربية في `src/`» **خامل تمامًا** (القاعدة غير مطبَّقة آليًا) | High | PROUVÉ | P1

- **الموقع**: `eslint.config.mjs:126-142` (القاعدة) · `src/domain/ocr/numbers.ts:22` (المخالفة الحاضرة).
- **الوصف**: القاعدة المعلَنة:
  ```js
  files: ["src/**/*.ts", "src/**/*.tsx"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: "Literal[value=/[€\\u0600-\\u06FF]/]", message: "POS UI FR uniquement : littéral €/arabe interdit dans src/ (APK : mobile/ seul, ADR-051)." },
      { selector: "TemplateElement[value.raw=/[€\\u0600-\\u06FF]/]", message: "…" }],
  }
  ```
- **الآلية/السبب الجذري**: مُحدِّد `esquery` الذي يستعمله ESLint **لا يستطيع
  표현 أصناف محارف غير ASCII**؛ وجود `€` أو `\\u0600-\\u06FF` داخل المُحدِّد
  يجعل **المُحدِّد كلّه صامتًا** (لا خطأ ولا مطابقة) ⇒ القاعدة لا تُفعَّل أصلًا.
- **الأثر**: **ضمان ADR-051 غير مطبَّق آليًا**: «Le POS (`src/`, Electron, tickets)
  reste français uniquement. Aucune chaîne arabe n'entre dans le POS»
  (`docs/ADR-051-apk-bilingue-exception.md:13`). اليوم 4 مخالفات موجودة:
  **وظيفية** واحدة `src/domain/ocr/numbers.ts:22`
  (`.replace(/[€$£دج]|DZD|DA\b/gi, " ")` — رمز الدينار العربي داخل regex في
  `src/domain/`!) و**3 تعليقات** في `electron/ipc/validators.print.ts:177`،
  `electron/printing/printing.payment.ts:25`،
  `electron/printing/receipt-documents/payment-ticket.ts:17`.
  ⇒ **أي نص عربي جديد يدخل `src/` دون أن يوقفه أي شيء**.
  شدّة: High (قاعدة gouvernance معلَنة وحارسها ميت).
- **الدليل** (أُعيد تشغيله بنفسي):
  ```
  # A : الملف الحقيقي الذي يحوي العربية
  Get-Content src/domain/ocr/numbers.ts -Raw | npx eslint --stdin --stdin-filename src/domain/ocr/numbers.ts
  → EXIT_A = 0      (بلا أي خطأ، رغم وجود "دج" في السطر 22)
  # B : حقن literal عربي صريح في الملف نفسه
  → EXIT_B = 0      (بلا أي خطأ)
  ```
  ⇒ القاعدة **لا تطلق** على مخالفة موجودة فعلًا.
- **المقارنة المرجعية**: التعليق في `eslint.config.mjs:124-125` يدّعي أن للـ OCR
  «son propre bloc» — **لا يوجد أي bloc استثناء** في الملف.
- **الإصلاح المقترح**: `eslint.config.mjs:126-142` — استبدال المحدّد بمحرّك
  **بلا اعتماد على regex-esquery**: (أ) `no-restricted-syntax` على
  `Literal[value=/[^\x00-\x7F]/]` (ASCII-only ⇒ نظيف)، مع استثناء صريح لـ
  `src/domain/ocr/numbers.ts`؛ أو (ب) سكربت `scripts/quality/verify-fr-only.mjs`
  (نمط `verify-domain.ts`) يُفحص فيه `src/` و`electron/` بـ regex **JS** (وهو
  يعمل) ويُضاف إلى CI.
- **اختبار الانحدار**: اختبار يُحقن عربية في `src/` ويتوقّع الرفض.
- **الجهد**: **S**. **الثقة**: **PROUVÉ** (إعادة تشغيل ناجحة).

##### G-14 — تدوير مفتاح الترخيص **يُبطل كل الرخص المُصدَرة سابقًا** | High | PROUVÉ | P1 (قرار)

- **الموقع**: `scripts/licensing/keygen.mjs:15-33` (التدوير = `--force`، **يستبدل**
  `resources/license/public.key` بملف **متابَع**) ↔
  `electron/licensing/public-key.ts:13-52` (التحقّق يقرأ **مفتاحًا واحدًا** فقط،
  **بلا قائمة مفاتيح سابقة**) ↔ `electron/licensing/protocol.ts:305-311`
  (فشل ⇒ `INVALID_SIGNATURE`).
- **الأثر**: بعد تدوير المفتاح، **كل** رخصة سابقة تصبح `INVALID_SIGNATURE` على
  أجهزة العملاء. هذا موثّق صراحةً في `docs/licensing/KEY_MANAGEMENT.md:24-37`
  («Ré-émettre les licences actives») و`docs/ADR-115-rotation-cles-licensing-verify.md:42-45`
  (يسرد 4 رخص became `INVALID_SIGNATURE`)، وفي
  `license-manager/ipc/registry.ts:122-123` («acte irréversible»).
  ⇒ ليست عيبًا بل **قرار تصميمي عالي الأثر**؛ الخطر أن **لا حارس آلي** يمنعه:
  `package.json:53` يعرّف `verify:licensing` لكنّه **غير موجود في
  `.github/workflows/ci.yml` ولا في أي سكربت `package*`** ⇒ حارس ADR-115
  **لا يعمل آليًا أبدًا**.
- **الجهد**: **M** (قائمة مفاتيح + توصيل `verify:licensing` بالـ CI).
  **الثقة**: **PROUVÉ**.

##### G-15 — المانجر يستطيع إصدار رخصة **يرفضها الـ POS** | High | PROUVÉ | P1

- **الموقع**: `license-manager/ipc/validators.ts:59`
  (`z.string().regex(/^\d{4}-\$2-\$2\$/)` — **تحقّق الشكل فقط، بلا تحقّق تقويمي**)
  ↔ `electron/licensing/protocol.ts:184-186`
  (`Date.parse(d)` ⇒ `NaN` ⇒ `CORRUPTED_STATE`).
- **الأثر**: تاريخ غير موجود تقويميًا (مثل `2026-02-30`) ⇒ المانجر يوقّع
  ترخيصًا **صحيح التوقيع** لكن الـ POS يرفضه بـ `CORRUPTED_STATE` ⇒ ترخيص
  مُنتَج لا يعمل عند العميل.
- **الإصلاح المقترح**: `license-manager/ipc/validators.ts:59` — استعمال
  `isRealCalendarDate` (المتوفّرة في `src/domain/common/dates.ts:5-15`).
  **الجهد**: **S**. **الثقة**: **PROUVÉ**.

##### G-16 — قاعدة بيانات المانجر **غير مشفّرة** at-rest | Medium | PROUVÉ | P2

- **الموقع**: `license-manager/db/manager-db.ts:76-102` — `new Database(file)` +
  `PRAGMA foreign_keys/journal_mode/busy_timeout` فقط؛ **لا `PRAGMA key`، ولا
  SQLCipher، ولا تشفير على مستوى الحقل**. المخطّط (`:19-56`) يخزّن
  `envelope_vlic` و`customer_ref` و`client_name` و`hardware_fingerprint`
  **بنصّه الصريح**.
- **المقارنة المرجعية**: الـ POS **يفرّض** أسرار السحابة بـ DPAPI
  (`electron/sync/sync-secrets.ts:33-46`) ⇒ **عدم تناسق**.
- **الأثر**: أي عملية تعمل بحساب المستخدم البائع تقرأ سجلّ التراخيص.
- **الجهد**: **L** (قرار: تشفير الحقل أو trust model). **الثقة**: **PROUVÉ**.

##### G-17 — `maxDevices` موقَّعة لكن **لا تُطبَّق** | Medium | PROUVÉ | P2 (قرار)

- **الموقع**: `electron/licensing/protocol.ts:211-214` (تحقّق من المدى فقط) ·
  `electron/licensing/license-service.ts:291` (عرض فقط) ·
  `license-manager/renderer/App.tsx:342` (افتراضي `"1"` في الواجهة).
- **الأثر**: ترخيص بـ `deviceBinding:false` يطفو على أي جهاز؛ وعد «1 جهاز» في
  واجهة المانجر **غير مُنفَّذ**. موثّق أصلًا في
  `docs/reports/PHASE_8_REPORT.md:55` («signé mais non contrôlé»).
- **الثقة**: **PROUVÉ**.

#### G-18 — APK والـ POS: تاريخ مختلف ب يوم، ومبالغ سالبة/تالفة متعاملة بشكل مختلف | High | PROUVÉ | P1

- **الموقع**: `mobile/src/format.ts:31-35` (تقطيع **UTC**) ↔
  `src/shared/formatters/format.ts:115-120` (`Intl` **بالتوقيت المحلي**).
- **الوصف**: `created_at` يُخزَّن UTC ⇒ بيعٌ عند **00:30 محلي** (Algeria، UTC+1)
  يُختم `2026-09-01T23:30:00.000Z` ⇒ **تذكرة الكاشيء تعرض 02/09/2026
  وAPK العميل يعرض 01/09/2026**.
- **الدليل** (أُعيد تشغيله بنفسي على هذا الجهاز، `TZ=Africa/Algiers`):
  ```
  MOBILE formatDateFr -> 01/09/2026
  POS     formatDateFr -> 02/09/2026
  ```
  شدّة: High (العميل يرى تاريخًا مختلفًا عن التذكرة).
- **انحرافات أخرى مُتحقَّق منها**:
  - **D2** السالب: `mobile/src/format.ts:20-21` يدعم السالب (`-1 250,00 دج`) ↔
    `src/domain/money/money.ts:147-157` **يرمي** ⇒ POS يعرض `"—"`.
  - **D3** التالف: `mobile/src/views.ts:75-80` (`num()`) يهبط إلى **0,00 DZD** ↔
    POS يرفض التصيير ⇒ «العميل يظنّ دينه = 0».
  - **D4** `overdue` لا يُكتب (§E-30) ⇒ APK يعرض «Endetté» حيث يعرض POS
    «En retard» (`mobile/src/screens/Home.tsx:26-31`).
  - **D5** لا مسار TVA في APK (الفارق ليس مبلغًا).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### G-19 — التزامن (sync) بلا إعادة محاولة ولا backoff ولا مهلة | Medium | PROUVÉ | P2

- **الموقع**: `electron/sync/sync.service.ts:220-262` — `fetch` **بلا
  `AbortController` ولا مهلة**؛ و`throw` داخل الحلقة ⇒ **صفّ واحد سيّئ يُجهض
  الدفعة كاملة**؛ و`sync_outbox.status` يبقى `'pending'` (لا حالة `'failed'`).
- **المقارنة المرجعية**: Edge function بلا إعادة محاولة أيضًا
  (`cloud/supabase/functions/client-sync/index.ts:81-237`)؛ الـ mobile عنده
  مهلة 10 s + `AbortController` (`mobile/src/api.ts:76-99`).
- **الأثر**: المرآة تتوقّف عن التحديث لذلك العميل بصمت.
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

#### G-20 — «الأحدث» في المرآة = أكبر `id` لا أحدث `created_at` | Medium | PROUVÉ + DYNAMIC-RISK | P2

- **الموقع**: `cloud/supabase/schema.sql:45-49`
  (`DISTINCT ON (customer_id, kind) … ORDER BY customer_id, kind, id DESC`).
- **الأثر**: إذا دُفعت لقطتان لنفس `(customer, kind)` خارج الترتيب الزمني، يخدم
  الـ APK **لقطة أقدم** بوسم `syncedAt` **أحدث** ⇒ **مبلغ دين قديم معروض
  كأنه حالي**.
- **الجهد**: **S** (ترتيب `created_at DESC, id DESC`). **الثقة**: **PROUVÉ** (المتّفق)
  - **DYNAMIC-RISK** (مسار التفعيل).

#### G-21 — 13 ملفًا من `mobile/src` (22) **لا يفحصها أي أمر typecheck** | High | PROUVÉ | P1

- **الموقع**: `mobile/package.json:12` (سكربت `typecheck` **موجود** لكن
  **orphan**: لا سكربت جذري ولا خطوة CI تستدعيه) ·
  `.github/workflows/ci.yml:26-39` (لا خطوة mobile) · `package.json:11-56`
  (**صفر** ورود لكلمة `mobile`).
- **الوصف**: `tsconfig.json` الجذري `include` = `["src","tests","scripts",…]`
  ⇒ 9 ملفات من `mobile/src` تدخل **عبر الصدفة** (من `tests/unit/mobile-*`)،
  بينما **13 ملفًا — كل شاشات React + `App.tsx` — لا يفحصها أي أمر**.
  الملفات غير المفحوصة: `mobile/src/App.tsx` · `mobile/src/screens/{Account,Home,InvoiceDetail,Invoices,Login,Payments,QrScanner,ReceiptSheet}.tsx` ·
  `mobile/src/ui/{error-boundary,kit,nav,states}.tsx`.
- **الأثر**: خطأ نوعي في أي شاشة APK **يمرّ** بينما `npm run build` وCI
  يبقوان أخضرين. **ملاحظة**: `mobile/tsconfig.json` **موجود** (بخلاف ما يقوله
  `handoff.md:202`)، والسكربت **ينجح** (قِستُه ⇒ EXIT=0) — المشكلة أن لا
  أحد يستدعيه.
- **الإصلاح المقترح**: `package.json` — إضافة `"typecheck:mobile": "npm --prefix mobile run typecheck"`
  - خطوة في `.github/workflows/ci.yml`.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### G-22 — مخطّط قاعدة البيانات: جدول يتيم + 10 أعمدة يتيمة + جدول ميت + 15 جدول بلا FK | Medium | PROUVÉ | P2

- **جدول يتيم**: `app_meta` (`0001_initial_schema.sql:14`) — **0 مرجع** في الكود.
- **10 أعمدة يتيمة**: `company_profile.{ai_number,legal_form,nis_number}` ·
  `customers.bread_profile_json` · `bread_orders.{custom_name,transferred_at,pickup_time,is_delivered,is_paid,transferred_to_customer_account}` ·
  `daily_closings.z_report_path`.
- **جدول ميت (TEST-ONLY)**: `bread_orders` (وحدة Pain محذوفة بـ ADR-109) — يُنشأ
  ويُوسَّع ويُفهرس في 6 مهاجرات ولا يقرأه ولا يكتبه أي كود في `src/` أو
  `electron/`؛ تلمسه الاختبارات فقط.
- **15 جدولًا بلا أي FK** (منهم `categories`، `suppliers`، `customers` —
  أبواء كثيرين) ⇒ السلامة المرجعية **مستندة إلى 7 triggers `BEFORE DELETE`**
  (0040) لا إلى قيود تصريحية.
- **~15 فهرسًا على أعمدة لا تُستعمل في أي `WHERE/ORDER BY`** (منهم 8 على
  `bread_orders` الميت).
- **الجهد**: **L** (يتطلّب **مهاجرات جديدة** فقط، لا حذف أعمدة).
  **الثقة**: **PROUVÉ**.

#### G-23 — 40 تعليمة `ALTER TABLE … ADD COLUMN` بلا حارس + 8 كائنات بلا `IF NOT EXISTS` | Medium | PROUVÉ | P2

- SQLite لا يدعم `ADD COLUMN IF NOT EXISTS` ⇒ **40** تعليمة في 24 ملفًا تفشل
  بـ `duplicate column name` عند إعادة التشغيل اليدوي (مثال: `0006:3`،
  `0046:15-44`، `0047:16`).
- **بلا `IF NOT EXISTS`**: `0036_print_templates.sql:5,21` (جدول + فهرس) ·
  `0031_defensive_sale_item_discount.sql:16,24,33,41,51,62` (6 triggers) ·
  `0037_products_quantity_nonneg.sql:15,23` (2 triggers).
- **التخفيف**: المشغّل يمنع إعادة التطبيق (`sqlite.service.ts:243-289` + حارس
  checksum) ⇒ ليست عيبًا تشغيليًا، **بل فخّ صيانة** (إعادة يدوية لـ
  `sqlite3 < 00XX.sql` تُجهض الهجرة في منتصفها ⇒ rollback ذرّي + خطأ صاخب).
- **الجهد**: **M** (توثيق + أداة `verify:migrations` تفحص قابلية إعادة التشغيل).
  **الثقة**: **PROUVÉ**.

#### G-24 — تكرار `syncedAt` بمعنيين + تكرار `pin_algo` غير مُستعمل في المرآة | Medium | PROUVÉ | P2

- **الموقع**: `electron/ipc/handlers/client-access.repo.ts:440` (`syncedAt` = وقت
  الدفع) ↔ `cloud/supabase/functions/client-sync/index.ts:232` (`syncedAt` = وقت
  القراءة) ⇒ **المفتاح نفسه بمعنيين**، ويُقرأ في مكانين مختلفين داخل الـ APK.
- **الموقع 2**: `AccessMirrorRow` يحمل `pin_algo` (`sync.protocol.ts:100-113`)
  لكن الـ Edge يقرأ `customer_id, pin_hash, pin_salt, revoked_at, locked_until`
  فقط (`index.ts:133`) ⇒ يقرّر مسار KDF **من وجود `pin_salt` وحده** ويتجاهل
  `pin_algo` (الذي يحرسه 0043).
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

### H. المعمارية والحدود

| #    | الفحص                                          | النتيجة                                                                                                                                                                                                   | الدليل                                                                                       | الأولوية |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| H-01 | `src/domain` بلا framework                     | **0** استيراد react/electron/better-sqlite3/node/SQL                                                                                                                                                      | `tests/unit/a3-organisation.test.ts:101-109` + بحث                                           | —        |
| H-02 | `src/application` بلا UI/SQL                   | **0**                                                                                                                                                                                                     | نفس البحث                                                                                    | —        |
| H-03 | `electron/` لا يستورد `src/`                   | **0**                                                                                                                                                                                                     | `a3-organisation.test.ts:111-115`                                                            | —        |
| H-04 | `mobile/`+`cloud/` معزولان                     | **0** استيراد نحو `src/`/`electron/`                                                                                                                                                                      | `a3-organisation.test.ts:127-134`                                                            | —        |
| H-05 | اتجاه التبعيات features                        | **0** arête خارج القائمة البيضاء، **0** cycle                                                                                                                                                             | `a3-organisation.test.ts:59-99`                                                              | —        |
| H-06 | **مكوّنات خارج كل أداة**                       | `cloud/`: خارج tsconfig **و** knip **و** coverage (وeslint بلا قواعد type-aware)؛ `license-manager/`: خارج knip **و** coverage؛ `src/features`+`src/shared`+`src/app` (157 ملف / ~30k سطر): خارج coverage | `knip.json:10` · `tsconfig.json:30-39` · `vitest.config.ts:27` · `eslint.config.mjs:146-164` | **P1**   |
| H-07 | `mobile/tsconfig.json` **موجود** لكن غير مربوط | `mobile/tsconfig.json:9` (`include: ["src"]`) + `mobile/package.json` سكربت `"typecheck"` — وقِستُه: **EXIT=0**. لكنه **غير مربوط بأي بوابة جذرية ولا بـ CI**                                             | `tsconfig.json:30-39` (لا mobile) · `.github/workflows/ci.yml:26-39`                         | **P1**   |

---

### I. الاختبارات والتغطية

#### I-01 — `npm run test:coverage` **أحمر** (EXIT=1) و**غير موجود في CI** | High | PROUVÉ | P1

- **الموقع**: `vitest.config.ts:24-39` (العتبات) · `package.json:28` · `.github/workflows/ci.yml:26-39`.
- **الوصف**: `thresholds: { statements: 80, branches: 75, functions: 88, lines: 80, perFile: true }`
  ⇒ **كل ملف** من `src/domain` + `src/application` يجب أن يحقّق العتبات **منفردًا**.
  النتيجة: **18 انتهاكًا على 5 ملفات** ⇒ `EXIT=1`.
- **الانتهاكات** (من `docs/reports/maintenance/audit-raw/build-coverage.txt`):
  | الملف                                    | branches | functions | lines  | statements |
  | ---------------------------------------- | -------- | --------- | ------ | ---------- |
  | `src/domain/ocr/types.ts`                | 0%       | 0%        | 0%     | 0%         |
  | `src/domain/product/product-rules.ts`    | 14.28%   | 50%       | 36.36% | 36.36%     |
  | `src/domain/suppliers/po-rules.ts`       | 62.5%    | —         | —      | —          |
  | `src/domain/import/csv-import.ts`        | 55.26%   | —         | —      | —          |
  | `src/domain/proforma/proforma-rules.ts`  | 50%      | —         | —      | —          |
  | `src/domain/ocr/parser.ts`               | 71.91%   | —         | —      | —          |
  | `src/domain/returns/return-rules.ts`     | —        | 71.42%    | 70.07% | 70.07%     |
  | `src/domain/suppliers/supplier-rules.ts` | 60.97%   | —         | 74.28% | 74.28%     |
- **السبب الجذري (1)**: `src/domain/ocr/types.ts` ملف **أنواع فقط** ⇒ 0% تنفيذ
  (مستورد `import type` فقط في `tests/unit/ocr-matcher.test.ts:11`) ⇒ العتبة
  `perFile` على ملف لا تنفيذ فيه = **عتبة غير قابلة للامتثال** بالقيمة الحالية.
- **السبب الجذري (2)**: `src/features/**` (119 ملف / 28 784 سطر) **خارج**
  `coverage.include` ⇒ **93% من الكود التطبيقي خارج التغطية**.
- **الأثر**: **لا بوابة تكشف تراجع التغطية** (CI لا يشغّل `test:coverage`) ⇒
  التراجع مستمر وصامت. شدّة: High (البوابة نفسها حمراء اليوم).
- **الإصلاح المقترح** (اختيار المالك): (أ) استثناء الملفات بلا تنفيذ من
  `coverage.exclude` (types-only) **وت]** توسيع `include` إلى `src/features/**`
  مع عتبات أقل (مثل 60/50/60/60)؛ (ب) رفع تغطية الملفات الخمسة؛ (ج) إيقاف
  `perFile` والعودة إلى عتبة عامة + استثناءات صريحة. **الموصى به**: (أ)+(ب)
  لأن (ج) يُلغي قيمة العتبة.
- **اختبار الانحدار**: `npm run test:coverage` ⇒ EXIT=0 (شرط بوابة).
- **الجهد**: **M**. **الثقة**: **PROUVÉ**.

| #    | الفحص                                                  | النتيجة                                                                                                                                                                                                                                                          | الدليل                                                           | الأولوية   |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| I-02 | `operation-id-coverage` **لا يثبت اكتمالَه**           | `tests/unit/operation-id-coverage.test.ts:16-37` (REQUIRED، 20) + `:41-62` (OPTIONAL، 20) = **42 من 120 مخططًا مصنَّفة**؛ **39 مخططًا تشترط `operationId` فعليًا** ⇒ 19 غير مُدرجة. **لا assertion على المتمم** ⇒ مخطط جديد نقدي بلا `operationId` **لا يُكتشف** | **PROUVÉ**                                                       | **P1**     |
| I-03 | 15 ملف اختبار «مرآة» تُعيد تنفيذ منطق الإنتاج          | `tests/integration/payment-receipt.test.ts:7-48` (يعيد كتابة `ledgerBalances` كاملة) · `tests/unit/operation-id.test.ts:65-87` (يعيد خوارزمية التكرارية) · `tests/integration/carts-drafts.test.ts:83-85` · `tests/integration/atomic-slices.test.ts:42-60`      | **تبقى خضراء حتى لو حُذف منطق الإنتاج أو انقلب**                 | **P1**     |
| I-04 | `pin-kdf-parity` إثبات parité **بنصّ المصدر**          | `tests/unit/pin-kdf-parity.test.ts:32-48` — 3 تأكيدات `expect(src).toContain("PIN_KDF_ITERATIONS = 100_000")` (تطابق نصّي!) على 3 ملفات. لا يوجد اختبار parité لـ KDF الفريق (`STAFF_KDF_*`)                                                                     | **PROUVÉ**                                                       | P2         |
| I-05 | `hookTimeout` غير مضبوط                                | `vitest.config.ts:40` — `testTimeout: 15000` فقط؛ `hookTimeout` الافتراضي 10 s، وكل `beforeEach` في `tests/database/*` و`tests/integration/*` يعيد تشغيل **47 هجرة**                                                                                             | مُثبت: 12 `Hook timed out` عند التشغيل المتزامن، وEXIT=0 معزولًا | P2         |
| I-06 | عدد اختبارات E2E / الدقة                               | 13 ملف spec (✓) · **37** كتلة `test()` (handoff يقول 24) · **799** كتلة `it()` vitest (handoff يقول 804)                                                                                                                                                         | عدّ برمجي                                                        | P3 (توثيق) |
| I-07 | `full-loop-client` **hard-fail** لا skip               | `tests/e2e/full-loop-client.spec.ts:31-38` — `throw new Error("Relais miroir E2E injoignable sur http://127.0.0.1:8100")` داخل `beforeEach`                                                                                                                      | **PROUVÉ**                                                       | P3         |
| I-08 | اختبارات بلا assertion                                 | **0**                                                                                                                                                                                                                                                            | تحليل 121 ملف vitest + 13 spec                                   | —          |
| I-09 | `expect(true)` / `toBeTruthy()`                        | **0**                                                                                                                                                                                                                                                            |                                                                  | —          |
| I-10 | تغطية `src/domain`+`src/application` بالاستيراد الفعلي | **41 من 42** ملفًا مستوردًا في اختبار واحد على الأقل ⇒ التغطية الاسمية 19/39 لكن الفعلية شبه كاملة                                                                                                                                                               |                                                                  | —          |
| I-11 | `vi.useFakeTimers()`                                   | **0** في كل `tests/`                                                                                                                                                                                                                                             |                                                                  | P3         |
| I-12 | E2E غير قابل للتنفيذ                                   | `installer.spec.ts` (UAC + حزمة Win)                                                                                                                                                                                                                             |                                                                  | P3         |

---

### J. الأداء

| #    | الفحص                                           | النتيجة                                                                                                                                                                                                                                                                                     | الدليل                  | الأولوية |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| J-01 | **N+1**                                         | **14 موضعًا**، منها 4 متوسّعة: `import.repo.ts:52` (≤5000 SELECT) · `finance.repo.ts:67-68` (2 استعلامات مرتبطة لكل صف مورّد) · `inventory.repo.ts:467-469` (3 استعلامات مرتبطة لكل صف منتج) · **`returns.repo.ts:279`** (`consumptionsOfSale()` — نتيجة **ثابتة في الحلقة** تُعاد لكل سطر) |                         | **P2**   |
| J-02 | استعلامات بلا فهرس                              | 6 (§F-06)                                                                                                                                                                                                                                                                                   |                         | P2       |
| J-03 | **حجم الـ bundle**                              | `dist/assets` = 30 ملف / 1 016 993 B؛ أكبر chunk `index-Ce5QNZwr.js` = **485 291 B** (474 KB)                                                                                                                                                                                               | `vite.config.ts:19-24`  | P3       |
| J-04 | `manualChunks`                                  | **غائب**                                                                                                                                                                                                                                                                                    | `vite.config.ts:19-24`  | P3       |
| J-05 | `chunkSizeWarningLimit`                         | 1200 KB ≈ **2.5×** أكبر chunk ⇒ الحارس خامل                                                                                                                                                                                                                                                 | `vite.config.ts:22`     | P3       |
| J-06 | مكتبات ثقيلة                                    | `pdfjs-dist` **كسول** (`ocr-pdf.ts:68`)، `tesseract.js` **كسول + worker thread** (`ocr-engine.ts:87`)، `qrcode` `require` كسول                                                                                                                                                              |                         | —        |
| J-07 | عمل ثقيل على الـ main thread                    | `ocr-pdf.ts:68-118` (pdfjs على main) · `ocr-files.ts:179-202` (قراءة 15 MB + decode + resize + encode **متزامن**)                                                                                                                                                                           |                         | P2       |
| J-08 | `useCountUp` re-render storm                    | ≈54 `setState` لكل تحميل Dashboard                                                                                                                                                                                                                                                          | `use-count-up.ts:25-33` | P2       |
| J-09 | بلا virtualisation                              | **لا لائحة غير محدودة** — كل الشاشات pagination خادمية (`PAGE_SIZE = 20`)                                                                                                                                                                                                                   |                         | —        |
| J-10 | `useEffect` بلا deps                            | 11 موضعًا — كلها نمط «latest closure» الموثّق                                                                                                                                                                                                                                               |                         | P3       |
| J-11 | `dist-license-manager` غير مشمول في `knip.json` | `knip.json:10` — `project` لا يضم `license-manager/**` رغم أن الـ entry مذكور (`:7-8`) ⇒ 16 ملفًا خارج knip                                                                                                                                                                                 |                         | P2       |
| J-12 | `sqlite.service.ts:328`                         | اتصال `readonly` بلا `busy_timeout`                                                                                                                                                                                                                                                         |                         | P3       |
| J-13 | إعادة تسجيل listeners                           | **0** تكرار (كل `app.on` على مستوى الوحدة، وكل `ipcMain.handle` محميّ بعلم idempotence في `main.ts:87-93`)                                                                                                                                                                                  |                         | —        |
| J-14 | `setPermissionRequestHandler`                   | 4 نوافذ تكتب على **الجلسة الافتراضية نفسها** (آخر كاتب يفوز) — سلوك متطابق (deny-all) فلا تجاوز                                                                                                                                                                                             |                         | P3       |

---

### K. الأمان والخصوصية

#### K-01 — `customers.accessQrSvg` بلا بوابة staff ⇒ **تسريب PIN العميل** | High | PROUVÉ | P1

- **الموقع**: `electron/ipc/registry.customers.ts:137-152` ·
  `electron/ipc/validators.customers.ts` (نقص من `STAFF_CHANNEL_PERMISSION`) ·
  `electron/ipc/license-gates.ts:112` (page-gated فقط).
- **الوصف**: القناة تبني
  `ClientAccess.buildActivationQrPayloadV2(endpoint.supabaseUrl, endpoint.anonKey, input.phone, input.pin, input.code)`
  ⇒ **PIN العميل (6 أرقام) + كود التفعيل + anon key** داخل QR قابل للمسح.
- **الأثر**: أي كود renderer (أو سكربت محقون) يستطيع **铸造** QR تفعيل يحوي
  PIN عميل حيّ. شدّة: High (كشف سرّ عميل).
- **الدليل**: `electron/ipc/registry.customers.ts:137-152` + grep `STAFF_CHANNEL_PERMISSION`
  ⇒ `customers.accessQrSvg` **غير حاضرة**؛ وقارن `customers.accessActivate` و
  `customers.accessRevoke` **حاضرتان** (`staff-gates.ts:99-100`) ⇒ **سهو مقصود**.
- **المقارنة المرجعية**: `ADR-087` (مصفوفة الأدوار) + `staff-gates.ts:4-12`.
- **الإصلاح المقترح**: `electron/ipc/staff-gates.ts` — إضافة
  `[IPC_CHANNELS["customers.accessQrSvg"]]: "debts";`.
- **اختبار الانحدار**: `tests/unit/` — استدعاء القناة بلا جلسة ⇒ رفض
  `STAFF_SESSION_REQUIRED`؛ وبصلاحية `debts` ⇒ نجاح.
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

#### K-02 — License Manager يحمّل `VITE_MANAGER_URL` بلا حارس `!app.isPackaged` | High | PROUVÉ | P1

- **الموقع**: `license-manager/main/window-manager.ts:62-69`.
- **الوصف**:
  ```ts
  const devUrl = process.env["VITE_MANAGER_URL"];
  if (devUrl) { void mainWindow.loadURL(devUrl); } else { … }
  ```
  في المقابل، الـ POS يحرس نفس الحالة:
  `electron/main/window-manager.ts:157` — `if (devUrl && !app.isPackaged)` مع تعليق
  _"une variable d'env résiduelle/malveillante ne doit JAMAIS charger un contenu
  attaquant dans la fenêtre privilégiée (bridge window.veloria)"_.
- **الأثر**: متغيّر بيئة متبقٍ/خبيث في بناء Manager محزَّم ⇒ تحميل **أصل بعيد**
  في نافذة ذات جسر كامل ⇒ اختراق كامل. شدّة: High (تطبيق منفصل عن POS).
- **الإصلاح المقترح**: نسخ حارس الـ POS + إضافة `will-redirect` + حارس webview
  (K-03).
- **الجهد**: **S**. **الثقة**: **PROUVÉ**.

| #    | الفحص                                                          | النتيجة                                                                                                                                                                                                                                                                                                                                          | الدليل | الأولوية  |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| K-03 | License Manager: `will-redirect` + `will-attach-webview` غائبة | `license-manager/main/window-manager.ts:46-83` (POS يملكهما في `window-manager.ts:75-86` و`:63-67`)                                                                                                                                                                                                                                              |        | P2        |
| K-04 | **`staffScope()` = «لا جلسة ⇒ صلاحيات gérant»**                | `electron/ipc/registry.finance.ts:15-20` و `registry.sales.ts:15-20` — `null` تعني «gérant (tout)» (`history.repo.ts:73-77`)، و`getCurrentStaffUser()` تُعيد `null` عند **انتهاء مهلة 30 دقيقة بلا نشاط** (`staff-session.ts:22-30`) ⇒ قارئ **غير مصادَق** على `history.*` / `sales.history` / `dashboard.summary` يرى **رؤية المدير كاملة**     |        | **P1**    |
| K-05 | `database.optimize` بلا أي بوابة                               | `electron/ipc/registry.system.ts:147` ⇒ `VACUUM` + `ANALYZE` + `wal_checkpoint(TRUNCATE)` على القاعدة الحيّة (`sqlite.service.ts:448-467`) — بلا staff gate، بلا licence gate، بلا page gate. **قارن** `database.reset` المحميّ الثلاثة                                                                                                          |        | **P1**    |
| K-06 | لا CSP على نوافذ `data:`                                       | `window-manager.ts:181,200,226,245` · `printing.templates.ts:241` · `printing.pdf.ts:107` — نافذتا recovery وlicense تحمّلان HTML مولَّدًاDINAMIC بلا CSP ** ومعهما جسر preload كامل**. (HTML مولَّد main-side ومُهرَّب ⇒ لا مسار حقن حيّ)                                                                                                       |        | P2        |
| K-07 | `assertSafeUserFolder` قائمة **منع** لا قائمة **سماح**         | `electron/security/security.ts:108-144` — `path.normalize` + deny-list للنظام + `realpath` (أقوى من blacklist `..`) لكن **بلا جذر حصر** ⇒ الكتابة ممكنة في أي مكان قابل للكتابة                                                                                                                                                                  |        | P2        |
| K-08 | `logo_path` قراءة ملف محلي عشوائي                              | §A-17                                                                                                                                                                                                                                                                                                                                            |        | P1        |
| K-09 | كود الاستعادة = **بيانات اعتماد رئيسية** واحدة                 | `electron/ipc/handlers/staff.repo.ts:657-725` — يُعيد تعيين PIN **أي** مستخدم (بما فيه المدير) ويمسح `must_change_code`؛ القناة `staff.recover` **بلا بوابة**. (التخفيف: PBKDF2، 5 محاولات/15 دقيقة، العرض مرة واحدة)                                                                                                                            |        | P2        |
| K-10 | لا سجلّ تدقيق لحدثَي الدخول والخروج                            | `electron/ipc/handlers/staff.repo.ts:310-356` + `registry.staff.ts:21-33` — عدّاد الفشل يُصفَّر عند النجاح ⇒ **لا أثر دائم** لمحاولات تخمين                                                                                                                                                                                                      |        | **P1**    |
| K-11 | العمليات المدمِّرة غير مُدقَّقة                                | `database.reset` (`registry.system.ts:152`) · `database.relocate` (`registry.core.ts:74`) · `backup.restore` (`backup.service.ts:572`) ⇒ سطر log نصّي فقط، لا سطر `audit_log`                                                                                                                                                                    |        | **P1**    |
| K-12 | `spellcheck` مفعّل افتراضيًا على كل النوافذ                    | `window-manager.ts:47-55` · `printing.pdf.ts:84-89` · `printing.templates.ts:213-218` · `license-manager/main/window-manager.ts:55-60` ⇒ أسماء المنتجات/العملاء تُعرض للمصحّح SpellChecker                                                                                                                                                       |        | P3        |
| K-13 | PII في `audit_log.details_json`                                | `electron/ipc/handlers/customers.repo.ts:270` — **الاسم الكامل للعميل** في كل `customer.updated` ⇒ يتسرّب لكل نسخة احتياطية                                                                                                                                                                                                                      |        | P3        |
| K-14 | الأسرار                                                        | **لا أسرار في الشجرة ولا في تاريخ git** (61 commit / 2880 object ⇒ 2 نتيجة = JWT وهمي للاختبار). `private/` مُتجاهَل، `service_key` مُعمّى بـ DPAPI (`sync-secrets.ts:33-46`)، حالة الترخيص في ملف DPAPI لا في SQLite                                                                                                                            |        | —         |
| K-15 | فحوص النوافذ                                                   | `nodeIntegration:false` · `contextIsolation:true` · `sandbox:true` · `webviewTag:false` على **كل** النوافذ الستّ؛ CSP في `index.html:7-10` (`default-src 'self'; script-src 'self'` بلا `unsafe-eval`)؛ `will-navigate`/`will-redirect`/`setWindowOpenHandler` على كل النوافذ؛ `openExternal` https فقط؛ **لا بروتوكول مخصّص** (لا `veloria://`) |        | —         |
| K-16 | ثغرات الاعتماديات                                              | **غير محسومة** — `npm audit --offline` ⇒ «0 vulnerabilities» بلا شبكة ⇒ **لا قيمة إثباتية**. `electron@37.2.0` خارج نافذة الدعم (3 majors الأخيرة) ⇒ لا تصحيحات Chromium                                                                                                                                                                         |        | P2 (قرار) |

---

### L. UX / الواجهة (المعيار الفرنسي + ergonomic cashier)

| #    | الفحص                  | النتيجة                                                                                                                                                              | الدليل                                                            | الأولوية |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| L-01 | واجهة فرنسية 100%      | **0** حرف عربي في `src/` (بلا استثناء `mobile/` — ADR-051)                                                                                                           | eslint `no-restricted-syntax` (`eslint.config.mjs:126-142`) + بحث | —        |
| L-02 | استثناءات خام للمستخدم | `src/`: **0** (`error.message` / `String(e)` / `e.stack` في JSX) — لكن `A-04`/`A-05` يفتحان في pathway الـ main                                                      |                                                                   | P1       |
| L-03 | حالات فارغة/تحميل/خطأ  | 16 شاشة: **15/16** فيها empty+loading؛ **0/16** فيها حالة خطأ دائمة (`A-06`)؛ `PrintTemplatesScreen` بلا الثلاث (`A-07`)                                             |                                                                   | P2       |
| L-04 | `key={i}`              | 3 مواقع على بيانات ثابتة (`A-27`)                                                                                                                                    |                                                                   | P3       |
| L-05 | a11y                   | `htmlFor`/`id` متطابقان في كل `.tsx` (0 عدم تطابق، 0 `id` مكرر)؛ `aria-label` على كل زر أيقونة وكل حقل تصفية؛ `role="status"`/`role="alert"` حاضران؛ أهداف لمس ≥44px |                                                                   | —        |
| L-06 | تركيز                  | `Modal` له trap + تركيز ابتدائي؛ **`Drawer` بلا trap** (`A-08`); لا رجوع للتركيز (`A-25`)                                                                            |                                                                   | P2       |
| L-07 | سرعة الكاشيء           | ADR-116 (مسح بدون Enter) مطبَّق في `sell-search.ts:37-43` (`SCAN_BURST_GAP_MS=60`, `SCAN_IDLE_MS=90`, `TEXT_IDLE_MS=220`) — **مُتحقَّق منه**                         |                                                                   | —        |
| L-08 | «Monnaie» بارزة        | `PayDialog.tsx:108` — `font-mono-currency-xl tabular-nums`                                                                                                           |                                                                   | —        |

---

### M. الأدوات والتشغيل

| #    | الفحص                                                                        | النتيجة                                                                                                                                                                                                                                                                                                       | الأولوية |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| M-01 | سكربتات `package.json`                                                       | **44 سكربت**؛ **0 مسار مفقود** على القرص؛ 7 بلا مرجع (`clean:logs`, `preview`, `lint:fix`, `test:watch`, **`test:coverage`**, `package:portable`, `build:pos`); 3 متكرّرة (`build:pos` = `typecheck`+`typecheck:electron`+`build`؛ `package:pos` = `package:win`؛ `package`/`package:win`/`package:portable`) | P3       |
| M-02 | `license:keygen` يعيد كتابة `resources/license/public.key` (**ملف متتبَّع**) | `package.json:40` ⇒ `scripts/licensing/keygen.mjs` يكتب المفتاح العام في ملف متتبَّع ⇒ تشغيله بالخطأ **يكسر تفعيل الترخيص لكل العملاء**                                                                                                                                                                       | **P2**   |
| M-03 | 8 سكربتات PowerShell بمسارات مطلقةHardcoded                                  | `scripts/maintenance/elevated-step{1..8}.ps1:3` — `'C:\Users\zenagui bilal\Desktop\Veloria POS dev zenagui bilal\docs\reports\maintenance\elevated-step1.log'` ⇒ تنكسر على أي جهاز آخر وتكشف اسم المستخدم                                                                                                     | **P2**   |
| M-04 | 728 Ko صور علامة تجارية بلا مرجع                                             | `scripts/maintenance/brand-veloria-pos.jpg` (342 Ko) + `brand-veloria-license-manager.jpg` (386 Ko) — متتبَّعة، **0 مرجع** في الكود                                                                                                                                                                           | P2       |
| M-05 | `docs/` غير مُتجاهَل في `.gitignore`                                         | `docs/reports/maintenance/audit-raw/` غير متجاهَل ⇒ `git add -A` يجرف ملفات scratch                                                                                                                                                                                                                           | P3       |
| M-06 | `.gitignore` يغطّي كل الآثار                                                 | ✓ `dist*`, `/release/`, `test-results/`, `playwright-report/`, `*.tsbuildinfo`, `graphify-out/`, `mobile/android/`, `mobile/ios/`, `.expo/`, `private/`, `*.vlic`, `*.sqlite*`                                                                                                                                | —        |
| M-07 | آثار متتبَّعة                                                                | **0** ملف scratch متتبَّع (`git ls-files` 866 ملف)                                                                                                                                                                                                                                                            | —        |
| M-08 | `.github/workflows/ci.yml` موجود ومتتبَّع                                    | 39 سطرًا، 14 خطوة (format → lint → typecheck ×3 → license:scan → test → verify ×3 → build ×4) — **لكن لا remote ⇒ لا يعمل أبدًا**                                                                                                                                                                             | **P2**   |
| M-09 | `knip.json` — مدخلات بلا مشروع                                               | `:7-8` يعلن `license-manager/main/main.ts` و`license-manager/renderer/manager-env.d.ts` entry لكن `project` (`:10`) لا يضم `license-manager/**` ولا `cloud/**` ⇒ knip لا يمكنه الإبلاغ عنهما                                                                                                                  | P2       |
| M-10 | `knip.json` ignore قديم                                                      | `:13` `ignoreDependencies: ["bindings", "@eslint/js", "tailwindcss"]` — knip: «tailwindcss: Remove from ignoreDependencies»                                                                                                                                                                                   | P3       |
| M-11 | `npm run lint` يمرّ على `docs/**`                                            | أي مساعد `.mjs` تحت `docs/` ⇒ `Parsing error` (allowDefaultProject قائمة صريحة، `eslint.config.mjs:31-58`)                                                                                                                                                                                                    | P3       |
| M-12 | `verify-domain.ts` لا يغطي zakat                                             | §C-03                                                                                                                                                                                                                                                                                                         | P2       |

---

### N. التوثيق والقرارات

| #    | الفحص                                 | النتيجة                                                                                                                                                                                                                                                                                  | الدليل     | الأولوية   |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| N-01 | **`docs/INDEX.md` مكتمل حتى ADR-119** | `docs/INDEX.md:112-127` تسرد ADR-104→ADR-119 ⇒ **الادّعاء في `handoff.md:33` («مستوقف عند 103») خطأ**                                                                                                                                                                                    | **PROUVÉ** | P2 (توثيق) |
| N-02 | `docs/STRUCTURE.md` أرقام قديمة       | `:32` «0001..0036 IMMUABLES» (الحقيقة 47) · `:120` «0001..0034+» · `:60` «ADR-001→058» (الحقيقة 119) · `:16` أسماء الملفات `.electron.json`/`.manager.json` (الفعلي `tsconfig.electron.json`/`tsconfig.manager.json`)                                                                    | **PROUVÉ** | P2         |
| N-03 | `handoff.md` أرقام قديمة              | `:38` 804 → **799** كتلة `it()` · `:62` E2E 24 → **37** · `:44` `factory-reset ×2` → **1** · `:49` «typecheck manager/mobile غير مُشغَّلين» — لكن `manager` **في CI** (`ci.yml:30`)                                                                                                      | **PROUVÉ** | P2         |
| N-04 | `handoff.md` §1 غير محدَّث            | لا يذكر `test:coverage` أحمر، ولا `docs/INDEX.md` مكتمل، ولا `mobile/tsconfig`                                                                                                                                                                                                           |            | P2         |
| N-05 | ADR بلا أثر                           | `RAW_GUARDED_CHANNELS` (ADR-088) — الـ ADR يقول «garde-fou de revue»، والواقع: لا أثر                                                                                                                                                                                                    |            | P1         |
| N-06 | تعليقات كاذبة                         | `scripts/quality/verify-domain.ts:13-16` («no `src/domain/finance/zakat.ts`») · `verify-domain.ts:7` («There is no `src/domain/finance/zakat.ts` — the live zakat path is `src/features/zakat/types.ts:computeZakatLocal`») — **الدالة انتقلت إلى `src/domain/zakat/zakat-rules.ts:20`** | **PROUVÉ** | P2         |
| N-07 | ADRs 001→119 موجودة                   | ✓ كلّها، مسرودة في `docs/INDEX.md`                                                                                                                                                                                                                                                       |            | —          |

---

### O. النظافة (hygiene)

| #    | الفحص                                              | النتيجة                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | الدليل                                                                                                                                                                                                                                                                                                                                                                                          | الأولوية |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| O-01 | **تلف ترميز UTF-8 (U+FFFD) في 20 ملف مصدري مودَع** | **113 محرف تالف**، كلّه في `electron/ipc/*`: `validators.print.ts` (18) · `validators.common.ts` (11) · `ipc-errors.ts` (10) · `registry.core.ts` (8) · `registry.recovery.ts` (8) · `validators.sales.ts` (8) · `credit-gates.ts` (7) · `license-gates.ts` (6) · `registry.sales.ts` (6) · `validators.finance.ts` (6) · `validators.stock.ts` (6) · `registry.system.ts` (3) · `validators.catalog.ts` (3) · `validators.customers.ts` (3) · `handle.ts` (2) · `registry.customers.ts` (2) · `registry.finance.ts` (2) · `validators.settings.ts` (2) · `registry.documents.ts` (1) · `validators.documents.ts` (1) | مثال: `electron/ipc/validators.sales.ts:13` — `original �?� 0` (يجب `≥ 0`)، `:14` `(original �^' final) �- qty` (يجب `−` و`×`)، `:26` `supprimés) �?" la` (يجب `→`)، `:63` `Phase 9 �?" pain`. **وتشمل** `index.html:11` (`Veloria PoS �?" Point de vente`) و`.gitignore` (تعليقات). **لا أثر runtime** (تعليقات فقط) لكنّه يوثّق **قاعدة `Set-Content`→mojibake** المحقَّقة في `handoff.md` §8 | **P2**   |
| O-02 | `TODO`/`FIXME`/`HACK`/`XXX`                        | **0** في `src/`, `electron/`, `tests/`, `scripts/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                 | —        |
| O-03 | `@ts-ignore`/`@ts-expect-error`/`as any`           | **0** في `src/` و`electron/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                 | —        |
| O-04 | `console.log`                                      | **0** في `src/`؛ 18 استدعاء `console.*` في `electron/`، منها **11 تتجاوز خدمة `log()`** ⇒ لا تصل إلى `<userData>/logs/veloria.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `window-manager.ts:159,163,183,202,228,247` · `main.ts:62,76` · `settings.repo.ts:59` · `sales.repo.ts:489,502` · `inventory.repo.ts:178` · `idempotency.ts:28,37` · `database-path.service.ts:56`                                                                                                                                                                                              | P3       |
| O-05 | `catch { }` فارغ                                   | **0** كتلة فارغة بلا تعليق؛ 96 كتلة `catch { /* تبرير */ }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                 | —        |

---

### P. المخاطر غير التقنية

| #    | المخاطر                                | الحالة                                                                                                                                                                                                    | الدليل                                                                                          | الأولوية                              |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| P-01 | **لا remote ولا CI فعّال**             | `.github/workflows/ci.yml` موجود (14 خطوة) لكن `git remote -v` ⇒ **فارغ** ⇒ CI **لا يعمل أبدًا**؛Localization فقط                                                                                         |                                                                                                 | **P1** (خطر استرجاع + تراجع غير مرئي) |
| P-02 | `electron@37.2.0` خارج نافذة الدعم     | لا تصحيحات Chromium                                                                                                                                                                                       | `package.json:81`                                                                               | P2                                    |
| P-03 | ABI `better-sqlite3` مقابل Electron 37 | مسار البناء صحيح (`postinstall` + `electron-rebuild` + `npmRebuild` الافتراضي) لكن **لا فحص ABI وقت التشغيل** (`NODE_MODULE_VERSION` ⇒ 0 نتائج)                                                           | `sqlite.service.ts:167-171`                                                                     | P2                                    |
| P-04 | `installer.spec` (UAC)                 | **الوحيد الذي لم يُخضَّر أبدًا**                                                                                                                                                                          | `tests/e2e/installer.spec.ts:112,118`                                                           | P3 (قرار)                             |
| P-05 | APK / EAS                              | `mobile/android/` **موجود على القرص** (بناء Gradle كامل + `index.android.bundle`) ⇒ APK حقيقي بُني محليًا، لا «placeholder» فقط؛ `eas.json` الحقيقي غير موجود                                             | `mobile/android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle` | P3 (قرار)                             |
| P-06 | خطة الاستعادة                          | `backup.restore` تراجع مُنفَّذ، لكن **بلا `operationId`** (`A-11`) و**بلا audit** (`K-11`)؛ والاستعادة **مُختبَرة** بم eurorestore-rollback.test.ts` و`stock-backup.spec.ts` (مستوى الملف لا قاعدة إنتاج) |                                                                                                 | P1                                    |
| P-07 | `license:keygen` يكتب ملفًا متتبَّعًا  | `M-02`                                                                                                                                                                                                    |                                                                                                 | P2                                    |

---

## 4. (مُدمج في §3.B) — ملخّص الكود الميت

انظر الجدول الكامل في **§3.B** (30 عنصرًا: 3 قنوات IPC + 24 إعادة-تصدير + 3
تصديرات + 1 config + 1 dependency). **قرار لكل عنصر** في عمود «القرار المقترح».

---

## 5. (مُدمج في §3.C) — ملخّص الـ stubs

انظر §3.C (6 عناصر).

---

## 6. (مُدمج في §3.D) — ملخّص التكرار والاعتماديات

انظر §3.D (9 عناصر) + §3.B-2 (جدول الاعتماديات).

---

## 7. (مُدمج في §3.E) — المال والذرّية

انظر §3.E (19 فحصًا). **النتيجة: الدومين المالي سليم؛ الفجوات في التكرارية
والتغطية، لا في حساب المبلغ.**

---

## 8. (مُدمج في §3.K) — مصفوفة مخاطر الأمان

| الخطر                               | القنوات/الأسطح                                                       | الحارس الحالي                       | الفجوة                        | الأولوية |
| ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------- | ----------------------------- | -------- |
| تسريب PIN عميل                      | `customers.accessQrSvg`                                              | page-gated فقط                      | **بلا staff gate**            | **P1**   |
| رؤية المدير بلا جلسة                | `history.*`, `sales.history`, `dashboard.summary`, `reports.summary` | تصفية بالمؤلف فقط إذا كانت جلسة     | `null` = gérant               | **P1**   |
| تعديل قاعدة بالـ VACUUM             | `database.optimize`                                                  | **لا شيء**                          | بلا staff/license/page gate   | **P1**   |
| استعادة نسخة (مُدمِّرة) بلا تكرارية | `backup.restore`                                                     | rollback                            | بلا `operationId`             | **P1**   |
| مصادقة ببيانات اعتماد رئيسية        | `staff.recover`                                                      | KDF + lockout                       | يعيد تعيين أي حساب            | P2       |
| قراءة ملف محلي                      | `company.update.logo_path`                                           | magic bytes + حجم                   | بلا حصر في `<userData>/logos` | **P1**   |
| أصل بعيد في نافذة مُميَّزة          | License Manager `VITE_MANAGER_URL`                                   | —                                   | بلا `!app.isPackaged`         | **P1**   |
| لا CSP في نوافذ `data:`             | recovery + license                                                   | HTML مولَّد ومُهرَّب                | بلا CSP                       | P2       |
| كتابة خارج جذر التطبيق              | `assertSafeUserFolder`                                               | deny-list نظام + realpath           | بلا allow-list                | P2       |
| فجوة تدقيق                          | دخول/خروج/فشل مصادقة، إعادة تهيئة، نقل، استعادة                      | `audit_log` (43 موضع INSERT)        | غير مُدقَّقة                  | **P1**   |
| قفل تغيير الرمز                     | 32 قناة خام                                                          | `handle.ts:100-102`                 | لا يُطبَّق خارج `handle()`    | **P1**   |
| بوابة ائتمان fail-open              | `proformas.convert`                                                  | try/catch                           | continue                      | P2       |
| تسريب PIN عبر `frError`             | `use-notifications.ts:67`                                            | denylist                            | نص خام                        | P2       |
| أسرار في المستودع                   | —                                                                    | `license:scan` + `.gitignore`       | **لا شيء**                    | —        |
| حقن SQL                             | —                                                                    | prepared + allow-list + `sql-guard` | **لا شيء**                    | —        |

---

## 9. ملخّص فجوات الاختبارات

_(القسم 9 مغطّى في §3.I — 12 finding بأدلة.)_

**الأهم**: (1) `test:coverage` أحمر وبلا CI (I-01) · (2) `operation-id-coverage`
لا يثبت اكتمالَه (I-02) · (3) 15 ملف اختبار «مرآة» تُعيد تنفيذ منطق الإنتاج
(I-03) · (4) `pin-kdf-parity` parité بنصّ المصدر (I-04) · (5) `src/features`
(93% من الكود) خارج التغطية (H-06).

---

## 10. ملخّص الأداء

_(القسم 10 مغطّى في §3.J — 14 finding.)_

---

## 11. ملخّص الأدوات والتوثيق والنظافة

_(القسم 11 مغطّى في §3.M + §3.N + §3.O — 24 finding.)_

---

## 12. «مُستبعد» (Refuted) — لماذا ليس مشكلًا

> كل مُرشّح مُستبعد هنا اجتاز بحثًا شاملًا. هذه القائمة تُثبت أن الأدوات
> (knip/ts-prune/depcheck) تُنتج ضجيجًا كبيرًا في هذا المستودع (النسبة التاريخية
> 212/219).

| المُرشّح                                                      | سبب الاستبعاد                                                                                  | الدليل                                                                    | ADR                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| `bindings` (depcheck: unused dependency)                      | **مطلوب وقت التشغيل** لـ `better-sqlite3` (native `require`)                                   | `node_modules/better-sqlite3` يستعمله؛ `knip.json:13` يتجاهله             | ADR-005                            |
| `tailwindcss` (depcheck: unused devDep)                       | مستعمل عبر `@tailwindcss/vite` plugin                                                          | `vite.config.ts:9`                                                        | —                                  |
| `@vitest/coverage-v8` (depcheck)                              | مستعمل عبر `vitest run --coverage`                                                             | `package.json:28`                                                         | —                                  |
| `@eslint/js` (depcheck: missing)                              | **معلومة موروثة** — الـ import موجود فعلًا، ينقص التصريح                                       | `eslint.config.mjs:1`                                                     | `DEAD_CODE_AUDIT_2026-10-18.md:22` |
| 8 تصديرات `validators.common.ts` غير `*Schema`                | **مستهلكة فعلًا** (مُثبتة بالبحث) — المشكلة أن الحراسة لا تغطّيها (G-04) لا أنها ميتة          | `moneyMinor:44` مستعمل في `validators.*` كلّها                            | —                                  |
| `percentOfMinor` (ts-prune: unused)                           | **مقابل main** في `electron/ipc/money-guard.ts:68` + اختبار parité                             | `tests/unit/money-guard-parity.test.ts:71`                                | —                                  |
| `formatDzd` "يرمي" (منظَّر كعيب في `money.ts`)                | **سلوك مقصود** (fail-closed) — العيب في **الاستعمال** (268 موقعًا) لا في الدالة                | `money.ts:147` + `format.ts:5-9`                                          | —                                  |
| `fromDzd` (ts-prune)                                          | **TEST-ONLY + بوابة** (`verify-domain.ts:39`)                                                  |                                                                           | —                                  |
| `clearCartDraftsAtomic`                                       | **TEST-ONLY محافظ** عليه (ADR-075 ST-01)                                                       | `tests/integration/idempotency-config.test.ts:54`                         | ADR-075                            |
| `recovery.retry`/`recovery.exit` (قنوات بلا caller في `src/`) | **مستهلكة من HTML النافذة**                                                                    | `electron/main/recovery-view.ts:95,100`                                   | —                                  |
| `window.maximizedChanged` / `ocr.progress`                    | **push events** (main→renderer)، تُقرأ عبر `onMaximizedChanged` / `ocrOnProgress`              | `ipc-client.ts:107-111, 198`                                              | —                                  |
| ~800 تصدير في ts-prune                                        | نمط مشروع «استيراد قاعدة نقية داخل ملفها» ⇒ `knip.json:11` `ignoreExportsUsedInFile: true`     | `knip.json:11`                                                            | —                                  |
| 0 `parseFloat` في `src/`                                      | نظيف                                                                                           | بحث كامل                                                                  | —                                  |
| 0 حروف عربية في `src/`                                        | نظيف (الاستثناء `mobile/` فقط)                                                                 | eslint rule + بحث                                                         | ADR-051                            |
| 0 `localStorage` لبيانات أعمال                                | 4 مفاتيح UI فقط (ثيم/كثافة/تأكيد/شريط جانبي)                                                   | `theme-density.ts:15,26,47,70` · `confirm.ts:10,18` · `shell-types.ts:38` | —                                  |
| 0 استيراد electron/node/sqlite في `src/`                      | نظيف (مغطّى بـ `a3-organisation.test.ts:117-125`)                                              |                                                                           | —                                  |
| 0 `await` داخل transaction                                    | نظيف                                                                                           | `transaction(\s*async` ⇒ 0                                                | —                                  |
| 0 أسرار في git (61 commit)                                    | نظيف                                                                                           | 2 نتيجة = JWT وهمي للاختبار                                               | —                                  |
| 0 حقن SQL                                                     | نظيف                                                                                           | كل الاستعلامات prepared                                                   | —                                  |
| 0 `nodeIntegration:true` / `contextIsolation:false`           | نظيف (6 نوافذ)                                                                                 | `window-manager.ts:47-55`                                                 | —                                  |
| `templates.testPrint` في `LICENSE_PROTECTED_CHANNELS`         | **ليس عيبًا أمنيًا** — الترخيص الفعلي قائم عبر `guardPrint`؛ العيب **إعداد ميت مضلِّل** (G-09) | `printing.studio.ts:50`                                                   | —                                  |

---

## 13. قيود التدقيق والثقة المتبقية

| البند                    | الثقة                | ما ينقص لإثباته                                                                         |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------------- |
| A-01 (رمي أثناء التصيير) | **PROUVÉ**           | لا شيء — الإصلاح يحتاج `test:coverage` + اختبار render                                  |
| A-03 (احتياطي UUID ثابت) | PROUVÉ (الرمز)       | **DYNAMIC**: تنفيذ على Electron 37 يُظهر توفّر `crypto.randomUUID` دائمًا ⇒ تُغلقابي P3 |
| A-04 / A-21 / A-24       | DYNAMIC-RISK         | اختبار E2E على جهاز حقيقي                                                               |
| A-04 / K-06              | PROUVÉ (الآلية)      | تنفيذ حقيقي لـ `"database is locked"`                                                   |
| K-01                     | **PROUVÉ**           | لا شيء                                                                                  |
| K-04                     | **PROUVÉ**           | اختبار وحدة: `staffScope()` بلا جلسة ⇒ null                                             |
| K-10 / K-11              | **PROUVÉ**           | اختبار: استدعاء `staff.login` ثم فحص `audit_log`                                        |
| I-01                     | **PROUVÉ**           | لا شيء (أُعيد التشغيل)                                                                  |
| K-16 (ثغرات)             | **غير محسوم**        | `npm audit` على الشبكة                                                                  |
| P-03 (ABI)               | **غير محسوم**        | تشغيل الحزمة `.exe` المحزَّمة                                                           |
| P-06 (الاستعادة)         | **جزئي**             | اختبار استعادة على **قاعدة إنتاج** (منع: قاعدة «لا تكتب بيانات أعمال»)                  |
| E-01..E-19               | **PROUVÉ**           | لا شيء                                                                                  |
| المحور J                 | **PROUVÉ (ستاتيكي)** | قياس `EXPLAIN QUERY PLAN` على القاعدة الفعليّة (منع: قاعدة ABI + لا تشغيل POS)          |
| F-01..F-08               | **PROUVÉ**           | لا شيء                                                                                  |

**حدود العيّنة**: الطبقات الحسّاسة (Money/Atomicity/Audit/المهاجرات/IPC) =
**تدقيق 100%** (كل `db.transaction` وكل قناة وكل هجرة وكل حراسة مُراجَعة يدويًا).
الطبقات الأخرى (features/UI/تنسيق) = **بحث نصّي شامل + عيّنة ممثِّلة موثّقة**
(كل `formatDzd` في JSX = 268/268 مُحصىًا؛ كل `useEffect` = 96 مُصنَّفًا؛ كل
`key={i}` = 3؛ كل `localStorage` = 4). **المبرَّر**: التغطية الاسمية 100% على
الأنماط المعروفة + تثبيت كل نتيجة بملف:سطر.

**حدود الأدوات**: `graphify` لم يُستعمل query/path (اعتُمد الفحص المباشر
والسكربتات، وهو أدقّ لقياس أرقام محدَّدة) · `semgrep`/`gitleaks`/`osv-scanner`/
`ast-grep`/`betterer`/`lizard`/`jscpd`/`dpdm`/`madge` **لم تُشغَّل** (;"
تعذّر/غير مبرَّرة في هذا العمق؛ المسح اليدوي + knip/depcheck/ts-prune غطّى
الأهداف ذاتها) ⇒ **المحور المنصوص عليه في §6.1 «أدوات إضافية» غير مُغطّى
تلقائيًا**، وقد غُطّي يدويًا حيثما كان ذا معنى.
