// Veloria Client (APK) — i18n V1 : arabe (défaut, RTL) + français (LTR).
// Glossaire fermé ADR-051 : toute nouvelle clé exige les deux langues.

export type Lang = "ar" | "fr";

const STRINGS = {
  debtRemaining: { ar: "الدين المتبقي", fr: "Dette restante" },
  settlementDay: { ar: "الاستحقاق", fr: "Échéance" },
  lastInvoice: { ar: "آخر فاتورة", fr: "Dernière facture" },
  thisMonth: { ar: "هذا الشهر", fr: "Ce mois-ci" },
  invoicesTotal: { ar: "عدد الفواتير", fr: "Factures au total" },
  creditUsage: { ar: "استخدام الائتمان", fr: "Utilisation du crédit" },
  purchasesThisMonth: { ar: "مشتريات الشهر", fr: "Achats du mois" },
  paidThisMonth: { ar: "مدفوعات الشهر", fr: "Payés ce mois" },
  welcomeTitle: { ar: "مرحباً بك في فضاء الزبون", fr: "Bienvenue dans votre espace" },
  welcomeHint: {
    ar: "ستظهر فواتيرك ومدفوعاتك هنا بعد أول عملية شراء.",
    fr: "Vos factures et paiements apparaîtront ici après votre premier achat.",
  },
  loyaltyInfo: { ar: "نقاط الولاء (للعرض فقط)", fr: "Points fidélité (info)" },
  loyaltyHint: {
    ar: "نقاط تحفيزية غير قابلة للصرف حالياً",
    fr: "Points indicatifs non échangeables",
  },
  lastSync: { ar: "آخر تحديث", fr: "Dernière synchro" },
  // Phrases COMPLÈTES (jamais un fragment en attente d'une date) : ces chaînes
  // sont affichées seules (en-tête, toasts) ou après une date.
  staleData: {
    ar: "المحل غير متصل : تم عرض نسخة محلية",
    fr: "Magasin hors ligne : copie locale affichée",
  },
  staleDataOn: {
    ar: "لا اتصال بالإنترنت، آخر نسخة محلية بتاريخ",
    fr: "Hors ligne : dernière copie locale du",
  },
  // Phrase complète pour un échec SANS copie locale affichée (connexion,
  // détail sans cache) : on n'affirme pas « copie locale » là où il n'y en a pas.
  offlineError: {
    ar: "لا اتصال بالإنترنت، أعد المحاولة لاحقاً",
    fr: "Hors connexion : réessayez plus tard",
  },
  retry: { ar: "إعادة المحاولة", fr: "Réessayer" },
  invoices: { ar: "فواتيري", fr: "Mes factures" },
  payments: { ar: "دفعاتي", fr: "Mes paiements" },
  invoicePayments: { ar: "دفعات الفاتورة", fr: "Paiements de la facture" },
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
  logoutConfirm: { ar: "تسجيل الخروج؟", fr: "Se déconnecter ?" },
  logoutHint: {
    ar: "ستحتاج إلى رقم الهاتف والرمز للدخول مجدداً.",
    fr: "Vous devrez saisir votre téléphone et votre code pour revenir.",
  },
  cancel: { ar: "إلغاء", fr: "Annuler" },
  changePin: { ar: "تغيير الرمز", fr: "Changer PIN" },
  aboutApp: { ar: "حول التطبيق", fr: "À propos" },
  enter: { ar: "دخول", fr: "Entrer" },
  newPinRequest: {
    ar: "السلام عليكم، أنا زبونكم وأريد رمز تطبيق جديد. شكراً",
    fr: "Bonjour, je suis votre client et je souhaite un nouveau code appli. Merci",
  },
  loginError: { ar: "الهاتف أو الرمز غير صحيح", fr: "Téléphone ou code incorrect" },
  loginHint: {
    ar: "تحقق من الرقم والرمز، أو اطلب رمزاً جديداً من المحل",
    fr: "Vérifiez le numéro et le code, ou demandez un nouveau code au magasin.",
  },
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
  noResults: { ar: "لا نتائج", fr: "Aucun résultat" },
  noResultsHint: {
    ar: "جرّب كلمة أخرى أو أزل الفلتر",
    fr: "Essayez un autre terme ou retirez le filtre.",
  },
  emptyHint: { ar: "اتصل بالمحل عند الحاجة", fr: "Appelez le magasin si besoin." },
  all: { ar: "الكل", fr: "Tout" },
  details: { ar: "عرض التفاصيل", fr: "Voir détails" },
  total: { ar: "الإجمالي", fr: "Total" },
  paidAmount: { ar: "المدفوع", fr: "Payé" },
  remaining: { ar: "الباقي", fr: "Reste" },
  status: { ar: "الحالة", fr: "Statut" },
  monthlySummary: { ar: "ملخص السداد الشهري", fr: "Résumé mensuel" },
  viewReceipt: { ar: "عرض الوصل", fr: "Voir le reçu" },
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
  connected: { ar: "متصل بالإنترنت", fr: "Connecté (internet)" },
  showPin: { ar: "إظهار الرمز", fr: "Afficher le code" },
  hidePin: { ar: "إخفاء الرمز", fr: "Masquer le code" },
  verified: { ar: "موثّق", fr: "Vérifié" },
  financialSituation: { ar: "الوضعية المالية", fr: "Situation" },
  addressLabel: { ar: "العنوان", fr: "Adresse" },
  whatsapp: { ar: "واتساب", fr: "WhatsApp" },
  contactShop: {
    ar: "السلام عليكم، أنا زبونكم. أريد الاستفسار. شكراً",
    fr: "Bonjour, je suis votre client. Je souhaite un renseignement. Merci",
  },
  greeting: { ar: "السلام عليكم", fr: "Bonjour" },
  greetingEvening: { ar: "مساء الخير", fr: "Bonsoir" },
  topProducts: { ar: "أكثر ما اشتريته", fr: "Vos articles phares" },
  invoiceLabel: { ar: "الفاتورة", fr: "Facture" },
  dateLabel: { ar: "التاريخ", fr: "Date" },
  phoneLabel: { ar: "رقم هاتفك المسجل عند التاجر", fr: "Votre téléphone enregistré au magasin" },
  pinLabel: { ar: "رمز العميل السري (PIN)", fr: "Code client (PIN)" },
  help1: { ar: "خذ رمزك من المحل", fr: "Prenez votre code au magasin" },
  help2: { ar: "أدخل الهاتف والرمز", fr: "Saisissez téléphone + code" },
  help3: { ar: "شاهد دينك وفواتيرك", fr: "Voyez dette et factures" },
  secureConnection: { ar: "اتصال مشفّر", fr: "Connexion chiffrée" },
  or: { ar: "أو", fr: "ou" },
  clientSpace: { ar: "فضاء الزبون", fr: "Espace Client" },
  // Écran de connexion V5 : reason pour laquelle « دخول » est encore grisé,
  // et libellé de l'effacement du téléphone mémorisé.
  pinIncomplete: { ar: "أكمل الرمز (6 أرقام)", fr: "Code incomplet (6 chiffres)" },
  changeNumber: { ar: "تغيير الرقم", fr: "Changer le numéro" },
  deleteDigit: { ar: "حذف رقم", fr: "Effacer un chiffre" },
  clientLabel: { ar: "الزبون", fr: "Client" },
  amountLabel: { ar: "المبلغ", fr: "Montant" },
  methodLabel: { ar: "الطريقة", fr: "Méthode" },
  typeLabel: { ar: "النوع", fr: "Type" },
  refLabel: { ar: "المرجع", fr: "Référence" },
  statementTitle: { ar: "كشف حساب", fr: "Relevé" },
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
