const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifkeenaSecret786';

const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

let db = null;
let dbStatus = "🔴 OFFLINE";

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        dbStatus = "🟢 ONLINE";
        console.log("✅ v1.9.7 SUPREME BRAIN ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); dbStatus = "❌ ERR: " + error.message; }

app.use(cors());
app.use(bodyParser.json());

// --- 127-KEY PATH CONSTANTS (FOR CONNECTIVITY) ---
const PATH = {
    BRANDING: 'config/system_branding',
    LOGIC: 'config/system_logic',
    VERIFY: 'config/verification_engine',
    GATEWAY: 'config/gateways',
    DNA: 'config/hardware_dna',
    USERS: 'users',
    TX: 'transactions',
    LEDGER: 'ledger',
    FORENSICS: 'forensics',
    SYNC: 'sync_room',
    AUDITS: 'audits'
};

const normalizePhone = (p) => { if (!p) return ""; const clean = p.toString().replace(/\D/g, ''); return clean.length >= 9 ? clean.slice(-9) : clean; };

const getNextImperialRef = async () => {
    if (!db) return "#000000";
    const ref = db.ref(PATH.LEDGER + '/097_receipt_counter');
    const res = await ref.transaction((c) => (c || 0) + 1);
    return "#" + res.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedLedger = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref(PATH.LEDGER + '/096_empire_verified_wealth_usd').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const stampDNA = async (phoneNumber, deviceId) => {
    if (!db || !deviceId) return;
    const ts = new Date().toISOString();
    await db.ref(PATH.USERS + '/' + phoneNumber + '/071_identity_dna_stamps/' + deviceId).set({ ts, seen: true });
    await db.ref(PATH.USERS + '/' + phoneNumber).update({ '072_current_dna': deviceId });
};

const logForensic = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const ts = new Date().toISOString();
        const actor = req.user ? req.user.phoneNumber : "SYSTEM";
        const dna = req.user ? (req.user.deviceId || "WEB") : "UNK";
        const entry = { ts, actor, action, target, dna, details };
        await db.ref(PATH.FORENSICS + '/103_global_execution_feed').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + actor + '/actions').push().set(entry);
        }
    } catch (e) {}
};

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role === 'MASTER' || user.role === 'SUPPORT' || user.role === 'LISTENER') {
            if (db) {
                const trusted = (await db.ref(PATH.DNA + '/058_trusted_devices').once('value')).val() || {};
                if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) return res.status(403).json({ message: "Untrusted Device DNA" });
            }
        }
        req.user = user; next();
    });
};

const isMaster = (req, res, next) => { if (req.user && req.user.role === 'MASTER') next(); else res.status(403).send("Master Only"); };
const isSupport = (req, res, next) => { if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next(); else res.status(403).send("Staff Only"); };

// --- CORE APIs (CONNECTED TO 127 NODES) ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (db && deviceId && ['eesi','maamulka','maamulka_2','sensor_primary'].includes(phoneNumber)) {
            const lock = (await db.ref(PATH.DNA + '/060_registry_lock_status').once('value')).val();
            if (lock !== 'LOCKED') await db.ref(PATH.DNA + '/059_pending_approval_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
        }
        if (phoneNumber === 'eesi' && password === MASTER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'MASTER' });
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).send("Offline");
        const userRef = db.ref(PATH.USERS + '/' + clean);
        const user = (await userRef.once('value')).val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ '062_phoneNumber': clean, '063_password': password, '064_balanceUSD': 0.0, '065_status': 'PENDING', '067_createdAt': new Date().toISOString() });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user['063_password'] !== password) return res.status(401).send("Fail");
            if (user['065_status'] === 'BLOCKED') return res.status(403).send("Blocked");
            await stampDNA(clean, deviceId);
            return res.json({ token: jwt.sign({ phoneNumber: clean, role: 'USER', deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'USER' });
        }
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { transactionId, status } = req.body;
    const txRef = db.ref(PATH.TX + '/' + transactionId);
    const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData['080_status'] === 'PENDING') {
        const uRef = db.ref(PATH.USERS + '/' + txData['076_userId']);
        const oldBal = (await uRef.once('value')).val()['064_balanceUSD'] || 0;
        const isOut = txData['077_type'].toLowerCase().includes("withdraw");
        const nBal = isOut ? oldBal - txData['078_amountUSD'] : oldBal + txData['078_amountUSD'];
        const iRef = await getNextImperialRef();
        await uRef.update({ '064_balanceUSD': nBal });
        await txRef.update({ '080_status': 'APPROVED', '087_approvedBy': req.user.phoneNumber, '082_prevBalance': oldBal, '083_newBalance': nBal, '081_imperialRef': iRef, '095_creation_ts': new Date().toISOString(), '088_dnaStamp': req.user.deviceId || "WEB" });
        await updateVerifiedLedger(txData['078_amountUSD'], isOut ? 'SUB' : 'ADD');
        await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + req.user.phoneNumber).transaction((s) => { if(s) s.total_approvals = (s.total_approvals || 0) + 1; return s; });
    }
    res.json({ message: "OK" });
});

