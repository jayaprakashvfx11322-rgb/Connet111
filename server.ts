import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const DATABASE_FILE = path.join(process.cwd(), 'server_db.json');

app.use(express.json());

// Database initial states helper
function getInitialDatabase() {
  return {
    config: {
      revenueSharePercent: 80, // % to Creator, 20% to Platform
      platformCpm: 2.50, // Base CPM per 1000 impressions in USD
      minimumWithdrawalAmount: 5.00 // Configurable limit in USD
    },
    wallets: {
      'user_kavin': {
        id: 'user_kavin',
        username: 'kavin_23',
        displayName: 'Kavin',
        balance: 3125.46,
        pendingEarnings: 154.20,
        totalPaid: 1200.00,
        adImpressions: 542000
      },
      'user_priya': {
        id: 'user_priya',
        username: 'priya_vibe',
        displayName: 'Priya',
        balance: 4520.12,
        pendingEarnings: 235.50,
        totalPaid: 2100.00,
        adImpressions: 894000
      },
      'user_anu': {
        id: 'user_anu',
        username: 'anu_creative',
        displayName: 'Anu',
        balance: 1450.80,
        pendingEarnings: 82.40,
        totalPaid: 850.00,
        adImpressions: 430000
      },
      'DemoUser': {
        id: 'DemoUser',
        username: 'cx_pilot',
        displayName: 'Demo Creator',
        balance: 845.20,
        pendingEarnings: 34.10,
        totalPaid: 120.00,
        adImpressions: 124000
      }
    },
    withdrawals: [
      {
        id: 'w_init_1',
        creatorId: 'user_kavin',
        username: 'kavin_23',
        amount: 350.00,
        method: 'PayPal',
        address: 'kavin@gmail.com',
        status: 'approved',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        payoutDetails: { batch_status: 'SUCCESS', payout_batch_id: 'PA_XM1289BB9' }
      },
      {
        id: 'w_init_2',
        creatorId: 'user_priya',
        username: 'priya_vibe',
        amount: 150.00,
        method: 'UPI',
        address: 'priya@okhdfc',
        status: 'pending',
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      }
    ],
    logs: [
      {
        id: 'l_init_1',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1050).toISOString(),
        type: 'config_change',
        message: 'System initialization set CPM to $2.50 USD and Revenue share to 80%.'
      },
      {
        id: 'l_init_2',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'payout_approved',
        creatorId: 'user_kavin',
        amount: 350.00,
        message: 'Withdrawal w_init_1 for $350.00 approved & released via PayPal.'
      },
      {
        id: 'l_init_3',
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        type: 'withdrawal_request',
        creatorId: 'user_priya',
        amount: 150.00,
        message: 'Priya requested $150.00 payout clearance via UPI (priya@okhdfc).'
      }
    ]
  };
}

// Read database from file
function readDB() {
  if (!fs.existsSync(DATABASE_FILE)) {
    const fresh = getInitialDatabase();
    writeDB(fresh);
    return fresh;
  }
  try {
    const content = fs.readFileSync(DATABASE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to read database file, reloading safe copy', e);
    return getInitialDatabase();
  }
}

// Write database to file
function writeDB(data: any) {
  try {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write database file', e);
  }
}

// API: Setup specific creator's wallet data dynamically if it doesn't exist yet
function getOrCreateWallet(db: any, creatorId: string, username = 'creator_node', displayName = 'Creator Node') {
  if (!db.wallets[creatorId]) {
    db.wallets[creatorId] = {
      id: creatorId,
      username,
      displayName,
      balance: 10.00,
      pendingEarnings: 0.00,
      totalPaid: 0.00,
      adImpressions: 0
    };
  }
  return db.wallets[creatorId];
}

// -------------------------------------------------------------
// CORE MONETIZATION & AD IMPRESSIONS API ROUTES
// -------------------------------------------------------------

// Post: batch ad impressions view log
app.post('/api/monetization/impressions', (req, res) => {
  const { creatorId, username, displayName, views } = req.body;
  
  if (!creatorId) {
    return res.status(400).json({ error: 'creatorId is required' });
  }

  const batchViews = Number(views) || 0;
  if (batchViews <= 0) {
    return res.status(400).json({ error: 'Views must be greater than zero' });
  }

  const db = readDB();
  const wallet = getOrCreateWallet(db, creatorId, username, displayName);
  
  // Accrue ad impressions
  wallet.adImpressions += batchViews;

  // Calculate gross and net creator earnings based on platform specifications
  const config = db.config;
  const CPM = config.platformCpm;
  const revShare = config.revenueSharePercent / 100; // e.g. 0.80

  // Total gross from these views: (Views / 1000) * Base CPM
  const grossAdRevenue = (batchViews / 1000) * CPM;
  // Creator net payout share
  const creatorEarningsShare = grossAdRevenue * revShare;

  // Accrue earnings directly as pending earnings (or balance)
  wallet.pendingEarnings = parseFloat((wallet.pendingEarnings + creatorEarningsShare).toFixed(4));
  
  // Audit log entry
  const logId = 'log_' + Date.now() + Math.floor(Math.random() * 1000);
  const newLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    type: 'impression' as const,
    creatorId,
    amount: parseFloat(creatorEarningsShare.toFixed(4)),
    message: `Tracked ${batchViews} ad impressions for @${wallet.username}. Gross: $${grossAdRevenue.toFixed(4)}, Net: $${creatorEarningsShare.toFixed(4)}`
  };
  db.logs.unshift(newLog);

  writeDB(db);
  res.json({ success: true, wallet, loggedRevenue: creatorEarningsShare });
});

