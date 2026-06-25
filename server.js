const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR_SECRET_KEY';

app.use(cors());
app.use(bodyParser.json());

// Mock Database
let wallet = {
    balance: 1000.00,
    transactions: [
        { id: 1, type: 'Deposit', amount: 500.00, date: new Date().toISOString(), status: 'Success' },
        { id: 2, type: 'Withdraw', amount: 200.00, date: new Date().toISOString(), status: 'Success' }
    ]
};

// Middleware for JWT Verification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- API ENDPOINTS ---

// Login (Mock OTP)
app.post('/api/login', (req, res) => {
    const { phoneNumber, otp } = req.body;
    if (phoneNumber && otp === '1234') { // Mock OTP check
        const token = jwt.sign({ phoneNumber }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(400).json({ message: 'Invalid phone or OTP' });
    }
});

// Get Balance
app.get('/api/balance', authenticateToken, (req, res) => {
    res.json({ balance: wallet.balance });
});

// Get Transactions
app.get('/api/transactions', authenticateToken, (req, res) => {
    res.json(wallet.transactions);
});

// Deposit (Zaad Placeholder)
app.post('/api/deposit', authenticateToken, (req, res) => {
    const { phoneNumber, amount, referenceId } = req.body;
    const numAmount = parseFloat(amount);

    if (numAmount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    // Simulate Zaad API call
    console.log(`Calling ZAAD_API_PLACEHOLDER for ${phoneNumber} with amount ${numAmount}`);

    wallet.balance += numAmount;
    const newTransaction = {
        id: wallet.transactions.length + 1,
        type: 'Deposit',
        amount: numAmount,
        date: new Date().toISOString(),
        status: 'Success'
    };
    wallet.transactions.unshift(newTransaction);

    res.json({ message: 'Deposit successful', balance: wallet.balance });
});

// Withdraw (1xBet Placeholder)
app.post('/api/withdraw', authenticateToken, (req, res) => {
    const { accountId, amount } = req.body;
    const numAmount = parseFloat(amount);

    if (numAmount <= 0) return res.status(400).json({ message: 'Invalid amount' });
    if (numAmount > wallet.balance) return res.status(400).json({ message: 'Insufficient balance' });

    // Simulate 1xBet API call
    console.log(`Calling 1XBET_API_PLACEHOLDER for account ${accountId} with amount ${numAmount}`);

    wallet.balance -= numAmount;
    const newTransaction = {
        id: wallet.transactions.length + 1,
        type: 'Withdraw',
        amount: numAmount,
        date: new Date().toISOString(),
        status: 'Success'
    };
    wallet.transactions.unshift(newTransaction);

    res.json({ message: 'Withdrawal successful', balance: wallet.balance });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
