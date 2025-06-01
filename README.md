# Securigreffe Scraper

Ce projet permet d'automatiser la récupération des documents PDF depuis Securigreffe et de les envoyer vers l'API Auctionis.

## Fonctionnalités

- 🔐 Connexion automatique à Securigreffe
- 📁 Navigation automatique dans l'arborescence des dossiers
- 📄 Détection et téléchargement des nouveaux PDFs
- 🔄 Vérification des doublons avant envoi
- 📤 Envoi automatique vers l'API Auctionis

## Prérequis

- Node.js (v14 ou supérieur)
- Un compte Securigreffe valide
- Accès à l'API Auctionis

## Installation

1. Clonez le repository :
```bash
git clone [repository-url]
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
```

## Utilisation

Lancez le script :
```bash
node securigreffe/login.js
```

Le script va :
1. Se connecter à Securigreffe
2. Naviguer dans le dossier "2025"
3. Parcourir tous les sous-dossiers
4. Détecter les nouveaux PDFs
5. Les envoyer à l'API Auctionis

## Structure des logs

Les logs sont organisés de manière hiérarchique pour une meilleure lisibilité :

```
📁 Sous-dossier 1/16: [NOM_DOSSIER]
  📂 Sous-dossier 1/1: [TYPE_DOSSIER]
    📄 PDF 1/1: [NOM_PDF]
      ⏭️  PDF déjà présent dans le dossier, pas d'envoi
      ✨ Nouveau PDF détecté, envoi en cours...
      ✅ Fichier envoyé avec succès à l'API
```

## Structure du projet

- `securigreffe/` : Dossier principal du projet
  - `login.js` : Script principal de scraping
  - `package.json` : Dépendances du projet
  - `.env` : Variables d'environnement (à créer)

## Configuration de l'API

L'API Auctionis est configurée avec :
- URL de base : `https://pp.auctionis.fr/api/public/files/securigreffe`
- ID Securigreffe fixe : `5439802`
- Sous-dossier fixe : `HONORAIRES`

## Gestion des erreurs

Le script gère plusieurs types d'erreurs :
- Échec de connexion à Securigreffe
- PDFs non trouvés
- Erreurs d'API

## Support

Pour toute question ou problème, veuillez ouvrir une issue sur GitHub.