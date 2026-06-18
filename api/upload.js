// api/upload.js — Cloudinary upload proxy (no dependencies)
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

    // Build form data for Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'klave_beats');
    formData.append('resource_type', 'auto');
    formData.append('cloud_name', process.env.CLOUDINARY_CLOUD_NAME);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    // Use Cloudinary REST API directly
    const timestamp = Math.round(Date.now() / 1000);
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      {
        method: 'POST',
        body: formData,
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
