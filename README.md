# Scraper Securigreffe

Ce projet est un script Node.js qui automatise la récupération des documents PDF depuis Securigreffe et les envoie à l'API Auctionis.

## Fonctionnalités

- 🔐 Connexion automatique à Securigreffe
- 📁 Parcours automatique des dossiers et sous-dossiers
- 📄 Récupération des documents PDF
- 🔄 Vérification des doublons avant envoi
- 📤 Envoi automatique à l'API Auctionis
- 📝 Logs détaillés avec emojis pour une meilleure lisibilité

## Prérequis

- Node.js (version 18 ou supérieure)
- npm (gestionnaire de paquets Node.js)
- Un compte Securigreffe avec accès aux documents
- Les identifiants d'accès à l'API Auctionis

## Installation

1. Clonez ce dépôt :
```bash
git clone https://github.com/rcoco78/securigreffe-scraper.git
cd securigreffe-scraper
```

2. Installez les dépendances :
```bash
npm install
```

3. Créez un fichier `.env` à la racine du projet avec les variables suivantes :
```env
SECURIGREFFE_LOGIN=votre_login
SECURIGREFFE_PASSWORD=votre_password
API_URL=url_de_l_api
```

## Utilisation

Pour lancer le script :
```bash
node login.js
```

## GitHub Actions

Le script est configuré pour s'exécuter automatiquement via GitHub Actions tous les jours à 3h du matin UTC.

Pour configurer GitHub Actions :

1. Allez dans les paramètres de votre repo GitHub
2. Dans "Secrets and variables" > "Actions"
3. Ajoutez les secrets suivants :
   - `SECURIGREFFE_LOGIN` : votre identifiant Securigreffe
   - `SECURIGREFFE_PASSWORD` : votre mot de passe Securigreffe
   - `API_URL` : l'URL de l'API Auctionis

## Structure du projet

```
securigreffe/
├── .github/
│   └── workflows/
│       └── scraper-daily.yml    # Configuration GitHub Actions
├── login.js                     # Script principal
├── package.json                 # Dépendances et scripts
└── README.md                    # Documentation
```

## Logs

Le script utilise des emojis pour une meilleure lisibilité des logs :
- 📁 : Dossier
- 📂 : Sous-dossier
- 📄 : Fichier PDF
- ✅ : Succès
- ❌ : Erreur
- ⏭️ : Action ignorée (fichier déjà présent)
- ✨ : Nouveau fichier détecté