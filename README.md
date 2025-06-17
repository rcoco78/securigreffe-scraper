# Scraper Securigreffe

> 🤖 Script d'automatisation pour la récupération et le traitement des documents Securigreffe

Ce projet est un script Node.js qui automatise la récupération des documents PDF depuis Securigreffe et les envoie à l'API Auctionis. Il permet de centraliser automatiquement les documents juridiques et d'éviter les doublons.

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

## Logique de classement des documents

Le script classe automatiquement chaque PDF dans l'un des sous-dossiers métier suivants selon le dossier d'origine et la description du document :

- **GREFFE**
  - Documents issus du sous-dossier "courrier" dont la description contient :
    - "Certificat de dépôt en matière RJLJ - inventaire"
    - "Lettre transmission du jugement au chargé d'inventaire - inventaire d'une procédure de (redressement ou liquidation) judiciaire"
    - "Transmission ext jugt rj (ou lj) - ouverture de redressement (ou lj) judiciaire sans administrateur"
  - Documents issus du dossier "jugement" dont la description contient :
    - "Décisions (signature électronique) - ouverture d'une procédure de redressement (ou liquidation) judiciaire"

- **HONORAIRES**
  - Documents issus du dossier "courrier" dont la description contient :
    - "Certificat dépôt en matière RJLJ - Fixation de la rémunération du chargé d'inventaire"
    - "Notification d'ordonnance - fixation de la rémunération du chargé d'inventaire"
  - Documents issus du dossier "Ordonnance du président du TAE" dont la description contient :
    - "Ordonnance du Président du TAE fixation de la rémunération du chargé d'inventaire"

- **VENTE**
  - Documents issus du dossier "ordonnance du juge commissaire" dont la description contient :
    - "Ordonnance du juge commissaire (signature électronique) - autorisation de la vente aux enchères publiques des autres biens du débiteur"

Le classement est entièrement automatisé et s'appuie sur la détection de mots-clés dans la description et le dossier d'origine.

## Logs

Le script affiche dans les logs :
- La description extraite pour chaque PDF
- Le sous-dossier métier choisi (GREFFE, HONORAIRES, VENTE)