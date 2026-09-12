// /api/verify-payment.js
// Vercel serverless function — verifies a Paystack transaction server-side.
// NEVER trust the frontend to tell you a payment succeeded — always verify here first.
//
// Beat prices in Firestore are stored in USD (b.price, b.exclPrice), but Paystack
// (Nigeria-registered merchant) settles in NGN. So this function independently
// re-fetches the USD->NGN rate itself and checks the naira amount actually paid
// against it — never trusting a rate the client might have used to build the charge.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars can't store real newlines, so private keys are saved with
      // literal "\n" characters — this swaps them back to real line breaks.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function getUsdToNgnRate() {
  // open.er-api.com is free, no key required, and updates once every 24h — so a
  // client fetching around the same moment as this server check will almost
  // always see the identical cached rate, keeping the tolerance band tight.
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

  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({ error: 'Missing required field: reference' });
  }

  try {
    // 1. Verify the transaction with Paystack using your SECRET key (server-side only)
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      return res.status(402).json({
        error: 'Payment not successful',
        details: verifyData.data?.gateway_response || 'Unknown reason',
      });
    }

    // SECURITY: pull the sale details from Paystack's verified response, NOT from
    // req.body — the client's body can be edited in dev tools before the request
    // is sent, but the metadata below is whatever Paystack recorded at payment time.
    const { beatId, buyerId, tier, email } = verifyData.data.metadata || {};

    if (!beatId || !buyerId || !tier) {
      return res.status(400).json({
        error: 'Transaction metadata missing beatId/buyerId/tier — check the Paystack setup() call included them.',
      });
    }

    if (tier !== 'standard' && tier !== 'exclusive') {
      return res.status(400).json({ error: `Unrecognized tier: ${tier}` });
    }

    const amountPaidKobo = verifyData.data.amount; // Paystack returns amount in kobo
    const amountPaidNaira = amountPaidKobo / 100;
    const currency = verifyData.data.currency;

    const beatRef = db.collection('beats').doc(beatId);
    const beatSnap = await beatRef.get();

    if (!beatSnap.exists) {
      return res.status(404).json({ error: 'Beat not found' });
    }

    const beat = beatSnap.data();

    // 2. Cross-check the naira amount actually paid against what the beat's USD
    //    price converts to right now — catches both a tampered tier/amount AND a
    //    stale/fake exchange rate the client might have used.
    const expectedPriceUsd = tier === 'exclusive' ? beat.exclPrice : beat.price;

    if (typeof expectedPriceUsd !== 'number') {
      return res.status(400).json({ error: `Beat has no ${tier} price set` });
    }

    const liveRate = await getUsdToNgnRate();
    const expectedNaira = expectedPriceUsd * liveRate;

    // 5% tolerance for rounding + the small chance the daily rate ticked over
    // between the client's fetch and this verification.
    const tolerance = 0.05;
    const minAcceptable = expectedNaira * (1 - tolerance);

    if (amountPaidNaira < minAcceptable) {
      return res.status(402).json({
        error: 'Amount paid is below the expected converted price',
        expectedPriceUsd,
        liveRate,
        expectedNaira,
        amountPaidNaira,
      });
    }

    // 3. Record the sale and, for exclusive licenses, lock the beat from further
    //    sale. Run this as a transaction so two simultaneous exclusive buyers
    //    can't both "win" the same beat. Writes into the existing 'orders'
    //    collection the app already uses, with status 'completed' — the client
    //    can never set that itself (blocked by firestore.rules), only this
    //    Admin SDK function can.
    const orderRef = db.collection('orders').doc(reference);

    await db.runTransaction(async (t) => {
      const freshBeatSnap = await t.get(beatRef);
      const freshBeat = freshBeatSnap.data();

      if (tier === 'exclusive' && freshBeat.soldExclusive) {
        throw new Error('This beat has already been sold exclusively');
      }

      if (tier === 'exclusive') {
        t.update(beatRef, { soldExclusive: true });
      }

      t.set(orderRef, {
        buyerId,
        beatId,
        amount: expectedPriceUsd, // stored in USD to match the app's existing schema
        amountPaidNaira,
        exchangeRateUsed: liveRate,
        tier,
        email: email || null,
        status: 'completed',
        paystackReference: reference,
        beatTitle: beat.title,
        producerId: beat.producerId,
        createdAt: new Date().toISOString(),
      });
    });

    // 4. TODO: Generate the license doc + signed/expiring download link for
    //    beat.audioUrl, and return them below so the frontend can show a
    //    "download your beat + license" screen.

    return res.status(200).json({
      success: true,
      reference,
      beatId,
      tier,
      amountPaidNaira,
      currency,
      audioUrl: beat.audioUrl,
      // licenseUrl: '...',
    });
  } catch (err) {
    console.error('Payment verification error:', err);

    if (err.message === 'This beat has already been sold exclusively') {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}
