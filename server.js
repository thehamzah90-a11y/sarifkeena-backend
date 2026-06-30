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
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ v1.9.6 SUPREME EMPIRE READY.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const getNextImperialRef = async () => {
    const ref = db.ref('ledger/receipt_counter');
    const result = await ref.transaction((current) => (current || 0) + 1);
    return "#" + result.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedBalance = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const logBalanceChange = async (phoneNumber, amountUSD, type, oldBal, newBal, reason, actor) => {
    if (!db) return;
    const event = { ts: new Date().toISOString(), amountUSD, type, oldBal, newBal, reason, actor };
    await db.ref(`ledger/balance_logs/${phoneNumber}`).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: `BAL_${type}` });
};

const logForensic = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const entry = {
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? (req.user.deviceId || "WEB") : "UNK",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(`staff_activity/${req.user.phoneNumber}`).push().set(entry);
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
            const trustSnap = await db.ref('config/trusted_devices').once('value');
            const trusted = trustSnap.val() || {};
            const isTrustEmpty = Object.keys(trusted).length === 0;

            if (!isTrustEmpty) {
                if (!trusted[user.deviceId]) {
                    return res.status(403).json({ message: "Untrusted Device DNA" });
                }
            }
        }
        req.user = user;
        next();
    });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Denied" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- MASTER VAULT ---
