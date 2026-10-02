// DEMO ONLY — Serveur local de démonstration `client-sync` (données fictives).
// Reproduit le contrat exact de cloud/supabase/functions/client-sync/index.ts
// pour prévisualiser l'APK sans Supabase. JAMAIS de vraies données ici.
// Usage : node scripts/demo-client-sync-server.mjs (écoute 127.0.0.1:8099)
// Démo : téléphone 0550123456 + PIN 123456.
import http from "node:http";

const PORT = 8099;
const DEMO_PHONE = "0550123456";
const DEMO_PIN = "123456";

// PII : aucun numéro complet au log — on ne garde que les 2 derniers chiffres
// (ex. `***93`). Le PIN n'est jamais loggé (ni masqué ni en clair).
const maskPhone = (p) => (p.length < 3 ? "**" : `***${p.slice(-2)}`);

const now = new Date();
const day = (offset) => {
  const d = new Date(now.getTime() - offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const snapshot = {
  customer: {
    first_name: "محمد",
    last_name: "حمداوي",
    outstanding_balance_minor: 4525000,
    debt_status: "overdue",
    is_over_limit: 0,
    credit_limit_minor: 6000000,
  },
  monthPurchasesMinor: 1840000,
  monthPaymentsMinor: 1200000,
  loyaltyPoints: 320,
  lastSales: [
    {
      id: 142,
      invoice_number: "FAC-2026-0142",
      total_minor: 845000,
      remaining_balance_minor: 325000,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: `${day(4)}T19:14:00.000Z`,
    },
    {
      id: 139,
      invoice_number: "FAC-2026-0139",
      total_minor: 1420000,
      remaining_balance_minor: 500000,
      payment_status: "partial",
      is_cancelled: 0,
      created_at: `${day(9)}T11:02:00.000Z`,
    },
    {
      id: 131,
      invoice_number: "FAC-2026-0131",
      total_minor: 960000,
      remaining_balance_minor: 0,
      payment_status: "paid",
      is_cancelled: 0,
      created_at: `${day(15)}T17:40:00.000Z`,
    },
  ],
  lastPayments: [
    {
      id: 91,
      amount_minor: 1000000,
      method: "cash",
      reference: "PAY-9921",
      sale_id: 139,
      payment_date: day(3),
    },
    {
      id: 87,
      amount_minor: 500000,
      method: "transfer",
      reference: "REF-BM-8839201",
      sale_id: null,
      payment_date: day(8),
    },
    {
      id: 82,
      amount_minor: 960000,
      method: "cash",
      reference: "PAY-9810",
      sale_id: 131,
      payment_date: day(15),
    },
  ],
  topProducts: [
    { name: "زيت إيليو 5L", quantity: 4, lastPriceMinor: 95000 },
    { name: "قهوة فاميكو 250g", quantity: 10, lastPriceMinor: 32000 },
    { name: "حليب كانديا 1L", quantity: 24, lastPriceMinor: 14000 },
  ],
  announcement: "تخفيضات نهاية الأسبوع على المواد الغذائية - 15%",
  shop: { name: "سوبرماركت البركة", phone: "0550123456", address: "حي النور، الجزائر العاصمة" },
};

const invoices = {
  sales: [
    ...snapshot.lastSales,
    {
      id: 120,
      invoice_number: "FAC-2026-0120",
      total_minor: 2300000,
      remaining_balance_minor: 0,
      payment_status: "paid",
      is_cancelled: 0,
      created_at: `${day(22)}T10:20:00.000Z`,
    },
    {
      id: 115,
      invoice_number: "FAC-2026-0115",
      total_minor: 410000,
      remaining_balance_minor: 410000,
      payment_status: "unpaid",
      is_cancelled: 1,
      created_at: `${day(28)}T09:05:00.000Z`,
    },
  ],
};

const payments = {
  payments: [
    ...snapshot.lastPayments,
    {
      id: 70,
      amount_minor: 2300000,
      method: "cheque",
      reference: "CHQ-4412",
      sale_id: 120,
      payment_date: day(21),
    },
  ],
};

// Lignes de démonstration par facture (miroir du cliché `invoice_detail` POS).
const detailItems = {
  142: [
    {
      product_name_snapshot: "زيت إيليو 5L",
      quantity: 2,
      unit_price_minor: 95000,
      line_total_minor: 190000,
    },
    {
      product_name_snapshot: "حليب كانديا 1L",
      quantity: 24,
      unit_price_minor: 14000,
      line_total_minor: 336000,
    },
    {
      product_name_snapshot: "قهوة فاميكو 250g",
      quantity: 10,
      unit_price_minor: 32000,
      line_total_minor: 320000,
    },
  ],
  139: [
    {
      product_name_snapshot: "سكر 1kg",
      quantity: 50,
      unit_price_minor: 9000,
      line_total_minor: 450000,
    },
    {
      product_name_snapshot: "فرينة 1kg",
      quantity: 40,
      unit_price_minor: 8000,
      line_total_minor: 320000,
    },
    {
      product_name_snapshot: "طماطم مصبرة",
      quantity: 30,
      unit_price_minor: 15000,
      line_total_minor: 450000,
    },
    {
      product_name_snapshot: "مقرونة",
      quantity: 20,
      unit_price_minor: 10000,
      line_total_minor: 200000,
    },
  ],
  131: [
    {
      product_name_snapshot: "ماء معدني 1.5L ×6",
      quantity: 16,
      unit_price_minor: 60000,
      line_total_minor: 960000,
    },
  ],
  120: [
    {
      product_name_snapshot: "زيت إيليو 5L",
      quantity: 10,
      unit_price_minor: 95000,
      line_total_minor: 950000,
    },
    {
      product_name_snapshot: "سكر 1kg",
      quantity: 150,
      unit_price_minor: 9000,
      line_total_minor: 1350000,
    },
  ],
};

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "apikey, Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "apikey, Content-Type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    send(res, 200, { ok: true, service: "demo-client-sync", demo: `${DEMO_PHONE} / ${DEMO_PIN}` });
    return;
  }
  if (req.method !== "POST" || req.url !== "/functions/v1/client-sync") {
    send(res, 404, { ok: false, code: "METHOD_ERROR", message: "Introuvable." });
    return;
  }
  let raw = "";
  req.on("data", (c) => {
    raw += c;
  });
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Requête illisible." });
      return;
    }
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    // Log démo (téléphone MASQUÉ, jamais le PIN) pour diagnostiquer les 401.
    const stamp = new Date().toISOString();
    if (phone.length < 1 || phone.length > 30 || !/^[0-9]{6}$/.test(pin)) {
      console.log(`[${stamp}] 401 VALIDATION phone=${maskPhone(phone)} pinLen=${pin.length}`);
      send(res, 401, { ok: false, code: "AUTH_ERROR", message: "Téléphone ou code incorrect." });
      return;
    }
    if (phone !== DEMO_PHONE || pin !== DEMO_PIN) {
      console.log(`[${stamp}] 401 NO_MATCH phone=${maskPhone(phone)}`);
      send(res, 401, { ok: false, code: "AUTH_ERROR", message: "Téléphone ou code incorrect." });
      return;
    }
    // Détail à la demande (page facture APK, miroir de la fonction Edge).
    // Même contrat que l'Edge : `saleId` fourni mais invalide = VALIDATION_ERROR.
    const rawSaleId = body.saleId;
    let saleId = null;
    if (rawSaleId !== undefined && rawSaleId !== null) {
      if (typeof rawSaleId !== "number" || !Number.isInteger(rawSaleId) || rawSaleId <= 0) {
        send(res, 400, {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Identifiant de facture invalide.",
        });
        return;
      }
      saleId = rawSaleId;
    }
    if (saleId != null) {
      const sale = invoices.sales.find((s) => s.id === saleId);
      const items = detailItems[saleId];
      if (!sale || !items) {
        console.log(`[${stamp}] 404 NOT_FOUND saleId=${JSON.stringify(saleId)}`);
        send(res, 404, { ok: false, code: "NOT_FOUND", message: "Facture indisponible." });
        return;
      }
      console.log(`[${stamp}] 200 DETAIL saleId=${saleId}`);
      send(res, 200, {
        ok: true,
        data: {
          detail: {
            sale: { ...sale, amount_paid_minor: sale.total_minor - sale.remaining_balance_minor },
            items,
          },
          syncedAt: new Date().toISOString(),
        },
      });
      return;
    }
    console.log(`[${stamp}] 200 OK phone=${maskPhone(phone)}`);
    send(res, 200, {
      ok: true,
      data: { snapshot, invoices, payments, syncedAt: new Date().toISOString() },
    });
  });
});

// 127.0.0.1 explicite : sans hôte, `listen` écoute TOUTES les interfaces alors
// que l'en-tête et l'usage annoncent 127.0.0.1 — les identifiants de démo
// partiraient sur le LAN.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`demo-client-sync on http://127.0.0.1:${PORT} (demo ${DEMO_PHONE} / ${DEMO_PIN})`);
  // QR de test (ADR-054) : générez-en une image pour tester le scan APK.
  console.log(`demo-qr-payload VELORIA1|${DEMO_PHONE}|${DEMO_PIN}|DEMOACTIVATIONCODE01`);
});
