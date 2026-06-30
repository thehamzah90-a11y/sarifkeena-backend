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
let dbStatus = "OFFLINE";
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: process.env.FIREBASE_DATABASE_URL });
        db = admin.database(); dbStatus = "ONLINE";
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    }
} catch (e) { console.error(e.message); }

app.use(cors());
app.use(bodyParser.json());

const normalizePhone = (p) => { if (!p) return ""; const clean = p.toString().replace(/\D/g, ''); return clean.length >= 9 ? clean.slice(-9) : clean; };
const getNextImperialRef = async () => { if (!db) return "#000000"; const ref = db.ref('ledger/receipt_counter'); const res = await ref.transaction((c) => (c || 0) + 1); return "#" + res.snapshot.val().toString().padStart(6, '0'); };

const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role === 'MASTER' || user.role === 'SUPPORT' || user.role === 'LISTENER') {
            if (db) {
                const trustSnap = await db.ref('config/trusted_devices').once('value');
                const trusted = trustSnap.val() || {};
                if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) return res.status(403).json({ message: "Untrusted Device DNA" });
            }
        }
        req.user = user; next();
    });
};

const isMaster = (req, res, next) => { if (req.user && req.user.role === 'MASTER') next(); else res.status(403).send("Master Only"); };
const isSupport = (req, res, next) => { if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next(); else res.status(403).send("Staff Only"); };

// --- WEB INTERFACES (ROBUST STRINGS) ---
app.get('/master-vault', (req, res) => {
    let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MASTER VAULT</title>';
    h += '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">';
    h += '<style>body{background:#050505;color:#f0f0f0;font-family:sans-serif;}.card{background:#111;border:1px solid #222;border-radius:12px;padding:15px;margin-bottom:10px;}.nav-tabs{border:none;background:#0a0a0a;padding:10px;display:flex;flex-wrap:nowrap;overflow-x:auto;}.nav-link{color:#555;border:none!important;font-size:0.7rem;font-weight:700;}.nav-link.active{color:#ffc107!important;border-bottom:2px solid #ffc107!important;}</style></head>';
    h += '<body><div id="log" style="height:100vh;display:flex;align-items:center;justify-content:center;"><div class="card text-center" style="width:320px;"><h2>MASTER VAULT</h2><small>DB: '+dbStatus+'</small><input type="password" id="k" class="form-control text-center my-3 bg-dark text-white border-secondary"><button onclick="login()" class="btn btn-warning w-100">UNLOCK</button></div></div>';
    h += '<div id="ui" style="display:none;" class="container-fluid py-3"><header class="d-flex justify-content-between mb-3"><h4>SARIFKEENA MASTER</h4><button onclick="location.reload()" class="btn btn-sm btn-danger">LOGOUT</button></header>';
    h += '<ul class="nav nav-tabs shadow-sm mb-4" role="tablist"><li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#q">QUEUE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#u" onclick="refreshU()">USERS</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fin" onclick="loadF()">FINANCE</a></li><li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#dev" onclick="loadD()">DEVICES</a></li></ul>';
    h += '<div class="tab-content"><div class="tab-pane fade show active" id="q"><div id="q-list"></div></div><div class="tab-pane fade" id="u"><div id="u-list"></div></div><div class="tab-pane fade" id="fin"><div id="f-box"></div></div><div class="tab-pane fade" id="dev"><div id="d-list"></div></div></div></div>';
    h += '<script>let t="";async function login(){const p=document.getElementById("k").value;const res=await fetch("/api/v1/user/auth-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phoneNumber:"eesi",password:p,mode:"login",deviceId:"MASTER_WEB"})});const d=await res.json();if(d.token&&d.role==="MASTER"){t="Bearer "+d.token;document.getElementById("log").style.display="none";document.getElementById("ui").style.display="block";fetchQ();}else{alert("Denied");}}';
    h += 'async function fetchQ(){const res=await fetch("/api/admin/transactions",{headers:{"Authorization":t}});const txs=await res.json();document.getElementById("q-list").innerHTML=Object.entries(txs).reverse().map(([id,x])=>x.status==="PENDING"?"<div class=\'card\'>$ "+x.amountUSD+" | "+x.userId+"<br><button onclick=\'app(\\""+id+"\\")\' class=\'btn btn-warning btn-sm\'>Approve</button></div>":"").join("");}';
    h += 'async function app(id){await fetch("/api/v1/queue/update-state",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({transactionId:id,status:"APPROVED"})});fetchQ();}';
    h += 'async function refreshU(){const res=await fetch("/api/admin/all-users",{headers:{"Authorization":t}});const us=await res.json();document.getElementById("u-list").innerHTML=Object.entries(us).map(([ph,u])=>"<div class=\'card\'>"+ph+" | $ "+u.balance+"</div>").join("");}';
    h += 'async function loadF(){const res=await fetch("/api/v1/sup/ledger-sheet",{headers:{"Authorization":t}});const d=await res.json();document.getElementById("f-box").innerHTML="<div class=\'card\'>Empire Balance: $ "+d.empireUSD+"<br>Liabilities: $ "+d.liabilitiesUSD+"</div>";}';
    h += 'async function loadD(){const res=await fetch("/api/v1/sup/pending-devices",{headers:{"Authorization":t}});const ds=await res.json();document.getElementById("d-list").innerHTML=Object.entries(ds).map(([id,d])=>"<div class=\'card\'>"+d.role+"<br>"+id+"<br><button onclick=\'tr(\\""+id+"\\")\' class=\'btn btn-success btn-sm\'>TRUST</button></div>").join("");}';
    h += 'async function tr(id){await fetch("/api/v1/sup/trust-device",{method:"POST",headers:{"Authorization":t,"Content-Type":"application/json"},body:JSON.stringify({deviceId:id})});loadD();}';
    h += '</script><script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script></body></html>';
    res.send(h);
});

