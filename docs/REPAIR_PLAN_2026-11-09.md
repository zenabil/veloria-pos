# خطة الإصلاح الجذري — تدقيق Veloria POS (2026-11-09)

> طلب المستخدم: «قم بتحليل و دراسة المشروع بدقة شديدة جدا و اعدد جدول بكل الأخطاء» ثم «أعدد خطة قوية و أصلح جذرياً».  
> هذه الخطة هي مرجع التنفيذ الكامل والموثّق. لا يُعدّ أي إصلاح نهائياً إلا بعد تحقق البوابات في §7.

## 1) المبدأ الحاكم (لا يُكسر أبداً)

| القاعدة                                  | الالتزام                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| 1. SQLite وحده مصدر الحقيقة              | ممنوع أي مصدر بديل للبيانات التجارية                                   |
| 2. Renderer لا يعرف Electron/Node/SQLite | Bridge `window.veloria` فقط                                            |
| 3. لا `run-sql` عام                      | قنوات `domain.action` + Zod صريح                                       |
| 4. المال = centimes DZD صحيحة            | صفر float في أي حساب محاسبي                                            |
| 5. ذرية كل تغيير مالي                    | `UNIQUE` + idempotency + prepared statements + تدقيق                   |
| 6. واجهة فرنسية 100%                     | لا استثناء خام يظهر للمستخدم                                           |
| 7. Vertical slices                       | UI → use case → domain → repo → migration → test                       |
| 11/12. Migrations immutable              | أي تغيير مخطط = ملف جديد مرقّم + lock محدّث + `verify-migrations` أخضر |
| 13ـ14. Skill-first + scope strict        | لا انحراف خارج النطاق المحدد                                           |

## 2) إعادة البناء (التشخيص)

### 2.1 ما هو سليم (معتمد من البوابات)

- `typecheck ×5`, `format`, `verify` (59 migration), `tests` (192 ملف / 1412 اختبار), `build` (5.76s), `knip`: خضراء عدا `lint` (خطأ واحد مؤكد).
- البنية: prepared statements، Zod، idempotency keys، رسائل FR، تغطية اختبارات واسعة.

### 2.2 ما هو مكسور (دخول خطة الإصلاح)

| القناة              | الأعراض                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sync                | آثار جانبية شبكية قبل الحجز؛ لا قفل للمالك؛ فقدان تحديثات (lost update)؛ `buildOwnerSnapshot` خارج الـtry                         |
| Cash / Closing      | الإغلاق يعدّ `sale_id IS NULL` فقط؛ لا يتتبع تدفقات الديون على فواتير قديمة؛ المرتجعات تُنسب حسب تاريخ الإنشاء لا تاريخ الاسترداد |
| Returns / Templates | إعادة التشغيل الصامت دون تحقق (UNIQUE → return)                                                                                   |
| Backup              | دورة نسخ احتياطي قد تحذف ملف الاستعادة قبل التحقق؛ سياسة الترخيص غير متسقة؛ مسارات مطلقة مسرّبة                                   |
| IPC / FR            | رسائل تقنية/إنجليزية قد تظهر للمستخدم (أبرزها `This operation was aborted`)؛ معرّفات قصيرة غير محمية في `history`                 |
| Idempotency         | دلالة `'{}'` هشّة: تُجبر كل مستدعٍ على التقاط UNIQUE يدوياً                                                                       |

## 3) المبادئ التصميمية للإصلاح

