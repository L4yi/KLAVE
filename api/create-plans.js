// api/create-plans.js — ONE-TIME SETUP endpoint. Call this once (e.g. via
// curl or Postman, signed in as the admin account) to create the $7/mo and
// $25/mo recurring plans on Paystack. It prints back plan_code values —
// paste those into PAYSTACK_PLAN_CODE_PRO7 / PAYSTACK_PLAN_CODE_PRO25 in
// the frontend, then this endpoint is never needed again.
//
// IMPORTANT — exchange rate caveat: Paystack plans bill a FIXED NGN amount
// on every renewal. This converts $7/$25 to NGN once, at creation time,
// using today's rate. If USD/NGN moves a lot afterward, the NGN amount
// your subscribers pay monthly does NOT auto-adjust — you'd need to
// create new plans and migrate subscribers to reprice. Fine to launch
// with, but revisit periodically.
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

const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2';

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
  if (decoded.uid !== ADMIN_UID) {
    return res.status(403).json({ error: 'Admin only' });
  }

  try {
    const rateRes = await fetch('https://open.er-api.com/v6/latest/USD');
    const rateData = await rateRes.json();
    const rate = (rateData && rateData.rates && rateData.rates.NGN) ? rateData.rates.NGN : 1600;

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY missing' });

    async function createPlan(name, usdAmount) {
      const amountKobo = Math.round(usdAmount * rate * 100);
      const r = await fetch('https://api.paystack.co/plan', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          amount: amountKobo,
          interval: 'monthly',
          currency: 'NGN',
        }),
      });
      const data = await r.json();
      if (!data.status) throw new Error(data.message || 'Plan creation failed');
      return data.data.plan_code;
    }

    const pro7Code = await createPlan('KLAVE Pro ($7/mo)', 7);
    const pro25Code = await createPlan('KLAVE Pro+ ($25/mo)', 25);

    return res.status(200).json({
      success: true,
      rateUsed: rate,
      pro7: pro7Code,
      pro25: pro25Code,
      note: 'Paste these plan_code values into PAYSTACK_PLAN_CODE_PRO7 / PAYSTACK_PLAN_CODE_PRO25 in the frontend.',
    });
  } catch (e) {
    console.error('Plan creation error:', e);
    return res.status(500).json({ error: e.message });
  }
}
