import { kv } from '@vercel/kv';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function isAuthorized(req) {
  const provided = req.headers['x-admin-password'] || req.query.password;
  return Boolean(ADMIN_PASSWORD) && provided === ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { nom, telephone, reseau, forfait, montant } = req.body || {};
      if (!nom || !telephone || !reseau || !forfait || !montant) {
        return res.status(400).json({ error: 'Champs manquants' });
      }

      const id = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order = {
        id,
        nom,
        telephone,
        reseau,
        forfait,
        montant,
        statut: 'en_attente', // en_attente | confirme | annule
        date: new Date().toISOString()
      };

      await kv.set(id, order);
      await kv.zadd('orders_index', { score: Date.now(), member: id });

      return res.status(200).json({ ok: true, id });
    }

    if (req.method === 'GET') {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorisé' });
      }

      const ids = await kv.zrange('orders_index', 0, -1, { rev: true });
      const orders = ids && ids.length ? await Promise.all(ids.map((id) => kv.get(id))) : [];

      return res.status(200).json({ orders: orders.filter(Boolean) });
    }

    if (req.method === 'PATCH') {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorisé' });
      }

      const { id, statut } = req.body || {};
      if (!id || !statut) {
        return res.status(400).json({ error: 'id et statut requis' });
      }

      const order = await kv.get(id);
      if (!order) {
        return res.status(404).json({ error: 'Commande introuvable' });
      }

      order.statut = statut;
      await kv.set(id, order);

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorisé' });
      }

      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'id requis' });
      }

      await kv.del(id);
      await kv.zrem('orders_index', id);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', details: String(err) });
  }
}
