
// [2026.10.13.2245] OverEngineered Setup
/*
 * OverEngineered Solar
 * Required Notice: Copyright (c) 2026 OverEngineered-Tech
 * Licensed under the PolyForm Noncommercial License 1.0.0
 * Source: https://github.com/OverEngineered-Tech/OverEngineered-Solar
 * Support: https://buymeacoffee.com/overengineeredtech
 */
// Setup for the OverEngineered Solar widget (Scriptable, iOS), for use with Enphase solar systems.
// Run it from the Scriptable app. It saves overengineered-solar-config.json and
// overengineered-solar-token.json, which the widget reads.
// Not affiliated with or endorsed by Enphase Energy, Inc.

const SETUP_VERSION = "2026.10.13.2245";

const FM = FileManager.local();
const DIR = FM.documentsDirectory();
const CONFIG_PATH = FM.joinPath(DIR, "overengineered-solar-config.json");
const TOKEN_PATH = FM.joinPath(DIR, "overengineered-solar-token.json");
const CONFIG_SCHEMA_VERSION = 1;

// Enphase's addresses. The redirect address is Enphase's own page, which shows the code after Authorize,
// so no web server is needed to receive it.
const PORTAL_URL = "https://developer-v4.enphase.com/admin/applications";
const REDIRECT_URI = "https://api.enphaseenergy.com/oauth/redirect_uri";
const AUTHORIZE_URL = "https://api.enphaseenergy.com/oauth/authorize";
const TOKEN_URL = "https://api.enphaseenergy.com/oauth/token";
const SYSTEMS_URL = "https://api.enphaseenergy.com/api/v4/systems";

// A guess, stored only when the refresh token's own expiry cannot be read.
const REFRESH_TOKEN_FALLBACK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// A stop, so the connect page can never loop forever.
const MAX_CONNECT_ROUNDS = 25;

// Starting values for a first run.
const DEFAULTS = {
  panelTiltDeg: 30,
  trueUpMonth: 3,
  title: "OverEngineered Solar",
  estimatedDailyKwh: 30,
};

