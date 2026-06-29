const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

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
        console.log("✅ v1.9.6 SUPREME READY.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const verifySignature = (data, signature, publicKey) => {
    try {
        const verifier = crypto.createVerify('sha256');
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, signature, 'hex');
    } catch (e) { return false; }
};

const getVerifiedBalance = async () => {
    const snap = await db.ref('ledger/verified_balance').once('value');
    return parseFloat(snap.val() || 0);
};

const updateVerifiedBalance = async (amount, type = 'ADD') => {
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + amount : val - amount;
    });
};

const logBalanceChange = async (phoneNumber, amount, type, oldBal, newBal, reason, actor) => {
    const event = { ts: new Date().toISOString(), amount, type, oldBal, newBal, reason, actor };
    await db.ref(`ledger/balance_logs/${phoneNumber}`).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: `BAL_${type}` });
};

const logForensic = async (req, action, target, details = {}) => {
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
    } catch (e) {}
};

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
    else res.status(403).json({ message: "Forbidden" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- WEB PANEL ---
app.get('/supreme-control', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>SUPREME DASHBOARD</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            body { background: #050505; color: #f0f0f0; font-family: sans-serif; }
            .glass-card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
            .btn-supreme { background: #00c853; color: black; border: none; font-weight: 800; border-radius: 8px; }
            .nav-tabs { border: none; background: #111; padding: 5px; border-radius: 10px; }
            .nav-link { color: #555; border: none !important; font-weight: 700; }
            .nav-link.active { color: #00c853 !important; background: transparent !important; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="glass-card text-center" style="width: 320px;">
                <h3 class="mb-4" style="color: #00c853; font-weight: 900;">SARIFKEENNA</h3>
                <input type="password" id="key" class="form-control text-center mb-3 bg-dark text-white border-secondary" placeholder="ACCESS KEY">
                <button onclick="login()" class="btn btn-supreme w-100 py-3">LOGIN</button>
            </div>
        </div>

        <div id="dashboard" style="display:none;" class="container py-3">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 style="font-weight: 900;">SUPREME <span style="color: #00c853;">v1.9.6</span></h4>
                <button onclick="location.reload()" class="btn btn-sm btn-outline-danger">LOGOUT</button>
            </div>

            <ul class="nav nav-tabs mb-3 shadow-sm" role="tablist">
                <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#q">QUEUE</a></li>
                <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#u" onclick="loadUsers()">USERS</a></li>
                <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#f" onclick="loadFeed()">FEED</a></li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="q"><div id="q-box"></div></div>
                <div class="tab-pane fade" id="u">
                    <input type="text" id="s" onkeyup="filter()" class="form-control mb-3 bg-dark text-white border-secondary" placeholder="Search phone...">
                    <div id="u-box"></div>
                </div>
                <div class="tab-pane fade" id="f"><div id="f-box" style="font-size: 0.7rem;"></div></div>
            </div>
        </div>

        <script>
            let token = "";
            async function login() {
                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: 'maamulka', password: document.getElementById('key').value, mode: 'login'})
                });
                const d = await res.json();
                if(d.token) {
                    token = "Bearer " + d.token;
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('dashboard').style.display = 'block';
                    loadQueue();
                }
            }
            async function loadQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('q-box').innerHTML = Object.entries(txs).reverse().map(([id, t]) => {
                    if(t.status !== 'PENDING') return '';
                    return `<div class="glass-card d-flex justify-content-between align-items-center">
                        <div><b>$${t.amount}</b><br><small class="text-muted">${t.type} | 6${t.userId?.slice(-8)}</small></div>
                        <button onclick="approve('${id}')" class="btn btn-supreme btn-sm">APPROVE</button>
                    </div>`;
                }).join('') || '<div class="text-center text-muted">Queue is empty</div>';
            }
            async function approve(id) {
                if(!confirm("Approve?")) return;
                await fetch('/api/v1/queue/update-state', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify({transactionId: id, status: 'APPROVED'})
                });
                loadQueue();
            }
            async function loadUsers() {
                const res = await fetch('/api/admin/all-users', {headers: {'Authorization': token}});
                const us = await res.json();
                document.getElementById('u-box').innerHTML = Object.entries(us).map(([ph, u]) => `
                    <div class="glass-card d-flex justify-content-between">
                        <div><b>6${ph.slice(-8)}</b><br><small class="text-muted">$${u.balance?.toFixed(2)}</small></div>
                        ${u.status === 'PENDING' ? `<button onclick="act('${ph}')" class="btn btn-supreme btn-sm">ACTIVATE</button>` : ''}
                    </div>`).join('');
            }
            async function act(ph) {
                await fetch('/api/admin/user/activate', {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': token}, body: JSON.stringify({targetPhone: ph})});
                loadUsers();
            }
            async function loadFeed() {
                const res = await fetch('/api/admin/global-forensics', {headers: {'Authorization': token}});
                const logs = await res.json();
                document.getElementById('f-box').innerHTML = logs.map(l => `<div class="glass-card p-2 mb-1 border-0" style="border-left: 3px solid #00c853 !important;"><b>${l.action}</b> | ${l.target || l.phoneNumber} | <span class="text-muted">${l.actor}</span></div>`).join('');
            }
            setInterval(() => { if(token) loadQueue(); }, 15000);
        </script>
    </body>
    </html>
    `);
});

// --- CORE API ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId, pkg } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', ip: clientIp }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token, role: 'MASTER' });
        }
        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) {
            const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'LISTENER' });
        }

        const cleanPhone = phoneNumber.toString().replace(/\D/g, '').slice(-9);
        const userRef = db.ref('users/' + cleanPhone);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: cleanPhone, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: cleanPhone, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || {});
});

app.get('/api/balance', authenticate, async (req, res) => {
    const snap = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: parseFloat(snap.val() || 0) });
});

app.get('/api/transactions', authenticate, async (req, res) => {
    const snap = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    const ref = db.ref('transactions').push();
    await ref.set({ userId: req.user.phoneNumber, type: req.body.type, amount: parseFloat(req.body.amount), status: 'PENDING', date: new Date().toISOString(), details: req.body.details || {} });
    res.json({ message: "SUCCESS" });
});

// --- ADMIN API ---
app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(100).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(100).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    try {
        const { transactionId, status } = req.body;
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const userRef = db.ref('users/' + txData.userId);
            const uSnap = await userRef.once('value');
            const oldBal = uSnap.val().balance || 0;
            const isIntake = (txData.type.toLowerCase().includes("zaad") || txData.type.toLowerCase().includes("sahal") || txData.type.toLowerCase().includes("edahab"));
            const newBal = isIntake ? oldBal + txData.amount : oldBal - txData.amount;
            await userRef.update({ balance: newBal });
            await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber });
            await logBalanceChange(txData.userId, txData.amount, isIntake ? 'CREDIT' : 'DEBIT', oldBal, newBal, txData.type, req.user.phoneNumber);
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' });
    res.json({ message: "OK" });
});

// --- PULSE ENGINE ---
app.post('/api/v1/gateway/pulse', async (req, res) => {
    const { p_v1, p_v2, refId, reportedBalance, direction, deviceId, p_asig, timestamp, currency } = req.body;
    try {
        const amount = parseFloat(p_v1);
        const phone = normalizePhone(p_v2);
        const currentVerified = await getVerifiedBalance();

        if (direction === 'OUT') {
            const paySnap = await db.ref('payout_requests').orderByChild('status').equalTo('PENDING').once('value');
            const payouts = paySnap.val() || {};
            const matchId = Object.keys(payouts).find(k => payouts[k].phoneNumber === phone && Math.abs(payouts[k].amount - amount) < 0.01);
            if (matchId) {
                await updateVerifiedBalance(amount, 'SUB');
                await db.ref('payout_requests/' + matchId).update({ status: 'VERIFIED', externalId: refId });
                return res.json({ message: "VERIFIED" });
            }
        }

        await updateVerifiedBalance(amount, 'ADD');
        const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
        const txs = txSnap.val() || {};
        const tid = Object.keys(txs).find(k => txs[k].status === 'PENDING' && Math.abs(txs[k].amount - amount) < 0.1);
        if (tid) {
            const uRef = db.ref('users/' + phone);
            const uSnap = await uRef.once('value');
            const oldBal = uSnap.val().balance || 0;
            await uRef.update({ balance: oldBal + amount });
            await db.ref('transactions/' + tid).update({ status: 'APPROVED', externalId: refId });
            await logBalanceChange(phone, amount, 'CREDIT', oldBal, oldBal + amount, "Auto-Deposit", "SENSOR");
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Pulse Error"); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SUPREME Active.`));
