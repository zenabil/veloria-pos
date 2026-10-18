// Veloria PoS — Documents d'impression purs (barrel : decoupage sans changement).
// Compatibilite totale : re-exporte exactement la surface publique d'origine.
// Source : electron/printing/receipt-documents/*.ts (deterministes, francais).
export { code39Svg, sanitizeCode39, CODE39_PATTERNS } from "./receipt-documents/barcode39";
export {
  CODE128_WIDTHS,
  code128Svg,
  code128Symbols,
  sanitizeCode128,
} from "./receipt-documents/barcode128";
export { escapeHtml, escapePreText } from "./receipt-documents/html";
export {
  formatCustomerCode,
  formatProductRef,
  paymentMethodLabel,
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
export { buildProformaA4Html, proformaFromReceipt } from "./receipt-documents/proforma";
export type { ProformaData } from "./receipt-documents/proforma";
export {
  buildPaymentText,
  paymentTicketKindLabel,
  toPaymentTicketData,
} from "./receipt-documents/payment-ticket";
export type { PaymentTicketData, PaymentTicketKind } from "./receipt-documents/payment-ticket";
export { buildReportHtml, toReportData } from "./receipt-documents/report";
export type { ReportChart, ReportData, ReportKpi, ReportTable } from "./receipt-documents/report";
export { buildLabelsHtml, LABEL_FORMATS, labelPageMicrons } from "./receipt-documents/labels";
export type { LabelFormat, LabelItem, LabelOptions } from "./receipt-documents/labels";
export {
  buildDeliveryText,
  buildPurchaseOrderText,
  buildReturnSlipText,
} from "./receipt-documents/logistics";
export type { LogisticsDocData } from "./receipt-documents/logistics";
