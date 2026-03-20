// Gestionnaire de demandes en attente (mémoire uniquement, TTL 5 min)
// Pas besoin de persistence : elles expirent au redémarrage

const DEMANDES = new Map(); // key = `${type}_${fromId}_${toId}_${guildId}`

const TTL = 5 * 60 * 1000; // 5 minutes

function key(type, fromId, toId, guildId) {
  return `${type}:${fromId}:${toId}:${guildId}`;
}

const Demandes = {
  creer(type, fromId, toId, guildId, messageId) {
    const k = key(type, fromId, toId, guildId);
    const expiresAt = Date.now() + TTL;
    DEMANDES.set(k, { type, fromId, toId, guildId, messageId, expiresAt });

    // Auto-nettoyage
    setTimeout(() => DEMANDES.delete(k), TTL);
    return k;
  },

  get(type, fromId, toId, guildId) {
    const k = key(type, fromId, toId, guildId);
    const d = DEMANDES.get(k);
    if (!d) return null;
    if (d.expiresAt < Date.now()) { DEMANDES.delete(k); return null; }
    return d;
  },

  getByMessage(messageId) {
    for (const [, d] of DEMANDES) {
      if (d.messageId === messageId) {
        if (d.expiresAt < Date.now()) { DEMANDES.delete(key(d.type, d.fromId, d.toId, d.guildId)); return null; }
        return d;
      }
    }
    return null;
  },

  supprimer(type, fromId, toId, guildId) {
    DEMANDES.delete(key(type, fromId, toId, guildId));
  },

  // Demande en attente vers un user (évite les doublons)
  hasPending(type, toId, guildId) {
    for (const [, d] of DEMANDES) {
      if (d.type === type && d.toId === toId && d.guildId === guildId && d.expiresAt > Date.now()) return true;
    }
    return false;
  },

  hasPendingFrom(type, fromId, guildId) {
    for (const [, d] of DEMANDES) {
      if (d.type === type && d.fromId === fromId && d.guildId === guildId && d.expiresAt > Date.now()) return true;
    }
    return false;
  },
};

module.exports = Demandes;
