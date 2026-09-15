// /api/payout-referrals.js
// Vercel serverless function — pays out one ambassador's pending referral
// commission via Paystack Transfers. This moves real money, so it:
//   1. Requires a valid Firebase ID token from the admin account (same
//      ADMIN_UID gate used everywhere else in the app).
//   2. Re-reads the pending balance itself rather than trusting whatever
//      the admin panel displayed on screen.
//   3. Never assumes Paystack succeeded without checking the response.
//
// REQUIRES, before this can work at all:
//   - Transfers enabled on your Paystack account (business verification —
//     done in the Paystack dashboard, not something this code can do)
//   - A funded Paystack balance to pay out from
//   - Env vars: PAYSTACK_SECRET_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
//     FIREBASE_PRIVATE_KEY (all already set up for verify-payment.js)
//
// NOTE ON OTP: some Paystack accounts require a one-time PIN to finalize a
// transfer (a manual step in their dashboard/app), especially for newer or
// unverified businesses. If your account is set up that way, the transfer
// created here will sit in "otp" status until you approve it in Paystack —
// this function can't complete that step for you. Ask Paystack support to
// disable OTP for API-initiated transfers once you're ready to go fully
// automatic.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2'; // must match index-15.html

async function getUsdToNgnRate() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  const data = await res.json();
  const rate = data?.rates?.NGN;
  if (!rate) throw new Error('Could not fetch USD->NGN exchange rate');
  return rate;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Confirm the caller is really the admin ──
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  let callerUid;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  if (callerUid !== ADMIN_UID) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { referrerId, referrerType } = req.body || {};
  if (!referrerId || !['users', 'waitlist'].includes(referrerType)) {
    return res.status(400).json({ error: 'referrerId and a valid referrerType (users|waitlist) are required' });
  }

  try {
    // ── 2. Re-read the real pending balance and bank details ──
    const referrerRef = db.collection(referrerType).doc(referrerId);
    const referrerSnap = await referrerRef.get();
    if (!referrerSnap.exists) {
      return res.status(404).json({ error: 'Referrer not found' });
    }
    const referrer = referrerSnap.data();
    const pendingUsd = referrer.pendingReferralPayout || 0;
    const bank = referrer.bankDetails;
    const referrerName = referrerType === 'users' ? referrer.username : referrer.name;

    if (pendingUsd <= 0) {
      return res.status(400).json({ error: 'Nothing pending for this ambassador' });
    }
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return res.status(400).json({ error: 'No bank details on file for this ambassador' });
    }

    // ── 3. Create (or reuse) a Paystack transfer recipient ──
    let recipientCode = bank.recipientCode;
    if (!recipientCode) {
      const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'nuban',
          name: bank.accountName || referrerName,
          account_number: bank.accountNumber,
          bank_code: bank.bankCode,
          currency: 'NGN',
        }),
      });
      const recipientData = await recipientRes.json();
      if (!recipientData.status) {
        throw new Error(recipientData.message || 'Could not create transfer recipient');
      }
      recipientCode = recipientData.data.recipient_code;
      await referrerRef.update({ 'bankDetails.recipientCode': recipientCode });
    }

    // ── 4. Convert USD balance to NGN (Paystack pays out in NGN) ──
    const rate = await getUsdToNgnRate();
    const amountNgn = Math.round(pendingUsd * rate);
    const amountKobo = amountNgn * 100;

    // ── 5. Initiate the transfer ──
    const transferRes = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'balance',
        amount: amountKobo,
        recipient: recipientCode,
        reason: 'KLAVE ambassador referral commission',
      }),
    });
    const transferData = await transferRes.json();
    if (!transferData.status) {
      throw new Error(transferData.message || 'Paystack transfer failed');
    }

    // ── 6. Only now that Paystack accepted it, clear the pending balance ──
    // Decrement by the exact amount we just paid (not "set to 0") so a new
    // commission that lands mid-request isn't accidentally wiped out.
    await referrerRef.update({
      pendingReferralPayout: FieldValue.increment(-pendingUsd),
    });

    await db.collection('referralPayoutRuns').add({
      referrerId,
      referrerType,
      referrerName,
      amountUsd: pendingUsd,
      amountNgn,
      exchangeRate: rate,
      paystackTransferCode: transferData.data.transfer_code,
      paystackStatus: transferData.data.status, // 'success', 'pending', or 'otp'
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      amountNgn,
      status: transferData.data.status,
      note: transferData.data.status === 'otp'
        ? 'Transfer created but needs OTP approval in your Paystack dashboard before it completes.'
        : undefined,
    });
  } catch (err) {
    console.error('payout-referrals failed:', err);
    return res.status(500).json({ error: err.message || 'Payout failed' });
  }
}
