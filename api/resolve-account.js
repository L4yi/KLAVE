// /api/resolve-account.js
// Vercel serverless function — verifies a bank account number + bank code
// actually belongs to a real account, and returns the account holder's name
// so the ambassador can confirm it's theirs before it's saved. Never trust
// an account number without this check — a typo'd digit sends someone
// else's commission to a stranger.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accountNumber, bankCode } = req.body || {};
  if (!accountNumber || !bankCode) {
    return res.status(400).json({ error: 'accountNumber and bankCode are required' });
  }

  try {
    const psRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const psData = await psRes.json();

    if (!psData.status) {
      return res.status(400).json({ error: psData.message || 'Could not verify that account' });
    }

    return res.status(200).json({
      accountName: psData.data.account_name,
      accountNumber: psData.data.account_number,
    });
  } catch (err) {
    console.error('resolve-account failed:', err);
    return res.status(500).json({ error: 'Account verification failed' });
  }
}
