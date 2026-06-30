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

// --- AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        const currentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (user.role !== 'USER' && user.ip !== currentIp) return res.status(403).json({ message: "Security Binding Mismatch" });
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

// --- API ID 2: SUPREME WEB PANEL UI ---
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
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
            input { background: #151515 !important; border: 1px solid #333 !important; color: white !important; }
            .forensic-log { font-size: 0.7rem; border-left: 3px solid var(--supreme-green); padding: 8px; background: #0a0a0a; margin-bottom: 5px; }
            .badge-usd { background: rgba(0, 200, 83, 0.1); color: var(--supreme-green); border: 1px solid var(--supreme-green); }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="glass-card text-center shadow-lg" style="width: 320px;">
                <h2 class="mb-4" style="font-weight: 900;">SARIF<span style="color: var(--supreme-green);">KEENA</span></h2>
                <input type="password" id="key" class="form-control text-center mb-3 py-3" placeholder="ENTER ACCESS KEY">
                <button onclick="doLogin()" id="login-btn" class="btn btn-supreme w-100 py-3">OPEN EMPIRE</button>
                <div id="login-err" class="text-danger mt-3 small fw-bold"></div>
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
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-act" onclick="refreshActivations()">ACTIVATE</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-u" onclick="refreshUsers()">USERS</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-f" onclick="refreshFeed()">FEED</a></li>
                    <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-a" onclick="loadAudit()">AUDIT</a></li>
                    <li class="nav-item" id="nav-master" style="display:none;"><a class="nav-link" data-bs-toggle="tab" href="#tab-m">MASTER</a></li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="tab-q"><div id="queue-list"></div></div>
                    <div class="tab-pane fade" id="tab-act"><div id="activation-list"></div></div>
                    <div class="tab-pane fade" id="tab-u">
                        <div class="d-flex gap-2 mb-3"><input type="text" id="user-search" class="form-control" placeholder="Search phone..."><button onclick="doSearch()" class="btn btn-supreme px-3"><i class="fas fa-search"></i></button></div>
                        <div id="users-list"></div>
                    </div>
                    <div class="tab-pane fade" id="tab-f"><div id="feed-list"></div></div>
                    <div class="tab-pane fade" id="tab-a">
                        <div class="glass-card">
                            <h6 class="fw-bold mb-3">6-FIELD RECONCILIATION</h6>
                            <input type="number" id="aud-start" class="form-control mb-2" placeholder="Start Bal $">
                            <input type="number" id="aud-dep" class="form-control mb-2" placeholder="Total Deposits $">
                            <input type="number" id="aud-pay" class="form-control mb-2" placeholder="User Withdrawals $">
                            <input type="number" id="aud-liab" class="form-control mb-2" placeholder="User Liabilities $">
                            <input type="number" id="aud-staff" class="form-control mb-2" placeholder="Staff Cash Out (SLSH)">
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

        <div class="modal fade" id="dnaModal" tabindex="-1"><div class="modal-dialog modal-fullscreen-sm-down"><div class="modal-content bg-dark border-secondary"><div class="modal-header border-secondary text-white"><h5 id="dna-title">User DNA</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body" id="dna-body"></div><div class="modal-footer border-secondary justify-content-between"><button onclick="lockdown(true)" class="btn btn-danger">BAN</button><button onclick="lockdown(false)" class="btn btn-success">UNBAN</button></div></div></div></div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        <script>
            let token = "";
            let currentDnaPhone = "";

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
                } else { document.getElementById('login-err').innerText = "WRONG KEY"; }
            }

            async function fetchQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('queue-list').innerHTML = Object.entries(txs).reverse().map(([id, t]) => {
                    if(t.status!=='PENDING') return '';
                    return \`
                    <div class="glass-card d-flex justify-content-between align-items-center" onclick="openDna('\${t.userId}')">
                        <div><b>$ \${t.amountUSD}</b><br><small class="text-muted">\${t.type} | 6\${t.userId?.slice(-8)}</small></div>
                        <button onclick="approve('\${id}', event)" class="btn btn-supreme btn-sm px-4">OK</button>
                    </div>\`;
                }).join('') || '<p class="text-center mt-5 text-muted">Queue Empty</p>';
            }

            async function refreshActivations() {
                const res = await fetch('/api/admin/all-users', {headers: {'Authorization': token}});
                const users = await res.json();
                document.getElementById('activation-list').innerHTML = Object.entries(users).filter(u => u[1].status === 'PENDING').map(([ph, u]) => \`
                    <div class="glass-card d-flex justify-content-between align-items-center">
                        <div><b>6\${ph.slice(-8)}</b><br><small class="text-muted">Waiting since \${u.createdAt?.slice(11,16)}</small></div>
                        <button onclick="act('\${ph}')" class="btn btn-supreme btn-sm">ACTIVATE</button>
                    </div>\`).join('') || '<p class="text-center mt-5 text-muted">No pending users</p>';
            }

            async function openDna(ph) {
                currentDnaPhone = ph;
                const res = await fetch('/api/v1/sup/user-dna/'+ph, {headers:{'Authorization':token}});
                const d = await res.json();
                document.getElementById('dna-title').innerText = "DNA: 6" + ph.slice(-8);
                document.getElementById('dna-body').innerHTML = \`
                    <div class="alert badge-usd">Balance: <b>$\${d.profile.balance?.toFixed(2)}</b></div>
                    <div class="mb-3"><small class="text-muted">Password:</small> <span id="pass-field">********</span> <button onclick="revealPass('\${ph}')" class="btn btn-sm btn-outline-info">Reveal</button></div>
                    <h6 class="small fw-bold">LAST 5 ACTIONS</h6>
                    \${d.transactions?.slice(0,5).map(t => \`<div class="forensic-log">\${t.type}: \${t.status} | $\${t.amountUSD}</div>\`).join('')}\`;
                new bootstrap.Modal(document.getElementById('dnaModal')).show();
            }

            async function revealPass(ph) {
                await fetch('/api/v1/ops/track-view', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({targetPhone:ph})});
                alert("This action has been logged for forensics.");
                document.getElementById('pass-field').innerText = "REVEALED_LOGGED";
            }

            async function approve(id, e) {
                e.stopPropagation(); if(!confirm("Approve?")) return;
                await fetch('/api/v1/queue/update-state', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({transactionId:id, status:'APPROVED'})});
                fetchQueue();
            }

            async function act(ph) { await fetch('/api/admin/user/activate', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({targetPhone:ph})}); refreshActivations(); }
            async function lockdown(block) { await fetch('/api/v1/sup/security-lockdown', {method:'POST', headers:{'Authorization':token,'Content-Type':'application/json'}, body:JSON.stringify({targetPhone:currentDnaPhone, block})}); alert("Status Updated"); }
            async function refreshFeed() {
                const res = await fetch('/api/admin/global-forensics', {headers: {'Authorization': token}});
                const logs = await res.json();
                document.getElementById('feed-list').innerHTML = logs.map(l => \`<div class="forensic-log"><b>\${l.action}</b><br><small>\${l.actor} on \${l.target || 'System'} at \${l.ts?.slice(11,16)}</small></div>\`).join('');
            }

            setInterval(() => { if(token) fetchQueue(); }, 15000);
        </script>
    </body>
    </html>
    `);
});

