const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config(); // Charge les variables d'environnement depuis .env

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_PARALLEL = 4; // Nombre de sous-dossiers traités en parallèle

// Vérification des variables d'environnement requises
if (!process.env.SECURIGREFFE_LOGIN || !process.env.SECURIGREFFE_PASSWORD) {
    console.error('❌ Erreur: Les variables d\'environnement SECURIGREFFE_LOGIN et SECURIGREFFE_PASSWORD sont requises');
    process.exit(1);
}

// URLs de l'API Auctionis
if (!process.env.API_URL) {
    console.error('❌ Erreur: La variable d\'environnement API_URL est requise');
    process.exit(1);
}
const API_URL = process.env.API_URL;
const API_GET_URL = (securigreffeId) => `${API_URL}/${securigreffeId}`;
const API_POST_URL = API_URL;

// Fonction pour extraire l'ID du nom du PDF
function extractSecurigreffeId(pdfName) {
    const match = pdfName.match(/^(\d+)_/);
    return match ? match[1] : null;
}

// Fonction pour vérifier si le dossier existe
async function checkFolderExists(securigreffeId) {
    try {
        console.log(`Vérification de l'existence du dossier ${securigreffeId}...`);
        const res = await fetch(API_GET_URL(securigreffeId));
        const text = await res.text();
        
        if (res.status === 404 || text.includes("not found")) {
            console.log(`Dossier ${securigreffeId} non trouvé`);
            return false;
        }
        
        if (!res.ok) {
            console.error(`Erreur lors de la vérification du dossier:`, {
                status: res.status,
                statusText: res.statusText,
                body: text
            });
            return false;
        }

        console.log(`Dossier ${securigreffeId} trouvé`);
        return true;
    } catch (e) {
        console.error('Erreur lors de la vérification du dossier:', e);
        return false;
    }
}

// Ajout d'une fonction pour récupérer la liste des fichiers du dossier
async function getExistingPdfNamesInFolder(securigreffeId) {
    try {
        const res = await fetch(API_GET_URL(securigreffeId));
        if (!res.ok) return new Set();
        const data = await res.json();
        if (data && data['hydra:member']) {
            return new Set(data['hydra:member']);
        }
        return new Set();
    } catch (e) {
        return new Set();
    }
}

function normalize(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // retire les accents
        .replace(/\s+/g, ' ')
        .trim();
}

function getSubfolder(dossier1, dossier2, nomPdf, description = '') {
    const d2 = normalize(dossier2); // "chemin"
    const desc = normalize(description); // "titre"

    // Règles prioritaires explicites
    if (d2 === 'ordonnance juge commissaire') {
        return 'VENTE';
    }
    if (d2 === 'ordonnance du president du tribunal de commerce') {
        return 'HONORAIRES';
    }

    // 🔷 Dossier GREFFE
    if (d2.includes('courrier')) {
        if (desc.includes('certificat de depot') && desc.includes('rjlj')) {
            return 'GREFFE';
        }
        if (desc.includes('rjlj') && desc.includes('inventaire')) {
            return 'GREFFE';
        }
        if (desc.includes('transmission du jugement') && desc.includes('inventaire')) {
            return 'GREFFE';
        }
        if (desc.includes('transmission ext jugt')) {
            return 'GREFFE';
        }
    }
    if (d2.includes('jugement')) {
        if (desc.includes('decision') && desc.includes('ouverture') && (desc.includes('redressement') || desc.includes('liquidation'))) {
            return 'GREFFE';
        }
    }

    // 🔷 Dossier HONORAIRES
    if (d2.includes('courrier')) {
        if (desc.includes('certificat depot') && desc.includes('fixation de la remuneration')) {
            return 'HONORAIRES';
        }
        if (desc.includes("notification d'ordonnance") && desc.includes('remuneration')) {
            return 'HONORAIRES';
        }
    }
    if (d2.includes('ordonnance du president')) {
        if (desc.includes('ordonnance') && desc.includes('fixation de la remuneration')) {
            return 'HONORAIRES';
        }
    }

    // 🔷 Dossier VENTE (patch accentué et variantes)
    if (d2.includes('ordonnance du juge commissaire')) {
        // On accepte vente aux encheres (avec ou sans accent), vente aux encheres publiques, autorisation de la vente, etc.
        if (
            (desc.includes('ordonnance du juge commissaire') &&
                (
                    desc.includes('vente aux encheres') ||
                    desc.includes('vente aux encheres publiques') ||
                    desc.includes('autorisation de la vente')
                )
            )
        ) {
            return 'VENTE';
        }
    }

    // Par défaut, si aucune règle ne correspond
    return 'NON_CLASSE';
}