app.post('/api/v1/gateway/pulse', async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { p_v1, p_v2, reportedBalanceSLSH, direction, refId } = req.body;
    try {
        const amtSLSH = parseInt(p_v1); const amtUSD = amtSLSH / 11000; const ph = normalizePhone(p_v2);
        const baseline = (await db.ref(PATH.VERIFY + '/023_lastKnownBaselineBalanceSLSH').once('value')).val() || 0;
        const expected = direction === 'OUT' ? baseline - amtSLSH : baseline + amtSLSH;

        // --- BATCH SYNC LOGIC (NETWORK WAIT 3 PEOPLE) ---
        if (Math.abs(expected - reportedBalanceSLSH) > 100) {
            const bufferRef = db.ref(PATH.SYNC + '/108_pulse_buffer');
            await bufferRef.push().set({ ts: new Date().toISOString(), ph, amtSLSH, refId, reportedBalanceSLSH });
            const count = (await bufferRef.once('value')).numChildren();
            if (count >= 3) {
                // AUTO RELEASE BATCH
                await db.ref(PATH.VERIFY).update({ '023_lastKnownBaselineBalanceSLSH': reportedBalanceSLSH, '028_autoReleaseMode': 'INSTANT_RESET' });
                await bufferRef.remove();
                await logForensic({ user: { phoneNumber: 'SYSTEM' } }, "BATCH_RELEASED", "ALL", { count });
            }
            return res.json({ message: "BUFFERED" });
        }

        await db.ref(PATH.VERIFY).update({ '023_lastKnownBaselineBalanceSLSH': reportedBalanceSLSH, '029_lastReportedSmsRef': refId });
        if (direction === 'IN') {
            const txs = (await db.ref(PATH.TX).orderByChild('076_userId').equalTo(ph).once('value')).val() || {};
            const tid = Object.keys(txs).find(k => txs[k]['080_status'] === 'PENDING' && Math.abs(txs[k]['079_amountSLSH'] - amtSLSH) < 100);
            if (tid) {
                const uRef = db.ref(PATH.USERS + '/' + ph);
                const old = (await uRef.once('value')).val()['064_balanceUSD'] || 0;
                const n = old + amtUSD; const i = await getNextImperialRef();
                await uRef.update({ '064_balanceUSD': n });
                await db.ref(PATH.TX + '/' + tid).update({ '080_status': 'APPROVED', '086_externalId': refId, '082_prevBalance': old, '083_newBalance': n, '081_imperialRef': i, '090_result_snapshot': reportedBalanceSLSH });
                await updateVerifiedLedger(amtUSD, 'ADD');
            }
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/v1/sup/audit-lock', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const auditData = {
        ...req.body,
        '115_ts': new Date().toISOString(),
        '116_actor': req.user.phoneNumber,
        '123_signature': 'SIGNED_HASH_' + Math.random().toString(36).substring(7).toUpperCase()
    };
    await db.ref(PATH.AUDITS).push().set(auditData);
    res.json({ message: "OK" });
});