app.get('/master-vault', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>SARIFKEENA MASTER VAULT</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root { --master-gold: #ffc107; --supreme-green: #00c853; --dark-bg: #050505; --card-bg: #111; }
            body { background: var(--dark-bg); color: #f0f0f0; font-family: -apple-system, system-ui, sans-serif; }
            .glass-card { background: var(--card-bg); border: 1px solid #222; border-radius: 16px; padding: 15px; margin-bottom: 12px; }
            .btn-master { background: var(--master-gold); color: black; border: none; font-weight: 800; border-radius: 10px; }
            .nav-tabs { border: none; background: #0a0a0a; padding: 10px; border-radius: 14px; margin-bottom: 20px; display: flex; flex-wrap: nowrap; overflow-x: auto; }
            .nav-link { color: #555; border: none !important; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
            .nav-link.active { color: var(--master-gold) !important; background: transparent !important; border-bottom: 2px solid var(--master-gold) !important; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #1a1a00, #000); }
            input { background: #151515 !important; border: 1px solid #333 !important; color: white !important; }
            .forensic-log { font-size: 0.7rem; border-left: 3px solid var(--master-gold); padding: 8px; background: #0a0a0a; margin-bottom: 5px; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="glass-card text-center" style="width: 320px;">
                <h2 style="font-weight: 900; color: var(--master-gold);">MASTER<br><span style="color:white; font-size: 0.8rem;">VAULT ACCESS</span></h2>
                <input type="password" id="key" class="form-control text-center my-4" placeholder="MASTER KEY">
                <button onclick="login()" class="btn btn-master w-100 py-3">UNLOCK SYSTEM</button>
                <div id="err" class="text-danger mt-3 small fw-bold"></div>
            </div>
        </div>

        <div id="main-ui" style="display:none;">
            <div class="container-fluid py-3">
                <ul class="nav nav-tabs shadow-sm" role="tablist">
                    <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-q">QUEUE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-act" onclick="refreshActivations()">ACTIVATE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-f" onclick="refreshFeed()">FEED</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-finance" onclick="loadFinance()">FINANCE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-staff" onclick="loadStaff()">STAFF</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-d" onclick="refreshDevices()">DEVICES</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-frauds" onclick="loadFrauds()">FRAUDS</a></li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active" id="tab-q"><div id="q-list"></div></div>
                    <div class="tab-pane fade" id="tab-act"><div id="act-list"></div></div>
                    <div class="tab-pane fade" id="tab-f"><div id="feed-list"></div></div>
                    <div class="tab-pane fade" id="tab-finance"><div id="fin-box"></div></div>
                    <div class="tab-pane fade" id="tab-staff"><div id="staff-box"></div></div>
                    <div class="tab-pane fade" id="tab-d">
                        <div class="glass-card d-flex justify-content-between mb-4">
                            <b>DNA REGISTRY STATUS</b>
                            <button onclick="lockRegistry()" class="btn btn-sm btn-outline-danger" id="reg-lock-btn">LOCK REGISTRY</button>
                        </div>
                        <div id="dev-list"></div>
                    </div>
                    <div class="tab-pane fade" id="tab-frauds"><div id="fraud-list"></div></div>
                </div>
            </div>
        </div>

        <script>
            let token = "";
            async function login() {
                const pass = document.getElementById('key').value;
                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: 'eesi', password: pass, mode: 'login', deviceId: 'MASTER_WEB'})
                });
                const d = await res.json();
                if(d.token && d.role === 'MASTER') {
                    token = "Bearer " + d.token;
                    document.getElementById('login-screen').style.display='none';
                    document.getElementById('main-ui').style.display='block';
                    fetchQueue();
                } else { document.getElementById('err').innerText = "DENIED: MASTER ONLY"; }
            }
            async function fetchQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('q-list').innerHTML = Object.entries(txs).reverse().map(([id, t]) =>
                    \`<div class="glass-card d-flex justify-content-between align-items-center">
                        <div><b>$ \${t.amountUSD}</b><br><small class="text-muted">\${t.type} | 6\${t.userId?.slice(-8)}</small><br><span class="badge \${t.status==='APPROVED'?'bg-success':'bg-warning'}">\${t.status}</span></div>
                        \${t.status==='PENDING' ? \`<button onclick="approve('\${id}')" class="btn btn-master btn-sm px-4">OK</button>\` : ''}
                    </div>\`).join('') || '<p class="text-center mt-5">Vault Clear</p>';
            }
            async function approve(id) {
                await fetch('/api/v1/queue/update-state', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({transactionId:id, status:'APPROVED'})});
                fetchQueue();
            }
            async function refreshFeed() {
                const res = await fetch('/api/admin/global-forensics', {headers: {'Authorization': token}});
                const logs = await res.json();
                document.getElementById('feed-list').innerHTML = logs.map(l => \`<div class="forensic-log"><b>\${l.action}</b><br><small>\${l.actor} | \${l.target || 'System'}</small></div>\`).join('');
            }
            async function loadFinance() {
                const res = await fetch('/api/v1/sup/ledger-sheet', {headers:{'Authorization':token}});
                const d = await res.json();
                document.getElementById('fin-box').innerHTML = \`
                    <div class="glass-card text-center"><div class="text-muted small">EMPIRE BALANCE</div><h2 class="text-success">$ \${d.empireUSD?.toFixed(2)}</h2></div>
                    <div class="glass-card text-center"><div class="text-muted small">USER LIABILITIES</div><h2 class="text-danger">$ \${d.liabilitiesUSD?.toFixed(2)}</h2></div>\`;
            }
            async function loadStaff() {
                const res = await fetch('/api/v1/sup/staff-directory', {headers:{'Authorization':token}});
                const d = await res.json();
                document.getElementById('staff-box').innerHTML = d.activeStaff.map(s => \`
                    <div class="glass-card d-flex justify-content-between align-items-center" onclick="loadStaffDna('\${s}')">
                        <b>\${s}</b><i class="fas fa-chevron-right"></i>
                    </div>\`).join('');
            }
            async function loadStaffDna(ph) {
                const res = await fetch('/api/v1/sup/staff-dna/'+ph, {headers:{'Authorization':token}});
                const logs = await res.json();
                alert("Dossier for "+ph+": "+logs.length+" actions today.");
            }
            async function refreshDevices() {
                const res = await fetch('/api/v1/sup/pending-devices', {headers: {'Authorization': token}});
                const devs = await res.json();
                document.getElementById('dev-list').innerHTML = Object.entries(devs).map(([id, d]) => \`
                    <div class="glass-card d-flex justify-content-between align-items-center">
                        <div><b>\${d.role} DNA Attempt</b><br><small class="text-muted">DNA: \${id.slice(0,12)}...</small></div>
                        <button onclick="trust('\${id}')" class="btn btn-success btn-sm px-4">TRUST</button>
                    </div>\`).join('') || '<p class="text-center mt-5">No Pending DNA</p>';
            }
            async function trust(id) { await fetch('/api/v1/sup/trust-device', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({deviceId:id})}); refreshDevices(); }
            async function loadFrauds() {
                const res = await fetch('/api/admin/fraud-alerts', {headers:{'Authorization':token}});
                const alerts = await res.json();
                document.getElementById('fraud-list').innerHTML = Object.values(alerts).map(a => \`
                    <div class="glass-card border-danger"><b>\${a.type}</b><br><small>\${a.details}</small></div>\`).join('') || '<p class="text-center mt-5">System Safe</p>';
            }
            setInterval(() => { if(token) fetchQueue(); }, 20000);
        </script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `);
});

// --- STAFF PANEL ---
app.get('/staff-panel', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>STAFF TERMINAL</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #050505; color: white; font-family: sans-serif; }
            .glass-card { background: #111; border: 1px solid #222; border-radius: 16px; padding: 15px; margin-bottom: 10px; }
            .btn-supreme { background: #00c853; color: black; font-weight: 800; border-radius: 10px; }
            .nav-tabs { border: none; background: #0a0a0a; padding: 10px; border-radius: 14px; margin-bottom: 20px; }
            .nav-link { color: #555; border: none !important; font-size: 0.8rem; font-weight: 700; }
            .nav-link.active { color: #00c853 !important; background: transparent !important; border-bottom: 2px solid #00c853 !important; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
            input { background: #151515 !important; border: 1px solid #333 !important; color: white !important; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="glass-card text-center" style="width: 320px;">
                <h2 style="font-weight: 900; color: #00c853;">STAFF<br><span style="color:white; font-size: 0.8rem;">PANEL ACCESS</span></h2>
                <input type="password" id="key" class="form-control text-center my-4" placeholder="ACCESS KEY">
                <button onclick="login()" class="btn btn-supreme w-100 py-3">ENTER TERMINAL</button>
                <div id="err" class="text-danger mt-3 small fw-bold"></div>
            </div>
        </div>

        <div id="main-ui" style="display:none;">
            <div class="container-fluid py-3">
                <ul class="nav nav-tabs" role="tablist">
                    <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#q">QUEUE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#act" onclick="refreshActivations()">ACTIVATE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-search" onclick="refreshUsers()">SEARCH</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#audit">AUDIT</a></li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane show active" id="q"><div id="q-list"></div></div>
                    <div class="tab-pane" id="act"><div id="act-list"></div></div>
                    <div class="tab-pane" id="tab-search">
                         <div class="d-flex gap-2 mb-3"><input type="text" id="s" class="form-control"><button onclick="doSearch()" class="btn btn-supreme">SEARCH</button></div>
                         <div id="u-list"></div>
                    </div>
                    <div class="tab-pane" id="audit">
                        <div class="glass-card">
                            <h6 class="mb-3">6-FIELD SHIFT LOCK</h6>
                            <input type="number" id="a1" class="form-control mb-2" placeholder="Start USD">
                            <input type="number" id="a2" class="form-control mb-2" placeholder="In USD">
                            <input type="number" id="a3" class="form-control mb-2" placeholder="Out USD">
                            <input type="number" id="a4" class="form-control mb-2" placeholder="Liabilities USD">
                            <input type="number" id="a5" class="form-control mb-2" placeholder="Staff Cash (SLSH)">
                            <button onclick="lockAudit()" class="btn btn-supreme w-100">SUBMIT & LOCK</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let token = "";
            async function login() {
                const pass = document.getElementById('key').value;
                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: 'maamulka', password: pass, mode: 'login', deviceId: 'STAFF_WEB'})
                });
                const d = await res.json();
                if(d.token && d.role === 'SUPPORT') {
                    token = "Bearer " + d.token;
                    document.getElementById('login-screen').style.display='none';
                    document.getElementById('main-ui').style.display='block';
                    fetchQueue();
                } else { document.getElementById('err').innerText = "DENIED: STAFF ONLY"; }
            }
            async function fetchQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('q-list').innerHTML = Object.entries(txs).reverse().map(([id, t]) =>
                    t.status==='PENDING' ? \`<div class="glass-card d-flex justify-content-between align-items-center"><div><b>$ \${t.amountUSD}</b><br><small>\${t.type}</small></div><button onclick="approve('\${id}')" class="btn btn-supreme btn-sm">OK</button></div>\` : '').join('');
            }
            async function approve(id) { await fetch('/api/v1/queue/update-state', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({transactionId:id, status:'APPROVED'})}); fetchQueue(); }
            async function refreshActivations() {
                const res = await fetch('/api/admin/all-users', {headers: {'Authorization': token}});
                const users = await res.json();
                document.getElementById('act-list').innerHTML = Object.entries(users).filter(u => u[1].status === 'PENDING').map(([ph, u]) => \`
                    <div class="glass-card d-flex justify-content-between align-items-center"><b>6\${ph.slice(-8)}</b><button onclick="act('\${ph}')" class="btn btn-supreme btn-sm">ACTIVATE</button></div>\`).join('');
            }
            async function act(ph) { await fetch('/api/admin/user/activate', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({targetPhone:ph})}); refreshActivations(); }
            async function lockAudit() { alert('Shift Saved'); location.reload(); }
            setInterval(() => { if(token) fetchQueue(); }, 30000);
        </script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `);
});

// --- CORE API REGISTRY (42 APIs - REMAINDER) ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const configSnap = await db.ref('config').once('value');
        const config = configSnap.val() || {};

        if (deviceId && !config.registryLocked) {
            if (phoneNumber === 'eesi' || phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2' || phoneNumber === 'sensor_primary') {
                await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
            }
        }

        if (phoneNumber === 'eesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token, role: 'MASTER' });
        }
        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = (phoneNumber === 'maamulka') ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) {
            const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'LISTENER' });
        }

        const cleanPhone = normalizePhone(phoneNumber);
        const userRef = db.ref('users/' + cleanPhone);
        const snap = await userRef.once('value');
        const user = snap.val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ phoneNumber: cleanPhone, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING" });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: cleanPhone, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(100).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(50).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => {
    const ph = normalizePhone(req.params.phone);
    const u = await db.ref('users/' + ph).once('value');
    const tx = await db.ref('transactions').orderByChild('userId').equalTo(ph).limitToLast(10).once('value');
    res.json({ profile: u.val(), transactions: Object.values(tx.val() || {}).reverse() });
});

