// api/upload.js — Cloudinary upload proxy using base64 data URI
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '52mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { file, fileName } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Cloudinary env vars missing' });
    }

    // Sign the upload
    const timestamp = Math.round(Date.now() / 1000);
    const str = `timestamp=${timestamp}&upload_preset=klave_beats${apiSecret}`;
    
    // Use crypto to sign
    const { createHash } = await import('crypto');
    const signature = createHash('sha1').update(str).digest('hex');

    // Send as JSON to Cloudinary
    const params = new URLSearchParams();
    params.append('file', file); // base64 data URI
    params.append('upload_preset', 'klave_beats');
    params.append('api_key', apiKey);
    params.append('timestamp', timestamp);
    params.append('signature', signature);
    params.append('resource_type', 'auto');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    return res.status(200).json({
      secure_url: data.secure_url,
      public_id: data.public_id,
      duration: data.duration || 0,
      format: data.format,
      bytes: data.bytes,
    });

  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: e.message });
  }
}