1. **المال يتبع تدفقه:** النقد المتوقع يُحسب من `sale_payments` (دفتر التدفقات) حسب `payment_date`/`created_at`، لا من `sales.created_at`. تقسيم `cash_sales` / `collections` يظل للعرض فقط، والمجموع لا يتغير.
2. **الاسترداد له تاريخه:** جدول `return_refund_movements` هو الحقيقة الجديدة؛ لا يُستنتج تاريخ الاسترداد من `updated_at` أو `details_json`.
3. **الحجز قبل الإرسال:** أي عملية شبكية (مرآة، لياتين، حساب مالك) تحجز `operationId` أولاً. إعادة التشغيل مع نتيجة مخزنة تعود فوراً؛ مع `{}` (pending) تُعاد القراءة من الحالة المحلية بدل إرسال مكرر.
4. **لا فقدان تحديثات:** كل كتابة على `client_sync` تعيد قراءة الوثيقة داخل معاملتها قبل الكتابة. العمليات = update على الحقول فقط، لا استبدال أعمى.
5. **الحالة صريحة في idempotency:** عمود `status` (`pending`/`done`) يفصل «قيد التنفيذ» عن «اكتمل». الفشل الصريح غير موجود كحالة؛ الفشل = عدم تخزين نتيجة (الـclaim يبقى pending ويمنع الإعادة العمياء). يُعدّل التعليق بصراحة.
6. **النسخ الاحتياطي لا يأكل مصدره:** ملف الاستعادة محمي من التدوير؛ أي فشل تحقق نظّف مؤقته ولا يمس المصدر.
7. **FR دائماً:** كل رسالة للمستخدم فرنسية؛ التفاصيل التقنية في السجل فقط. القبول: `toUserMessage` لا يعيد نصاً إنجليزياً أبداً.
8. **نطاق صارم:** تُصلَّح فقط الملفات المذكورة في §5. لا إعادة هيكلة عامة؛ لا تغييرات أداء؛ لا واجهات جديدة.

## 4) مصفوفة الإصلاحات (IDs التدقيق → التطبيق)

| ID   | الخطورة | الإصلاح المطلوب                                                                                                                   |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | متوسط   | إزالة `as Record<string,string>` غير الضروري في `tests/e2e/real-cloud-loop.spec.ts:46`                                            |
| S-01 | عالٍ    | حجز `operationId` قبل `POST` في `publishOwnerSnapshotAtomic` + معالجة `{}` عبر قراءة `lastOwnerPushAt`                            |
| S-02 | عالٍ    | حجز في `saveOwnerAccountAtomic` قبل `adminAuthFetch` + نتيجة محلية                                                                |
| S-03 | متوسط   | `ownerInFlight` مثل `mirrorInFlight`؛ المؤقت يمر عبر نفس البوابة                                                                  |
| S-04 | متوسط   | `refreshDoc` داخل كل مسار كتابة؛ لا تجاوز للوثيقة القديمة                                                                         |
| S-05 | متوسط   | `buildOwnerSnapshot` داخل `try` مع حفظ `lastOwnerError`/`lastOwnerAttemptAt`                                                      |
| S-06 | منخفض   | إظهار `accessRejected` في النتيجة والسجل                                                                                          |
| C-01 | حرج     | `collections` = كل تدفقات `sale_payments` النقدية (بما فيها دفعات الديون على فواتير قديمة) منقسم إلى `cash_sales` / `collections` |
| C-02 | عالٍ    | مصدر وحيد: `sale_payments` حسب `payment_date`                                                                                     |
| C-03 | عالٍ    | Migration `0060` + جدول `return_refund_movements` + backfill من `audit_log`                                                       |
| C-04 | متوسط   | `storeIdempotencyResult` داخل معاملة `cash-session`                                                                               |
| R-01 | متوسط   | تحقق بعد UNIQUE في `recordReturnRefundAtomic`                                                                                     |
| R-02 | منخفض   | تحقق بعد UNIQUE في قوالب (3 دوال)                                                                                                 |
| R-03 | متوسط   | Migration `0062` + إبقاء سجل الوصول (revoke بدل DELETE) + قراءة أحدث صف فقط في المزامنة                                           |
| B-01 | حرج     | حماية ملف الاستعادة من التدوير + نسخة عمل مؤقتة                                                                                   |
| B-02 | متوسط   | توحيد سياسة الترخيص (المنع صريح)                                                                                                  |
| B-03 | منخفض   | أسماء نسبية فقط في `backup.list`/`backup.status`                                                                                  |
| B-04 | منخفض   | تخزين نتيجة الاستعادة أو تحرير الحجز عند فشل حتمي                                                                                 |
| I-01 | متوسط   | `toUserMessage` لا يعيد أبداً نصاً غير فرنسي                                                                                      |
| I-02 | متوسط   | تغطية `"This operation was aborted"` برسالة FR                                                                                    |
| I-03 | متوسط   | تنظيف الرسائل عند القراءة (defense in depth)                                                                                      |
| I-04 | منخفض   | فحص صريح `amountPaid > total` برسالة FR                                                                                           |
| I-05 | منخفض   | `try/catch` حول زر «Appoint»                                                                                                      |
| I-06 | منخفض   | `ESCAPE '\'` موحّد في `history-query`                                                                                             |
| I-07 | متوسط   | Migration `0061`: عمود `status` + helpers + تحويلات `pending` إلى خطأ FR                                                          |