// The two pages this script shows. They are ordinary web pages kept as text, and the script loads them
// into a WebView. One page is easier to read, and to get right, than a chain of popups.
const CONNECT_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1\">\n<title>Connect to Enphase</title>\n<style>\n  :root { --bg:#000; --card:#1c1c1e; --line:#38383a; --text:#fff; --dim:#98989f; --green:#4cae66; --orange:#e8935a; --field:#2c2c2e; }\n  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\n  html, body { margin:0; background:var(--bg); color:var(--text); font:16px/1.4 -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", sans-serif; }\n  body { padding:12px 16px 48px; max-width:560px; margin:0 auto; }\n  h1 { font-size:26px; margin:8px 4px 2px; }\n  .sub { color:var(--dim); font-size:14px; margin:0 4px 14px; }\n  .dummy, .msg { background:#3a2a12; color:#f3c58a; border-radius:10px; padding:9px 12px; font-size:14px; margin-bottom:8px; }\n  h2 { font-size:18px; font-weight:700; margin:26px 2px 9px; padding-left:10px; border-left:4px solid #5a5a60; line-height:1.15; }\n  h2 span { display:block; font-size:13px; font-weight:400; color:var(--dim); margin-top:3px; }\n  h2.done { border-left-color:var(--green); }\n  h2.done span { color:var(--green); }\n  .card { background:var(--card); border-radius:12px; padding:13px 16px; margin-bottom:10px; }\n  ol { margin:0; padding-left:22px; }\n  li { margin:5px 0; }\n  li.must { background:#3a2a12; color:#f3c58a; border-radius:8px; padding:8px 10px; margin:8px 0 8px -6px; }\n  li.must b { color:#fff; }\n  .found { display:flex; justify-content:space-between; padding:7px 0; border-top:1px solid var(--line); font-size:15px; }\n  .found:first-child { border-top:0; }\n  .found span:last-child { color:var(--green); font-family:ui-monospace, Menlo, monospace; }\n  .note { color:var(--dim); font-size:13px; margin:8px 4px 12px; }\n  a.btn, button.btn { display:block; width:100%; background:var(--green); color:#fff; border:0; border-radius:12px; padding:14px; font:600 17px -apple-system, sans-serif; text-align:center; text-decoration:none; }\n  a.btn.off { background:#2c2c2e; color:#6b6b70; pointer-events:none; }\n  button.plain { display:block; width:100%; background:var(--field); color:var(--text); border:0; border-radius:10px; padding:11px; font:inherit; margin-top:10px; }\n  details { margin-top:12px; }\n  summary { color:var(--dim); font-size:15px; list-style:none; text-align:center; padding:6px; }\n  summary::-webkit-details-marker { display:none; }\n  label.f { display:block; font-size:14px; color:var(--dim); margin:10px 0 4px; }\n  input[type=text] { width:100%; background:var(--field); color:var(--text); border:1px solid transparent; border-radius:8px; padding:9px 10px; font:14px ui-monospace, Menlo, monospace; -webkit-appearance:none; }\n  input:focus { outline:none; border-color:var(--green); }\n  .tell { text-align:center; color:var(--green); font-size:14px; margin-top:10px; min-height:20px; }\n  .hidden { display:none !important; }\n</style>\n</head>\n<body>\n  <h1>Connect to Enphase</h1>\n  <p class=\"sub\">Two steps, done once.</p>\n    <div class=\"msg hidden\" id=\"topMsg\"></div>\n\n  <h2 id=\"h1step\">1. Get your keys<span id=\"keysTag\">On Enphase's developer site</span></h2>\n\n  <div id=\"keysTodo\">\n    <div class=\"card\">\n      <ol>\n        <li>Tap the button below. If a cookie box appears, tap <b>Accept All Cookies</b>.</li>\n        <li>New to this? Tap <b>Sign Up</b>, the small link under the Sign In button. <b>Organization</b> and <b>Username</b> can be anything.</li>\n        <li>Enphase emails an activation link (from api@enphaseenergy.com). Tap it, then come back here and sign in.</li>\n        <li>Tap <b>Applications</b> in the menu at the top, not the big Quick Start button. Then tap <b>Create new application</b>.</li>\n        <li><b>Plan:</b> leave it on <b>Watt</b> (free). <b>Name</b>, <b>Description</b>, <b>Developed By:</b> anything you like, such as \"Solar Widget\".</li>\n        <li class=\"must\"><b>Access Control: check every box.</b> They all start unchecked, and the widget can't read your data without them.</li>\n        <li>Tap <b>Create Application</b>. Wait a moment until the page shows the API Key, Client ID and Client Secret.</li>\n      </ol>\n    </div>\n    <p class=\"note\">With those three keys on screen, tap <b>Close</b> at the top left. Here Close means \"done\", not \"cancel\". Setup reads the keys for you. Tap Close any time to come back to these steps.</p>\n    <a class=\"btn\" id=\"portalBtn\" href=\"#\">Open Enphase Developer Site</a>\n  </div>\n\n  <div id=\"keysDone\" class=\"hidden\">\n    <div class=\"card\">\n      <div class=\"found\"><span>API Key</span><span id=\"tailApi\"></span></div>\n      <div class=\"found\"><span>Client ID</span><span id=\"tailId\"></span></div>\n      <div class=\"found\"><span>Client Secret</span><span id=\"tailSecret\"></span></div>\n    </div>\n  </div>\n\n  <details id=\"typeBox\">\n    <summary id=\"typeSummary\">Type the keys in myself</summary>\n    <div class=\"card\">\n      <label class=\"f\" for=\"apiKey\">API Key</label><input type=\"text\" id=\"apiKey\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\">\n      <label class=\"f\" for=\"clientId\">Client ID</label><input type=\"text\" id=\"clientId\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\">\n      <label class=\"f\" for=\"clientSecret\">Client Secret</label><input type=\"text\" id=\"clientSecret\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\">\n      <button class=\"plain\" id=\"useKeysBtn\" type=\"button\">Use these keys</button>\n    </div>\n  </details>\n\n  <h2 id=\"h2step\">2. Approve access<span>Let the widget read your solar data</span></h2>\n  <div class=\"card\">\n    <ol>\n      <li>Log in with your <b>Enlighten</b> account, the one you use in the Enphase app. This is not the developer account.</li>\n      <li>Tap <b>Authorize</b>.</li>\n      <li>Tap <b>Close</b> at the top left.</li>\n    </ol>\n  </div>\n  <p class=\"note\">The widget can only read your data. It can't change your system.</p>\n  <a class=\"btn off\" id=\"authBtn\" href=\"#\">Continue to Enphase login</a>\n\n  <details id=\"codeBox\">\n    <summary>Login done but nothing happened? Paste the code</summary>\n    <div class=\"card\">\n      <label class=\"f\" for=\"pasteCode\">Authorization code</label><input type=\"text\" id=\"pasteCode\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\">\n      <button class=\"plain\" id=\"useCodeBtn\" type=\"button\">Use this code</button>\n    </div>\n  </details>\n\n  <div class=\"tell\" id=\"tell\"></div>\n\n<script>\n  window.__setupPage = \"connect\";\n  window.__submit = null;\n  function $(id) { return document.getElementById(id); }\n  function tail(v) { v = String(v || \"\"); return v.length > 4 ? \"\u2026\" + v.slice(-4) : v; }\n  // Called by the script (or by the preview below) with { keys, portalUrl, authUrl, message, openKeys }.\n  function fillConnect(v) {\n    var k = v.keys || {};\n    var have = !!(k.apiKey && k.clientId && k.clientSecret);\n    $(\"apiKey\").value = k.apiKey || \"\"; $(\"clientId\").value = k.clientId || \"\"; $(\"clientSecret\").value = k.clientSecret || \"\";\n    $(\"portalBtn\").href = v.portalUrl || \"#\";\n    $(\"keysTodo\").classList.toggle(\"hidden\", have);\n    $(\"keysDone\").classList.toggle(\"hidden\", !have);\n    $(\"h1step\").classList.toggle(\"done\", have);\n    $(\"keysTag\").textContent = have ? \"Keys found\" : \"On Enphase's developer site\";\n    $(\"typeSummary\").textContent = have ? \"Change the keys\" : \"Type the keys in myself\";\n    $(\"typeBox\").open = !!v.openKeys;\n    if (have) { $(\"tailApi\").textContent = tail(k.apiKey); $(\"tailId\").textContent = tail(k.clientId); $(\"tailSecret\").textContent = tail(k.clientSecret); }\n    $(\"authBtn\").classList.toggle(\"off\", !have || !v.authUrl);\n    $(\"authBtn\").href = have && v.authUrl ? v.authUrl : \"#\";\n    if (v.message) { $(\"topMsg\").textContent = v.message; $(\"topMsg\").classList.remove(\"hidden\"); }\n  }\n  $(\"useKeysBtn\").addEventListener(\"click\", function () {\n    var k = { apiKey: $(\"apiKey\").value.trim(), clientId: $(\"clientId\").value.trim(), clientSecret: $(\"clientSecret\").value.trim() };\n    if (!k.apiKey || !k.clientId || !k.clientSecret) { $(\"tell\").textContent = \"Fill in all three keys first.\"; return; }\n    window.__submit = { keys: k };\n    $(\"tell\").textContent = \"Got them. Tap Close at the top left to continue.\";\n  });\n  $(\"useCodeBtn\").addEventListener(\"click\", function () {\n    var c = $(\"pasteCode\").value.trim();\n    if (!c) { $(\"tell\").textContent = \"Paste the code first.\"; return; }\n    window.__submit = { code: c };\n    $(\"tell\").textContent = \"Got it. Tap Close at the top left to continue.\";\n  });\n</script>\n</body>\n</html>\n";
const FORM_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1\">\n<title>Solar Widget Setup</title>\n<style>\n  :root {\n    --bg: #000; --card: #1c1c1e; --line: #38383a; --text: #fff; --dim: #98989f;\n    --green: #4cae66; --orange: #e8935a; --field: #2c2c2e;\n  }\n  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\n  html, body { margin: 0; background: var(--bg); color: var(--text);\n    font: 16px/1.35 -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", sans-serif; }\n  body { padding: 12px 16px 120px; max-width: 560px; margin: 0 auto; }\n  h1 { font-size: 26px; margin: 8px 4px 2px; }\n  .sub { color: var(--dim); font-size: 14px; margin: 0 4px 18px; }\n  .dummy { background: #3a2a12; color: #f3c58a; border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 18px; }\n  h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 30px 2px 9px; padding-left: 10px; border-left: 4px solid #5a5a60; line-height: 1.15; }\n  .card { background: var(--card); border-radius: 12px; overflow: hidden; }\n  .row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-top: 1px solid var(--line); min-height: 44px; }\n  .row:first-child { border-top: 0; }\n  .row label { flex: 0 0 44%; font-size: 16px; }\n  .row.wide label { flex: 1 1 auto; }\n  .row .hint { display: block; color: var(--dim); font-size: 12px; margin-top: 2px; }\n  .row input[type=text], .row input[type=number], .row input[type=date], .row select {\n    flex: 1 1 auto; min-width: 0; width: 100%; background: var(--field); color: var(--text);\n    border: 1px solid transparent; border-radius: 8px; padding: 8px 10px; font: inherit; text-align: right;\n    -webkit-appearance: none; appearance: none; color-scheme: dark; }\n  .row input:focus, .row select:focus { outline: none; border-color: var(--green); }\n  .stack { flex-direction: column; align-items: stretch; gap: 6px; }\n  .stack label { flex: none; }\n  .stack input { text-align: left !important; font-family: ui-monospace, Menlo, monospace; font-size: 14px !important; }\n  .switch { margin-left: auto; position: relative; width: 51px; height: 31px; flex: none; }\n  .switch input { opacity: 0; width: 100%; height: 100%; margin: 0; position: absolute; z-index: 2; }\n  .switch span { position: absolute; inset: 0; background: #39393d; border-radius: 31px; transition: background .15s; }\n  .switch span::after { content: \"\"; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; transition: transform .15s; }\n  .switch input:checked + span { background: var(--green); }\n  .switch input:checked + span::after { transform: translateX(20px); }\n  .status { margin-left: auto; color: var(--dim); font-size: 15px; text-align: right; }\n  .status.ok { color: var(--green); }\n  button.inline { margin-left: auto; background: var(--field); color: var(--text); border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; }\n  input[type=date]::-webkit-date-and-time-value { text-align: right; }\n  .hidden { display: none !important; }\n  .pair { gap: 10px; }\n  .pair .half { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 8px; }\n  .pair .half label { flex: 1 1 auto; }\n  .pair .half input { flex: 0 0 74px; width: 74px; }\n  .row.narrow label { flex: 0 0 20%; }\n  .row.narrow input { text-align: left; }\n  #keysBox .row { border-top: 1px solid var(--line); }\n  h2.hl { border-left-color: var(--green); }\n  h2 span { display: block; font-size: 13px; font-weight: 400; color: var(--dim); margin-top: 3px; }\n  .card.hl { box-shadow: 0 0 0 1.5px var(--green); }\n  button.inline { margin-left: 10px; flex: none; font-size: 14px; padding: 7px 11px; }\n  .status { flex: none; }\n  .bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom));\n    background: linear-gradient(to top, #000 70%, transparent); }\n  .bar .inner { max-width: 560px; margin: 0 auto; }\n  button.save { width: 100%; background: var(--green); color: #fff; border: 0; border-radius: 12px; padding: 14px; font: 600 17px -apple-system, sans-serif; }\n  .saved { text-align: center; color: var(--green); font-size: 15px; font-weight: 600; margin-bottom: 8px; min-height: 19px; } button.save { transition: transform .08s, opacity .08s, background .15s; } button.save:active { transform: scale(0.96); opacity: 0.75; } button.save.done { background: #2f7d46; }\n  .note { color: var(--dim); font-size: 12px; margin: 7px 16px 0; }\n  .msg { background: #3a2a12; color: #f3c58a; border-radius: 10px; padding: 9px 12px; font-size: 14px; margin-bottom: 6px; }\n  .err { color: var(--orange); font-size: 14px; margin-bottom: 8px; white-space: pre-line; text-align: left; }\n  .status.warn { color: var(--orange); }\n</style>\n</head>\n<body>\n  <h1>Solar Widget Setup</h1>\n  <p class=\"sub\">Change what you need, then Save.</p>\n    <div class=\"msg hidden\" id=\"topMsg\"></div>\n\n  <h2>Enphase account</h2>\n  <div class=\"card\">\n    <div class=\"row wide\"><label>Keys</label><span class=\"status\" id=\"keysStatus\">Not entered</span><button class=\"inline\" id=\"keysBtn\" type=\"button\">Edit</button></div>\n    <div id=\"keysBox\" class=\"hidden\">\n      <div class=\"row stack\"><label for=\"apiKey\">API Key</label><input type=\"text\" id=\"apiKey\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\"></div>\n      <div class=\"row stack\"><label for=\"clientId\">Client ID</label><input type=\"text\" id=\"clientId\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\"></div>\n      <div class=\"row stack\"><label for=\"clientSecret\">Client Secret</label><input type=\"text\" id=\"clientSecret\" autocapitalize=\"off\" autocorrect=\"off\" spellcheck=\"false\"></div>\n    </div>\n    <div class=\"row wide\"><label>Login</label><span class=\"status\" id=\"loginStatus\">Not connected</span><button class=\"inline\" id=\"loginBtn\" type=\"button\">Log in again</button></div>\n    <div class=\"row\"><label for=\"systemId\">System ID</label><input type=\"text\" id=\"systemId\" inputmode=\"numeric\"></div>\n  </div>\n  <p class=\"note\">Tap \"Log in again\" only if the widget says Reauth Needed.</p>\n  \n  <h2>Your system</h2>\n  <div class=\"card\">\n    <div class=\"row\"><label for=\"lifetimeStartDate\">System turn-on date<span class=\"hint\">Data is counted from this day</span></label><input type=\"date\" id=\"lifetimeStartDate\"></div>\n    <div class=\"row\"><label for=\"arrayObservedMaxKw\">Peak AC power<span class=\"hint\">Highest kW in the Enphase app</span></label><input type=\"number\" id=\"arrayObservedMaxKw\" inputmode=\"decimal\" step=\"0.1\"></div>\n    <div class=\"row pair\">\n      <div class=\"half\"><label for=\"panelTiltDeg\">Panel tilt<span class=\"hint\">30\u00b0 if unsure</span></label><input type=\"number\" id=\"panelTiltDeg\" inputmode=\"numeric\"></div>\n      <div class=\"half\"><label for=\"weatherZip\">ZIP code<span class=\"hint\">For weather</span></label><input type=\"text\" id=\"weatherZip\" inputmode=\"numeric\"></div>\n    </div>\n    <div class=\"row\"><label for=\"weatherLatLon\">Outside the US<span class=\"hint\">\u00b1Latitude, \u00b1Longitude</span></label><input type=\"text\" id=\"weatherLatLon\" placeholder=\"51.51, -0.13\" autocapitalize=\"off\" autocorrect=\"off\"></div>\n  </div>\n\n  <h2 class=\"hl\">Banked credits<span>Update from a new bill periodically</span></h2>\n  <div class=\"card hl\">\n    <div class=\"row wide\"><label for=\"banksKwhCredits\">My utility banks kWh credits<span class=\"hint\">Switch off for net billing, such as California NEM 3</span></label>\n      <div class=\"switch\"><input type=\"checkbox\" id=\"banksKwhCredits\"><span></span></div></div>\n    <div class=\"row\" id=\"bankKwhRow\"><label for=\"bankBaselineKwh\">Balance<span class=\"hint\">kWh, from your bill</span></label><input type=\"number\" id=\"bankBaselineKwh\" inputmode=\"decimal\" min=\"0\"></div>\n    <div class=\"row\"><label for=\"bankBaselineDate\" id=\"bankDateLbl\">Bill date</label><input type=\"date\" id=\"bankBaselineDate\"></div>\n    <div class=\"row\" id=\"trueUpRow\"><label for=\"trueUpMonth\">True-up month<span class=\"hint\">When your utility resets banked credits</span></label>\n      <select id=\"trueUpMonth\">\n        <option value=\"1\">January</option><option value=\"2\">February</option><option value=\"3\">March</option><option value=\"4\">April</option>\n        <option value=\"5\">May</option><option value=\"6\">June</option><option value=\"7\">July</option><option value=\"8\">August</option>\n        <option value=\"9\">September</option><option value=\"10\">October</option><option value=\"11\">November</option><option value=\"12\">December</option>\n      </select></div>\n    <div class=\"row wide\"><label for=\"showBankChart\">12-month bank chart<span class=\"hint\">A small line of the last 12 months beside the balance; Net moves up beside the arrow</span></label>\n      <div class=\"switch\"><input type=\"checkbox\" id=\"showBankChart\"><span></span></div></div>\n  </div>\n\n  <h2>Consumption</h2>\n  <div class=\"card\">\n    <div class=\"row wide\"><label for=\"hasCTs\">Enphase shows consumption<span class=\"hint\">Not just production</span></label>\n      <div class=\"switch\"><input type=\"checkbox\" id=\"hasCTs\"><span></span></div></div>\n    <div class=\"row hidden\" id=\"estRow\"><label for=\"estimatedDailyKwh\">Estimated consumption<span class=\"hint\">kWh a day</span></label><input type=\"number\" id=\"estimatedDailyKwh\" inputmode=\"decimal\"></div>\n    <div class=\"row wide\"><label for=\"showExportedImported\">Show Exported / Imported<span class=\"hint\">Energy to and from the grid, in place of Cons</span></label>\n      <div class=\"switch\"><input type=\"checkbox\" id=\"showExportedImported\"><span></span></div></div>\n  </div>\n\n  <h2>Widget</h2>\n  <div class=\"card\">\n    <div class=\"row narrow\"><label for=\"title\">Title</label><input type=\"text\" id=\"title\"></div>\n  </div>\n\n  <div class=\"bar\"><div class=\"inner\">\n    <div class=\"err\" id=\"errMsg\"></div>\n    <div class=\"saved\" id=\"savedMsg\"></div>\n    <button class=\"save\" id=\"saveBtn\">Save</button>\n  </div></div>\n\n<script>\n  var FIELDS = [\"apiKey\",\"clientId\",\"clientSecret\",\"systemId\",\"lifetimeStartDate\",\"arrayObservedMaxKw\",\"panelTiltDeg\",\"weatherZip\",\"weatherLatLon\",\"bankBaselineKwh\",\"bankBaselineDate\",\"trueUpMonth\",\"estimatedDailyKwh\",\"title\"];\n  var TOGGLES = [\"hasCTs\",\"showExportedImported\",\"banksKwhCredits\",\"showBankChart\"];\n  function $(id) { return document.getElementById(id); }\n  // Keys: one summary row; the three boxes stay folded away once all three are filled in.\n  function syncKeys(initial) {\n    var have = [\"apiKey\",\"clientId\",\"clientSecret\"].filter(function (f) { return $(f).value.trim() !== \"\"; }).length;\n    $(\"keysStatus\").textContent = have === 3 ? \"Saved\" : (have === 0 ? \"Not entered\" : have + \" of 3 entered\");\n    $(\"keysStatus\").classList.toggle(\"ok\", have === 3);\n    if (initial) $(\"keysBox\").classList.toggle(\"hidden\", have === 3);\n    $(\"keysBtn\").textContent = $(\"keysBox\").classList.contains(\"hidden\") ? \"Edit\" : \"Hide\";\n  }\n  function syncEst() { $(\"estRow\").classList.toggle(\"hidden\", $(\"hasCTs\").checked); }\n  // With the switch off there is no balance to enter: the widget shows net energy since the chosen date.\n  function syncBank() {\n    var on = $(\"banksKwhCredits\").checked;\n    $(\"bankKwhRow\").classList.toggle(\"hidden\", !on);\n    $(\"trueUpRow\").classList.toggle(\"hidden\", !on);\n    $(\"bankDateLbl\").innerHTML = on ? \"Bill date\" : 'Count net from<span class=\"hint\">Such as your true-up date</span>';\n  }\n  // Called by the script (or by the preview below) to fill the page in.\n  function fillForm(v) {\n    FIELDS.forEach(function (f) { if (v[f] !== undefined && v[f] !== null) $(f).value = v[f]; });\n    TOGGLES.forEach(function (f) { $(f).checked = !!v[f]; });\n    var ls = $(\"loginStatus\");\n    ls.classList.remove(\"ok\", \"warn\");\n    if (v.loginState === \"ok\" || v.loggedIn) { ls.textContent = v.loginText || \"Connected\"; ls.classList.add(\"ok\"); $(\"loginBtn\").textContent = \"Log in again\"; }\n    else if (v.loginState === \"warn\") { ls.textContent = v.loginText || \"Expired\"; ls.classList.add(\"warn\"); $(\"loginBtn\").textContent = \"Log in\"; }\n    else { ls.textContent = v.loginText || \"Not connected\"; $(\"loginBtn\").textContent = \"Log in\"; }\n    if (v.message) { $(\"topMsg\").textContent = v.message; $(\"topMsg\").classList.remove(\"hidden\"); }\n    syncKeys(true);\n    syncEst();\n    syncBank();\n  }\n  function collectForm() {\n    var out = {};\n    FIELDS.forEach(function (f) { out[f] = $(f).value; });\n    TOGGLES.forEach(function (f) { out[f] = $(f).checked; });\n    return out;\n  }\n  $(\"hasCTs\").addEventListener(\"change\", syncEst);\n  $(\"banksKwhCredits\").addEventListener(\"change\", syncBank);\n  $(\"keysBtn\").addEventListener(\"click\", function () { $(\"keysBox\").classList.toggle(\"hidden\"); syncKeys(false); });\n  [\"apiKey\",\"clientId\",\"clientSecret\"].forEach(function (f) { $(f).addEventListener(\"input\", function () { syncKeys(false); }); });\n  function todayIso() {\n    var d = new Date();\n    return d.getFullYear() + \"-\" + String(d.getMonth() + 1).padStart(2, \"0\") + \"-\" + String(d.getDate()).padStart(2, \"0\");\n  }\n  function isNum(x) { return String(x).trim() !== \"\" && isFinite(Number(x)); }\n  // errs block Save; warns are shown once and a second tap saves anyway.\n  function validate(v) {\n    var errs = [], warns = [];\n    [\"apiKey\",\"clientId\",\"clientSecret\"].forEach(function (f) {\n      var name = f === \"apiKey\" ? \"API Key\" : (f === \"clientId\" ? \"Client ID\" : \"Client Secret\");\n      var val = String(v[f] || \"\").trim();\n      if (!val) errs.push(name + \" is empty.\");\n      else if (val.length !== 32) warns.push(name + \" is usually 32 characters; this one is \" + val.length + \".\");\n    });\n    if (!/^\\d+$/.test(String(v.systemId || \"\").trim())) errs.push(\"System ID must be a number.\");\n    if (!v.lifetimeStartDate) errs.push(\"System turn-on date is missing.\");\n    else if (v.lifetimeStartDate > todayIso()) errs.push(\"System turn-on date is in the future.\");\n    if (!isNum(v.arrayObservedMaxKw) || Number(v.arrayObservedMaxKw) <= 0) errs.push(\"Peak AC power must be a number above 0.\");\n    if (!v.banksKwhCredits) {\n      if (v.bankBaselineDate && v.bankBaselineDate > todayIso()) errs.push(\"The date to count net from is in the future.\");\n      else if (v.bankBaselineDate && v.lifetimeStartDate && v.bankBaselineDate < v.lifetimeStartDate) errs.push(\"The date to count net from is before the system turn-on date.\");\n    }\n    else if (!isNum(v.bankBaselineKwh)) errs.push(\"Banked credits balance must be a number (0 if none).\");\n    else if (Number(v.bankBaselineKwh) < 0) errs.push(\"Banked credits balance can't be below 0.\");\n    else if (Number(v.bankBaselineKwh) > 0) {\n      if (!v.bankBaselineDate) errs.push(\"Bill date is missing.\");\n      else if (v.bankBaselineDate > todayIso()) errs.push(\"Bill date is in the future.\");\n      else if (v.lifetimeStartDate && v.bankBaselineDate < v.lifetimeStartDate) errs.push(\"Bill date is before the system turn-on date.\");\n    }\n    if (!v.hasCTs && (!isNum(v.estimatedDailyKwh) || Number(v.estimatedDailyKwh) <= 0)) errs.push(\"Estimated consumption must be a number above 0.\");\n    if (!isNum(v.panelTiltDeg)) errs.push(\"Panel tilt must be a number (30 if unsure).\");\n    else if (Number(v.panelTiltDeg) < 0 || Number(v.panelTiltDeg) > 60) warns.push(\"Panel tilt of \" + v.panelTiltDeg + \" degrees is unusual.\");\n    var zip = String(v.weatherZip || \"\").trim(), ll = String(v.weatherLatLon || \"\").trim();\n    if (ll) {\n      var m = /^(-?\\d+(?:\\.\\d+)?)\\s*[, ]\\s*(-?\\d+(?:\\.\\d+)?)$/.exec(ll);\n      if (!m) errs.push(\"Latitude, longitude must be two plain numbers, like 51.51, -0.13 (south and west are negative).\");\n      else if (Math.abs(Number(m[1])) > 90 && Math.abs(Number(m[1])) <= 180 && Math.abs(Number(m[2])) <= 90) errs.push(\"Latitude comes first. These two look swapped.\");\n      else if (Math.abs(Number(m[1])) > 90) errs.push(\"Latitude must be between -90 and 90.\");\n      else if (Math.abs(Number(m[2])) > 180) errs.push(\"Longitude must be between -180 and 180.\");\n    }\n    if (zip && !/^\\d{5}$/.test(zip)) warns.push(\"ZIP code is usually 5 digits.\");\n    else if (!zip && !ll) warns.push(\"No ZIP code or latitude, longitude: the widget will run without the weather icon and the dirty-panel warning.\");\n    if (!String(v.title || \"\").trim()) errs.push(\"Title is empty.\");\n    return { errs: errs, warns: warns };\n  }\n  var warnedFor = null;\n  function clearSaved() { window.__result = null; $('saveBtn').textContent = 'Save'; $('saveBtn').classList.remove('done'); $(\"savedMsg\").textContent = \"\"; }\n  $(\"saveBtn\").addEventListener(\"click\", function () {\n    var v = collectForm(), r = validate(v), sig = JSON.stringify(v);\n    window.__result = null; window.__relogin = false; $('saveBtn').textContent = 'Save'; $('saveBtn').classList.remove('done'); $(\"savedMsg\").textContent = \"\";\n    if (r.errs.length) { $(\"errMsg\").textContent = r.errs.join(\"\\n\"); return; }\n    if (r.warns.length && warnedFor !== sig) { warnedFor = sig; $(\"errMsg\").textContent = r.warns.join(\"\\n\") + \"\\nTap Save again to save anyway.\"; return; }\n    $(\"errMsg\").textContent = \"\";\n    window.__warnings = r.warns;\n    window.__result = v; $('saveBtn').textContent = 'Saved'; $('saveBtn').classList.add('done');\n    $(\"savedMsg\").textContent = \"Saved. Tap Close at the top left to continue.\";\n  });\n  $(\"loginBtn\").addEventListener(\"click\", function () {\n    window.__result = null;\n    window.__draft = collectForm(); $('saveBtn').textContent = 'Save'; $('saveBtn').classList.remove('done');\n    window.__relogin = true;\n    $(\"errMsg\").textContent = \"\";\n    $(\"savedMsg\").textContent = \"Tap Close at the top left. The Enphase login opens next.\";\n  });\n  document.addEventListener(\"input\", function () { if (window.__result) clearSaved(); });\n  document.addEventListener(\"change\", function () { if (window.__result) clearSaved(); });\n</script>\n</body>\n</html>\n";

// Runs inside whatever page was on screen when the user tapped Close. On this script's own page it returns
// what the user typed. On Enphase's developer page it finds the three keys by looking for each label and
// taking the 32-character value that follows it. It also picks up the authorization code if Enphase's
// page is showing one.
const INSPECT_PAGE = `
(function () {
  try {
    var out = { href: String(location.href), host: String(location.host) };
    if (window.__setupPage === "connect") { out.ours = true; out.submit = window.__submit || null; return JSON.stringify(out); }
    var text = document.body ? (document.body.innerText || "") : "";
    var keys = {};
    [["apiKey", "API Key"], ["clientId", "Client ID"], ["clientSecret", "Client Secret"]].forEach(function (p) {
      var i = text.toLowerCase().indexOf(p[1].toLowerCase());
      if (i < 0) return;
      var m = text.slice(i + p[1].length, i + p[1].length + 90).match(/\\b[0-9a-f]{32}\\b/i);
      if (m) keys[p[0]] = m[0];
    });
    out.keys = keys;
    var c = text.match(/Authorization code\\s*\\(?\\s*([A-Za-z0-9_-]{4,})\\s*\\)?/i);
    if (c) out.textCode = c[1];
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
})()
`;

// Runs inside the form page after it closes, to collect what the user entered.
const READ_FORM = `JSON.stringify({ result: window.__result || null, relogin: !!window.__relogin, draft: window.__draft || null, warnings: window.__warnings || [] })`;

// ==================== SMALL HELPERS ====================
// Keys and tokens never appear whole in a report, only their last 4 characters.
function mask(v) {
  v = String(v === undefined || v === null ? "" : v);
  if (!v) return "(none)";
  return v.length <= 4 ? "****" : "..." + v.slice(-4) + " (" + v.length + " chars)";
}

function readJson(path) {
  if (!FM.fileExists(path)) return null;
  try { return JSON.parse(FM.readString(path)); } catch (e) { return null; }
}

function writeJson(path, obj) {
  FM.writeString(path, JSON.stringify(obj, null, 2));
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isNum(x) { return String(x === undefined || x === null ? "" : x).trim() !== "" && isFinite(Number(x)); }

function haveAllKeys(k) { return !!(k && k.apiKey && k.clientId && k.clientSecret); }

// Enphase's login page for this application.
function authUrlFor(clientId) {
  return `${AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

// After Authorize, Enphase sends the browser to the redirect address with ?code=... on the end.
function codeFromUrl(url) {
  const u = String(url || "");
  if (u.indexOf(REDIRECT_URI) !== 0) return null;
  const m = u.match(/[?&]code=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function jwtExpiryMs(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(Data.fromBase64String(b64).toRawString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function tokenState(tok) {
  if (!tok || !tok.refresh_token) return "none";
  const exp = typeof tok.refresh_expires_at === "number" ? tok.refresh_expires_at : null;
  if (exp === null) return "ok";
  return exp > Date.now() ? "ok" : "expired";
}

async function notice(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction("OK");
  await a.presentAlert();
}

// ==================== SAVED FILES ====================

// A settings file from another version is not read. It is reported as "legacy" and backed up before a
// new one is saved.
function loadConfig() {
  const raw = readJson(CONFIG_PATH);
  if (raw && raw.schemaVersion === CONFIG_SCHEMA_VERSION) return { config: raw, legacy: false };
  return { config: null, legacy: FM.fileExists(CONFIG_PATH) };
}

function backupLegacyConfig() {
  if (!FM.fileExists(CONFIG_PATH)) return null;
  const raw = readJson(CONFIG_PATH);
  if (raw && raw.schemaVersion === CONFIG_SCHEMA_VERSION) return null;
  const backupPath = FM.joinPath(DIR, `overengineered-solar-config.backup-${Date.now()}.json`);
  FM.writeString(backupPath, FM.readString(CONFIG_PATH));
  return backupPath;
}

// Saved in the form the widget expects. The widget renews these on its own from here on.
function saveToken(tokenRes) {
  const now = Date.now();
  const refreshExp = jwtExpiryMs(tokenRes.refresh_token);
  const tok = {
    access_token: tokenRes.access_token,
    refresh_token: tokenRes.refresh_token,
    expires_at: now + (typeof tokenRes.expires_in === "number" ? tokenRes.expires_in * 1000 : 0),
    refresh_expires_at: refreshExp !== null ? refreshExp : now + REFRESH_TOKEN_FALLBACK_LIFETIME_MS,
    refresh_expiry_source: refreshExp !== null ? "token" : "assumed 30 days",
    obtained_at: now,
  };
  writeJson(TOKEN_PATH, tok);
  return tok;
}

// ==================== ENPHASE CALLS ====================

// Swaps the one-time code for tokens. Enphase takes these parameters in the address, not in the request
// body, with the Client ID and Client Secret as a Basic authorization header.
async function exchangeCode(code, clientId, clientSecret) {
  const url = `${TOKEN_URL}?grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${encodeURIComponent(code)}`;
  const req = new Request(url);
  req.method = "POST";
  req.headers = { "Authorization": "Basic " + Data.fromString(`${clientId}:${clientSecret}`).toBase64String() };
  let res;
  try {
    res = await req.loadJSON();
  } catch (e) {
    throw new Error("couldn't reach Enphase (" + (e && e.message ? e.message : e) + ")");
  }
  if (!res || !res.refresh_token || !res.access_token) {
    throw new Error((res && (res.error_description || res.message || res.error)) || "no token came back");
  }
  return res;
}

// Asks which systems this login owns, so the user never has to find a system ID. The API key goes in the
// address as ?key=. Each system's start date comes back too, to pre-fill the form.
async function fetchSystems(apiKey, accessToken) {
  const req = new Request(`${SYSTEMS_URL}?key=${encodeURIComponent(apiKey)}`);
  req.headers = { "Authorization": `Bearer ${accessToken}` };
  let res;
  try {
    res = await req.loadJSON();
  } catch (e) {
    throw new Error("couldn't reach Enphase (" + (e && e.message ? e.message : e) + ")");
  }
  if (!res || !Array.isArray(res.systems)) {
    throw new Error((res && (res.message || res.details || res.code)) || "no system list came back");
  }
  return res.systems.map((s) => {
    let operationalDate = "";

    if (typeof s.operational_at === "number" && s.operational_at > 0) {
      const d = new Date(s.operational_at > 100000000000 ? s.operational_at : s.operational_at * 1000);
      if (!isNaN(d.getTime())) operationalDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return { id: String(s.system_id), name: String(s.name || s.system_name || ""), operationalDate };
  });
}

// ==================== PAGE 1: CONNECT TO ENPHASE ====================

// Page 1. Each pass shows the connect page. From it the user opens Enphase's developer site or login in
// the same window. In Scriptable the only way out of a WebView is Close at the top left, so Close means
// "I'm done here": when it is tapped, the script looks at the page that was showing and works out what
// happened. Returns true once logged in.
async function connectLoop(st, rep, firstMessage) {
  let message = firstMessage || "";
  let openKeys = false;

  for (let round = 1; round <= MAX_CONNECT_ROUNDS; round++) {
    const capture = { code: null, sawRedirect: false };
    const wv = new WebView();
    // Watches every address the WebView loads. The moment Enphase redirects with the code it is caught here,
    // so the user never has to copy it.
    wv.shouldAllowRequest = (req) => {
      try {
        const u = String(req && req.url ? req.url : "");
        if (u.indexOf(REDIRECT_URI) === 0) {
          capture.sawRedirect = true;
          const c = codeFromUrl(u);
          if (c) capture.code = c;
        }
      } catch (e) {
      }
      return true;
    };

    await wv.loadHTML(CONNECT_HTML);
    await wv.evaluateJavaScript(`fillConnect(${JSON.stringify({
      keys: st.keys,
      portalUrl: PORTAL_URL,
      authUrl: haveAllKeys(st.keys) ? authUrlFor(st.keys.clientId) : "",
      message,
      openKeys,
    })}); null`);
    await wv.present(true);

    // The WebView has closed. Read what was on screen.
    let info;
    try {
      info = JSON.parse(await wv.evaluateJavaScript(INSPECT_PAGE));
    } catch (e) {
      info = { error: String(e && e.message ? e.message : e) };
    }
    message = "";
    openKeys = false;

    // Three ways to get the code, most reliable first: caught during the redirect, still in the page's
    // address, or shown as text on Enphase's page.
    let code = capture.code;
    let codeSource = code ? "caught as the page loaded" : null;
    if (!code && info.href) {
      code = codeFromUrl(info.href);
      if (code) codeSource = "page address";
    }
    if (!code && info.textCode && String(info.host || "").indexOf("enphaseenergy.com") >= 0) {
      code = info.textCode;
      codeSource = "page text";
    }

    const roundLog = { round, closedOn: info.error ? "unreadable page" : (info.ours ? "connect page" : (info.host || "unknown page")), sawRedirect: capture.sawRedirect };

    if (info.error) {
      message = "Couldn't read that page after it closed. Try again, or type the keys in below.";
      roundLog.error = info.error;
    } else if (info.ours) {
      // Closed on this script's own page: the user typed keys, pasted a code, or is quitting.
      const sub = info.submit;
      if (sub && sub.keys && haveAllKeys(sub.keys)) {
        st.keys = { apiKey: sub.keys.apiKey, clientId: sub.keys.clientId, clientSecret: sub.keys.clientSecret };
        st.keysSource = "typed";
        roundLog.did = "keys typed";
        message = "Keys entered. Now approve access below.";
      } else if (sub && sub.code) {
        code = String(sub.code).trim();
        const m = code.match(/[?&]code=([^&#]+)/);
        if (m) code = decodeURIComponent(m[1]);
        codeSource = "pasted";
      } else if (!code) {
        roundLog.did = "closed the connect page";
        rep.rounds.push(roundLog);
        return false;
      }
    } else {
      // Closed on one of Enphase's pages: look for the three keys.
      const found = info.keys || {};
      const n = ["apiKey", "clientId", "clientSecret"].filter((f) => found[f]).length;
      if (n === 3) {
        st.keys = { apiKey: found.apiKey, clientId: found.clientId, clientSecret: found.clientSecret };
        st.keysSource = "read from Enphase's page";
        message = "Found your three keys. Now approve access below.";
        roundLog.did = "keys read from page";
      } else if (!code) {
        if (String(info.host || "").indexOf("developer") >= 0) {
          message = n > 0
            ? `Found ${n} of the 3 keys on that page. Open your application so all three are on screen, then tap Close. Or type them in below.`
            : "Couldn't find the keys on that page. Open Applications and tap your application's name, or finish creating one, so the API Key, Client ID and Client Secret are on screen. Then tap Close.";
          openKeys = n > 0;
        } else {
          message = "The login wasn't finished. Tap Authorize on Enphase's page before Close.";
        }
        roundLog.did = `no code, ${n} keys on page`;
      }
    }

    // With a code and the keys, finish the login and look up the system.
    if (code) {
      roundLog.codeSource = codeSource;
      roundLog.code = mask(code);
      if (!haveAllKeys(st.keys)) {
        message = "Got a code, but the keys are missing. Get or type the keys first.";
        openKeys = true;
      } else {
        try {
          const tokenRes = await exchangeCode(code, st.keys.clientId, st.keys.clientSecret);
          st.token = saveToken(tokenRes);
          rep.codeSource = codeSource;
          rep.tokenSwap = "ok";
          roundLog.did = "token swap ok";
        } catch (e) {
          rep.tokenSwap = "FAILED: " + e.message;
          roundLog.did = "token swap failed";
          rep.rounds.push(roundLog);
          message = `Enphase didn't accept that: ${e.message}. Check the Client ID and Client Secret, then tap Continue again.`;
          openKeys = true;
          continue;
        }

        try {
          st.systems = await fetchSystems(st.keys.apiKey, st.token.access_token);
          rep.systemLookup = `ok, ${st.systems.length} system(s)`;
          if (st.systems.length >= 1 && !st.systemId) st.systemId = st.systems[0].id;
          if (st.systems.length >= 1 && !st.suggestedStartDate) st.suggestedStartDate = st.systems[0].operationalDate || "";
        } catch (e) {
          st.systems = [];
          st.systemLookupError = e.message;
          rep.systemLookup = "FAILED: " + e.message;
        }
        rep.rounds.push(roundLog);
        return true;
      }
    }

    rep.rounds.push(roundLog);
  }
  return false;
}

