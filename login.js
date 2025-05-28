const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config(); // Charge les variables d'environnement depuis .env
// Pense à définir SECURIGREFFE_LOGIN et SECURIGREFFE_PASSWORD dans .env ou dans les secrets GitHub Actions

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_PARALLEL = 4; // Nombre de sous-dossiers traités en parallèle

// --- AJOUT POUR DEBUG GITHUB ACTIONS ---
process.env.SECURIGREFFE_LOGIN = 'nicolas.pastor';
process.env.SECURIGREFFE_PASSWORD = 'Lefaucheux72!';
// --- FIN AJOUT ---

const WEBHOOK_URL_1 = process.env.WEBHOOK_URL_1;
const WEBHOOK_URL_2 = process.env.WEBHOOK_URL_2;

// URLs de l'API Auctionis
const API_BASE_URL = 'https://pp.auctionis.fr/api/public/files/securigreffe';
const API_GET_URL = (securigreffeId) => `${API_BASE_URL}/${securigreffeId}`;
const API_POST_URL = API_BASE_URL;

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

async function loginToSecurigreffe() {
    if (!process.env.SECURIGREFFE_LOGIN || !process.env.SECURIGREFFE_PASSWORD) {
        throw new Error('Les variables d\'environnement SECURIGREFFE_LOGIN et/ou SECURIGREFFE_PASSWORD ne sont pas définies ou sont vides.');
    }
    let browser = null;
    // On prépare un tableau pour stocker les résultats
    const results = [];
    let nouveauxFichiers = 0;
    try {
        console.log('Lancement du navigateur...');
        browser = await puppeteer.launch({
            headless: 'new',
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized',
                '--window-size=1920,1080'
            ],
            ignoreHTTPSErrors: true,
            protocolTimeout: 60000
        });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(60000);
        console.log('Navigation vers la page de connexion...');
        await page.goto('https://securigreffe.infogreffe.fr/infogreffe/#/connect/idpwd', { waitUntil: 'networkidle0' });
        await sleep(3000);
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
        await sleep(5000);

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
                break;
            }
        }
        if (!trouve) {
            console.log("Dossier '2025' non trouvé !");
            return;
        }
        // Attendre que les sous-dossiers s'affichent (on attend la présence d'un sous-dossier)
        await sleep(2000);

        // Cliquer sur chaque sous-dossier un par un (version robuste)
        console.log("Début du parcours des sous-dossiers de 2025...");
        // On récupère d'abord la liste des noms de sous-dossiers (hors '2025')
        const sousDossierSelector = "td.col-name span";
        await page.waitForSelector(sousDossierSelector, { visible: true });
        let sousDossierNoms = await page.$$eval(sousDossierSelector, els => els.map(e => e.textContent.trim()).filter(nom => nom && nom !== '2025'));

        // Boucle sur chaque sous-dossier 1
        for (let index = 0; index < sousDossierNoms.length; index++) {
            const nom = sousDossierNoms[index];
            console.log(`Traitement du sous-dossier ${index + 1}/${sousDossierNoms.length} : ${nom}`);
            // Rechercher dynamiquement le bon élément à chaque itération
            await page.waitForSelector(sousDossierSelector, { visible: true });
            const elements = await page.$$(sousDossierSelector);
            let found = false;
            for (const el of elements) {
                const text = await page.evaluate(e => e.textContent.trim(), el);
                if (text === nom) {
                    await el.click();
                    found = true;
                    break;
                }
            }
            if (!found) {
                console.log(`Sous-dossier '${nom}' non trouvé, on passe au suivant.`);
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
                console.log(`  Traitement du sous-dossier 2 (${idx2 + 1}/${sousDossier2Noms.length}) : ${nom2}`);
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
                    console.log(`  Sous-dossier 2 '${nom2}' non trouvé, on passe au suivant.`);
                    continue;
                }
                await sleep(1200);
                // Récupérer la liste des PDF à l'intérieur du sous-dossier 2
                const pdfSelector = "td.col-name span";
                await page.waitForSelector(pdfSelector, { visible: true });
                let pdfNoms = await page.$$eval(pdfSelector, els => els.map(e => e.textContent.trim()).filter(n => n && n.toLowerCase().endsWith('.pdf')));
                for (let idxPdf = 0; idxPdf < pdfNoms.length; idxPdf++) {
                    const pdfNom = pdfNoms[idxPdf];
                    console.log(`    PDF trouvé (${idxPdf + 1}/${pdfNoms.length}) : ${pdfNom}`);
                    // Cliquer sur le PDF pour obtenir l'URL
                    await page.waitForSelector(pdfSelector, { visible: true });
                    const pdfElements = await page.$$(pdfSelector);
                    let pdfUrl = '';
                    for (const elPdf of pdfElements) {
                        const textPdf = await page.evaluate(e => e.textContent.trim(), elPdf);
                        if (textPdf === pdfNom) {
                            await elPdf.click();
                            await sleep(1000);
                            const pages = await browser.pages();
                            let pdfPage = pages[pages.length - 1];
                            if (pdfPage !== page) {
                                pdfUrl = pdfPage.url();
                                await pdfPage.close();
                            } else {
                                pdfUrl = await page.url();
                            }
                            const dateStr = new Date().toLocaleString('fr-FR', { hour12: false });
                            const data = {
                                sous_dossier_1: nom,
                                sous_dossier_2: nom2,
                                nom_pdf: pdfNom,
                                url_pdf: pdfUrl,
                                date_scraping: dateStr
                            };
                            await sendToWebhook(data);
                            console.log(`    Données envoyées au webhook pour : ${pdfNom}`);
                            break;
                        }
                    }
                }
                // Revenir à la liste des sous-dossiers 2
                await page.goBack();
                await sleep(1000);
            }
            // Revenir à la liste des sous-dossiers 1
            await page.goBack();
            await sleep(1000);
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

async function sendToWebhook(data) {
    // securigreffe_id fixe, subfolder fixe à 'HONORAIRES'
    const securigreffeId = '5439802';
    const subfolder = 'HONORAIRES';

    // Récupérer la liste des fichiers déjà présents dans le dossier
    const existingPdfs = await getExistingPdfNamesInFolder(securigreffeId);
    if (existingPdfs.has(data.nom_pdf)) {
        console.log(`PDF déjà présent dans le dossier, pas d'envoi : ${data.nom_pdf}`);
        return;
    }

    // Préparation des données pour l'API
    const apiData = {
        filename: data.nom_pdf,
        file_url: data.url_pdf,
        securigreffe_id: securigreffeId,
        subfolder: subfolder
    };

    // Envoi à l'API Auctionis
    try {
        console.log(`Envoi des données à l'API pour le dossier ${securigreffeId}...`, apiData);
        const res = await fetch(API_POST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiData)
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`Erreur lors de l'envoi à l'API:`, {
                status: res.status,
                statusText: res.statusText,
                body: errorText
            });
        } else {
            console.log(`Fichier ${data.nom_pdf} envoyé avec succès à l'API`);
        }
    } catch (e) {
        console.error(`Erreur lors de l'envoi à l'API:`, e.message);
    }

    // Envoi aux webhooks existants si configurés
    for (const url of [WEBHOOK_URL_1, WEBHOOK_URL_2]) {
        if (!url) continue;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                console.log(`Erreur lors de l'envoi au webhook (${url}):`, res.status, await res.text());
            }
        } catch (e) {
            console.log(`Erreur lors de l'envoi au webhook (${url}):`, e.message);
        }
    }
} 