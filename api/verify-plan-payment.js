// api/verify-plan-payment.js — verifies a Paystack transaction for a plan
// upgrade (pro7 / pro25), then writes the new tier onto the
// user's Firestore doc via the Admin SDK.
//
// Changes in this version:
//  - Checks WHAT was paid, not just that something was paid:
//      pro7 / pro25  -> must be on the matching Paystack plan code
//                       (env PAYSTACK_PLAN_PRO7 / PAYSTACK_PLAN_PRO25).
//                       If those env vars aren't set yet, falls back to an
//                       amount check against the live USD->NGN rate.
//  - Rejects currencies other than NGN/USD.
//  - A reference can grant a tier only once (recorded in `planPayments`), so
//    an old reference can't be replayed later to re-upgrade a downgraded account.
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

const PLAN_USD = { pro7: 7, pro25: 25 };

async function getUsdToNgnRate() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  const data = await res.json();
  const rate = data?.rates?.NGN;
  if (!rate) throw new Error('Could not fetch USD->NGN exchange rate');
  return rate;
}

// Returns true if the money paid is enough for the tier.
async function amountCoversTier(tier, amountMajor, currency) {
  const usd = PLAN_USD[tier];
  if (currency === 'USD') return amountMajor >= usd * 0.95;
  if (currency === 'NGN') {
    const rate = await getUsdToNgnRate();
    // 10% tolerance: plan/checkout amounts may have been set at an older rate.
    return amountMajor >= usd * rate * 0.9;
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
  if (!idToken) return res.status(401).json({ error: 'Missing auth token' });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  const { reference, tier } = req.body || {};
  if (typeof reference !== 'string' || !reference || !Object.keys(PLAN_USD).includes(tier)) {
    return res.status(400).json({ error: 'Missing or invalid reference/tier' });
  }

  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY missing' });

    // -- VERIFY WITH PAYSTACK --
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not verified as successful' });
    }

    const d = verifyData.data;
    const meta = d.metadata || {};
    if (meta.uid !== decoded.uid || meta.tier !== tier) {
      return res.status(403).json({ error: 'Payment does not match this account/tier' });
    }

    // -- CHECK THAT THE RIGHT THING WAS PAID FOR --
    const currency = d.currency;
    const amountMajor = d.amount / 100;

    const expectedPlan = tier === 'pro7' ? process.env.PAYSTACK_PLAN_PRO7 : process.env.PAYSTACK_PLAN_PRO25;
    const paidPlan =
      (typeof d.plan === 'string' ? d.plan : d.plan?.plan_code) || d.plan_object?.plan_code || null;

    if (expectedPlan) {
      if (paidPlan !== expectedPlan) {
        return res.status(403).json({ error: 'Payment was not for this plan' });
      }
    } else {
      console.warn(`PAYSTACK_PLAN_${tier.toUpperCase()} not set — falling back to amount check`);
      if (!(await amountCoversTier(tier, amountMajor, currency))) {
        return res.status(402).json({ error: 'Amount paid is too low for this plan' });
      }
    }

    // -- LOOK UP THE RECURRING SUBSCRIPTION (unchanged) --
    let subscriptionCode = null;
    let subscriptionToken = null;

    const customerCode = d.customer && d.customer.customer_code;
    if (customerCode) {
      const subRes = await fetch(`https://api.paystack.co/subscription?customer=${encodeURIComponent(customerCode)}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const subData = await subRes.json();
      if (subData.status && subData.data && subData.data.length) {
        const sub = subData.data[0];
        subscriptionCode = sub.subscription_code;
        subscriptionToken = sub.email_token;
      }
    }

    // -- GRANT THE TIER, ONCE PER REFERENCE --
    const userRef = db.collection('users').doc(decoded.uid);
    const payRef = db.collection('planPayments').doc(reference);

    const update = { tier, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (subscriptionCode) update.subscriptionCode = subscriptionCode;
    if (subscriptionToken) update.subscriptionToken = subscriptionToken;

    const granted = await db.runTransaction(async (t) => {
      const snap = await t.get(payRef);
      if (snap.exists) return false; // this reference already granted a tier
      t.set(payRef, {
        uid: decoded.uid,
        tier,
        amount: amountMajor,
        currency,
        createdAt: new Date().toISOString(),
      });
      t.set(userRef, update, { merge: true });
      return true;
    });

    return res.status(200).json({ success: true, tier, subscriptionCode, alreadyProcessed: !granted });
  } catch (e) {
    console.error('Plan verification error:', e);
    return res.status(500).json({ error: 'Plan verification failed' });
  }
}
