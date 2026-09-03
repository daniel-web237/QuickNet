import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();
const ordersCollection = db.collection('orders');

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

      const docRef = await ordersCollection.add({
        nom,
        telephone,
        reseau,
        forfait,
        montant,
        statut: 'en_attente', // en_attente | confirme | annule
        date: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ ok: true, id: docRef.id });
    }

    if (req.method === 'GET') {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorisé' });
      }

      const snapshot = await ordersCollection.orderBy('date', 'desc').get();
      const orders = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date ? data.date.toDate().toISOString() : new Date().toISOString()
        };
      });

      return res.status(200).json({ orders });
    }

    if (req.method === 'PATCH') {
      if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorisé' });
      }

      const { id, statut } = req.body || {};
      if (!id || !statut) {
        return res.status(400).json({ error: 'id et statut requis' });
      }

      await ordersCollection.doc(id).update({ statut });

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

      await ordersCollection.doc(id).delete();

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', details: String(err) });
  }
}
