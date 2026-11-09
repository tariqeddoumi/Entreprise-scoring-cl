# Guide utilisateur (Word, charte Groupe BCP)

- `contenu.json` : textes (profils, circuit, sections, étapes, règles).
- `guide_docx.js` : génération ; les captures sont lues dans `docs/expression-besoin/captures/<img>.jpg`.
- `charte.js` : couleurs, logo et mise en page Groupe BCP.

```bash
NODE_PATH=$(npm root -g) node scripts/guide-utilisateur/guide_docx.js
# → docs/guides/Guide_utilisateur_outil_notation.docx
```