// ==================== PAGE 2: THE FORM ====================
// What the form starts with: saved settings if there are any, otherwise defaults and what Enphase reported.
function formValues(cfg, st) {
  const c = cfg || {};
  const est = typeof c.estimatedDailyKwh === "number" ? c.estimatedDailyKwh : 0;
  const startDate = c.lifetimeStartDate || st.suggestedStartDate || "";
  let trueUp = c.trueUpMonth;
  if (!trueUp && startDate) trueUp = parseInt(startDate.slice(5, 7), 10) || DEFAULTS.trueUpMonth;
  return {
    apiKey: st.keys.apiKey || "",
    clientId: st.keys.clientId || "",
    clientSecret: st.keys.clientSecret || "",
    systemId: st.systemId || c.systemId || "",
    lifetimeStartDate: startDate,
    arrayObservedMaxKw: c.arrayObservedMaxKw !== undefined ? c.arrayObservedMaxKw : "",
    panelTiltDeg: c.panelTiltDeg !== undefined ? c.panelTiltDeg : DEFAULTS.panelTiltDeg,
    weatherZip: c.weatherZip || "",
    weatherLatLon: (typeof c.weatherLat === "number" && typeof c.weatherLon === "number") ? c.weatherLat + ", " + c.weatherLon : "",
    bankBaselineKwh: c.bankBaselineKwh !== undefined ? c.bankBaselineKwh : 0,
    bankBaselineDate: c.bankBaselineDate || "",
    trueUpMonth: trueUp || DEFAULTS.trueUpMonth,
    banksKwhCredits: c.banksKwhCredits !== false,
    hasCTs: cfg ? est <= 0 : true,
    estimatedDailyKwh: est > 0 ? est : DEFAULTS.estimatedDailyKwh,
    showExportedImported: !!c.showExportedImported,
    showBankChart: c.showBankChart !== false,
    title: c.title || DEFAULTS.title,
  };
}

