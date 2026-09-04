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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function notifyTelegram(order) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const text =
    '🔔 Nouvelle commande QuickNet\n\n' +
    'Code : ' + order.code + '\n' +
    'Nom : ' + order.nom + '\n' +
    'Téléphone : ' + order.telephone + '\n' +
    'Réseau : ' + order.reseau + '\n' +
    'Forfait : ' + order.forfait + '\n' +
    'Montant : ' + order.montant + ' F\n' +
    (order.reference ? 'Référence SMS : ' + order.reference + '\n' : '') +
    '\nVérifie ta réception avant de confirmer sur /admin.html';

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    });
  } catch (err) {
    // une notif ratée ne doit jamais faire échouer la commande
  }
}

function isAuthorized(req) {
  const provided = req.headers['x-admin-password'] || req.query.password;
  return Boolean(ADMIN_PASSWORD) && provided === ADMIN_PASSWORD;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { nom, telephone, reseau, forfait, montant, reference } = req.body || {};
      if (!nom || !telephone || !reseau || !forfait || !montant || !reference) {
        return res.status(400).json({ error: 'Champs manquants (référence de transaction requise)' });
      }

      const code = generateCode();

      const docRef = await ordersCollection.add({
        nom,
        telephone,
        reseau,
        forfait,
        montant,
        reference: reference || null,
        code,
        statut: 'en_attente', // en_attente | confirme | annule
        date: admin.firestore.FieldValue.serverTimestamp()
      });

      await notifyTelegram({ code, nom, telephone, reseau, forfait, montant, reference });

      return res.status(200).json({ ok: true, id: docRef.id, code });
    }

    if (req.method === 'GET') {
      // Vérification publique du statut par code (le client, sans mot de passe)
      if (req.query.code) {
        const snapshot = await ordersCollection.where('code', '==', String(req.query.code).toUpperCase()).limit(1).get();
        if (snapshot.empty) {
          return res.status(404).json({ error: 'Commande introuvable' });
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        return res.status(200).json({
          statut: data.statut,
          forfait: data.forfait,
          montant: data.montant
        });
      }

      // Liste complète, réservée à l'admin
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
