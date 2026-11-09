# 28 — Paramétrage de l'OCR intelligent : OpenAI (GPT), Google Gemini, Azure OpenAI

> Pour comparer les fournisseurs sur les mêmes dossiers. Une clé par fournisseur, dans sa propre variable d'environnement : on passe de l'un à l'autre depuis l'écran, sans redéployer.

## 1. Les clés (une seule fois, sur Vercel)

Vercel › projet › Settings › Environment Variables, puis **redéployer une fois** :

| Variable | Valeur | Où l'obtenir |
|---|---|---|
| `IA_CLE_OPENAI` | clé OpenAI (`sk-…`) | platform.openai.com › API keys |
| `IA_CLE_GEMINI` | clé Gemini | aistudio.google.com › Get API key |
| `IA_CLE_AZURE` | clé de la ressource Azure OpenAI | portail Azure › ressource › Keys and Endpoint |
| `ANTHROPIC_API_KEY` | clé Claude (si on compare aussi) | console.anthropic.com |

Une clé ne s'écrit jamais dans l'outil ni dans le dépôt. L'écran Raccordements indique seulement si elle est présente.

## 2. Le paramétrage par fournisseur

Administration › Paramétrage › OCR intelligent :

| Paramètre | OpenAI (GPT) | Google Gemini | Azure OpenAI |
|---|---|---|---|
| Fournisseur | OpenAI | API compatible OpenAI | Azure OpenAI |
| Modèle | ex. `gpt-5` | ex. `gemini-2.5-pro` | nom du **déploiement** créé dans Azure |
| Adresse de l'API | vide | `https://generativelanguage.googleapis.com/v1beta/openai` | `https://<ressource>.openai.azure.com/openai/deployments/<déploiement>?api-version=2024-10-21` |
| Variable d'environnement de la clé | `IA_CLE_OPENAI` | `IA_CLE_GEMINI` | `IA_CLE_AZURE` |

Les noms de modèle évoluent. Prenez le nom exact dans la liste du fournisseur (OpenAI : page Models ; Google AI Studio : liste des modèles ; Azure : nom donné au déploiement).

## 3. Tester puis activer

1. Enregistrez le paramétrage du fournisseur, en laissant l'assistance par l'OCR intelligent **désactivée**.
2. Administration › Raccordements › OCR intelligent › **Tester la connexion**. Le test envoie une requête minimale, sans donnée client.
3. Si le test est réussi, activez l'assistance par l'OCR intelligent dans Paramétrage.
4. Pour passer au fournisseur suivant :
   1. désactivez l'OCR intelligent ;
   2. changez les quatre paramètres ;
   3. testez de nouveau ;
   4. réactivez.

   Un changement de fournisseur, de modèle, d'adresse ou de variable de clé exige un nouveau test réussi.

## 4. Comparer équitablement

- **Mêmes pièces, mêmes dossiers** pour chaque fournisseur : bilans en PDF texte, en PDF scanné et en image, et rapports de solvabilité.
- **PDF.** Claude lit les PDF page par page, tableaux compris. Avec OpenAI, Gemini et Azure, l'outil envoie le **texte extrait** du PDF. Un PDF scanné, sans couche texte, n'est donc pas lisible par ces trois fournisseurs : envoyez-le en image (PNG ou JPEG) ou faites-le passer par un logiciel de reconnaissance de texte.
- **Sortie structurée.** L'outil demande d'abord une réponse au schéma JSON strict. Si le fournisseur le refuse, il repasse en JSON libre, le schéma étant alors donné dans les consignes.
- **À relever** pour chaque fournisseur et chaque pièce :
  - les montants lus justes, faux ou absents ;
  - les propositions acceptées ou refusées par l'analyste ;
  - la durée de lecture ;
  - le coût, sur la console du fournisseur.

## 5. Protection des données

Pendant les essais, utilisez des **pièces fictives ou anonymisées**. Le choix définitif du fournisseur et de l'hébergement relève de la loi 09-08 et de la politique d'externalisation de la banque (D-48). Pour des données réelles, Azure OpenAI dans une région choisie par la banque, ou un modèle hébergé par la banque, est souvent plus simple à faire valider qu'une API publique.
