// /api/payout-referrals.js
// Pays out one ambassador's pending referral commission via Paystack Transfers.
//
// Changes in this version:
//  - NO DOUBLE PAYOUTS: the pending balance is reserved inside a Firestore
//    transaction BEFORE any money moves, and every transfer carries a unique
//    Paystack reference. A double-tap or two concurrent requests can no longer
//    both pay the same balance.
//  - If Paystack explicitly rejects the transfer, the reserved balance is
//    restored. If the network call itself fails (outcome unknown), the run is
//    marked 'unknown' and the balance is NOT restored: check the Paystack
//    dashboard for that reference before retrying.
//  - Reads bank details from users/{uid}/private/finance (falls back to the
//    legacy field on the user doc until bank-account.js 'migrate' has been run).
//
// Still requires: Transfers enabled on Paystack, a funded balance, and possibly
// OTP approval per transfer (see Paystack dashboard settings).

import { randomUUID } from 'crypto';
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
const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2';

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

  // ── 1. Admin only ──
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Missing auth token' });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  if (decoded.uid !== ADMIN_UID && decoded.admin !== true) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { referrerUid } = req.body || {};
  if (!referrerUid || typeof referrerUid !== 'string') {
    return res.status(400).json({ error: 'referrerUid is required' });
  }

  try {
    const referrerRef = db.collection('users').doc(referrerUid);
    const privRef = db.doc(`users/${referrerUid}/private/finance`);
    const [referrerSnap, privSnap] = await Promise.all([referrerRef.get(), privRef.get()]);

    if (!referrerSnap.exists) {
      return res.status(404).json({ error: 'Referrer not found' });
    }
    const referrer = referrerSnap.data();

    // Prefer the private doc; fall back to the legacy field until migrated.
    const privBank = privSnap.exists ? privSnap.data().bankDetails : null;
    const bankFromPrivate = !!(privBank && privBank.accountNumber);
    const bank = bankFromPrivate ? privBank : referrer.bankDetails;

    if ((referrer.pendingReferralPayout || 0) <= 0) {
      return res.status(400).json({ error: 'Nothing pending for this ambassador' });
    }
    if (!bank || !bank.accountNumber || !bank.bankCode) {
      return res.status(400).json({ error: 'No bank details on file for this ambassador' });
    }

    // ── 2. Transfer recipient (no money moves yet) ──
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
          name: bank.accountName || referrer.username,
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
      if (bankFromPrivate) {
        await privRef.set({ bankDetails: { recipientCode } }, { merge: true });
      } else {
        await referrerRef.update({ 'bankDetails.recipientCode': recipientCode });
      }
    }

    // Fetch the rate BEFORE reserving, so a rate failure can't strand a reservation.
    const rate = await getUsdToNgnRate();

    // ── 3. Reserve the balance atomically ──
    const payoutRef = db.collection('referralPayoutRuns').doc();
    const reservedUsd = await db.runTransaction(async (t) => {
      const snap = await t.get(referrerRef);
      const pending = snap.data().pendingReferralPayout || 0;
      if (pending <= 0) return 0;
      t.update(referrerRef, { pendingReferralPayout: FieldValue.increment(-pending) });
      t.set(payoutRef, {
        referrerUid,
        referrerUsername: referrer.username || null,
        amountUsd: pending,
        status: 'processing',
        createdAt: new Date().toISOString(),
      });
      return pending;
    });

    if (reservedUsd <= 0) {
      return res.status(400).json({ error: 'Nothing pending for this ambassador' });
    }

    const amountNgn = Math.round(reservedUsd * rate);
    const amountKobo = amountNgn * 100;
    const transferReference = 'kp-' + randomUUID(); // lowercase, 39 chars: valid Paystack reference

    // ── 4. Send the transfer ──
    let transferData;
    try {
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
          reference: transferReference,
          reason: 'KLAVE ambassador referral commission',
        }),
      });
      transferData = await transferRes.json();
    } catch (netErr) {
      // Outcome unknown: do NOT restore the balance automatically.
      await payoutRef.update({
        status: 'unknown',
        paystackReference: transferReference,
        amountNgn,
        exchangeRate: rate,
        error: String(netErr.message || netErr),
      });
      return res.status(502).json({
        error: 'Could not confirm the transfer with Paystack. Check the Paystack dashboard for this reference before retrying.',
        reference: transferReference,
      });
    }

    if (!transferData.status) {
      // Paystack explicitly refused: nothing was sent, put the balance back.
      await referrerRef.update({ pendingReferralPayout: FieldValue.increment(reservedUsd) });
      await payoutRef.update({
        status: 'failed',
        paystackReference: transferReference,
        error: transferData.message || 'Paystack transfer failed',
      });
      return res.status(400).json({ error: transferData.message || 'Paystack transfer failed' });
    }

    // ── 5. Record success ──
    await payoutRef.update({
      status: 'sent',
      amountNgn,
      exchangeRate: rate,
      paystackReference: transferReference,
      paystackTransferCode: transferData.data.transfer_code,
      paystackStatus: transferData.data.status, // 'success', 'pending', or 'otp'
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
