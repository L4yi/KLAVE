// /api/list-banks.js
// Vercel serverless function — proxies Paystack's bank list so the frontend
// never needs the secret key. Used to populate the bank dropdown in the
// ambassador bank-details form.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const psRes = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const psData = await psRes.json();

    if (!psData.status) {
      throw new Error(psData.message || 'Paystack bank list request failed');
    }

    // Only send what the dropdown needs — name + code.
    const banks = psData.data.map(b => ({ name: b.name, code: b.code }));
    return res.status(200).json({ banks });
  } catch (err) {
    console.error('list-banks failed:', err);
    return res.status(500).json({ error: 'Could not load bank list' });
  }
}
