// Fonction serveur (Vercel) : vérifie le statut d'une transaction CamPay par sa référence.

const CAMPAY_BASE_URL = process.env.CAMPAY_BASE_URL || 'https://demo.campay.net';

export default async function handler(req, res) {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ error: 'reference requise' });
  }

  if (!process.env.CAMPAY_PERMANENT_TOKEN) {
    return res.status(500).json({ error: "Le serveur n'est pas configuré (clé CamPay manquante)" });
  }

  try {
    const response = await fetch(`${CAMPAY_BASE_URL}/api/transaction/${encodeURIComponent(reference)}/`, {
      headers: {
        Authorization: `Token ${process.env.CAMPAY_PERMANENT_TOKEN}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    // data.status vaut normalement : PENDING | SUCCESSFUL | FAILED
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', details: String(err) });
  }
}
