// Veloria PoS — Documents d'impression purs (barrel : decoupage sans changement).
// Compatibilite totale : re-exporte exactement la surface publique d'origine.
// Source : electron/printing/receipt-documents/*.ts (deterministes, francais).
export {
  code39Svg,
  escapeHtml,
  escapePreText,
  formatCustomerCode,
  formatProductRef,
  paymentMethodLabel,
  sanitizeCode39,
  CODE39_PATTERNS,
} from "./receipt-documents/common";
export type { ReceiptData, ReceiptLine, ThermalWidth } from "./receipt-documents/common";
export {
  amountInWordsFr,
  buildQrPayload,
  timbreQuittanceLf2025,
  tvaBreakdown,
} from "./receipt-documents/amounts";
export {
  thermalCols,
  thermalField,
  thermalHtml,
  thermalItem,
  thermalRow,
  thermalSep,
  wrapThermal,
} from "./receipt-documents/thermal";
export {
  docQrPayload,
  headerNoteHtml,
  logoMaxHeight,
  pageAtRule,
  signsHtml,
  watermarkHtml,
} from "./receipt-documents/chrome";
export type { PageOpts } from "./receipt-documents/chrome";
export { buildReceiptText, toReceiptData } from "./receipt-documents/receipt-text";
export { buildA4Html } from "./receipt-documents/receipt-a4";
export {
  buildProformaA4Html,
  buildProformaText,
  proformaFromReceipt,
} from "./receipt-documents/proforma";
export type { ProformaData } from "./receipt-documents/proforma";
export {
  buildPaymentText,
  buildPaymentTicketA4Html,
  paymentTicketKindLabel,
  toPaymentTicketData,
} from "./receipt-documents/payment-ticket";
export type { PaymentTicketData, PaymentTicketKind } from "./receipt-documents/payment-ticket";
export { buildReportHtml, toReportData } from "./receipt-documents/report";
export type { ReportChart, ReportData, ReportKpi, ReportTable } from "./receipt-documents/report";
export { buildLabelsHtml } from "./receipt-documents/labels";
export type { LabelFormat, LabelItem, LabelOptions } from "./receipt-documents/labels";
export {
  buildDeliveryHtml,
  buildDeliveryText,
  buildPurchaseOrderHtml,
  buildPurchaseOrderText,
  buildReturnSlipHtml,
  buildReturnSlipText,
} from "./receipt-documents/logistics";
export type { LogisticsDocData } from "./receipt-documents/logistics";
