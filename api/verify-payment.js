// /api/verify-payment.js
// Vercel serverless function — verifies a Paystack transaction server-side.
// NEVER trust the frontend to tell you a payment succeeded — always verify here first.
//
// Beat prices in Firestore are stored in USD (b.price, b.exclPrice), but Paystack
// (Nigeria-registered merchant) settles in NGN. So this function independently
// re-fetches the USD->NGN rate itself and checks the naira amount actually paid
// against it — never trusting a rate the client might have used to build the charge.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

// Ambassador referral commission — % a referrer earns, based on how many
// people they've referred. Must match the tiers shown in the KLAVE app's
// admin referral panel (index-15.html: commissionTier()).
function commissionTier(referralCount) {
  if (referralCount >= 10) return 15;
  if (referralCount >= 5) return 10;
  return 5;
}

// Credits an ambassador's commission after a sale, if the buyer was referred.
// The referral code can match EITHER a real KLAVE user's username OR a
// waitlist ambassador's code (someone who joined via the separate ambassador
// page without a KLAVE account) — checks users first, then falls back to
// waitlist. Isolated in its own try/catch in the caller — same pattern as
// the download email below — since a referral-crediting bug should never
// break the payment response the buyer is waiting on.
async function creditReferralCommission({ buyerId, saleAmountUsd, beatId, reference }) {
  const buyerSnap = await db.collection('users').doc(buyerId).get();
  const referredBy = buyerSnap.exists ? buyerSnap.data().referredBy : null;
  if (!referredBy) return; // this buyer wasn't referred — nothing to do

  let referrerDoc = null;
  let referrerCollection = null;

  const userQuery = await db.collection('users').where('username', '==', referredBy).limit(1).get();
  if (!userQuery.empty) {
    referrerDoc = userQuery.docs[0];
    referrerCollection = 'users';
  } else {
    const waitlistQuery = await db.collection('waitlist').where('code', '==', referredBy).limit(1).get();
    if (!waitlistQuery.empty) {
      referrerDoc = waitlistQuery.docs[0];
      referrerCollection = 'waitlist';
    }
  }
  if (!referrerDoc) return; // referral code didn't match a real user or waitlist entry

  const referrerData = referrerDoc.data();

  // Guard against a beat's producer referring themselves as the buyer.
  if (referrerCollection === 'users' && referrerDoc.id === buyerId) return;

  const percent = commissionTier(referrerData.referralCount || 0);
  const commissionAmount = saleAmountUsd * (percent / 100);

  await referrerDoc.ref.update({
    referralEarnings: FieldValue.increment(commissionAmount),
    pendingReferralPayout: FieldValue.increment(commissionAmount),
  });

  await db.collection('referralPayouts').add({
    referrerUsername: referredBy,
    referrerType: referrerCollection, // 'users' or 'waitlist'
    referrerUid: referrerDoc.id,
    buyerUid: buyerId,
    beatId,
    saleAmount: saleAmountUsd,
    commissionPercent: percent,
    commissionAmount,
    reference,
    createdAt: new Date().toISOString(),
    paid: false,
  });
}

// Sends the buyer their download link by email via Resend, right after a
// verified purchase. This is deliberately isolated in its own try/catch in
// the caller — an email failing to send should NEVER fail the whole payment
// verification response, since the buyer already gets the download link
// on-screen in the app regardless of whether the email goes out.
//
// SETUP NEEDED before this actually delivers to real buyers:
// 1. Add RESEND_API_KEY to your Vercel env vars (from resend.com/api-keys).
// 2. The `from` address below uses Resend's sandbox sender, which only
//    reliably delivers to the email you signed up to Resend with — it will
//    silently fail (or bounce) for real customers. Verify your own domain
//    in Resend (Settings > Domains), then change `from` to something like
//    'KLAVE <beats@klaveapp.com>' once that's done.
async function sendDownloadEmail({ toEmail, beat, tier, reference }) {
  if (!toEmail) {
    console.warn('No buyer email available — skipping download email for', reference);
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping download email for', reference);
    return;
  }

  const licenseLabel = tier === 'exclusive' ? 'Exclusive Rights' : 'Standard';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'KLAVE <onboarding@resend.dev>', // swap for a verified KLAVE domain address once set up in Resend
      to: toEmail,
      subject: `Your beat is ready — ${beat.title}`,
      html: `
        <div style="font-family:sans-serif;background:#0a0a0a;color:#ffffff;padding:32px;border-radius:12px;">
          <div style="font-size:20px;font-weight:800;letter-spacing:2px;margin-bottom:2px;">KLAVE</div>
          <div style="font-size:11px;color:#888;letter-spacing:1px;margin-bottom:24px;">// your beat is ready.</div>
          <h2 style="margin:0 0 4px;">${beat.title}</h2>
          <p style="color:#aaa;margin:0 0 4px;">prod. ${beat.prod || 'Unknown'}</p>
          <p style="color:#aaa;margin:0 0 20px;">License: ${licenseLabel}</p>
          <a href="${beat.audioUrl}" style="display:inline-block;background:#3B5BFF;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Download Your Beat</a>
          <p style="color:#555;font-size:11px;margin-top:28px;">Order reference: ${reference}</p>
        </div>
      `,
    }),
  });
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

    // 4. Credit an ambassador commission if this buyer was referred. Isolated
    //    so a referral-crediting failure never breaks the payment response.
    try {
      await creditReferralCommission({
        buyerId,
        saleAmountUsd: expectedPriceUsd,
        beatId,
        reference,
      });
    } catch (referralErr) {
      console.error('Referral commission crediting failed:', referralErr);
    }

    // 5. Email the buyer their download link automatically. Falls back to the
    //    buyer's account email on file if Paystack's metadata didn't carry one.
    //    Wrapped so a failed/misconfigured email never breaks the payment
    //    response itself — the buyer still sees the download link in-app.
    try {
      let buyerEmail = email;
      if (!buyerEmail) {
        const buyerSnap = await db.collection('users').doc(buyerId).get();
        buyerEmail = buyerSnap.exists ? buyerSnap.data().email : null;
      }
      await sendDownloadEmail({ toEmail: buyerEmail, beat, tier, reference });
    } catch (emailErr) {
      console.error('Download email failed to send:', emailErr);
    }

    // 6. TODO: Generate the license doc + signed/expiring download link for
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