// Get creator's wallet statistics
app.get('/api/monetization/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const db = readDB();
  
  // Pre-load default wallet details if we can map other fields from request query if needed
  const username = (req.query.username as string) || 'user';
  const displayName = (req.query.displayName as string) || 'User';
  
  const wallet = getOrCreateWallet(db, userId, username, displayName);
  
  // Filter withdrawal list for this creator
  const creatorWithdrawals = db.withdrawals.filter((w: any) => w.creatorId === userId);

  res.json({
    wallet,
    withdrawals: creatorWithdrawals,
    config: db.config
  });
});

// Post withdrawal request
app.post('/api/monetization/withdraw', (req, res) => {
  const { creatorId, username, displayName, amount, method, address, paymentDetails } = req.body;

  if (!creatorId || !amount || !method || !address) {
    return res.status(400).json({ error: 'Missing required parameters. Amount, Method, and Destination are required.' });
  }

  const amountNum = parseFloat(amount);
  const db = readDB();

  // Validate limits
  if (amountNum < db.config.minimumWithdrawalAmount) {
    return res.status(400).json({ 
      error: `Payout request denied. The cashout amount $${amountNum.toFixed(2)} is less than the configurable administrative minimum threshold of $${db.config.minimumWithdrawalAmount.toFixed(2)}.` 
    });
  }

  const wallet = getOrCreateWallet(db, creatorId, username, displayName);

  // Validate balance
  if (wallet.balance < amountNum) {
    return res.status(400).json({ error: 'Insufficient balance available to proceed with this cashout transfer request.' });
  }

  // Prevent duplicate pending withdrawal requests
  const hasPending = db.withdrawals.some((w: any) => w.creatorId === creatorId && w.status === 'pending');
  if (hasPending) {
    return res.status(400).json({ error: 'A security block is active. You already have a withdrawal request pending approval. Please wait for the current request to clear.' });
  }

  // Deduct balance and transfer to pendingEarnings to cover escrow during processing
  wallet.balance = parseFloat((wallet.balance - amountNum).toFixed(2));
  wallet.pendingEarnings = parseFloat((wallet.pendingEarnings + amountNum).toFixed(4));

  // Create withdrawal record
  const wId = 'w_' + Date.now() + Math.floor(Math.random() * 100);
  const newWithdrawal = {
    id: wId,
    creatorId,
    username: wallet.username,
    amount: amountNum,
    method, // UPI, PayPal, Bank
    address, // UPI ID, PayPal Email, Bank Account Number
    paymentDetails: paymentDetails || {},
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  db.withdrawals.unshift(newWithdrawal);

  // Logging transaction
  const logId = 'log_' + Date.now();
  const newLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    type: 'withdrawal_request' as const,
    creatorId,
    amount: amountNum,
    message: `@${wallet.username} submitted withdrawal request ${wId} for $${amountNum.toFixed(2)} via ${method} (${address}). Funds stored in escrow.`
  };
  db.logs.unshift(newLog);

  writeDB(db);

  res.json({ 
    success: true, 
    withdrawal: newWithdrawal,
    wallet,
    message: 'Withdrawal request transmitted successfully to platform governance controllers.'
  });
});