app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => {
    const vSnap = await db.ref('ledger/verified_balance').once('value');
    const uSnap = await db.ref('users').once('value');
    const users = Object.values(uSnap.val() || {});
    const totalLiab = users.reduce((sum, u) => sum + (u.balance || 0), 0);
    res.json({ empireUSD: parseFloat(vSnap.val() || 0), liabilitiesUSD: totalLiab });
});

app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('staff_activity').once('value');
    res.json({ activeStaff: Object.keys(snap.val() || {}) });
});

app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref(\`staff_activity/\${req.params.phone}\`).limitToLast(100).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('config/pending_devices').once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => {
    const { deviceId } = req.body;
    const snap = await db.ref('config/pending_devices/' + deviceId).once('value');
    if (snap.val()) {
        await db.ref('config/trusted_devices/' + deviceId).set(snap.val());
        await db.ref('config/pending_devices/' + deviceId).remove();
        res.json({ message: "OK" });
    } else res.status(404).send("Err");
});

app.get('/api/admin/fraud-alerts', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('fraud_alerts').limitToLast(50).once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txSnap = await txRef.once('value');
    const txData = txSnap.val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const uRef = db.ref('users/' + txData.userId);
        const uSnap = await uRef.once('value');
        const oldBal = uSnap.val().balance || 0;
        const isIntake = !txData.type.toLowerCase().includes("withdraw");
        const nBal = isIntake ? oldBal + txData.amountUSD : oldBal - txData.amountUSD;
        const iRef = await getNextImperialRef();
        await uRef.update({ balance: nBal });
        await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber, prevBalance: oldBal, newBalance: nBal, imperialRef: iRef });
        await updateVerifiedBalance(txData.amountUSD, isIntake ? 'ADD' : 'SUB');
        await logForensic(req, "APPROVE_TX", txData.userId, { amount: txData.amountUSD });
    }
    res.json({ message: "OK" });
});

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' });
    await logForensic(req, "ACTIVATE_USER", req.body.targetPhone);
    res.json({ message: "OK" });
});

app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 SUPREME ACTIVE.`));