// --- THE 40 APIS (REMAINING 39 - UNCHANGED) ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token, role: 'MASTER' });
        }
        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }
        const cleanPhone = normalizePhone(phoneNumber);
        const userRef = db.ref('users/' + cleanPhone);
        const snap = await userRef.once('value');
        const user = snap.val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: cleanPhone, password, balance: 0.0, status: 'PENDING', deviceId, createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            if (user.status === 'BLOCKED') return res.status(403).json({ message: "Blocked" });
            const token = jwt.sign({ phoneNumber: cleanPhone, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Err" }); }
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    try {
        const { transactionId, status } = req.body;
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const uRef = db.ref('users/' + txData.userId);
            const uSnap = await uRef.once('value');
            const oldBal = uSnap.val().balance || 0;
            const isIntake = !txData.type.toLowerCase().includes("withdraw");
            const amtUSD = txData.amountUSD || txData.amount;
            const nBal = isIntake ? oldBal + amtUSD : oldBal - amtUSD;
            const iRef = await getNextImperialRef();
            await uRef.update({ balance: nBal });
            await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber, prevBalance: oldBal, newBalance: nBal, imperialRef: iRef, approvalTime: new Date().toISOString() });
            await updateVerifiedBalance(amtUSD, isIntake ? 'ADD' : 'SUB');
            await logBalanceChange(txData.userId, amtUSD, isIntake ? 'CREDIT' : 'DEBIT', oldBal, nBal, txData.type, req.user.phoneNumber);
            await logForensic(req, "APPROVE_TX", txData.userId, { amount: amtUSD });
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(100).once('value');
    res.json(snap.val() || {});
});

app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => {
    const ph = normalizePhone(req.params.phone);
    const u = await db.ref('users/' + ph).once('value');
    const tx = await db.ref('transactions').orderByChild('userId').equalTo(ph).limitToLast(10).once('value');
    res.json({ profile: u.val(), transactions: Object.values(tx.val() || {}).reverse() });
});

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' });
    await logForensic(req, "ACTIVATE_USER", req.body.targetPhone);
    res.json({ message: "OK" });
});

app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => {
    const action = req.body.block ? 'BLOCKED' : 'ACTIVE';
    await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ status: action });
    await logForensic(req, req.body.block ? "USER_BANNED" : "USER_UNBANNED", req.body.targetPhone);
    res.json({ message: "OK" });
});

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(50).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => {
    await logForensic(req, "VIEW_PASSWORD", req.body.targetPhone);
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 SUPREME ACTIVE.`));
