const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- SECURITY CONFIG ---
const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';

// --- DATABASE ---
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// --- SUPREME AUTH MIDDLEWARE (WITH FINGERPRINTING) ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        // --- SESSION FINGERPRINT CHECK ---
        // If this token was stolen and used on another PC/IP, block it.
        const currentIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const currentAgent = req.headers['user-agent'];

        if (user.role === 'MASTER' || user.role === 'SUPPORT') {
            if (user.ip !== currentIp || user.ua !== currentAgent) {
                console.log("🛑 SECURITY ALERT: Stolen Token Attempt Blocked!");
                return res.status(403).json({ message: "Session Hijack Detected" });
            }
        }

        req.user = user;
        next();
    });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Access Denied" });
};

// --- AUTH ENDPOINT (GENERATES FINGERPRINTED TOKENS) ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const clientAgent = req.headers['user-agent'];

        // MASTER
        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({
                phoneNumber: 'geesi',
                role: 'MASTER',
                ip: clientIp, // Fingerprint 1
                ua: clientAgent // Fingerprint 2
            }, SECRET_KEY, { expiresIn: '12h' }); // Reduced to 12h for security
            return res.json({ token, role: 'MASTER' });
        }

        // SUPPORT
        if ((phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2')) {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({
                    phoneNumber,
                    role: 'SUPPORT',
                    ip: clientIp,
                    ua: clientAgent
                }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        // --- REGULAR USER (NO FINGERPRINTING NEEDED FOR CUSTOMERS) ---
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

// --- DASHBOARD ROUTE ---
app.get('/supreme-control', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SUPREME v1.9.6 DASHBOARD</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background: #080808; color: #e0e0e0; font-family: sans-serif; }
            .card { background: #121212; border: 1px solid #222; border-radius: 12px; margin-bottom: 15px; }
            .btn-success { background: #00c853; border: none; font-weight: bold; }
            .forensic-item { border-bottom: 1px solid #222; padding: 8px; font-size: 0.8rem; }
            #login-screen { height: 100vh; display: flex; align-items: center; justify-content: center; }
        </style>
    </head>
    <body>
        <div id="login-screen">
            <div class="card p-4 shadow-lg" style="width: 320px;">
                <h4 class="text-center mb-4" style="color: #00c853; font-weight: bold;">SARIFKEENNA</h4>
                <input type="password" id="pass" class="form-control mb-3 bg-dark text-white" placeholder="Access Key">
                <button onclick="login()" class="btn btn-success w-100">LOGIN</button>
            </div>
        </div>

        <div id="main-ui" class="container py-4" style="display:none;">
            <div class="d-flex justify-content-between mb-4">
                <h4 style="font-weight: 900;">SUPREME <span style="color: #00c853;">CONTROL</span></h4>
                <button onclick="location.reload()" class="btn btn-outline-secondary btn-sm">LOGOUT</button>
            </div>

            <nav>
              <div class="nav nav-tabs mb-3 border-0">
                <button class="nav-link active text-white" data-bs-toggle="tab" data-bs-target="#tab-q">QUEUE</button>
                <button class="nav-link text-white" data-bs-toggle="tab" data-bs-target="#tab-u" onclick="loadUsers()">USERS</button>
                <button class="nav-link text-white" data-bs-toggle="tab" data-bs-target="#tab-f" onclick="loadFeed()">FORENSICS</button>
              </div>
            </nav>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="tab-q">
                    <div class="card p-3"><table class="table table-dark table-sm"><thead><tr><th>User</th><th>Type</th><th>Amt</th><th>Action</th></tr></thead><tbody id="q-body"></tbody></table></div>
                </div>
                <div class="tab-pane fade" id="tab-u">
                    <div class="card p-3"><table class="table table-dark table-sm"><thead><tr><th>Phone</th><th>Bal</th><th>Action</th></tr></thead><tbody id="u-body"></tbody></table></div>
                </div>
                <div class="tab-pane fade" id="tab-f">
                    <div class="card p-3" id="f-body" style="height:500px; overflow-y:auto;"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
        <script>
            let token = "";
            async function login() {
                const res = await fetch('/api/v1/user/auth-access', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({phoneNumber: 'maamulka', password: document.getElementById('pass').value, mode: 'login'})
                });
                const d = await res.json();
                if(d.token) {
                    token = "Bearer "+d.token;
                    document.getElementById('login-screen').style.display='none';
                    document.getElementById('main-ui').style.display='block';
                    loadQueue();
                }
            }
            async function loadQueue() {
                const res = await fetch('/api/admin/transactions', {headers: {'Authorization': token}});
                const txs = await res.json();
                document.getElementById('q-body').innerHTML = Object.entries(txs).reverse().map(([id, t]) => \`
                    <tr>
                        <td>\${t.userId?.slice(-8)}</td>
                        <td>\${t.type}</td>
                        <td>$\${t.amount}</td>
                        <td>\${t.status==='PENDING' ? \`<button class="btn btn-sm btn-success" onclick="approve('\${id}')">OK</button>\` : t.status}</td>
                    </tr>
                \`).join('');
            }
            async function approve(id) {
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
                document.getElementById('u-body').innerHTML = Object.entries(us).map(([ph, u]) => \`
                    <tr><td>\${ph}</td><td>$\${u.balance}</td><td>\${u.status==='PENDING' ? \`<button class="btn btn-sm btn-success" onclick="act('\${ph}')">ACTIVATE</button>\` : 'Active'}</td></tr>
                \`).join('');
            }
            async function act(ph) {
                await fetch('/api/admin/user/activate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify({targetPhone: ph})
                });
                loadUsers();
            }
            async function loadFeed() {
                const res = await fetch('/api/admin/global-forensics', {headers: {'Authorization': token}});
                const logs = await res.json();
                document.getElementById('f-body').innerHTML = logs.map(l => \`
                    <div class="forensic-item"><b>\${l.action}</b> | Target: \${l.target || l.phoneNumber} | Actor: \${l.actor}</div>
                \`).join('');
            }
        </script>
    </body>
    </html>
    `);
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
            const isIntake = (txData.type.toLowerCase().includes("zaad") || txData.type.toLowerCase().includes("sahal"));
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

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(100).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SUPREME Active on ${PORT}`));
