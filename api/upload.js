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

    // Sanitize filename — remove extension, slashes, special chars
    const safeName = (fileName || 'beat')
      .replace(/\.[^/.]+$/, '')        // remove extension
      .replace(/[^a-zA-Z0-9_-]/g, '_') // replace special chars/slashes with underscore
      .slice(0, 60);                   // limit length

    const publicId = `beats/${Date.now()}_${safeName}`;

    // Sign the upload
    const timestamp = Math.round(Date.now() / 1000);
    const str = `public_id=${publicId}&timestamp=${timestamp}&upload_preset=klave_beats${apiSecret}`;

    const { createHash } = await import('crypto');
    const signature = createHash('sha1').update(str).digest('hex');

    const params = new URLSearchParams();
    params.append('file', file);
    params.append('upload_preset', 'klave_beats');
    params.append('api_key', apiKey);
    params.append('timestamp', timestamp);
    params.append('signature', signature);
    params.append('public_id', publicId);
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