// -------------------------------------------------------------
// GOVERNANCE / ADMIN LEVEL CONTROLS API ROUTES
// -------------------------------------------------------------

// Get all creator wallets
app.get('/api/monetization/admin/creators', (req, res) => {
  const db = readDB();
  res.json(Object.values(db.wallets));
});

// Get all system withdrawals
app.get('/api/monetization/admin/withdrawals', (req, res) => {
  const db = readDB();
  res.json(db.withdrawals);
});

// Get payment log archives
app.get('/api/monetization/admin/logs', (req, res) => {
  const db = readDB();
  res.json(db.logs);
});

// Post save revenue configuration
app.post('/api/monetization/admin/config', (req, res) => {
  const { revenueSharePercent, platformCpm, minimumWithdrawalAmount } = req.body;
  const db = readDB();

  db.config.revenueSharePercent = Number(revenueSharePercent) || 80;
  db.config.platformCpm = Number(platformCpm) || 2.50;
  db.config.minimumWithdrawalAmount = Number(minimumWithdrawalAmount) || 5.00;

  // Log configuration update
  const logId = 'log_' + Date.now();
  const newLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    type: 'config_change' as const,
    message: `Admin adjusted revenue settings: Share=${db.config.revenueSharePercent}%, CPM=$${db.config.platformCpm.toFixed(2)}, Min=$${db.config.minimumWithdrawalAmount.toFixed(2)}`
  };
  db.logs.unshift(newLog);

  writeDB(db);
  res.json({ success: true, config: db.config });
});

// -------------------------------------------------------------
// REAL PAYMENT GATEWAY / PAYOUT API ROUTE handlers
// -------------------------------------------------------------

// Trigger PayPal Rest Payout
async function triggerRealPayPalPayout(payoutRequest: any) {
  const { amount, address, id } = payoutRequest;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PayPal Client credentials configured check: Fail. Setup client credentials in settings to allow live clearances.');
  }

  // Live PayPal authorization request to load access token
  const authUrl = process.env.PAYPAL_MODE === 'live' 
    ? 'https://api-m.paypal.com/v1/oauth2/token' 
    : 'https://api-m.sandbox.paypal.com/v1/oauth2/token';

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const authResponse = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!authResponse.ok) {
    const errText = await authResponse.text();
    throw new Error(`PayPal OAuth Access Token Request Failed: ${errText}`);
  }

  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;

  // Send rest Payout payload representing standard payout
  const payoutsUrl = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com/v1/payments/payouts'
    : 'https://api-m.sandbox.paypal.com/v1/payments/payouts';

  const payoutPayload = {
    sender_batch_header: {
      sender_batch_id: `batch_${id}_${Date.now()}`,
      email_subject: 'ConnectX Creator Revenue Release',
      email_message: `Your accrued creator vault earnings of $${amount.toFixed(2)} have been released!`,
      recipient_type: 'EMAIL'
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: {
          value: amount.toFixed(2),
          currency: 'USD'
        },
        note: `Revenue release clearance code: ${id}`,
        receiver: address,
        sender_item_id: `item_${id}`
      }
    ]
  };

  const payoutResponse = await fetch(payoutsUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payoutPayload)
  });

  if (!payoutResponse.ok) {
    const errText = await payoutResponse.text();
    throw new Error(`PayPal Payout Dispatch API call failed: ${errText}`);
  }

  return await payoutResponse.json();
}

