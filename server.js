const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

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
        console.log("✅ v2.2.1 SUPREME BRAIN ONLINE.");
    }
} catch (error) {
    console.error("❌ DB Error:", error.message);
    dbStatus = "❌ ERR: " + error.message;
}

app.use(cors());
app.use(bodyParser.json());

// --- 132-KEY PATH CONSTANTS ---
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
    AUDITS: 'audits',
    PERMS: 'api_permissions',
    REFS: 'used_receipt_ids'
};

const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

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

// --- AUTH MIDDLEWARE (HARDENED FOR JSON) ---
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ message: "No Token" });

        jwt.verify(token, SECRET_KEY, async (err, user) => {
            if (err) return res.status(403).json({ message: "Invalid Session" });

            if (user.role === 'MASTER' || user.role === 'SUPPORT' || user.role === 'LISTENER') {
                if (db) {
                    const trusted = (await db.ref(PATH.DNA + '/058_trusted_devices').once('value')).val() || {};
                    if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) {
                        return res.status(403).json({ message: "Untrusted Device DNA" });
                    }
                }
            }
            req.user = user; next();
        });
    } catch (e) { res.status(500).json({ message: "Auth Failure" }); }
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Staff Only" });
};

// --- CORE APIs ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (phoneNumber === 'eesi' && password === MASTER_PASS) {
            return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '24h' }), role: 'MASTER' });
        }

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).json({ message: "Offline" });

        const userRef = db.ref(PATH.USERS + '/' + clean);
        const user = (await userRef.once('value')).val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ '062_phoneNumber': clean, '063_password': password, '064_balanceUSD': 0.0, '065_status': 'PENDING', '067_createdAt': new Date().toISOString(), '132_isReviewer': false });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user['063_password'] !== password) return res.status(401).json({ message: "Fail" });
            if (user['065_status'] === 'BLOCKED') return res.status(403).json({ message: "Blocked" });
            await stampDNA(clean, deviceId);
            return res.json({
                token: jwt.sign({ phoneNumber: clean, role: 'USER', deviceId }, SECRET_KEY, { expiresIn: '30d' }),
                role: 'USER',
                '132_isReviewer': user['132_isReviewer'] || false
            });
        }
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ message: "Offline" });

        const type = req.body['077_type'] || req.body.type;
        const amountSLSH = parseInt(req.body['079_amountSLSH'] || req.body.amountSLSH) || 0;
        const amountUSD = parseFloat(req.body['078_amountUSD'] || req.body.amountUSD) || 0;
        const externalId = req.body['086_externalId'] || req.body.externalId || "";
        const ph = req.user.phoneNumber;

        if (!type || !ph) return res.status(400).json({ message: "Missing Data" });

        // Logic: ZAAD_WITHDRAW (Immediate Subtraction)
        if (type.includes('ZAAD_WITHDRAW')) {
            const uRef = db.ref(PATH.USERS + '/' + ph);
            const uData = (await uRef.once('value')).val();
            const bal = parseFloat(uData['064_balanceUSD'] || 0);

            if (bal < amountUSD) return res.status(400).json({ message: "Insufficient Balance" });

            await uRef.update({ '064_balanceUSD': bal - amountUSD });
            await db.ref(PATH.TX).push().set({
                '076_userId': ph, '077_type': type, '079_amountSLSH': amountUSD * 10000, '078_amountUSD': amountUSD,
                '080_status': 'PENDING', '095_creation_ts': new Date().toISOString(), '082_prevBalance': bal, '083_newBalance': bal - amountUSD
            });
            return res.json({ message: "SUCCESS" });
        }

        // Logic: 1XBET_WITHDRAW
        if (type === '1XBET_WITHDRAW') {
            await db.ref(PATH.TX).push().set({
                '076_userId': ph, '077_type': type, '086_externalId': externalId, '080_status': 'PENDING', '095_creation_ts': new Date().toISOString()
            });
            return res.json({ message: "SUCCESS" });
        }

        // Default Logic (Deposits)
        const finalUSD = amountUSD || (amountSLSH / 11000);
        await db.ref(PATH.TX).push().set({
            '076_userId': ph, '077_type': type, '079_amountSLSH': amountSLSH, '078_amountUSD': finalUSD,
            '080_status': 'PENDING', '095_creation_ts': new Date().toISOString()
        });
        res.json({ message: "SUCCESS" });
    } catch (e) {
        res.status(500).json({ message: "Server Error", details: e.message });
    }
});

app.get('/api/v1/sup/meta-gate', async (req, res) => {
    try {
        if (!db) return res.json({ category: { banks: [] } });
        const gateways = (await db.ref(PATH.GATEWAY).once('value')).val() || {};

        const bankList = Object.entries(gateways).map(([id, g]) => {
            let name, icon, ussd, target;
            if (id === 'zaad') {
                name = g['032_name']; icon = g['038_iconUrl']; ussd = g['033_ussd']; target = g['034_targetNumber'];
            } else if (id === 'sahal') {
                name = "SOLTELCO"; icon = g['047_iconUrl'] || g['038_iconUrl']; ussd = "*770*"; target = gateways['zaad']?.['034_targetNumber'] || g['043_targetNumber'];
            } else if (id === 'edahab') {
                name = g['050_name']; icon = g['056_iconUrl']; ussd = g['051_ussd']; target = g['052_targetNumber'];
            }

            return {
                id,
                name: name || id.toUpperCase(),
                icon: icon || "",
                ussd: ussd || "*220*",
                targetNumber: target || "",
                color: g['039_brandColor'] || "#222",
                mathLabel: g['035_mathLabel'] || "$1 = 11,000 SLSH",
                status: "ON"
            };
        });
        res.json({ category: { title: "DHIG / KALA BAX", banks: bankList } });
    } catch (e) { res.status(500).json({ message: "Gate Error" }); }
});

app.get('/api/balance', authenticate, async (req, res) => {
    try {
        const u = db ? (await db.ref(PATH.USERS + '/' + req.user.phoneNumber).once('value')).val() : null;
        res.json({ '064_balanceUSD': u ? u['064_balanceUSD'] : 0 });
    } catch (e) { res.status(500).json({ message: "Balance Error" }); }
});

app.get('/api/transactions', authenticate, async (req, res) => {
    try {
        const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
        res.json(txs.reverse());
    } catch (e) { res.json([]); }
});

app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() : {}));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v2.2.1 Active.`));