## 5) التسلسل التنفيذي (ملفات/مسارات مرتبطة)

**المرحلة 0 — التثبيت**

- `docs/REPAIR_PLAN_2026-11-09.md` (هذا الملف)؛ إضافة لـ`handoff.md` (§1 + جلسة جديدة)؛ `docs/ADR-177-...md` (حسب القرارات المؤثرة).

**المرحلة 1 — P0 Finance/Backup (حرج)**

- `electron/ipc/handlers/finance.repo.ts` (Closing)
- `electron/ipc/handlers/cash-session.repo.ts` (Session flows + C-04)

**المرحلة 2 — P0 Backup**

- `electron/backup/backup.service.ts` (B-01, B-02, B-03, B-04)
- `electron/ipc/raw-guards.ts` (تصحيح التعليق)؛ `electron/ipc/validators.print.ts`

**المرحلة 3 — P1 Sync (عالٍ)**

- `electron/sync/sync.service.ts` (S-01..S-06)

**المرحلة 4 — Returns/Templates/Client Access**

- `electron/ipc/handlers/returns.repo.ts`
- `electron/ipc/handlers/templates.repo.ts`
- `electron/ipc/handlers/client-access.repo.ts`
- `database/migrations/0060_return_refunds_by_date.sql`
- `database/migrations/0062_client_access_history.sql`

**المرحلة 5 — Idempotency / IPC / FR / UI**

- `electron/ipc/handlers/idempotency.ts` (+ Migration `0061`)
- `electron/ipc/ipc-errors.ts`; `src/shared/errors/fr-map.ts`
- `src/features/sales/sell/PayDialog.tsx`
- `electron/ipc/handlers/history-query.ts`; `registry.sales.ts`
- `tests/e2e/real-cloud-loop.spec.ts`

**المرحلة 6 — الاختبارات والبوابات**

- اختبارات جديدة: `tests/integration/closing-cash-attribution.test.ts`, `tests/integration/cash-session-idempotency.test.ts`, `tests/integration/backup-restore-protects-source.test.ts`, `tests/unit/sync-claim-before-send.test.ts`, `tests/unit/fr-aborted-message.test.ts`

## 6) التاعدة: ما لا يُمس

- لا تعديل `database/migrations/0001..0059.sql` في مكانها (القاعدة 12).
- لا تغيير في معنى عمود `daily_closings.cash_payments_minor` (معلوماتي فقط).
- لا تغيير في `isInternalProduct` أو مسارات المخزون غير المذكورة.
- لا إزالة لقنوات IPC قائمة (تغييرات متوافقة رجعياً فقط).

## 7) بوابات القبول (كل بندان أخضر)

| البوابة   | الأمر                                                                       | نجاح =                            |
| --------- | --------------------------------------------------------------------------- | --------------------------------- |
| typecheck | `npm run typecheck` + `typecheck:electron` + `manager` + `mobile` + `owner` | exit 0                            |
| lint      | `npm run lint`                                                              | exit 0 (A-01 مصلح)                |
| format    | `npm run format:check`                                                      | exit 0                            |
| tests     | `npm test`                                                                  | 192+ ملف / 1412+ اختبار، zero فقد |
| verify    | `npm run verify`                                                            | exit 0 (migrations + domain + FR) |
| build     | `npm run build`                                                             | يبني في < 10s                     |
| knip      | `npm run knip`                                                              | نظيف                              |
| إضافي     | `tests/integration` جديدة                                                   | ذهبية/مية 1:1                     |