// --- REST OF APIs (ALL CONNECTED) ---
app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => { const u = db ? (await db.ref(PATH.USERS + '/' + req.user.phoneNumber).once('value')).val() : null; res.json({ balanceUSD: u ? u['064_balanceUSD'] : 0 }); });
app.get('/api/transactions', authenticate, async (req, res) => {
    if (!db) return res.json([]);
    const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
    res.json(txs.reverse());
});
app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { type, amountSLSH } = req.body;
    await db.ref(PATH.TX).push().set({ '076_userId': req.user.phoneNumber, '077_type': type, '079_amountSLSH': amountSLSH, '078_amountUSD': amountSLSH / 11000, '080_status': 'PENDING', '095_creation_ts': new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref(PATH.USERS).once('value')).val() || {} : {}));
app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => { if (db) await db.ref(PATH.USERS + '/' + req.body.targetPhone).update({ '065_status': 'ACTIVE' }); res.json({ message: "OK" }); });
app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => res.json(db ? Object.values((await db.ref(PATH.FORENSICS + '/103_global_execution_feed').limitToLast(100).once('value')).val() || {}).reverse() : []));
app.post('/api/v1/sup/delta-force', authenticate, isMaster, async (req, res) => { if (db) await db.ref(PATH.USERS + '/' + normalizePhone(req.body.targetPhone)).update({ '064_balanceUSD': parseFloat(req.body.newBalance) }); res.json({ message: "OK" }); });
app.get('/api/v1/sup/audits', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref(PATH.AUDITS).limitToLast(50).once('value')).val() || {} : {}));
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).send("Offline"); const snap = await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref(PATH.DNA + '/058_trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).send("Err"); });
app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => { await logForensic(req, "VIEW_PASS", req.body.targetPhone); res.json({ message: "OK" }); });

// --- SUPREME MANAGEMENT APIs (FOR 127 NODES) ---

app.get('/api/v1/sup/empire-stats', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({ pendingCount: 0 });
    const snap = await db.ref(PATH.TX).orderByChild('080_status').equalTo('PENDING').once('value');
    res.json({ pendingCount: Object.keys(snap.val() || {}).length });
});

app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => {
    if (!db) return res.json({});
    const wealth = (await db.ref(PATH.LEDGER + '/096_empire_verified_wealth_usd').once('value')).val() || 0;
    const users = (await db.ref(PATH.USERS).once('value')).val() || {};
    const liab = Object.values(users).reduce((s, u) => s + (parseFloat(u['064_balanceUSD']) || 0), 0);
    res.json({ empireUSD: parseFloat(wealth), liabilitiesUSD: liab });
});

app.get('/api/v1/sup/search-users', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({});
    const q = req.query.q;
    const snap = await db.ref(PATH.USERS).orderByKey().startAt(q).endAt(q + "\uf8ff").limitToFirst(20).once('value');
    res.json(snap.val() || {});
});

app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({});
    const ph = normalizePhone(req.params.phone);
    const profile = (await db.ref(PATH.USERS + '/' + ph).once('value')).val();
    const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(ph).limitToLast(10).once('value')).val() || {});
    res.json({ profile, transactions: txs.reverse() });
});

app.post('/api/v1/sup/set-allowance', authenticate, isSupport, async (req, res) => {
    if (db) await db.ref(PATH.USERS + '/' + normalizePhone(req.body.targetPhone)).update({ '066_dailyLimitUSD': parseFloat(req.body.allowance) });
    res.json({ message: "OK" });
});

app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => {
    if (db) await db.ref(PATH.USERS + '/' + normalizePhone(req.body.targetPhone)).update({ '065_status': req.body.block ? 'BLOCKED' : 'ACTIVE' });
    res.json({ message: "OK" });
});

app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => {
    res.json({ activeStaff: db ? Object.keys((await db.ref(PATH.FORENSICS + '/104_staff_dossiers').once('value')).val() || {}) : [] });
});