// The form checks entries on the page. This is a second check before anything is written.
function configProblems(v) {
  const p = [];
  if (!String(v.apiKey || "").trim()) p.push("API Key is empty.");
  if (!String(v.clientId || "").trim()) p.push("Client ID is empty.");
  if (!String(v.clientSecret || "").trim()) p.push("Client Secret is empty.");
  if (!/^\d+$/.test(String(v.systemId || "").trim())) p.push("System ID must be a number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.lifetimeStartDate || ""))) p.push("System turn-on date is missing.");
  else if (v.lifetimeStartDate > todayIso()) p.push("System turn-on date is in the future.");
  if (!isNum(v.arrayObservedMaxKw) || Number(v.arrayObservedMaxKw) <= 0) p.push("Peak AC power must be a number above 0.");
  if (v.banksKwhCredits === false) {
    // No kWh bank (net billing): no balance is asked for. The date is optional and defaults to the turn-on date.
    const d = String(v.bankBaselineDate || "");
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) p.push("The date to count net from is not a date.");
    else if (d && d > todayIso()) p.push("The date to count net from is in the future.");
    else if (d && v.lifetimeStartDate && d < v.lifetimeStartDate) p.push("The date to count net from is before the system turn-on date.");
  }
  else if (!isNum(v.bankBaselineKwh) || Number(v.bankBaselineKwh) < 0) p.push("Banked credits balance must be 0 or more.");
  else if (Number(v.bankBaselineKwh) > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.bankBaselineDate || ""))) p.push("Bill date is missing.");
    else if (v.bankBaselineDate > todayIso()) p.push("Bill date is in the future.");
    else if (v.lifetimeStartDate && v.bankBaselineDate < v.lifetimeStartDate) p.push("Bill date is before the system turn-on date.");
  }
  if (!v.hasCTs && (!isNum(v.estimatedDailyKwh) || Number(v.estimatedDailyKwh) <= 0)) p.push("Estimated consumption must be a number above 0.");
  if (!isNum(v.panelTiltDeg)) p.push("Panel tilt must be a number.");
  const m = parseInt(v.trueUpMonth, 10);
  if (!(m >= 1 && m <= 12)) p.push("True-up month is missing.");
  if (String(v.weatherLatLon || "").trim() && !parseLatLon(v.weatherLatLon)) p.push("Latitude, longitude must be two numbers, like 51.51, -0.13.");
  if (!String(v.title || "").trim()) p.push("Title is empty.");
  return p;
}

