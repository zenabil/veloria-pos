// Veloria PoS - IPC: finance + depenses + societe + dettes/clotures/zakat (extrait de registry.ts, deplacement pur).

import { IPC_CHANNELS } from "./channels";
import * as V from "./validators";
import * as Finance from "./handlers/finance.repo";
import * as Expenses from "./handlers/expenses.repo";
import * as Company from "./handlers/company.repo";
import * as History from "./handlers/history.repo";
import * as Settings from "./handlers/settings.repo";
import { getCurrentStaffUser } from "./handlers/staff-session";
import { getStaffRole } from "./handlers/staff.repo";
import { readLogoDataUrlFromFile } from "../services/logo";
import { handle } from "./handle";

/** Périmètre auteur 0046 : null = gérant (tout), sinon id de l'utilisateur. */
function staffScope(): number | null {
  const id = getCurrentStaffUser();
  if (id == null) return null;
  return getStaffRole(id) === "manager" ? null : id;
}

export function registerFinanceChannels(): void {
  // reports/dashboard (repository : handlers/finance.repo.ts).
  // NOTE : l'ancien canal `reports.period` (non validé, redondant avec
  // `reports.full`) a été supprimé — aucun appelant.
  // NOTE : `reports.dashboard` (doublon de `dashboard.summary`, aucun appelant)
  // a été supprimé — `dashboard.summary` est l'unique synthèse.

  // historique unifié (lecture seule, UNION multi-tables).
  // R2 (0046) : filtré par auteur — le gérant (scope null) voit tout.
  handle(IPC_CHANNELS["history.list"], V.historyListSchema, (input) =>
    History.listHistory(
      {
        op: input.op,
        from: input.from ?? null,
        to: input.to ?? null,
        query: input.query,
        sort: input.sort,
        page: input.page,
        pageSize: input.pageSize,
      },
      staffScope(),
    ),
  );
  handle(IPC_CHANNELS["history.detail"], V.historyDetailSchema, (input) =>
    History.getHistoryDetail(input.kind, input.id, staffScope()),
  );
  handle(IPC_CHANNELS["history.stats"], V.historyStatsSchema, (input) =>
    History.getHistoryStats(input.from ?? null, input.to ?? null, staffScope()),
  );

  // expenses (repository : handlers/expenses.repo.ts)
  handle(IPC_CHANNELS["expenses.create"], V.expenseCreateSchema, (input) => ({
    id: Expenses.createExpense({
      operationId: input.operationId,
      description: input.description,
      category: input.category,
      amountMinor: input.amountMinor,
      expenseDate: input.expenseDate,
      supplierId: input.supplierId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      status: input.status,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
      // R2 (0046) : la dépense porte son auteur.
      staffUserId: getCurrentStaffUser(),
    }),
  }));
  handle(IPC_CHANNELS["expenses.list"], V.expenseListSchema, (input) =>
    Expenses.listExpensesUnified(input.query, input.page, input.pageSize, {
      category: input.category ?? null,
      statusFilter: input.statusFilter,
      methodFilter: input.methodFilter,
      from: input.from ?? null,
      to: input.to ?? null,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["expenses.update"], V.expenseUpdateSchema, (input) => {
    Expenses.updateExpense({
      id: input.id,
      description: input.description,
      category: input.category,
      amountMinor: input.amountMinor,
      expenseDate: input.expenseDate,
      supplierId: input.supplierId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      status: input.status,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      now: new Date().toISOString(),
      operationId: input.operationId ?? null,
    });
    return { updated: true };
  });
  handle(IPC_CHANNELS["expenses.delete"], V.expenseDeleteSchema, (input) => {
    // A-10 : `operationId` désormais EXIGÉ par le schéma (suppression
    // financière rejouable) — plus de repli sur un UUID aléatoire.
    Expenses.deleteExpenseAtomic(input.id, new Date().toISOString(), input.operationId);
    return { deleted: true };
  });
  handle(IPC_CHANNELS["expenses.stats"], V.emptyPayloadSchema, () => Expenses.getExpenseStats());

  // company (repository : handlers/company.repo.ts, schéma validé)
  // logoDataUrl joint (meilleur effort) pour l'aperçu Paramètres sans accès fichier renderer.
  handle(IPC_CHANNELS["company.get"], V.emptyPayloadSchema, () => {
    const company = Company.getCompany();
    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = readLogoDataUrlFromFile(
        (company as { logo_path?: unknown } | null)?.logo_path as string | null,
      );
    } catch {
      logoDataUrl = null;
    }
    return { company, logoDataUrl };
  });
  handle(IPC_CHANNELS["company.update"], V.companyUpdateSchema, (input) => {
    Company.saveCompany(
      {
        company_name: input.company_name ?? null,
        commercial_name: input.commercial_name ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        tax_number: input.tax_number ?? null,
        commercial_register: input.commercial_register ?? null,
        nis: input.nis ?? null,
        article_imposition: input.article_imposition ?? null,
        invoice_prefix: input.invoice_prefix ?? null,
        logo_path: input.logo_path ?? null,
      },
      new Date().toISOString(),
      input.operationId ?? null,
    );
    return { saved: true };
  });

  // ---- Phase 8 : dettes / rapports / clôtures / zakat ----
  handle(IPC_CHANNELS["debts.list"], V.debtsListSchema, (input) =>
    Finance.listDebtsUnified(input.query, input.page, input.pageSize, {
      typeFilter: input.typeFilter,
      statusFilter: input.statusFilter,
      dueFilter: input.dueFilter,
      settleFilter: input.settleFilter,
      sort: input.sort,
    }),
  );
  handle(IPC_CHANNELS["debts.detail"], V.debtTargetSchema, (input) =>
    Finance.getDebtDetail(input.debtType, input.id),
  );
  handle(IPC_CHANNELS["debts.stats"], V.emptyPayloadSchema, () => Finance.getDebtStats());
  handle(IPC_CHANNELS["reports.summary"], V.reportSummarySchema, (input) =>
    Finance.getReportsSummary({
      from: input.from,
      to: input.to,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      categoryId: input.categoryId ?? null,
      // R2 (0046) : l'utilisateur ne chiffre que ses opérations.
      staffUserId: staffScope(),
    }),
  );
  handle(IPC_CHANNELS["dashboard.summary"], V.dashboardSummarySchema, (input) =>
    Finance.getDashboardSummary(input.from, input.to, staffScope()),
  );
  handle(IPC_CHANNELS["closings.get"], V.closingsListSchema, (input) =>
    Finance.listClosings(input.from, input.to),
  );
  handle(IPC_CHANNELS["closings.create"], V.closingCreateSchema, (input) =>
    Finance.createDailyClosingAtomic({
      businessDate: input.businessDate,
      openingMinor: input.openingMinor,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
  // E-21 (P1) : réouverture d'une journée close (le verrou 0048 rend la
  // journée immuable ; le gérant peut la rouvrir explicitement pour corriger
  // puis re-clôturer). `reopenDailyClosingAtomic` refuse sans session gérant.
  handle(IPC_CHANNELS["closings.reopen"], V.closingReopenSchema, (input) =>
    Finance.reopenDailyClosingAtomic({
      businessDate: input.businessDate,
      operationId: input.operationId,
      now: new Date().toISOString(),
      actorUserId: getCurrentStaffUser(),
    }),
  );
  handle(IPC_CHANNELS["zakat.sources"], V.emptyPayloadSchema, () => Finance.getZakatSources());
  handle(IPC_CHANNELS["zakat.saveParams"], V.zakatParamsSchema, (input) => {
    Settings.saveZakatParams(
      {
        ratePercent: input.ratePercent,
        nisabMinor: input.nisabMinor,
        hawlDate: input.hawlDate ?? null,
        nisabMethod: input.nisabMethod,
      },
      new Date().toISOString(),
      input.operationId ?? null,
    );
    return { saved: true };
  });
  handle(IPC_CHANNELS["zakat.history"], V.paginationSchema, (input) =>
    Finance.listZakatCalculations(input.page, input.pageSize),
  );
  handle(IPC_CHANNELS["zakat.save"], V.zakatCalculationSchema, (input) =>
    Finance.saveZakatCalculation({
      hijriYear: input.hijriYear,
      calcDate: input.calcDate,
      cashMinor: input.cashMinor,
      bankMinor: input.bankMinor,
      stockMinor: input.stockMinor,
      receivablesMinor: input.receivablesMinor,
      otherMinor: input.otherMinor,
      liabilitiesMinor: input.liabilitiesMinor,
      nisabMinor: input.nisabMinor,
      ratePercent: input.ratePercent,
      notes: input.notes ?? null,
      operationId: input.operationId,
      now: new Date().toISOString(),
    }),
  );
}
