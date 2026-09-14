// api/paystack-webhook.js — receives real-time events from Paystack about
// subscription lifecycle: renewals, cancellations, and failed payments.
// This is the missing piece flagged in verify-plan-payment.js and
// cancel-plan.js: those two only handle the FIRST charge and an in-app
// cancel button. Everything that happens afterward on Paystack's own side
// — a renewal succeeding, a card failing, a subscription actually ending —
// only reaches this app through this webhook.
//
// SETUP NEEDED (you must do this manually in the Paystack dashboard):
// Settings > API Keys & Webhooks > Webhook URL, set to:
//   https://klaveapp.vercel.app/api/paystack-webhook
// Paystack will start sending events there immediately after you save it.
//
// SECURITY: every request is verified against Paystack's signature header
// before anything in the payload is trusted — otherwise anyone could POST
// a fake "subscription renewed" event and upgrade themselves for free.
import crypto from 'crypto';
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

// Must match the plan codes wired into index-15.html (PAYSTACK_PLAN_CODE_PRO7 /
// PAYSTACK_PLAN_CODE_PRO25). Kept here as a separate constant because this file
// runs server-side and can't read the frontend's JS variables — if you ever
// recreate the Paystack plans and get new codes, update BOTH places.
const PLAN_CODE_TO_TIER = {
  'PLN_xmwbhnqhh2zc080': 'pro7',
  'PLN_1bdx8i1kkxopbg0': 'pro25',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // -- VERIFY THE SIGNATURE (never trust an unverified webhook body) --
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers['x-paystack-signature'];

  // NOTE: this re-stringifies the already-parsed req.body rather than reading
  // the raw request bytes. That's the standard approach for Vercel Node
  // functions (which auto-parse JSON before your handler runs) and works
  // reliably because JSON.parse -> JSON.stringify round-trips Paystack's
  // payloads byte-for-byte in practice. If signature checks ever start
  // failing unexpectedly, that round-trip assumption is the first thing to
  // revisit.
  const expectedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    console.warn('Paystack webhook: signature mismatch — rejecting');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const db = admin.firestore();

  try {
    switch (event.event) {
      // ── A charge succeeded. Fires for the FIRST charge too (already
      // handled by verify-plan-payment.js) as well as every renewal after
      // that. Only act on it if it's tied to one of our recurring plans —
      // and use it to RE-CONFIRM the tier, which matters most for the case
      // where a subscriber's card failed once, got fixed, and this renewal
      // succeeding should restore their paid tier if it had lapsed.
      case 'charge.success': {
        const planCode = event.data.plan;
        const tier = PLAN_CODE_TO_TIER[planCode];
        if (!tier) break; // not a subscription charge we recognize — ignore

        const email = event.data.customer?.email;
        if (!email) break;

        const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
        if (usersSnap.empty) {
          console.warn('charge.success: no user found for email', email);
          break;
        }

        const userRef = usersSnap.docs[0].ref;
        const update = { tier, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        // Paystack's charge.success payload for a subscription renewal
        // includes the subscription details — capture it if present, in
        // case it's ever missing/stale from the original upgrade.
        if (event.data.subscription_code) update.subscriptionCode = event.data.subscription_code;

        await userRef.set(update, { merge: true });
        console.log('charge.success: confirmed tier', tier, 'for', email);
        break;
      }

      // ── A subscription was disabled — either the user cancelled
      // voluntarily (via /api/cancel-plan.js, which already set
      // pendingCancellation + accessUntil BEFORE calling Paystack's
      // disable endpoint — see that file) or Paystack gave up retrying a
      // failed card on its own.
      //
      // These two cases are handled differently:
      //  - Voluntary cancel: pendingCancellation is already true on the
      //    user doc. Access should continue until accessUntil, which
      //    /api/check-expiring-subs.js (daily cron) enforces — so this
      //    webhook does NOT downgrade the tier here, only clears the
      //    subscription code/token since billing has genuinely stopped.
      //  - Involuntary disable (failed payments exhausted): the user
      //    never asked to cancel, so there's no accessUntil grace period
      //    to honor — that period was never successfully paid for.
      //    Downgrade immediately.
      case 'subscription.disable': {
        const subCode = event.data.subscription_code;
        const email = event.data.customer?.email;

        let usersSnap = subCode
          ? await db.collection('users').where('subscriptionCode', '==', subCode).limit(1).get()
          : { empty: true };

        if (usersSnap.empty && email) {
          usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
        }

        if (usersSnap.empty) {
          console.warn('subscription.disable: no matching user for', subCode || email);
          break;
        }

        const userRef = usersSnap.docs[0].ref;
        const userData = usersSnap.docs[0].data();

        if (userData.pendingCancellation) {
          // Voluntary cancel already in progress — just drop the now-dead
          // subscription code/token, leave tier + accessUntil for the
          // daily cron to handle on schedule.
          await userRef.set({
            subscriptionCode: admin.firestore.FieldValue.delete(),
            subscriptionToken: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log('subscription.disable: voluntary cancel confirmed for', subCode || email, '— tier holds until accessUntil');
        } else {
          // Involuntary — payment retries exhausted. No grace period earned.
          await userRef.set({
            tier: 'free',
            subscriptionCode: admin.firestore.FieldValue.delete(),
            subscriptionToken: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log('subscription.disable: involuntary (failed payments) — downgraded immediately for', subCode || email);
        }
        break;
      }

      // ── A renewal charge failed. Paystack automatically retries these a
      // few times before eventually firing subscription.disable if every
      // retry fails — so this does NOT downgrade the tier yet, only logs
      // it. Flagging a producer's dashboard about this ("payment issue,
      // update your card") would be a good follow-up, not built here.
      case 'invoice.payment_failed': {
        console.warn('invoice.payment_failed for', event.data.customer?.email, '— Paystack will retry automatically');
        break;
      }

      default:
        // Unhandled event types are fine to ignore — just acknowledge receipt.
        break;
    }

    // Paystack expects a fast 200 to know the event was received; it will
    // retry delivery if it doesn't get one.
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('Webhook processing error:', e);
    // Still return 200 here rather than 500 — a bug in our own processing
    // logic shouldn't cause Paystack to endlessly retry the same event.
    // The error is logged above for debugging either way.
    return res.status(200).json({ received: true, note: 'processing error logged' });
  }
}