// "51.51, -0.13" -> [51.51, -0.13]. Null when empty or not two numbers in range.
function parseLatLon(text) {
  const m = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(String(text || "").trim());
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? [lat, lon] : null;
}

// Fields from an older file that this version does not know are carried over untouched.
function buildConfig(v, oldCfg) {
  const latLon = parseLatLon(v.weatherLatLon);
  return {
    ...(oldCfg || {}),
    schemaVersion: CONFIG_SCHEMA_VERSION,
    apiKey: String(v.apiKey).trim(),
    clientId: String(v.clientId).trim(),
    clientSecret: String(v.clientSecret).trim(),
    systemId: String(v.systemId).trim(),
    weatherZip: String(v.weatherZip || "").trim(),
    weatherLat: latLon ? latLon[0] : null,
    weatherLon: latLon ? latLon[1] : null,
    panelTiltDeg: Number(v.panelTiltDeg),
    lifetimeStartDate: v.lifetimeStartDate,
    banksKwhCredits: v.banksKwhCredits !== false,
    bankBaselineKwh: v.banksKwhCredits === false ? 0 : Number(v.bankBaselineKwh),
    bankBaselineDate: v.banksKwhCredits === false ? String(v.bankBaselineDate || "") : (Number(v.bankBaselineKwh) > 0 ? v.bankBaselineDate : ""),
    trueUpMonth: parseInt(v.trueUpMonth, 10),
    estimatedDailyKwh: v.hasCTs ? 0 : Number(v.estimatedDailyKwh),
    showExportedImported: !!v.showExportedImported,
    showBankChart: !!v.showBankChart,
    arrayObservedMaxKw: Number(v.arrayObservedMaxKw),
    title: String(v.title).trim(),
    savedAt: new Date().toISOString(),
    savedBySetupVersion: SETUP_VERSION,
  };
}