## 8) المخاطر المعروفة وإجراءات التخفيف

| الخطر                                             | التخفيف                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Migration `0060` تسحب من `audit_log.details_json` | استخراج متحفظ + تحقق من المجموع مقابل `returns.amount_refunded_minor`؛ اختلاف = إبقاء أي دخل محفوظ في mirror |
| Sync: لا idempotency خادمي للائتين                | الهدف = تضييق النافذة لـms، لا إلغاء تام؛ `lastOwnerPushAt` أساس التحقق عند `{}`                             |
| Customer access: صفوف إضافية                      | المزامنة تقرأ **الأحدث فقط** لكل عميل (`NOT EXISTS` للأحدث)؛ الاختبارات تغطيه                                |
| Idempotency `status` default                      | Backfill: الصفوف القديمة = `done` إن كان `result_json <> '{}'` وإلا `pending`                                |

## 9) جدول التحقق النهائي (تنفيذ 2026-11-09)

| ID             | الملفات المعدلة                                                                                               | التحقق                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A-01           | `tests/e2e/real-cloud-loop.spec.ts`                                                                           | lint 0                                                           |
| S-01           | `electron/sync/sync.service.ts` (`tryClaimBeforeSend`, `publishOwnerSnapshotAtomic`)                          | owner-snapshot-publish + sync-push 0 فشل                         |
| S-02           | `sync.service.ts` (`saveOwnerAccountAtomic`)                                                                  | idempotency replay محفوظ                                         |
| S-03           | `sync.service.ts` (`ownerInFlight`)                                                                           | قفل مزدوج                                                        |
| S-04           | `sync.service.ts` (`writeDocMeta`, `readDoc` داخلي)                                                           | لا فقدان إعدادات                                                 |
| S-05           | `sync.service.ts` (build داخل try)                                                                            | `lastOwnerError` محفوظة                                          |
| S-06           | `sync.service.ts` (`accessRejected`)                                                                          | sync-push-queue مُحدث ومخضر                                      |
| C-01/C-02      | `finance.repo.ts`, `cash-session.repo.ts`                                                                     | closing-cash-attribution (3) + Z formula + owner-snapshot (9500) |
| C-03           | `returns.repo.ts` + `0060` + `finance/cash`                                                                   | closing-cash-attribution                                         |
| C-04           | `cash-session.repo.ts` (tx returns)                                                                           | cash-sessions + cash-session                                     |
| R-01/R-02      | `returns.repo.ts`, `templates.repo.ts`                                                                        | cause محفوظة، لا صمت                                             |
| R-03           | `client-access.repo.ts` + `0062`                                                                              | client-access-sync (2 صفوف)                                      |
| B-01..B-04     | `backup.service.ts` (نسخة عمل + protect)                                                                      | نسخ احتياطي + ترخيص                                              |
| I-01/I-02/I-03 | `ipc-errors.ts`, `fr-map.ts`                                                                                  | fr-map + sync-error-fr                                           |
| I-04           | `registry.sales.ts`                                                                                           | رسالة FR صريحة                                                   |
| I-05           | `PayDialog.tsx`                                                                                               | `exactAmount`                                                    |
| I-06           | `history-query.ts`                                                                                            | ESCAPE موحد                                                      |
| I-07           | `idempotency.ts` + `0061`                                                                                     | حالة صريحة                                                       |
| هجرات          | `0060_return_refund_movements.sql`, `0061_idempotency_status.sql`, `0062_client_access_history.sql` + lock 62 | verify-migrations MIGRATIONS VERIFIED                            |

**البوابات النهائية:** format 0 · lint 0 · typecheck x5 0 · test 193/1417 0 · verify OK · knip 0 · build OK. `git` غير متاح ⇒ لا commit (المادة 10 مذكورة في handoff أعلاه).
