// v4 — added fallback for when the Anthropic API is unfunded / errors out
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;

  // Flip to true once the Anthropic API account has credit again.
  const NERO_LIVE = false;

  if (!NERO_LIVE) {
    return res.status(200).json(fallbackResponse(messages));
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        system: 'You are NERO, an AI inside KLAVE, a beat marketplace. Help producers with target audience, pricing, platforms, and marketing. Be direct and concise. Max 90 words.',
        messages
      })
    });

    const data = await response.json();

    // If the API errors out at runtime (e.g. billing/credit issue),
    // fall back gracefully instead of surfacing a raw error to the user.
    if (data.error) {
      console.error('NERO API error, falling back:', data.error.message);
      return res.status(200).json(fallbackResponse(messages));
    }

    res.status(200).json(data);
  } catch (e) {
    console.error('NERO call failed, falling back:', e.message);
    res.status(200).json(fallbackResponse(messages));
  }
}

// --- Fallback logic -----------------------------------------------------

function fallbackResponse(messages) {
  const lastUserMessage =
    (messages && messages.length && messages[messages.length - 1].content) || '';
  const text = getCannedReply(lastUserMessage);

  // Shaped to match the Anthropic API's response format, so the
  // frontend doesn't need any changes to read data.content[0].text
  return {
    content: [{ type: 'text', text }],
    mode: 'fallback'
  };
}

function getCannedReply(userMessage = '') {
  const msg = userMessage.toLowerCase();

  if (msg.includes('audience') || msg.includes('who should') || msg.includes('target')) {
    return "NERO's getting an upgrade — full AI guidance is back soon. Quick tip: check what genre tags your top-performing beats use, and lean into producers already buying in that lane.";
  }
  if (msg.includes('price') || msg.includes('pricing') || msg.includes('cost')) {
    return "NERO's getting an upgrade — full AI guidance is back soon. Quick tip: check the price range of similar beats in the trending tab before setting yours.";
  }
  if (msg.includes('market') || msg.includes('promote') || msg.includes('sell')) {
    return "NERO's getting an upgrade — full AI guidance is back soon. Quick tip: short clips of your beat with a hook in the first 3 seconds tend to perform best when sharing externally.";
  }

  return "NERO's getting an upgrade — full AI guidance is back soon. In the meantime, browse trending beats and tags for quick inspiration.";
}