function loginDisplay(st) {
  const s = tokenState(st.token);
  if (s === "ok") return { loginState: "ok", loginText: "Connected" };
  if (s === "expired") return { loginState: "warn", loginText: "Expired" };
  return { loginState: "none", loginText: "Not connected" };
}

// Page 2. Shows the form until the user saves, closes without saving, or asks to log in again. Entries
// are kept between passes, so a rejected save does not lose what was typed.
async function formLoop(st, cfg, rep) {
  let draft = formValues(cfg, st);
  let message = "";
  if (st.systemLookupError) {
    message = `Logged in, but Enphase rejected the API Key (${st.systemLookupError}). Tap Edit beside Keys to fix it, and enter your System ID by hand.`;
  } else if (st.systems && st.systems.length > 1) {
    message = "This login has more than one system: " + st.systems.map((s) => `${s.id}${s.name ? " (" + s.name + ")" : ""}`).join(", ") + ". Check the System ID below.";
  }

  for (;;) {
    const wv = new WebView();
    await wv.loadHTML(FORM_HTML);
    await wv.evaluateJavaScript(`fillForm(${JSON.stringify({ ...draft, ...loginDisplay(st), message })}); null`);
    await wv.present(true);

    let read;
    try {
      read = JSON.parse(await wv.evaluateJavaScript(READ_FORM));
    } catch (e) {
      rep.form = "FAILED to read the form back: " + (e && e.message ? e.message : e);
      await notice("Setup Problem", "Couldn't read the form after it closed. Nothing was saved. Run setup again; if it repeats, report it on the project's GitHub page.");
      return null;
    }
    message = "";

    if (read.relogin) {
      if (read.draft) draft = { ...draft, ...read.draft };
      st.keys = { apiKey: String(draft.apiKey || "").trim(), clientId: String(draft.clientId || "").trim(), clientSecret: String(draft.clientSecret || "").trim() };
      rep.relogins += 1;
      const ok = await connectLoop(st, rep, haveAllKeys(st.keys) ? "Tap Continue to log in again." : "The keys are needed before logging in.");
      draft.apiKey = st.keys.apiKey; draft.clientId = st.keys.clientId; draft.clientSecret = st.keys.clientSecret;
      if (ok) {
        if (!String(draft.systemId || "").trim() && st.systemId) draft.systemId = st.systemId;
        message = st.systemLookupError ? `Logged in, but the system lookup failed (${st.systemLookupError}).` : "Logged in. Tap Save to keep your settings.";
      } else {
        message = "Login not completed. Nothing changed.";
      }
      continue;
    }

    if (!read.result) {
      rep.form = "closed without saving";
      return null;
    }

    const problems = configProblems(read.result);
    if (problems.length) {
      draft = { ...draft, ...read.result };
      message = "Not saved: " + problems.join(" ");
      rep.form = "rejected by the script's own check: " + problems.join(" ");
      continue;
    }

    const backup = backupLegacyConfig();
    const config = buildConfig(read.result, cfg);
    writeJson(CONFIG_PATH, config);
    rep.form = "saved";
    rep.warnings = read.warnings || [];
    rep.legacyBackup = backup ? "older config file backed up" : "none needed";
    return config;
  }
}