async function loginToSecurigreffe() {
    let browser = null;
    // On prépare un tableau pour stocker les résultats
    const results = [];
    let nouveauxFichiers = 0;
    try {
        console.log('Lancement du navigateur...');
        browser = await puppeteer.launch({
            headless: "new",
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                '--window-size=1920,1080'
            ],
            ignoreHTTPSErrors: true,
            protocolTimeout: 120000
        });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(120000);
        await page.setDefaultTimeout(120000);
        console.log('Navigation vers la page de connexion...');
        await page.goto('https://securigreffe.infogreffe.fr/infogreffe/#/connect/idpwd', { waitUntil: 'networkidle0' });
        console.log('Attente après navigation (4s)...');
        await sleep(4000);
        console.log('Remplissage des champs...');
        const loginSelector = '#loginInput';
        const passwordSelector = '#passwordInput';
        await page.waitForSelector(loginSelector, { visible: true });
        await page.waitForSelector(passwordSelector, { visible: true });
        await page.evaluate((selector) => document.querySelector(selector).value = '', loginSelector);
        await page.evaluate((selector) => document.querySelector(selector).value = '', passwordSelector);
        await page.type(loginSelector, process.env.SECURIGREFFE_LOGIN, { delay: 100 });
        await page.type(passwordSelector, process.env.SECURIGREFFE_PASSWORD, { delay: 100 });
        const buttonSelector = '.connexionBoutton:not([disabled])';
        await page.waitForSelector(buttonSelector, { visible: true });
        console.log('Tentative de connexion...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click(buttonSelector)
        ]);
        console.log('Connexion réussie !');
        await sleep(3000);

        // Cliquer sur le dossier "2025"
        console.log("Recherche et clic sur le dossier '2025'...");
        // On cherche le span qui contient le texte '2025' dans la colonne Nom
        const dossier2025Selector = "td.col-name span";
        await page.waitForSelector(dossier2025Selector, { visible: true });
        const dossiers = await page.$$(dossier2025Selector);
        let trouve = false;
        for (const dossier of dossiers) {
            const text = await page.evaluate(el => el.textContent.trim(), dossier);
            if (text === '2025') {
                await dossier.click();
                trouve = true;
                console.log("Dossier '2025' cliqué.");
                // Scroll progressif pour charger tous les sous-dossiers
                await page.waitForSelector('.padded', { visible: true });
                let lastCount = 0;
                let stableCount = 0;
                let essais = 0;
                while (essais < 30) { // Limite de sécurité
                    const scrollable = await page.$('.padded');
                    if (!scrollable) {
                        console.log("❌ Impossible de trouver la div .scrollable");
                        break;
                    }
                    await page.evaluate(el => { el.scrollBy(0, 500); }, scrollable);
                    console.log('Attente après scroll (1s)...');
                    await sleep(1000);
                    const count = await page.$$eval('.tree-row > .name', els => els.length);
                    console.log(`Nombre de dossiers détectés : ${count}`);
                    if (count === lastCount) {
                        stableCount++;
                        if (stableCount >= 3) break;
                    } else {
                        stableCount = 0;
                    }
                    lastCount = count;
                    essais++;
                }
                break;
            }
        }
        if (!trouve) {
            console.log("Dossier '2025' non trouvé !");
            return;
        }
        // Attendre que les sous-dossiers s'affichent (on attend la présence d'un sous-dossier)
        await sleep(2000);

        // Nouvelle étape : cliquer sur "Voir plus" tant qu'il existe
        let voirPlusSelector = 'a[title="Afficher plus de dossier"]';
        let clicsVoirPlus = 0;
        while (await page.$(voirPlusSelector) !== null) {
            console.log("➡️  Clic sur 'Voir plus' pour charger plus de dossiers...");
            await page.evaluate((sel) => {
                const btn = document.querySelector(sel);
                if (btn) btn.click();
            }, voirPlusSelector);
            clicsVoirPlus++;
            await sleep(2000); // attendre le chargement des nouveaux dossiers
        }
        console.log(`✅ Nombre de clics sur 'Voir plus' : ${clicsVoirPlus}`);

        // Cliquer sur chaque sous-dossier un par un (version robuste)
        console.log("Début du parcours des sous-dossiers de 2025...");
        // On récupère d'abord la liste des noms de sous-dossiers (hors '2025')
        const sousDossierSelector = ".tree-row > .name";
        await page.waitForSelector(sousDossierSelector, { visible: true });
        let sousDossierNoms = await page.$$eval(
            sousDossierSelector,
            els => els.map(e => e.textContent.trim()).filter(nom => nom && nom !== '2025')
        );

        // Boucle sur chaque sous-dossier 1
        for (let index = 0; index < sousDossierNoms.length; index++) {
            const nom = sousDossierNoms[index];
            console.log(`\n📁 Sous-dossier ${index + 1}/${sousDossierNoms.length}: ${nom}`);
            let clicked = false;
            let attempts = 0;
            const maxAttempts = 3;
            while (!clicked && attempts < maxAttempts) {
                try {
                    await page.waitForSelector(sousDossierSelector, { visible: true });
                    const elements = await page.$$(sousDossierSelector);
                    let found = false;
                    for (const el of elements) {
                        const text = await page.evaluate(e => e.textContent.trim(), el);
                        if (text === nom) {
                            await el.click();
                            found = true;
                            clicked = true;
                            break;
                        }
                    }
                    if (!found) {
                        console.log(`  ❌ Sous-dossier '${nom}' non trouvé à la tentative ${attempts + 1}.`);
                        break; // inutile de réessayer si le nom n'est pas dans la liste
                    }
                } catch (err) {
                    console.log(`  ⚠️  Erreur lors du clic sur '${nom}' (tentative ${attempts + 1}/${maxAttempts}): ${err.message || err}`);
                    await sleep(1000); // petit délai avant de réessayer
                }
                attempts++;
            }
            if (!clicked) {
                console.log(`  ❌ Impossible d'ouvrir le sous-dossier '${nom}' après ${maxAttempts} tentatives, on passe au suivant.`);
                continue;
            }
            await sleep(1500);

            // Récupérer la liste des sous-dossiers 2 à l'intérieur du sous-dossier 1
            const sousDossier2Selector = "td.col-name span";
            await page.waitForSelector(sousDossier2Selector, { visible: true });
            let sousDossier2Noms = await page.$$eval(
                sousDossier2Selector,
                (els, nom1) => els.map(e => e.textContent.trim()).filter(n => n && n !== nom1),
                nom
            );
            for (let idx2 = 0; idx2 < sousDossier2Noms.length; idx2++) {
                const nom2 = sousDossier2Noms[idx2];
                console.log(`\n  📂 Sous-dossier ${idx2 + 1}/${sousDossier2Noms.length}: ${nom2}`);
                try {
                    // Rechercher dynamiquement le bon élément à chaque itération
                    await page.waitForSelector(sousDossier2Selector, { visible: true });
                    const elements2 = await page.$$(sousDossier2Selector);
                    let found2 = false;
                    for (const el2 of elements2) {
                        const text2 = await page.evaluate(e => e.textContent.trim(), el2);
                        if (text2 === nom2) {
                            await el2.click();
                            found2 = true;
                            break;
                        }
                    }
                    if (!found2) {
                        console.log(`    ❌ Sous-dossier '${nom2}' non trouvé, on passe au suivant.`);
                        continue;
                    }
                    await sleep(2000);
                    // Récupérer la liste des PDF à l'intérieur du sous-dossier 2
                    const pdfSelector = "td.col-name span";
                    await page.waitForSelector(pdfSelector, { visible: true });
                    let pdfNoms = await page.$$eval(pdfSelector, els => els.map(e => e.textContent.trim()).filter(n => n && n.toLowerCase().endsWith('.pdf')));
                    for (let idxPdf = 0; idxPdf < pdfNoms.length; idxPdf++) {
                        const pdfNom = pdfNoms[idxPdf];
                        console.log(`\n    📄 PDF ${idxPdf + 1}/${pdfNoms.length}: ${pdfNom}`);
                        try {
                            // Cliquer sur le PDF pour obtenir l'URL
                            await page.waitForSelector(pdfSelector, { visible: true });
                            const pdfElements = await page.$$(pdfSelector);
                            let pdfUrl = '';
                            let retryCount = 0;
                            const maxRetries = 3;
                            let pdfFound = false;
                            while (retryCount < maxRetries && !pdfFound) {
                                for (const elPdf of pdfElements) {
                                    const textPdf = await page.evaluate(e => e.textContent.trim(), elPdf);
                                    if (textPdf === pdfNom) {
                                        await elPdf.click();
                                        await sleep(1000);
                                        // Attente supplémentaire pour laisser le temps au PDF de charger complètement
                                        await sleep(2000);
                                        const pages = await browser.pages();
                                        let pdfPage = pages[pages.length - 1];
                                        if (pdfPage !== page) {
                                            pdfUrl = pdfPage.url();
                                            if (!pdfUrl || pdfUrl === 'about:blank') {
                                                console.log(`      ⚠️  Impossible de récupérer l'URL du PDF, tentative ${retryCount + 1}/${maxRetries}`);
                                                await pdfPage.close();
                                                retryCount++;
                                                await sleep(1000);
                                                continue;
                                            } else {
                                                await pdfPage.close();
                                                pdfFound = true;
                                            }
                                        } else {
                                            pdfUrl = await page.url();
                                            if (!pdfUrl || pdfUrl === 'about:blank') {
                                                console.log(`      ⚠️  Impossible de récupérer l'URL du PDF (même onglet), tentative ${retryCount + 1}/${maxRetries}`);
                                                retryCount++;
                                                await sleep(1000);
                                                continue;
                                            } else {
                                                pdfFound = true;
                                            }
                                        }
                                        // Récupérer la ligne <tr> correspondant à ce PDF
                                        const pdfRows = await page.$$('tr');
                                        let description = '';
                                        for (const row of pdfRows) {
                                            try {
                                                // Récupérer le nom du PDF dans la ligne
                                                const nomCell = await row.$('td.col-name span');
                                                if (nomCell) {
                                                    const nomCellText = await (await nomCell.getProperty('textContent')).jsonValue();
                                                    if (nomCellText && nomCellText.trim() === pdfNom) {
                                                        // Chercher la description dans les td.col-name.hidden-xs-down > span
                                                        const descSpans = await row.$$('td.col-name.hidden-xs-down > span');
                                                        for (const span of descSpans) {
                                                            const text = (await (await span.getProperty('textContent')).jsonValue()).trim();
                                                            if (text && text !== pdfNom && text.length > 10) {
                                                                description = text;
                                                                break;
                                                            }
                                                        }
                                                        break;
                                                    }
                                                }
                                            } catch (e) {}
                                        }
                                        if (!description) {
                                            console.warn(`    ⚠️  Aucune description trouvée pour le PDF : ${pdfNom}`);
                                        }
                                        console.log(`    📝 Description du PDF : ${description}`);

                                        const tempSubfolder = getSubfolder(nom, nom2, pdfNom, description);
                                        console.log(`    🗂️  Le dossier aurait dû être envoyé vers : ${tempSubfolder}`);

                                        const data = {
                                            sous_dossier_1: nom,
                                            sous_dossier_2: nom2,
                                            nom_pdf: pdfNom,
                                            url_pdf: pdfUrl,
                                            date_scraping: new Date().toLocaleString('fr-FR', { hour12: false }),
                                            description: description
                                        };
                                        await sendToApi(data);
                                        break;
                                    }
                                }
                                if (!pdfFound) retryCount++;
                            }
                            if (!pdfFound) {
                                console.log(`      ❌ Abandon du PDF '${pdfNom}' après ${maxRetries} tentatives.`);
                            }
                        } catch (errPdf) {
                            console.error(`      ❌ Erreur lors du traitement du PDF '${pdfNom}':`, errPdf.message || errPdf);
                            continue;
                        }
                    }
                    // Revenir à la liste des sous-dossiers 2
                    await page.goBack();
                    await sleep(2000);
                } catch (errSous2) {
                    console.error(`    ❌ Erreur dans le sous-dossier 2 '${nom2}':`, errSous2.message || errSous2);
                    continue;
                }
            }
            // Revenir à la liste des sous-dossiers 1
            await page.goBack();
            await sleep(2000);
        }
        console.log("Tous les sous-dossiers et dossiers ont été ouverts un par un.");
    } catch (error) {
        console.error('Une erreur est survenue:', error);
    } finally {
        if (browser) {
            console.log('Fermeture du navigateur...');
            await browser.close();
        }
    }
}

