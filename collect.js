// Fonction serveur (Vercel) : initie une collecte de paiement Mobile Money via CamPay.
// Le jeton secret CAMPAY_PERMANENT_TOKEN n'est JAMAIS exposé au navigateur : il vit
// uniquement dans les variables d'environnement Vercel.

const CAMPAY_BASE_URL = process.env.CAMPAY_BASE_URL || 'https://demo.campay.net';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { amount, phone, description, reference } = req.body || {};

  if (!amount || !phone) {
    return res.status(400).json({ error: 'amount et phone sont requis' });
  }

  // phone doit être au format 237XXXXXXXXX (sans "+")
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!/^237[62]\d{8}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Numéro de téléphone camerounais invalide' });
  }

  if (!process.env.CAMPAY_PERMANENT_TOKEN) {
    return res.status(500).json({ error: "Le serveur n'est pas configuré (clé CamPay manquante)" });
  }

  try {
    const response = await fetch(`${CAMPAY_BASE_URL}/api/collect/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.CAMPAY_PERMANENT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: 'XAF',
        from: cleanPhone,
        description: description || 'Paiement AbosPro',
        external_reference: reference || `abospro_${Date.now()}`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    // data contient normalement : { reference, ussd_code, ... }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', details: String(err) });
  }
}