// ==================== DEBUG REPORT ====================
// A plain-text account of the run, copied to the clipboard for troubleshooting. Secrets are masked.
function buildReport(rep, st, config) {
  const tok = st.token;
  const lines = [];
  lines.push(`OVERENGINEERED SOLAR SETUP [${SETUP_VERSION}]`);
  lines.push(`Run type: ${rep.runType}`);
  lines.push(`Outcome: ${rep.outcome}`);
  lines.push(`Keys: API Key ${mask(st.keys.apiKey)} | Client ID ${mask(st.keys.clientId)} | Client Secret ${mask(st.keys.clientSecret)} | source: ${st.keysSource || "saved file"}`);
  lines.push(`Authorization code source: ${rep.codeSource || "no login this run"}`);
  lines.push(`Token swap: ${rep.tokenSwap || "not attempted"}`);
  lines.push(`System lookup: ${rep.systemLookup || "not attempted"} (1 API call when attempted)`);
  if (tok) {
    lines.push(`Token file: access ${mask(tok.access_token)} | refresh ${mask(tok.refresh_token)}`);
    lines.push(`Refresh token good until: ${tok.refresh_expires_at ? new Date(tok.refresh_expires_at).toLocaleString() : "unknown"} (${tok.refresh_expiry_source || "?"}) | obtained ${tok.obtained_at ? new Date(tok.obtained_at).toLocaleString() : "unknown"}`);
  } else {
    lines.push("Token file: none");
  }
  lines.push(`Form: ${rep.form || "not shown"}`);
  if (rep.warnings && rep.warnings.length) lines.push(`Warnings accepted: ${rep.warnings.join(" ")}`);
  lines.push(`Logins from the form's button: ${rep.relogins}`);
  lines.push(`Older config file: ${rep.legacyBackup || (rep.legacyPresent ? "present, not touched" : "none")}`);
  if (rep.rounds.length) {
    lines.push("Connect page rounds:");
    for (const r of rep.rounds) {
      lines.push(` ${r.round}. closed on ${r.closedOn}${r.sawRedirect ? " | redirect seen" : ""}${r.did ? " | " + r.did : ""}${r.codeSource ? " | code " + r.code + " via " + r.codeSource : ""}${r.error ? " | " + r.error : ""}`);
    }
  }
  if (config) {
    const shown = { ...config, apiKey: mask(config.apiKey), clientId: mask(config.clientId), clientSecret: mask(config.clientSecret) };
    lines.push("Saved overengineered-solar-config.json (keys masked):");
    lines.push(JSON.stringify(shown, null, 2));
  }
  return lines.join("\n");
}

