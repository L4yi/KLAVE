// /api/verify-payment.js
// Vercel serverless function — verifies a Paystack transaction server-side.
// NEVER trust the frontend to tell you a payment succeeded — always verify here first.

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
    const { beatId, buyerId, licenseType } = verifyData.data.metadata || {};

    if (!beatId || !buyerId || !licenseType) {
      return res.status(400).json({
        error: 'Transaction metadata missing beatId/buyerId/licenseType — check the Paystack setup() call included them.',
      });
    }

    const amountPaidKobo = verifyData.data.amount; // Paystack returns amount in kobo/cents
    const currency = verifyData.data.currency;

    // 2. TODO: Cross-check amountPaidKobo against the beat's actual price for licenseType
    //    in Firestore before trusting it. Example (fill in with your Firestore setup):
    //
    // const beatDoc = await db.collection('beats').doc(beatId).get();
    // const expectedPrice = beatDoc.data().prices[licenseType]; // in your base currency
    // if (amountPaidKobo / 100 < expectedPrice) {
    //   return res.status(402).json({ error: 'Amount paid does not match beat price' });
    // }

    // 3. TODO: Mark the beat as sold / record the sale in Firestore.
    //    Do this in a transaction so two buyers can't both "win" an exclusive license.
    //
    // await db.runTransaction(async (t) => {
    //   const beatRef = db.collection('beats').doc(beatId);
    //   const beatSnap = await t.get(beatRef);
    //   if (licenseType === 'exclusive' && beatSnap.data().sold) {
    //     throw new Error('Beat already sold exclusively');
    //   }
    //   t.update(beatRef, { sold: licenseType === 'exclusive', lastSaleRef: reference });
    //   t.set(db.collection('sales').doc(reference), {
    //     beatId, buyerId, licenseType, amountPaidKobo, currency,
    //     paystackReference: reference,
    //     createdAt: new Date().toISOString(),
    //   });
    // });

    // 4. TODO: Generate the license doc + signed download link, return them below.

    return res.status(200).json({
      success: true,
      reference,
      amountPaidKobo,
      currency,
      // licenseUrl: '...',
      // downloadUrl: '...',
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