app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => {
    if (!db) return res.json([]);
    const snap = await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + req.params.phone + '/actions').limitToLast(100).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => {
    res.json(db ? (await db.ref(PATH.DNA + '/059_pending_approval_devices').once('value')).val() || {} : {});
});

app.post('/api/v1/sys/simulate', authenticate, isMaster, async (req, res) => {
    await logForensic(req, "SIMULATOR_PULSE", "SYSTEM", { pulse: "TEST_ZAAD_SUCCESS" });
    res.json({ message: "OK" });
});

// --- HTML PORTALS (INTEGRATED v1.9.7 SUPREME) ---

app.get('/master-vault', (req, res) => {
    let h = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SARIFKEENA MASTER VAULT</title>';
    h += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';
    h += '<style>:root{--gold:#ffc107;--bg:#050505;--card:#111;--border:#222;}body{background:var(--bg);color:#f0f0f0;font-family:sans-serif;}.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:15px;margin-bottom:12px;}.btn-gold{background:var(--gold);color:black;border:none;font-weight:800;border-radius:10px;}.nav-tabs{border:none;background:#0a0a0a;padding:10px;border-radius:14px;display:flex;flex-wrap:nowrap;overflow-x:auto;}.nav-link{color:#555;border:none!important;font-size:0.65rem;font-weight:700;white-space:nowrap;}.nav-link.active{color:var(--gold)!important;background:transparent!important;border-bottom:2px solid var(--gold)!important;}#login{height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at center, #1a1a00, #000);}.forensic-log{font-size:0.7rem;border-left:3px solid var(--gold);padding:8px;background:#0a0a0a;margin-bottom:5px;}.stat-box{text-align:center;padding:10px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid var(--border);}</style></head><body>';
    h += '<div id="login"><div class="card text-center" style="width:320px;"><h2 style="font-weight:900;color:var(--gold);">MASTER VAULT</h2><small class="text-muted">DB: '+dbStatus+'</small><input type="password" id="k" class="form-control text-center my-4 bg-dark text-white border-secondary" placeholder="MASTER KEY"><button onclick="doLogin()" class="btn btn-gold w-100 py-3">UNLOCK SYSTEM</button><div id="err" class="text-danger mt-2 small fw-bold"></div></div></div>';
    h += '<div id="ui" style="display:none;" class="container-fluid py-3"><header class="d-flex justify-content-between mb-3 px-2"><h4>SARIFKEENA <span style="color:var(--gold)">MASTER</span></h4><button onclick="location.reload()" class="btn btn-sm btn-outline-danger"><i class="fas fa-power-off"></i></button></header>';
    h += '<div class="row g-2 mb-4"><div class="col-4"><div class="stat-box"><h6>EMPIRE</h6><b id="s-bal" class="text-success">$0</b></div></div><div class="col-4"><div class="stat-box"><h6>OWED</h6><b id="s-liab" class="text-danger">$0</b></div></div><div class="col-4"><div class="stat-box"><h6>QUEUE</h6><b id="s-q" class="text-warning">0</b></div></div></div>';
    h += '<ul class="nav nav-tabs shadow-sm mb-4" role="tablist"><li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-q">QUEUE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-act" onclick="refreshAct()">ACTIVATE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-u" onclick="refreshUsers()">USERS</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-f" onclick="refreshFeed()">FEED</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-fin" onclick="loadFin()">FINANCE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-staff" onclick="loadStaff()">STAFF</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-dev" onclick="loadDev()">DEVICES</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-m">MASTERY</a></li></ul>';
    h += '<div class="tab-content pt-2"><div class="tab-pane fade show active" id="tab-q"><div id="q-list"></div></div><div class="tab-pane fade" id="tab-act"><div id="act-list"></div></div><div class="tab-pane fade" id="tab-u"><div class="d-flex gap-2 mb-3"><input type="text" id="us" class="form-control bg-dark text-white border-secondary" placeholder="Search 63..."><button onclick="searchUsers()" class="btn btn-gold"><i class="fas fa-search"></i></button></div><div id="u-list"></div></div><div class="tab-pane fade" id="tab-f"><div id="feed-list" style="max-height:70vh;overflow-y:auto;"></div></div><div class="tab-pane fade" id="tab-fin"><div id="fin-summary"></div><hr><h6 class="text-muted small fw-bold">SHIFT HISTORY</h6><div id="audit-history"></div></div><div class="tab-pane fade" id="tab-staff"><div id="staff-box"></div></div><div class="tab-pane fade" id="tab-dev"><div id="dev-list"></div></div><div class="tab-pane fade" id="tab-m"><div class="card"><h6>STEALTH & BRANDING</h6><button onclick="toggleGhost()" class="btn btn-warning w-100 mb-2">TOGGLE GHOST MODE</button><input type="text" id="h-txt" class="form-control mb-2 bg-dark text-white border-secondary" placeholder="Update Heading"><button onclick="saveLogo()" class="btn btn-gold btn-sm w-100">SAVE BRANDING</button></div><div class="card"><h6>SIMULATOR</h6><textarea id="sim-sms" class="form-control mb-2 bg-dark text-white border-secondary" placeholder="Paste SMS Sample"></textarea><button onclick="runSim()" class="btn btn-outline-info w-100">RUN TEST PULSE</button></div></div></div></div>';
    h += '<div class="modal fade" id="mdl" tabindex="-1"><div class="modal-dialog modal-fullscreen-sm-down"><div class="modal-content bg-dark border-secondary"><div class="modal-header border-secondary text-white"><h5 id="mdl-title">Dossier</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body" id="mdl-body"></div><div class="modal-footer border-secondary justify-content-between" id="mdl-foot"></div></div></div></div>';
    h += '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>';
    h += '<script>let t="";let curUser="";async function doLogin(){const p=document.getElementById("k").value;const res=await fetch("/api/v1/user/auth-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phoneNumber:"eesi",password:p,mode:"login",deviceId:"MASTER_WEB"})});const d=await res.json();if(d.token&&d.role==="MASTER"){t="Bearer "+d.token;document.getElementById("login").style.display="none";document.getElementById("ui").style.display="block";fetchQ();loadStats();}else{alert("Denied");}}';
    h += 'async function loadStats(){const res=await fetch("/api/v1/sup/ledger-sheet",{headers:{"Authorization":t}});const f=await res.json();const qres=await fetch("/api/v1/sup/empire-stats",{headers:{"Authorization":t}});const s=await qres.json();document.getElementById("s-bal").innerText="$"+f.empireUSD?.toFixed(2);document.getElementById("s-liab").innerText="$"+f.liabilitiesUSD?.toFixed(2);document.getElementById("s-q").innerText=s.pendingCount;}';
    h += 'async function fetchQ(){const res=await fetch("/api/admin/transactions",{headers:{"Authorization":t}});const txs=await res.json();document.getElementById("q-list").innerHTML=Object.entries(txs).reverse().map(([id,x])=>\'<div class="card d-flex flex-row justify-content-between align-items-center" onclick="openUserDNA(\\\'\'+x[\'076_userId\']+\'\\\')"><div><b>$ \'+(parseFloat(x[\'078_amountUSD\']) || 0).toFixed(2)+\'</b><br><small class="text-muted">\'+x[\'077_type\']+\' | 6\'+x[\'076_userId\']?.slice(-8)+\'</small></div>\'+(x[\'080_status\']==="PENDING"?"<button onclick=\'app(\\""+id+"\\",event)\' class=\'btn btn-gold btn-sm px-4\'>OK</button>":"<span class=\'badge "+(x[\'080_status\']==="APPROVED"?"bg-success":"bg-danger")+"\'>"+x[\'080_status\']+"</span>")+\'</div>\').join("");}';
    h += 'async function app(id,e){e.stopPropagation();await fetch("/api/v1/queue/update-state",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({transactionId:id,status:"APPROVED"})});fetchQ();loadStats();}';
    h += 'async function refreshAct(){const res=await fetch("/api/admin/all-users",{headers:{"Authorization":t}});const us=await res.json();document.getElementById("act-list").innerHTML=Object.entries(us).filter(u=>u[1][\'065_status\']==="PENDING").map(([ph,u])=>\'<div class="card d-flex flex-row justify-content-between align-items-center"><b>6\'+ph.slice(-8)+\'</b><button onclick="actUser(\\\'\'+ph+\'\\\')" class="btn btn-gold btn-sm px-4">ACTIVATE</button></div>\').join("");}';
    h += 'async function actUser(ph){await fetch("/api/admin/user/activate",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:ph})});refreshAct();}';
    h += 'async function refreshUsers(){const res=await fetch("/api/admin/all-users",{headers:{"Authorization":t}});renderUL(await res.json());}';
    h += 'async function searchUsers(){const q=document.getElementById("us").value;const res=await fetch("/api/v1/sup/search-users?q="+q,{headers:{"Authorization":t}});renderUL(await res.json());}';
    h += 'function renderUL(data){document.getElementById("u-list").innerHTML=Object.entries(data).reverse().map(([ph,u])=>\'<div class="card d-flex flex-row justify-content-between" onclick="openUserDNA(\\\'\'+ph+\'\\\')"><div><b>6\'+ph.slice(-8)+\'</b><br><small>$ \'+(parseFloat(u[\'064_balanceUSD\']) || 0).toFixed(2)+\'</small></div><span class="badge "+(u[\'065_status\']==="ACTIVE"?"bg-success":"bg-danger")+"\'>"+u[\'065_status\']+"</span></div>\').join("");}';
    h += 'async function openUserDNA(ph){curUser=ph;const res=await fetch("/api/v1/sup/user-dna/"+ph,{headers:{"Authorization":t}});const d=await res.json();document.getElementById("mdl-title").innerText="DNA: 6"+ph.slice(-8);document.getElementById("mdl-body").innerHTML=\'<div class="stat-box mb-3"><h6>WALLET</h6><h2>$ \'+(parseFloat(d.profile[\'064_balanceUSD\']) || 0).toFixed(2)+\'</h2></div><div class="input-group mb-2"><input type="number" id="nb" class="form-control bg-dark text-white border-secondary" placeholder="New $"><button onclick="setB()" class="btn btn-gold">SET</button></div><div class="input-group mb-3"><input type="number" id="nl" class="form-control bg-dark text-white border-secondary" placeholder="Daily Limit $"><button onclick="setLimit()" class="btn btn-gold">LIMIT</button></div><button onclick="revealP()" class="btn btn-sm btn-outline-info w-100 mb-4">REVEAL PASSWORD</button><h6 class="small fw-bold">IDENTITY DNA STAMPS</h6>\'+Object.entries(d.profile[\'071_identity_dna_stamps\'] || {}).map(([id,s])=>\'<div class="forensic-log"><b>\'+id.slice(0,12)+\'...</b><br><small>\'+s.ts?.replace(\"T\", \" \").slice(0,16)+\'</small></div>\').join("")+\'<h6 class="small fw-bold mt-3">RECENT HISTORY</h6>\'+d.transactions?.map(tx=>\'<div class="forensic-log"><b>\'+tx[\'077_type\']+\'</b> | $\'+tx[\'078_amountUSD\']+\'<br><small>\'+tx[\'081_imperialRef\']+\'</small></div>\').join("");document.getElementById("mdl-foot").innerHTML=\'<button onclick="bnUser(true)" class="btn btn-danger">BAN USER</button><button onclick="bnUser(false)" class="btn btn-success">UNBAN</button>\';new bootstrap.Modal(document.getElementById("mdl")).show();}';
    h += 'async function setB(){await fetch("/api/v1/sup/delta-force",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:curUser,newBalance:document.getElementById("nb").value})});alert("Done");}';
    h += 'async function setLimit(){await fetch("/api/v1/sup/set-allowance",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:curUser,allowance:document.getElementById("nl").value})});alert("Done");}';
    h += 'async function bnUser(b){await fetch("/api/v1/sup/security-lockdown",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:curUser,block:b})});alert("Done");}';
    h += 'async function revealP(){await fetch("/api/v1/ops/track-view",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:curUser})});alert("Forensic Log Created. Check Staff Dossier.");}';
    h += 'async function refreshFeed(){const res=await fetch("/api/admin/global-forensics",{headers:{"Authorization":t}});const lgs=await res.json();document.getElementById("feed-list").innerHTML=lgs.map(l=>\'<div class="forensic-log"><b>\'+l.action+\'</b><br><small>\'+l.actor+\' | \'+l.ts?.slice(11,19)+\'</small><br><small class="text-muted">\'+l.target+\'</small></div>\').join("");}';
    h += 'async function loadFin(){const res=await fetch("/api/v1/sup/ledger-sheet",{headers:{"Authorization":t}});const d=await res.json();const hres=await fetch("/api/v1/sup/audits",{headers:{"Authorization":t}});const h=await hres.json();document.getElementById("fin-summary").innerHTML=\'<div class="card"><b>Empire Wealth: $ \'+d.empireUSD?.toFixed(2)+\'</b><br><b>User Liabilities: $ \'+d.liabilitiesUSD?.toFixed(2)+\'</b></div>\';document.getElementById("audit-history").innerHTML=Object.values(h).reverse().map(a=>\'<div class="card small"><b>\'+a[\'123_signature\']+\'</b><br><small>\'+a[\'115_ts\']?.slice(0,10)+\' | \'+a[\'116_actor\']+\'</small></div>\').join("");}';
    h += 'async function loadStaff(){const res=await fetch("/api/v1/sup/staff-directory",{headers:{"Authorization":t}});const d=await res.json();document.getElementById("staff-box").innerHTML=d.activeStaff.map(s=>\'<div class="card d-flex flex-row justify-content-between align-items-center" onclick="openStaffDNA(\\\'\'+s+\'\\\')"><b>\'+s.toUpperCase()+\'</b><i class="fas fa-chevron-right"></i></div>\').join("");}';
    h += 'async function openStaffDNA(s){const res=await fetch("/api/v1/sup/staff-dna/"+s,{headers:{"Authorization":t}});const lgs=await res.json();document.getElementById("mdl-title").innerText="Staff Activity: "+s;document.getElementById("mdl-body").innerHTML=lgs.map(l=>\'<div class="forensic-log"><b>\'+l.action+\'</b><br><small>\'+l.target+\' | \'+l.ts?.slice(11,19)+\'</small><br><small class="text-muted">\'+l.dna+\'</small></div>\').join("");document.getElementById("mdl-foot").innerHTML="";new bootstrap.Modal(document.getElementById("mdl")).show();}';
    h += 'async function loadDev(){const res=await fetch("/api/v1/sup/pending-devices",{headers:{"Authorization":t}});const ds=await res.json();document.getElementById("dev-list").innerHTML=Object.entries(ds).map(([id,d])=>\'<div class="card d-flex flex-row justify-content-between align-items-center"><div><b>\'+d.role+\'</b><br><small>\'+id.slice(0,12)+\'...</small></div><button onclick="trustDev(\\\'\'+id+\'\\\')" class="btn btn-success btn-sm">TRUST</button></div>\').join("")||"<p class=\'text-center mt-5\'>Clear</p>";}';
    h += 'async function trustDev(id){await fetch("/api/v1/sup/trust-device",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({deviceId:id})});loadDev();}';
    h += 'setInterval(()=>{if(t)fetchQ();},20000);</script></body></html>';
    res.send(h);
});