// ==================== MAIN ====================
// A first run shows the connect page, then the form. A later run already has keys and a login, so it
// opens straight to the form.
async function main() {
  const loaded = loadConfig();
  const cfg = loaded.config;
  const st = {
    keys: { apiKey: (cfg && cfg.apiKey) || "", clientId: (cfg && cfg.clientId) || "", clientSecret: (cfg && cfg.clientSecret) || "" },
    keysSource: null,
    systemId: (cfg && cfg.systemId) || "",
    token: readJson(TOKEN_PATH),
    systems: null,
    systemLookupError: null,
    suggestedStartDate: "",
  };
  const rep = {
    runType: cfg ? "re-run (saved setup found)" : "first run",
    outcome: "",
    rounds: [],
    relogins: 0,
    legacyPresent: loaded.legacy,
  };

  let config = null;
  const needConnect = !haveAllKeys(st.keys) || tokenState(st.token) === "none";
  let connected = true;
  if (needConnect) connected = await connectLoop(st, rep, "");

  if (!connected) {
    rep.outcome = "stopped at the connect page; nothing saved" + (st.token ? " (a login token was saved earlier in this run)" : "");
  } else {
    config = await formLoop(st, cfg, rep);
    rep.outcome = config ? "settings saved" : "form closed without saving" + (needConnect && st.token ? " (login token was saved; settings were not)" : "");
  }

  const report = buildReport(rep, st, config);
  Pasteboard.copy(report);
  await notice(
    config ? "Setup Saved" : "Setup Not Finished",
    (config
      ? "Your settings are saved."
      : "Nothing was changed in your settings. Run setup again whenever you're ready.") +
      "\n\nA debug report was copied to the clipboard (keys and tokens show only their last 4 characters)."
  );
}

await main();