app.get('/staff-panel', (req, res) => {
    let h = '<!DOCTYPE html><html><head><title>STAFF TERMINAL</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>';
    h += '<body style="background:#050505;color:white;padding:50px;text-align:center;"><h2>STAFF TERMINAL</h2><input type="password" id="k" class="form-control mb-3 bg-dark text-white"><button onclick="login()" class="btn btn-success w-100">LOGIN</button>';
    h += '<script>async function login(){const p=document.getElementById("k").value;const res=await fetch("/api/v1/user/auth-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phoneNumber:"maamulka",password:p,mode:"login",deviceId:"STAFF_WEB"})});const d=await res.json();if(d.token){alert("Staff Sync Active. Use Android app for full operational queue.")}}</script></body></html>';
    res.send(h);
});

// --- CORE API REGISTRY (ID 3-42) ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (db) {
            const config = (await db.ref('config').once('value')).val() || {};
            if (deviceId && !config.registryLocked && ['eesi','maamulka','maamulka_2','sensor_primary'].includes(phoneNumber)) {
                await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
            }
        }
        if (phoneNumber === 'eesi' && password === MASTER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'MASTER' });
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });
        const clean = normalizePhone(phoneNumber); if (!db) return res.status(503).send("Offline");
        const user = (await db.ref('users/' + clean).once('value')).val();
        if (mode === 'register') { if (user) return res.status(400).json({ message: "Exists" }); await db.ref('users/' + clean).set({ phoneNumber: clean, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() }); return res.json({ message: "PENDING" }); }
        else { if (!user || user.password !== password) return res.status(401).send("Fail"); if (user.status === 'BLOCKED') return res.status(403).send("Blocked"); return res.json({ token: jwt.sign({ phoneNumber: clean, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' }), role: 'USER' }); }
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() || {} : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => { const b = db ? (await db.ref('users/' + req.user.phoneNumber + '/balance').once('value')).val() : 0; res.json({ balanceUSD: parseFloat(b || 0) }); });
app.get('/api/transactions', authenticate, async (req, res) => { if (!db) return res.json([]); const txs = Object.values((await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {}); res.json(txs.reverse().map(t => ({ ...t, externalId: t.status === 'APPROVED' ? t.imperialRef : "HUBIN..." }))); });
app.post('/api/v1/user/action-post', authenticate, async (req, res) => { if (!db) return res.status(503).send("Offline"); const { type, amountSLSH } = req.body; await db.ref('transactions').push().set({ userId: req.user.phoneNumber, type, amountSLSH, amountUSD: amountSLSH / 11000, status: 'PENDING', date: new Date().toISOString() }); res.json({ message: "SUCCESS" }); });
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('users').once('value')).val() || {} : {}));
app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('transactions').limitToLast(100).once('value')).val() || {} : {}));
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { transactionId, status } = req.body; const txRef = db.ref('transactions/' + transactionId); const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const uRef = db.ref('users/' + txData.userId); const oldBal = (await uRef.once('value')).val().balance || 0;
        const isOut = txData.type.toLowerCase().includes("withdraw"); const nBal = isOut ? oldBal - txData.amountUSD : oldBal + txData.amountUSD;
        const iRef = await getNextImperialRef(); await uRef.update({ balance: nBal });
        await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber, prevBalance: oldBal, newBalance: nBal, imperialRef: iRef, approvalTime: new Date().toISOString() });
    }
    res.json({ message: "OK" });
});
app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref('config/pending_devices').once('value')).val() || {} : {}));
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).send("Offline"); const snap = await db.ref('config/pending_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref('config/trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref('config/pending_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).send("Err"); });
app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => { if (!db) return res.json({}); const v = (await db.ref('ledger/verified_balance').once('value')).val() || 0; const us = Object.values((await db.ref('users').once('value')).val() || {}); res.json({ empireUSD: parseFloat(v), liabilitiesUSD: us.reduce((s, u) => s + (u.balance || 0), 0) }); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 Active.`));