// Exécution du script
console.log('Démarrage du script de login Securigreffe...');
loginToSecurigreffe().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
});

async function sendToApi(data) {
    // Utilisation de l'ID Securigreffe dynamique
    const securigreffeId = extractSecurigreffeId(data.nom_pdf);
    if (!securigreffeId) {
        console.log('      ❌ Impossible de déterminer l\'ID Securigreffe pour', data.nom_pdf);
        return;
    }
    // Vérifier l'existence du dossier
    const exists = await checkFolderExists(securigreffeId);
    if (!exists) {
        console.log(`      ❌ Dossier ${securigreffeId} inexistant chez Auctionis, fichier ignoré.`);
        return;
    }
    // Déterminer le sous-dossier
    const subfolder = getSubfolder(data.sous_dossier_1, data.sous_dossier_2, data.nom_pdf, data.description);
    console.log(`      📂 Sous-dossier choisi : ${subfolder} (description : ${data.description})`);
    // Si NON_CLASSE, on n'envoie pas à l'API
    if (subfolder === 'NON_CLASSE') {
        console.log(`      ⏭️  Document NON_CLASSE, pas d'envoi à l'API.`);
        return;
    }
    // Récupérer la liste des fichiers déjà présents dans le dossier
    const existingPdfs = await getExistingPdfNamesInFolder(securigreffeId);
    if (existingPdfs.has(data.nom_pdf)) {
        console.log(`      ⏭️  PDF déjà présent dans le dossier, pas d'envoi`);
        return;
    }
    // Si on arrive ici, c'est que le PDF n'existe pas encore
    console.log(`      ✨ Nouveau PDF détecté, envoi en cours...`);
    // Log détaillé de l'envoi
    console.log(`[ENVOI] Fichier : ${data.nom_pdf}\n        ID Securigreffe : ${securigreffeId}\n        Sous-dossier : ${subfolder}\n        URL API : ${API_POST_URL}`);
    // Préparation des données pour l'API
    const apiData = {
        filename: data.nom_pdf,
        file_url: data.url_pdf,
        securigreffe_id: securigreffeId,
        subfolder: subfolder
    };
    // Envoi à l'API Auctionis
    try {
        const res = await fetch(API_POST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData)
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`      ❌ Erreur lors de l'envoi à l'API:`, {
                status: res.status,
                statusText: res.statusText,
                body: errorText
            });
            return;
        }
        console.log(`      ✅ Fichier envoyé avec succès à l'API`);
    } catch (e) {
        console.error(`      ❌ Erreur lors de l'envoi à l'API:`, e.message);
        return;
    }
} 