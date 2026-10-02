// Veloria Client (APK) — i18n V1 : arabe (défaut, RTL) + français (LTR).
// Glossaire fermé ADR-051 : toute nouvelle clé exige les deux langues.

export type Lang = "ar" | "fr";

const STRINGS = {
  debtRemaining: { ar: "الدين المتبقي", fr: "Dette restante" },
  totalPurchases: { ar: "إجمالي المشتريات", fr: "Total achats" },
  loyaltyInfo: { ar: "نقاط الولاء (للعرض فقط)", fr: "Points fidélité (info)" },
  loyaltyHint: {
    ar: "نقاط تحفيزية غير قابلة للصرف حالياً",
    fr: "Points indicatifs non échangeables",
  },
  lastSync: { ar: "آخر تحديث", fr: "Dernière synchro" },
  // Phrases COMPLÈTES (jamais un fragment en attente d'une date) : ces chaînes
  // sont affichées seules (en-tête, toasts) ou après une date.
  staleData: {
    ar: "المحل غير متصل، تم عرض نسخة محلية",
    fr: "Magasin hors ligne : copie locale affichée",
  },
  staleDataOn: {
    ar: "المحل غير متصل، آخر نسخة محلية بتاريخ",
    fr: "Magasin hors ligne : dernière copie locale du",
  },
  // Phrase complète pour un échec SANS copie locale affichée (connexion,
  // détail sans cache) : on n'affirme pas « copie locale » là où il n'y en a pas.
  offlineError: {
    ar: "المحل غير متصل، أعد المحاولة لاحقاً",
    fr: "Magasin hors ligne : réessayez plus tard",
  },
  retry: { ar: "إعادة المحاولة", fr: "Réessayer" },
  invoices: { ar: "فواتيري", fr: "Mes factures" },
  payments: { ar: "دفعاتي", fr: "Mes paiements" },
  home: { ar: "الرئيسية", fr: "Accueil" },
  account: { ar: "حسابي", fr: "Mon compte" },
  shop: { ar: "المحل", fr: "Magasin" },
  paid: { ar: "مدفوعة", fr: "Payée" },
  partial: { ar: "جزئية", fr: "Partielle" },
  unpaid: { ar: "غير مدفوعة", fr: "Non payée" },
  cancelled: { ar: "ملغاة", fr: "Annulée" },
  invoicePayment: { ar: "دفعة فاتورة", fr: "Paiement facture" },
  accountAdvance: { ar: "تسبيق على الحساب", fr: "Avance sur compte" },
  cash: { ar: "نقدي", fr: "Espèces" },
  cheque: { ar: "شيك", fr: "Chèque" },
  transfer: { ar: "تحويل", fr: "Virement" },
  upToDate: { ar: "سليم", fr: "À jour" },
  indebted: { ar: "مديون", fr: "Endetté" },
  late: { ar: "متأخر", fr: "En retard" },
  overLimit: { ar: "تجاوز السقف", fr: "Dépassement" },
  hideAmounts: { ar: "إخفاء المبالغ", fr: "Masquer" },
  showAmounts: { ar: "إظهار", fr: "Afficher" },
  searchInvoice: { ar: "بحث برقم الفاتورة", fr: "Rechercher N°" },
  invoiceNo: { ar: "رقم الفاتورة", fr: "N°" },
  reportError: { ar: "عندي خطأ في هذه الفاتورة", fr: "Signaler une erreur" },
  call: { ar: "اتصال", fr: "Appeler" },
  support: { ar: "الدعم", fr: "Assistance" },
  shareStatement: { ar: "مشاركة الكشف", fr: "Partager" },
  logout: { ar: "خروج", fr: "Déconnexion" },
  changePin: { ar: "تغيير الرمز", fr: "Changer PIN" },
  lastLogin: { ar: "آخر دخول", fr: "Dernière connexion" },
  aboutApp: { ar: "حول التطبيق", fr: "À propos" },
  enter: { ar: "دخول", fr: "Entrer" },
  newPinRequest: {
    ar: "السلام عليكم، أنا زبونكم وأريد رمز تطبيق جديد. شكراً",
    fr: "Bonjour, je suis votre client et je souhaite un nouveau code appli. Merci",
  },
  loginError: { ar: "الهاتف أو الرمز غير صحيح", fr: "Téléphone ou code incorrect" },
  lockedError: {
    ar: "الحساب مقفل 5 دقائق (5 محاولات)",
    fr: "Compte verrouillé 5 minutes (5 échecs)",
  },
  revokedError: {
    ar: "تم إيقاف الوصول. اتصل بالمحل.",
    fr: "Accès coupé. Contactez votre magasin.",
  },
  noInvoices: { ar: "لا فواتير بعد", fr: "Aucune facture" },
  noPayments: { ar: "لا دفعات بعد", fr: "Aucun paiement" },
  emptyHint: { ar: "اتصل بالمحل عند الحاجة", fr: "Appelez le magasin si besoin" },
  all: { ar: "الكل", fr: "Tout" },
  details: { ar: "عرض التفاصيل", fr: "Voir détails" },
  total: { ar: "الإجمالي", fr: "Total" },
  paidAmount: { ar: "المدفوع", fr: "Payé" },
  remaining: { ar: "الباقي", fr: "Reste" },
  status: { ar: "الحالة", fr: "Statut" },
  monthlySummary: { ar: "ملخص السداد الشهري", fr: "Résumé mensuel" },
  viewReceipt: { ar: "عرض الوصل", fr: "Voir le reçu" },
  quickRefresh: { ar: "تحديث فوري", fr: "Actualiser" },
  firstSteps: { ar: "كيفية الدخول لأول مرة؟", fr: "Première connexion ?" },
  receipt: { ar: "الوصل", fr: "Reçu" },
  close: { ar: "إغلاق", fr: "Fermer" },
  notifications: { ar: "الإشعارات", fr: "Notifications" },
  language: { ar: "اللغة", fr: "Langue" },
  requestCode: { ar: "طلب رمز عبر واتساب", fr: "Demander un code WhatsApp" },
  noAnnouncement: { ar: "لا إعلانات جديدة من المحل", fr: "Aucune annonce du magasin" },
  receiptNote: {
    ar: "شكراً لثقتكم. احتفظ بهذا الوصل.",
    fr: "Merci de votre confiance. Gardez ce reçu.",
  },
  scanQr: { ar: "مسح QR من المحل", fr: "Scanner le QR du magasin" },
  qrError: {
    ar: "رمز QR غير صالح — اطلب بطاقة جديدة من المحل",
    fr: "QR invalide — demandez une nouvelle carte au magasin",
  },
  cameraNeed: {
    ar: "اسمح بالكاميرا لمسح رمز المحل",
    fr: "Autorisez la caméra pour scanner le code",
  },
  cameraGrant: { ar: "السماح بالكاميرا", fr: "Autoriser la caméra" },
  serverError: { ar: "خطأ في المزامنة — حاول لاحقاً", fr: "Échec de synchronisation — réessayez" },
  viewAll: { ar: "عرض الكل", fr: "Voir tout" },
  back: { ar: "رجوع", fr: "Retour" },
  detailTitle: { ar: "تفاصيل الفاتورة", fr: "Détail facture" },
  detailNotFound: {
    ar: "التفاصيل غير متوفرة — اطلب من المحل المزامنة ثم أعد المحاولة",
    fr: "Détail indisponible — demandez au magasin de synchroniser puis réessayez",
  },
  itemsTitle: { ar: "المنتجات", fr: "Articles" },
  qtyShort: { ar: "الكمية", fr: "Qté" },
  loading: { ar: "جارٍ التحميل…", fr: "Chargement…" },
  connected: { ar: "متصل بالشبكة المحلية للمحل", fr: "Connecté au magasin" },
  showPin: { ar: "إظهار الرمز", fr: "Afficher le code" },
  hidePin: { ar: "إخفاء الرمز", fr: "Masquer le code" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

/** Direction d'écriture : l'arabe retourne toute la mise en page. */
export function direction(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** Les deux langues doivent couvrir exactement les mêmes clés (testé). */
export function allKeys(): StringKey[] {
  return Object.keys(STRINGS) as StringKey[];
}
