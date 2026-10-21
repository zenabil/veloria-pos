// Veloria PoS — Documents d'impression purs (barrel : découpage sans changement).
// Source : electron/printing/receipt-documents/*.ts (déterministes, français).
// W6 (audit B-05..B-28) : la surface publique a été TRIÉE — les ré-exports que
// personne ne consomme (blocs thermiques morts, types de rapport non repris)
// ont été retirés ; en revanche ceux que la suite de tests consomme
// (échappement HTML, code-barres 39/128) sont CONSERVés — le `knip` doit
// rester à 0 ET `npm run typecheck` doit rester vert.
export {
  formatCustomerCode,
  formatProductRef,
  paymentMethodLabel,
} from "./receipt-documents/common";
export type { ReceiptData, ThermalWidth } from "./receipt-documents/common";
export { escapeHtml } from "./receipt-documents/html";
export { CODE39_PATTERNS, code39Svg, sanitizeCode39 } from "./receipt-documents/barcode39";
export {
  CODE128_WIDTHS,
  code128Svg,
  code128Symbols,
  sanitizeCode128,
} from "./receipt-documents/barcode128";
export {
  amountInWordsFr,
  buildQrPayload,
  timbreQuittanceLf2025,
  tvaBreakdown,
} from "./receipt-documents/amounts";
export {
  thermalCols,
  thermalField,
  thermalItem,
  thermalLogo,
  thermalRow,
  thermalHtml,
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
export { buildReceiptText, toReceiptData } from "./receipt-documents/receipt-text";
export { buildProformaA4Html, proformaFromReceipt } from "./receipt-documents/proforma";
export type { ProformaData } from "./receipt-documents/proforma";
export {
  buildPaymentText,
  paymentTicketKindLabel,
  toPaymentTicketData,
} from "./receipt-documents/payment-ticket";
export type { PaymentTicketData } from "./receipt-documents/payment-ticket";
export { buildReportHtml, toReportData } from "./receipt-documents/report";
export { buildLabelsHtml, LABEL_FORMATS, labelPageMicrons } from "./receipt-documents/labels";
export type { LabelFormat, LabelItem } from "./receipt-documents/labels";
export {
  buildDeliveryText,
  buildPurchaseOrderText,
  buildReturnSlipText,
} from "./receipt-documents/logistics";
export type { LogisticsDocData } from "./receipt-documents/logistics";
