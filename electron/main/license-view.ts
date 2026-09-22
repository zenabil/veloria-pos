// Veloria PoS — Electron main: page d'activation hors-ligne (statique, FR).
// Aucune donnée métier, aucun secret : identifiant matériel d'affichage +
// import .vlic via le bridge window.veloria (vérification 100 % côté main).

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildLicenseHtml(args: { appVersion: string; reason: string }): string {
  const { appVersion, reason } = args;
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" />
<style>
body{font-family:Segoe UI,system-ui,sans-serif;background:#0b0f14;color:#e2e8f0;margin:0;padding:28px}
.card{max-width:560px;margin:0 auto;background:#111827;border:1px solid #263043;border-radius:14px;padding:26px}
h1{font-size:19px;margin:0 0 4px}.sub{color:#94a3b8;font-size:13px;margin:0 0 16px}
.hwid{font-family:Consolas,monospace;font-size:20px;letter-spacing:2px;background:#0b0f14;border:1px solid #334155;border-radius:8px;padding:10px 14px;text-align:center;margin:8px 0 4px}
.hint{color:#64748b;font-size:12px;margin:0 0 14px}
.row{display:flex;gap:8px;margin-top:10px}
button{flex:1;background:#f59e0b;color:#111827;border:0;border-radius:8px;padding:10px;font-weight:700;cursor:pointer}
button.ghost{background:#1f2937;color:#e2e8f0}
#status{min-height:20px;font-size:13px;margin-top:12px;color:#fbbf24}
.reason{background:#1c1113;border:1px solid #7f1d1d;color:#fecaca;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px}
.foot{color:#475569;font-size:11px;margin-top:14px;text-align:center}
</style></head>
<body><div class="card">
<h1>Activation de Veloria POS</h1>
<p class="sub">Version ${esc(appVersion)} · Licence hors-ligne liée à cet ordinateur.</p>
<div class="reason">${esc(reason)}</div>
<div>Identifiant matériel</div>
<div class="hwid" id="hwid">…</div>
<div class="row" style="margin-top:0">
<button id="btn-copy" class="ghost">Copier l'identifiant complet</button>
</div>
<p class="hint">Transmettez cet identifiant au fournisseur pour recevoir votre fichier de licence (.vlic).</p>
<div class="row">
<button id="btn-import">Importer la licence</button>
<button id="btn-check" class="ghost">Revérifier</button>
<button id="btn-quit" class="ghost">Quitter</button>
</div>
<p id="status" role="status"></p>
<p class="foot">Vos données (ventes, stock, clients) sont conservées et ne sont jamais supprimées.</p>
</div>
<script>
const $=(id)=>document.getElementById(id);
const set=(t)=>{$("status").textContent=t;};
let fullFp="";
async function copyFp(){
  const t=fullFp||$("hwid").textContent||"";
  try{await navigator.clipboard.writeText(t);set("Identifiant copié.");return;}
  catch(e){
    try{
      const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);
      ta.select();const ok=document.execCommand("copy");document.body.removeChild(ta);
      set(ok?"Identifiant copié.":"Copie impossible : sélectionnez le texte.");
    }catch(e2){set("Copie impossible : sélectionnez le texte.");}
  }
}
$("btn-copy").onclick=()=>{copyFp();};
async function refresh(){
  try{
    const r=await window.veloria.license.hardwareId();
    if(r&&r.ok){$("hwid").textContent=r.data.hardwareId||"—";fullFp=r.data.fingerprint||"";}
  }catch(e){/* affiché à l'import */}
  try{
    const r=await window.veloria.license.status();
    if(r&&r.ok&&r.data){
      const s=r.data;
      if(s.state==="ACTIVE"||s.state==="EXPIRING_SOON"){set("Licence valide. Ouverture de l'application…");}
    }
  }catch(e){/* silencieux */}
}
$("btn-import").onclick=async()=>{
  set("Sélection du fichier de licence…");
  try{
    const r=await window.veloria.license.importLicense();
    if(r&&r.ok){
      if(r.data&&r.data.imported){set("Licence importée et vérifiée. Ouverture de l'application…");setTimeout(refresh,1200);}
      else{set("Aucun fichier sélectionné.");}
    }else{set((r&&r.message)||"Licence invalide.");}
  }catch(e){set(e&&e.message||"Activation impossible.");}
};
$("btn-check").onclick=async()=>{
  set("Vérification…");
  try{
    const r=await window.veloria.license.validate();
    if(r&&r.ok){
      const s=r.data||{};
      set(s.state==="ACTIVE"||s.state==="EXPIRING_SOON"?"Licence valide.":"Statut : "+(s.state||"inconnu"));
      if(s.state==="ACTIVE"||s.state==="EXPIRING_SOON"){setTimeout(refresh,1200);}
    }else{set((r&&r.message)||"Vérification impossible.");}
  }catch(e){set(e&&e.message||"Vérification impossible.");}
};
$("btn-quit").onclick=async()=>{try{await window.veloria.recovery.exit();}catch(e){}};
refresh();
</script>
</body></html>`;
}
