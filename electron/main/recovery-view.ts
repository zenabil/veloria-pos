// Veloria PoS — Electron main: page de récupération (base non prête).
// HTML statique français, sans trace technique : seul `userMessage` (rédigé à
// l'avance, jamais d'exception brute) est affiché. Les boutons utilisent les
// canaux IPC explicites existants (backup/system/database/app) + recovery.*.
// Module pur (aucun import Electron) : testable sans lancer l'application.

export interface RecoveryViewInput {
  /** Message FR issu de startup-flow (jamais de stack, jamais de SQL). */
  userMessage: string;
  appVersion: string;
  /** Dossier de la base (information locale utile, pas un secret). */
  dbFolder: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildRecoveryHtml(input: RecoveryViewInput): string {
  const message = esc(input.userMessage);
  const version = esc(input.appVersion);
  const folder = esc(input.dbFolder);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Veloria PoS — Récupération</title>
<style>
body{font-family:sans-serif;background:#0b0f14;color:#eee;margin:0;padding:32px}
.card{max-width:620px;margin:0 auto;background:#111a2e;border:1px solid #ffffff17;border-radius:16px;padding:28px}
h1{font-size:20px;margin:0 0 8px}
p{font-size:14px;line-height:1.55;color:#cbd5e1}
.meta{font-size:12px;color:#64748b;margin:12px 0 20px;word-break:break-all}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
button{flex:1 1 160px;border-radius:12px;border:1px solid #ffffff26;background:#ffffff0f;color:#fff;font-weight:700;font-size:14px;padding:12px;cursor:pointer}
button:hover{background:#ffffff1a}
button.primary{background:#f59e0b;border-color:#f59e0b;color:#111}
button.primary:hover{background:#fbbf24}
button:disabled{opacity:.5;cursor:wait}
#status{min-height:20px;font-size:13px;margin-top:14px;color:#fcd34d}
#backups{width:100%;margin-top:8px;background:#0b0f14;color:#eee;border:1px solid #ffffff26;border-radius:12px;padding:10px;font-size:13px}
label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}
</style>
</head>
<body>
<div class="card">
<h1>Veloria PoS — Base de données indisponible</h1>
<p>${message}</p>
<div class="meta">Veloria PoS ${version} · Dossier de la base : ${folder}</div>
<div class="row">
<button id="btn-retry" class="primary" type="button">Réessayer</button>
<button id="btn-quit" type="button">Quitter</button>
</div>
<div class="row">
<button id="btn-folder" type="button">Ouvrir le dossier</button>
<button id="btn-relocate" type="button">Changer l'emplacement…</button>
</div>
<div style="margin-top:20px">
<label for="backups">Restaurer une sauvegarde</label>
<select id="backups" aria-label="Choisir une sauvegarde"></select>
<div class="row">
<button id="btn-restore" type="button">Restaurer la sauvegarde choisie</button>
</div>
</div>
<p id="status" role="status" aria-live="polite"></p>
</div>
<script>
(function(){
var status=document.getElementById("status");
function say(t){status.textContent=t;}
function fail(r){say((r&&r.message)||"Opération impossible. Réessayez.");}
function api(){return window.veloria;}
async function refreshBackups(){
  try{
    var r=await api().backup.list();
    var sel=document.getElementById("backups");
    sel.innerHTML="";
    if(!r.ok||!r.data||r.data.length===0){
      var o=document.createElement("option");o.value="";o.textContent="Aucune sauvegarde disponible";sel.appendChild(o);return;
    }
    r.data.forEach(function(b){
      var o=document.createElement("option");o.value=b.file;
      var d=(b.createdAt||"").slice(0,16).replace("T"," ");
      o.textContent=(b.file.split(/[/\\\\]/).pop()||b.file)+" · "+d;sel.appendChild(o);
    });
  }catch(e){fail(null);}
}
document.getElementById("btn-retry").addEventListener("click",async function(){
  var b=this;b.disabled=true;say("Nouvelle tentative…");
  try{
    var r=await api().recovery.retry();
    if(r.ok){say("Base prête : ouverture de l'application…");}
    else{fail(r);b.disabled=false;}
  }catch(e){fail(null);b.disabled=false;}
});
document.getElementById("btn-quit").addEventListener("click",function(){try{api().recovery.exit();}catch(e){window.close();}});
document.getElementById("btn-folder").addEventListener("click",async function(){
  try{var r=await api().system.openDataFolder();if(!r.ok)fail(r);}catch(e){fail(null);}
});
document.getElementById("btn-relocate").addEventListener("click",async function(){
  say("Choisissez un dossier…");
  try{
    var p=await api().system.selectFolder();
    if(!p.ok){fail(p);return;}
    var folder=p.data&&p.data.folder;
    if(!folder){say("Sélection annulée.");return;}
    say("Déplacement et vérification…");
    var m=await api().database.relocate({folder:folder});
    if(!m.ok){fail(m);return;}
    say("Base déplacée : redémarrage…");
    await api().app.restart();
  }catch(e){fail(null);}
});
document.getElementById("btn-restore").addEventListener("click",async function(){
  var sel=document.getElementById("backups");
  if(!sel.value){say("Choisissez d'abord une sauvegarde.");return;}
  var b=this;b.disabled=true;say("Restauration et vérification…");
  try{
    var r=await api().backup.restore({file:sel.value});
    if(!r.ok){fail(r);b.disabled=false;return;}
    say("Base restaurée : redémarrage…");
    await api().app.restart();
  }catch(e){fail(null);b.disabled=false;}
});
refreshBackups();
})();
</script>
</body>
</html>`;
}