// Trigger Razorpay UPI/Bank Transfer Payouts
async function triggerRealRazorpayPayout(payoutRequest: any) {
  const { amount, method, address, paymentDetails } = payoutRequest;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const xAccountNumber = process.env.RAZORPAY_X_ACCOUNT_NUMBER; // Required for Razorpay X payouts

  if (!keyId || !keySecret) {
    throw new Error('Razorpay API details missing. Please establish credentials first inside administrative settings.');
  }

  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  
  // 1. Create a Razorpay Contact representing the creator
  const contactPayload = {
    name: payoutRequest.username,
    email: `${payoutRequest.username}@connectx-creator.com`,
    contact: paymentDetails?.phone || '9999999999',
    type: 'employee',
    reference_id: payoutRequest.creatorId,
    notes: { reason: 'Creator vault payout node link' }
  };

  const contactResponse = await fetch('https://api.razorpay.com/v1/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(contactPayload)
  });

  if (!contactResponse.ok) {
    const errText = await contactResponse.text();
    throw new Error(`Razorpay X Contact node creation failed: ${errText}`);
  }

  const contactData: any = await contactResponse.json();
  const contactId = contactData.id;

  // 2. Setup fund account node based on UPI VPA or Bank details
  let fundAccountPayload: any = {
    contact_id: contactId,
    account_type: method === 'UPI' ? 'vpa' : 'bank_account'
  };

  if (method === 'UPI') {
    fundAccountPayload.vpa = { address };
  } else {
    fundAccountPayload.bank_account = {
      name: paymentDetails?.holderName || payoutRequest.username,
      ifsc: paymentDetails?.ifsc || 'HDFC0000012',
      account_number: address
    };
  }

  const fundResponse = await fetch('https://api.razorpay.com/v1/fund_accounts', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(fundAccountPayload)
  });

  if (!fundResponse.ok) {
    const errText = await fundResponse.text();
    throw new Error(`Razorpay X Fund account map error: ${errText}`);
  }

  const fundData: any = await fundResponse.json();
  const fundAccountId = fundData.id;

  // 3. Request actual transactional Payout on Razorpay X balance (payout amount in paise)
  const amountInPaise = Math.round(amount * 100 * 83); // Converting USD to approximate INR paise for Razorpay India
  const payoutPayload = {
    account_number: xAccountNumber || '78787878787878', // fallback sandbox number representing active testing bounds
    fund_account_id: fundAccountId,
    amount: amountInPaise,
    currency: 'INR',
    mode: method === 'UPI' ? 'UPI' : 'IMPS',
    purpose: 'payout',
    queue_if_low_balance: true,
    reference_id: payoutRequest.id,
    notes: { releaseCode: payoutRequest.id }
  };

  const payoutResponse = await fetch('https://api.razorpay.com/v1/payouts', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payoutPayload)
  });

  if (!payoutResponse.ok) {
    const errText = await payoutResponse.text();
    throw new Error(`Razorpay X clearance payout execution endpoint returned an error: ${errText}`);
  }

  return await payoutResponse.json();
}

