# Attic — features removed from the live build (Sept 20 2026, v1244)

Doug's rule: delete from the live version, keep every piece here so it can be reinstalled. The full pre-condense app is also tagged `pre-condense-v1241` in git.

| Feature | Files here | To reinstall |
|---|---|---|
| Direct Mail (SendJim) | `sendjim.js` (module), `socialbranch-sendjim-trainual-tabs.js.txt` (`_renderSendJim`), `settings-sendjim-card.js.txt` | add `src/sendjim.js` back + `scripts/bundle-manifest.json` entry; paste `_renderSendJim` into `src/pages/socialbranch.js`; re-add tab `{ id:'sendjim', label:'Direct Mail', icon:'send' }` + `case 'sendjim'`; restore the Settings card; restore the two hooks: jobs.js `SendJim.afterJobComplete(j)` after a job completes, clients.js `SendJim.afterNewClient(...)` after a client is created |
| Trainual tab | `socialbranch-sendjim-trainual-tabs.js.txt` (`_renderTrainual`) | paste the function; re-add tab `{ id:'trainual', label:'Trainual', icon:'graduation-cap' }` + `case 'trainual'` |
| Competitors tracking | `socialbranch-competitors.js.txt` | paste the block into SocialBranch; re-add tab `{ id:'competitors', ... }` + `case 'competitors'` |
| SocialPilot import (HTML scrape) | `socialbranch-socialpilot-import.js.txt`, `socialbranch-socialpilot-autoimport.js.txt`, `socialbranch-socialpilot-toolscard.js.txt`, `settings-socialpilot-card.js.txt`, `settings-testsocialpilot.js.txt`, `marketing-socialpilot-card.js.txt`, `marketing-socialpilot-connect.js.txt`, `mediacenter-export-socialpilot.js.txt` | not recommended (the import LOOPED, see v1233); the Make webhook setting `bm-socialpilot-webhook` is still live in Settings as "Social posting webhook (Make)" |
| AI Receptionist (Twilio) page | `receptionist.js`, `tenantsetup-ai-receptionist-item.js.txt` | add `src/pages/receptionist.js` back + manifest entry; `index.html` pageConfigs `receptionist: { title: 'Receptionist', action: null }` and pageRenderers `receptionist: function() { return Receptionist.render(); }`; `auth.js` visible pages `'receptionist'`; Settings Templates row; the setup-checklist item |
| Cloud health dot | `supa-health.js` | never wired (no caller); add back + manifest entry + call `SupaHealth.init()` on load |
| Website → "Other Pages" tab | (one line) | `{ id:'pages', label:'Other Pages', disabled:true }` in `marketingsite.js` `_tabStrip` |
