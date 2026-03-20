# 💒 MarriageBot France v2

> Bot Discord de famille virtuelle **100% en français** — stockage JSON, design soigné, plein de commandes.

---

## ✨ Ce que le bot fait

- 💍 **Mariage** avec boutons interactifs et confirmation
- 💔 **Divorce** avec vérification anti-impulsivité
- 👶 **Adoption partagée** : si vous êtes marié(e), votre conjoint(e) adopte automatiquement aussi !
- 🌳 **Arbre généalogique** : grands-parents, frères/sœurs, petits-enfants inclus
- 🏅 **Système de badges** déblocables automatiquement
- 🎂 **Anniversaires** : enregistrez le vôtre, le bot rappelle les anniversaires du jour
- 🏆 **Classements** : plus d'enfants, plus de divorces, plus d'adoptions
- ⚙️ **Configuration** : salon de logs, rôle auto au mariage
- 🛡️ **Anti-inceste** : impossible d'épouser un membre de sa famille

---

## 📋 Liste complète des commandes

### 💍 Relations
| Commande | Description |
|----------|-------------|
| `/marier @personne` | Demande en mariage avec boutons Accepter / Refuser |
| `/divorcer` | Divorce avec confirmation |
| `/partenaire [@personne]` | Voir le/la conjoint(e) et depuis combien de temps |

### 👨‍👩‍👧‍👦 Famille
| Commande | Description |
|----------|-------------|
| `/adopter @personne` | Adoption — **partagée avec le conjoint automatiquement !** |
| `/desadopter @personne` | Désadopter un enfant |
| `/abandon` | Se désadopter soi-même de sa famille |
| `/enfants [@personne]` | Liste des enfants |
| `/parents [@personne]` | Voir les parents |

### 🌳 Généalogie
| Commande | Description |
|----------|-------------|
| `/arbre [@personne]` | Arbre généalogique complet |
| `/famille [@personne]` | Famille étendue avec mentions cliquables |
| `/relation @personne` | Lien de parenté entre vous et quelqu'un |

### 👤 Profil
| Commande | Description |
|----------|-------------|
| `/profil [@personne]` | Profil famille complet |
| `/bio <texte>` | Modifier votre bio |
| `/emoji <emoji>` | Emoji affiché dans votre profil de relation |
| `/anniversaire <JJ/MM>` | Enregistrer votre date de naissance |
| `/badges [@personne]` | Voir les badges obtenus |

### 🏆 Classements & Stats
| Commande | Description |
|----------|-------------|
| `/classement enfants` | Top des utilisateurs avec le plus d'enfants |
| `/classement divorces` | Top des utilisateurs avec le plus de divorces |
| `/classement adoptions` | Top des utilisateurs avec le plus d'adoptions |
| `/statistiques` | Stats globales du serveur |
| `/anniversaires` | Anniversaires du jour sur le serveur |

### ⚙️ Administration *(nécessite "Gérer le serveur")*
| Commande | Description |
|----------|-------------|
| `/config log <salon>` | Salon où envoyer les logs d'événements |
| `/config role-marie <rôle>` | Rôle attribué automatiquement lors d'un mariage |
| `/config voir` | Voir la configuration actuelle |
| `/admin reset @personne` | Réinitialiser le profil d'un utilisateur |
| `/admin infos @personne` | Voir les données brutes JSON d'un utilisateur |

### ❓ Aide
| Commande | Description |
|----------|-------------|
| `/aide` | Guide complet de toutes les commandes |

---

## 🏅 Badges

| Badge | Condition |
|-------|-----------|
| 💍 Premier Amour | S'est marié pour la première fois |
| 👨‍👩‍👧‍👦 Grande Famille | Avoir au moins 5 enfants |
| 💔 Cœur Brisé | Avoir divorcé 3 fois |
| 🍼 Parent en série | Avoir adopté 10 enfants au total |
| ⭐ Fidèle en amour | Marié depuis plus de 30 jours sans divorce |

---

## 🗄️ Stockage JSON

Toutes les données sont stockées dans `data/guilds.json`.  
Structure par serveur :

```json
{
  "GUILD_ID": {
    "users": {
      "USER_ID": {
        "partner": "USER_ID ou null",
        "children": ["USER_ID", "..."],
        "parents": ["USER_ID", "..."],
        "bio": "Ma bio",
        "emoji": "💑",
        "marriedAt": "2025-01-01T00:00:00.000Z",
        "divorces": 0,
        "proposals": 0,
        "adoptions": 0,
        "badges": ["premier_mariage"],
        "anniversaire": "02-14"
      }
    },
    "stats": {
      "totalMariages": 0,
      "totalDivorces": 0,
      "totalAdoptions": 0
    },
    "config": {
      "logChannel": "CHANNEL_ID ou null",
      "roleMaried": "ROLE_ID ou null",
      "couleurEmbed": null
    }
  }
}
```

---

## 🚀 Installation

### 1. Prérequis
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- Un bot Discord créé sur le [portail développeur](https://discord.com/developers/applications)

### 2. Cloner et installer
```bash
git clone https://github.com/vous/marriagebot-france
cd marriagebot-france
npm install
```

### 3. Configuration
```bash
cp .env.example .env
# Éditez .env et remplissez DISCORD_TOKEN et CLIENT_ID
```

### 4. Permissions Discord
Dans le portail développeur :
- ✅ Scope : **bot** + **applications.commands**
- ✅ Permissions : `Send Messages`, `Embed Links`, `Read Message History`, `Manage Roles` *(pour le rôle auto)*
- ✅ Intents : **Server Members Intent** *(pour les rôles automatiques)*

### 5. Démarrer
```bash
npm start
# ou en mode développement avec rechargement auto :
npm run dev
```

Les commandes slash s'enregistrent **automatiquement** au premier démarrage.

---

## 🛡️ Règles de sécurité
- ❌ Impossible de se marier avec soi-même ou un bot
- ❌ Impossible d'épouser un membre de sa famille (anti-inceste)
- ❌ Un enfant peut avoir au maximum **2 parents**
- ⏰ Les demandes expirent après **5 minutes**
- ⚠️ Le divorce nécessite une **confirmation** (bouton)
- 🔒 Les commandes admin nécessitent la permission **"Gérer le serveur"**

---

*Fait avec ❤️ pour la communauté Discord française*