// Post approve and execute withdrawal payouts
app.post('/api/monetization/admin/payout/approve', async (req, res) => {
  const { id } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Withdrawal Request ID is required' });
  }

  const db = readDB();
  const withdrawalRequest = db.withdrawals.find((w: any) => w.id === id);

  if (!withdrawalRequest) {
    return res.status(404).json({ error: 'Clearance target payout request not located inside archive logs.' });
  }

  if (withdrawalRequest.status !== 'pending') {
    return res.status(400).json({ error: 'This withdrawal target has already been approved or rejected previously.' });
  }

  const creatorId = withdrawalRequest.creatorId;
  const wallet = db.wallets[creatorId];

  if (!wallet) {
    return res.status(404).json({ error: 'Owner creator account wallet not configured inside database files.' });
  }

  let realPayoutLoggedSuccess = false;
  let responseMetadata: any = null;
  let exceptionErrorStr: string | null = null;

  try {
    // Determine payment gateway API to hit based on method
    if (withdrawalRequest.method === 'PayPal') {
      if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
        responseMetadata = await triggerRealPayPalPayout(withdrawalRequest);
        realPayoutLoggedSuccess = true;
      } else {
        console.warn('Sandbox mode active: Local PayPal Developer credentials absent. Simulating seamless payout clearing.');
      }
    } else if (withdrawalRequest.method === 'UPI' || withdrawalRequest.method === 'Bank') {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        responseMetadata = await triggerRealRazorpayPayout(withdrawalRequest);
        realPayoutLoggedSuccess = true;
      } else {
        console.warn('Sandbox mode active: Razorpay account credentials absent. Executing simulated Indian UPI clearance node.');
      }
    }
  } catch (err: any) {
    exceptionErrorStr = err.message || 'Unknown Payment Network Error';
    console.error('Real payout transfer error occurred:', err);
    withdrawalRequest.error = exceptionErrorStr;
    
    // Save rejection or rollback and let admin try again optionally, or proceed with sandbox simulation if specified
    return res.status(502).json({ 
      error: `Payout clearance failed. Gateway reported an error: ${exceptionErrorStr}. Securely aborted. Check keys in developer settings.` 
    });
  }

  // Deduct from creator escrow (pendingEarning) and record as totalPaid
  const cashAmount = withdrawalRequest.amount;
  wallet.pendingEarnings = parseFloat(Math.max(0, wallet.pendingEarnings - cashAmount).toFixed(4));
  wallet.totalPaid = parseFloat((wallet.totalPaid + cashAmount).toFixed(2));

  // Clear pending flags and update status to approved
  withdrawalRequest.status = 'approved';
  withdrawalRequest.payoutDetails = responseMetadata || {
    mock_cleared: true,
    cleared_at_time: new Date().toISOString(),
    auth_network: 'ConnectX Secure Sandbox Escrow'
  };

  // Log to payments logs
  const logId = 'log_' + Date.now();
  const transactionMessage = realPayoutLoggedSuccess
    ? `SUCCESS: Cleared real transaction ${withdrawalRequest.id} for $${cashAmount.toFixed(2)} using production gateway channel. Status: ACTIVE.`
    : `SECURE SIMULATOR: Cleared sandbox test payout for @${wallet.username} ($${cashAmount.toFixed(2)}) using active verified clearance mechanisms.`;

  const newLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    type: 'payout_approved' as const,
    creatorId,
    amount: cashAmount,
    message: transactionMessage
  };
  db.logs.unshift(newLog);

  writeDB(db);

  res.json({
    success: true,
    withdrawal: withdrawalRequest,
    wallet,
    message: realPayoutLoggedSuccess 
      ? `Clearance transaction executed! Real-time money routed to chosen account.` 
      : 'Simulation authorization approved! Simulated transaction logs validated successfully.'
  });
});

// Reject withdrawal payouts
app.post('/api/monetization/admin/payout/reject', (req, res) => {
  const { id, reason } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Withdrawal Request ID is required' });
  }

  const db = readDB();
  const withdrawalRequest = db.withdrawals.find((w: any) => w.id === id);

  if (!withdrawalRequest) {
    return res.status(404).json({ error: 'Payout request not located inside archive index.' });
  }

  if (withdrawalRequest.status !== 'pending') {
    return res.status(400).json({ error: 'This withdrawal target has already been approved or rejected previously.' });
  }

  const creatorId = withdrawalRequest.creatorId;
  const wallet = db.wallets[creatorId];

  if (wallet) {
    // Restore escrow (pendingEarning) back to the creator wallet's active balance
    const cashAmount = withdrawalRequest.amount;
    wallet.pendingEarnings = parseFloat(Math.max(0, wallet.pendingEarnings - cashAmount).toFixed(4));
    wallet.balance = parseFloat((wallet.balance + cashAmount).toFixed(2));
  }

  withdrawalRequest.status = 'rejected';
  withdrawalRequest.payoutDetails = {
    rejected_at: new Date().toISOString(),
    reason: reason || 'Details verification failed'
  };

  // Log rejection
  const logId = 'log_' + Date.now();
  const newLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    type: 'payout_rejected' as const,
    creatorId,
    amount: withdrawalRequest.amount,
    message: `REJECTED: Withdrawal w_id=${id} for $${withdrawalRequest.amount.toFixed(2)} rejected. Reason: "${reason || 'Details verification failed'}". Funds returned to active creator balance.`
  };
  db.logs.unshift(newLog);

  writeDB(db);

  res.json({
    success: true,
    withdrawal: withdrawalRequest,
    wallet,
    message: 'Withdrawal requested has been securely rejected. Funds restored to creator balance.'
  });
});

// -------------------------------------------------------------
// SEAMLESS VITE DEVELOPMENT PROCESS AND STATIC MIDDLEWARE
// -------------------------------------------------------------

async function startServer() {
  // Vite dev mode vs production routing
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ConnectX Server] Listening on http://localhost:${PORT}`);
  });
}

startServer();