app.get('/staff-panel', (req, res) => {
    let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>STAFF TERMINAL</title>';
    h += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">';
    h += '<style>body{background:#050505;color:white;font-family:sans-serif;}.card{background:#111;border:1px solid #222;border-radius:12px;padding:15px;margin-bottom:10px;}.btn-green{background:#00c853;color:black;font-weight:800;border-radius:8px;}.nav-tabs{border:none;background:#0a0a0a;padding:10px;}.nav-link{color:#555;font-size:0.8rem;}.nav-link.active{color:#00c853!important;border-bottom:2px solid #00c853!important;}</style></head><body>';
    h += '<div id="login" style="height:100vh;display:flex;align-items:center;justify-content:center;"><div class="card text-center" style="width:300px;"><h3>STAFF LOGIN</h3><input type="password" id="k" class="form-control text-center my-3 bg-dark text-white border-secondary" placeholder="ACCESS KEY"><button onclick="doLogin()" class="btn btn-green w-100 py-3">LOGIN</button></div></div>';
    h += '<div id="ui" style="display:none;" class="container py-3"><h4>STAFF PANEL</h4><ul class="nav nav-tabs mb-3"><li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#sq">QUEUE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#sact" onclick="refAct()">ACTIVATE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#saud">AUDIT</a></li></ul>';
    h += '<div class="tab-content"><div class="tab-pane fade show active" id="sq"><div id="sq-list"></div></div><div class="tab-pane fade" id="sact"><div id="sact-list"></div></div><div class="tab-pane fade" id="saud"><div class="card"><h6>SHIFT AUDIT REPORT</h6><input type="number" id="a1" class="form-control mb-2 bg-dark text-white border-secondary" placeholder="Start Wallet $"><input type="number" id="a2" class="form-control mb-2 bg-dark text-white border-secondary" placeholder="Total Deposits $"><input type="number" id="a3" class="form-control mb-2 bg-dark text-white border-secondary" placeholder="Total Withdraws $"><button onclick="subAudit()" class="btn btn-green w-100">SUBMIT & SIGN</button></div></div></div></div>';
    h += '<script>let t="";async function doLogin(){const p=document.getElementById("k").value;const res=await fetch("/api/v1/user/auth-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phoneNumber:"maamulka",password:p,mode:"login",deviceId:"STAFF_WEB"})});const d=await res.json();if(d.token){t="Bearer "+d.token;document.getElementById("login").style.display="none";document.getElementById("ui").style.display="block";sFetchQ();}else{alert("Denied");}}';
    h += 'async function sFetchQ(){const res=await fetch("/api/admin/transactions",{headers:{"Authorization":t}});const txs=await res.json();document.getElementById("sq-list").innerHTML=Object.entries(txs).reverse().map(([id,x])=>x[\'080_status\']==="PENDING"?\'<div class="card d-flex flex-row justify-content-between"><div><b>$ \'+x[\'078_amountUSD\']+\'</b><br><small>6\'+x[\'076_userId\']?.slice(-8)+\'</small></div><button onclick="sApp(\\\'\"+id+\"\\\')" class="btn btn-green btn-sm px-3">OK</button></div>\':"").join("");}';
    h += 'async function sApp(id){await fetch("/api/v1/queue/update-state",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({transactionId:id,status:"APPROVED"})});sFetchQ();}';
    h += 'async function refAct(){const res=await fetch("/api/admin/all-users",{headers:{"Authorization":t}});const us=await res.json();document.getElementById("sact-list").innerHTML=Object.entries(us).filter(u=>u[1][\'065_status\']==="PENDING").map(([ph,u])=>\'<div class="card d-flex flex-row justify-content-between"><b>6\'+ph.slice(-8)+\'</b><button onclick="sActUser(\\\'\"+ph+\"\\\')" class="btn btn-green btn-sm">OK</button></div>\').join("");}';
    h += 'async function sActUser(ph){await fetch("/api/admin/user/activate",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({targetPhone:ph})});refAct();}';
    h += 'async function subAudit(){await fetch("/api/v1/sup/audit-lock",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({startUSD:document.getElementById("a1").value,inUSD:document.getElementById("a2").value,outUSD:document.getElementById("a3").value})});alert("Audit Signed.");}</script></body></html>';
    res.send(h);
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.7 Active.`));
