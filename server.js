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
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE (Sarifkeena Restored).");
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
            dna: req.user ? (req.user.ip || "WEB") : "UNK",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(`staff_activity/${req.user.phoneNumber}`).push().set(entry);
        }
    } catch (e) {}
};

// --- AUTH MIDDLEWARE (WITH DYNAMIC TRUST WALL) ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.sendStatus(403);

        if (user.role === 'MASTER' || user.role === 'SUPPORT') {
            const trustSnap = await db.ref('config/trusted_devices').once('value');
            const trusted = trustSnap.val() || {};
            const isTrustEmpty = Object.keys(trusted).length === 0;

            // --- THE TRUST WALL LOGIC ---
            // If at least one device is trusted, start strict DNA check.
            // If list is empty, allow password-only bypass.
            if (!isTrustEmpty) {
                const currentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                if (user.ip !== currentIp && !trusted[user.deviceId]) {
                    console.log("🛑 SECURITY ALERT: Untrusted Device Blocked!");
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
    else res.status(403).json({ message: "Staff Only" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- WEB PANEL (REFINED WITH DEVICES TAB) ---
app.get('/supreme-control', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>SARIFKEENA SUPREME CONTROL</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            :root { --supreme-green: #00c853; --dark-bg: #050505; --card-bg: #111; --border-color: #222; }
            body { background: var(--dark-bg); color: #f0f0f0; font-family: -apple-system, system-ui, sans-serif; }
            .glass-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 15px; margin-bottom: 12px; }
            .btn-supreme { background: var(--supreme-green); color: black; border: none; font-weight: 800; border-radius: 10px; }
            .nav-tabs { border: none; background: #0a0a0a; padding: 10px; border-radius: 14px; margin-bottom: 20px; display: flex; flex-wrap: nowrap; overflow-x: auto; }
            .nav-link { color: #555; border: none !important; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
            .nav-link.active { color: var(--supreme-green) !important; background: transparent !important; border-bottom: 2px solid var(--supreme-green) !important; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #111, #000); }
            input { background: #151515 !important; border: 1px solid #333 !important; color: white !important; }
            .forensic-log { font-size: 0.7rem; border-left: 3px solid var(--supreme-green); padding: 8px; background: #0a0a0a; margin-bottom: 5px; }
            .badge-usd { background: rgba(0, 200, 83, 0.1); color: var(--supreme-green); border: 1px solid var(--supreme-green); }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="container" style="max-width: 350px;">
                <div class="glass-card text-center shadow-lg">
                    <h2 class="mb-4" style="font-weight: 900;">SARIF<span style="color: var(--supreme-green);">KEENA</span></h2>
                    <input type="password" id="key" class="form-control text-center mb-3 py-3" placeholder="ENTER ACCESS KEY">
                    <button onclick="doLogin()" id="login-btn" class="btn btn-supreme w-100 py-3">OPEN EMPIRE</button>
                    <div id="login-err" class="text-danger mt-3 small fw-bold"></div>
                </div>
            </div>
        </div>

        <div id="main-ui" style="display:none;">
            <div class="container-fluid py-3">
                <header class="d-flex justify-content-between align-items-center mb-3 px-2">
                    <h4 style="font-weight: 900; font-size: 1.1rem;">SUPREME <span style="color: var(--supreme-green);">v1.9.6</span></h4>
                    <button onclick="location.reload()" class="btn btn-outline-danger btn-sm px-3"><i class="fas fa-power-off"></i></button>
                </header>

                <ul class="nav nav-tabs shadow-sm" role="tablist">
                    <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-q">QUEUE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-d" onclick="refreshDevices()">DEVICES</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-u" onclick="refreshUsers()">USERS</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-f" onclick="refreshFeed()">FEED</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-a" onclick="loadAudit()">AUDIT</a></li>
                    <li class="nav-item" id="nav-master" style="display:none;"><a class="nav-link" data-bs-toggle="tab" href="#tab-m">MASTER</a></li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="tab-q"><div id="queue-list"></div></div>
                    <div class="tab-pane fade" id="tab-d"><div id="device-list"></div></div>
                    <div class="tab-pane fade" id="tab-u">
                        <div class="d-flex gap-2 mb-3"><input type="text" id="user-search" class="form-control" placeholder="Search phone..."><button onclick="doSearch()" class="btn btn-supreme px-3"><i class="fas fa-search"></i></button></div>
                        <div id="users-list"></div>
                    </div>
                    <div class="tab-pane fade" id="tab-f"><div id="feed-list"></div></div>
                    <div class="tab-pane fade" id="tab-a">
                        <div class="glass-card">
                            <h6 class="fw-bold mb-3">SHIFT RECONCILIATION</h6>
                            <input type="number" id="aud-start" class="form-control mb-2" placeholder="Start Bal $">
                            <input type="number" id="aud-liab" class="form-control mb-2" placeholder="Liabilities $">
                            <button onclick="lockAudit()" class="btn btn-supreme w-100 py-2">SIGN & LOCK SHIFT</button>
                        </div>
                    </div>
                    <div class="tab-pane fade" id="tab-m">
                        <div class="glass-card">
                           <button onclick="toggleGhost()" class="btn btn-outline-warning w-100 mb-2">TOGGLE GHOST MODE</button>
                           <button onclick="resetSeq()" class="btn btn-outline-light w-100">RESET SERIAL TO #000001</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        <script>
            let token = "";
            async function doLogin() {
                const pass = document.getElementById('key').value;
                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: 'maamulka', password: pass, mode: 'login', deviceId: 'WEB_PANEL'})
                });
                const d = await res.json();
                if(d.token) {
                    token = "Bearer " + d.token;
                    document.getElementById('login-screen').style.display='none';
                    document.getElementById('main-ui').style.display='block';
                    if(d.role==='MASTER') document.getElementById('nav-master').style.display='block';
                    fetchQueue();
                } else { document.getElementById('login-err').innerText = "DENIED"; }
            }

            async function refreshDevices() {
                const res = await fetch('/api/v1/sup/pending-devices', {headers: {'Authorization': token}});
                const devs = await res.json();
                document.getElementById('device-list').innerHTML = Object.entries(devs).map(([id, d]) => \`
                    <div class="glass-card d-flex justify-content-between align-items-center">
                        <div><b>\${d.role} Login Attempt</b><br><small class="text-muted">DNA: \${id.slice(0,12)}...</small></div>
                        <button onclick="trustDevice('\${id}')" class="btn btn-supreme btn-sm px-4">TRUST</button>
                    </div>\`).join('') || '<p class="text-center mt-5 text-muted">No pending devices</p>';
            }

            async function trustDevice(id) {
                await fetch('/api/v1/sup/trust-device', {
                    method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify({deviceId: id})
                });
                refreshDevices();
            }

            async function fetchQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('queue-list').innerHTML = Object.entries(txs).reverse().map(([id, t]) =>
                    t.status==='PENDING' ? \`<div class="glass-card d-flex justify-content-between align-items-center"><div><b>$ \${t.amountUSD}</b><br><small class="text-muted">\${t.type} | 6\${t.userId?.slice(-8)}</small></div><button onclick="approve('\${id}')" class="btn btn-supreme btn-sm px-4">OK</button></div>\` : '').join('');
            }

            async function approve(id) {
                await fetch('/api/v1/queue/update-state', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({transactionId:id, status:'APPROVED'})});
                fetchQueue();
            }

            setInterval(() => { if(token) fetchQueue(); }, 15000);
        </script>
    </body>
    </html>
    `);
});

// --- API REGISTRY ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Log all attempts to pending_devices node
        if (deviceId && (phoneNumber === 'geesi' || phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2')) {
            await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
        }

        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token, role: 'MASTER' });
        }
        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = (phoneNumber === 'maamulka') ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }
        // ... (User login same)
        res.status(401).send("Fail");
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

// 41. View Pending Devices
app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('config/pending_devices').once('value');
    res.json(snap.val() || {});
});

// 42. Trust Device (Blessing)
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => {
    const { deviceId } = req.body;
    const snap = await db.ref('config/pending_devices/' + deviceId).once('value');
    if (snap.val()) {
        await db.ref('config/trusted_devices/' + deviceId).set(snap.val());
        await db.ref('config/pending_devices/' + deviceId).remove();
        res.json({ message: "OK" });
    } else res.status(404).send("Not found");
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 Active (42 APIs).`));
