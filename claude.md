# MTG Commander Deck Creator — Living Documentation

> **Nota:** Questo file è tenuto aggiornato automaticamente. Ogni modifica significativa al progetto viene riflessa qui.

---

## Panoramica del Progetto

Un'applicazione web full-stack per la creazione e gestione di mazzi **Commander** (EDH) di Magic: The Gathering.

### Obiettivi principali
- Ricerca di carte via **Scryfall API** (con cache locale)
- Selezione del Commander e costruzione del mazzo (100 carte, legalità per color identity)
- Statistiche e analisi del mazzo (curva di mana, distribuzione tipi, ecc.)
- Salvataggio, modifica ed export dei mazzi

---

## Stack Tecnologico

| Layer     | Tecnologia                              |
|-----------|-----------------------------------------|
| Frontend  | React 18 + TypeScript + Vite            |
| Backend   | Node.js + Express + TypeScript          |
| Cache DB  | SQLite (via `better-sqlite3`)           |
| Cards API | Scryfall REST API                       |
| Monorepo  | npm workspaces                          |

---

## Struttura del Progetto

```
MTG-deck-creater/
├── claude.md                     ← questo file (sempre aggiornato)
├── README.md
├── package.json                  ← monorepo root (npm workspaces)
├── .gitignore
│
├── shared/                       ← tipi TypeScript condivisi
│   ├── package.json
│   └── src/
│       └── types/
│           └── index.ts
│
├── frontend/                     ← React app
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/                ← re-export da shared + tipi locali
│       ├── api/                  ← client HTTP verso il backend
│       ├── hooks/                ← custom React hooks
│       ├── store/                ← state management (Zustand o Context)
│       ├── components/           ← componenti UI riutilizzabili
│       │   ├── Card/
│       │   ├── Deck/
│       │   └── Search/
│       └── pages/
│           ├── Home.tsx
│           ├── DeckBuilder.tsx
│           └── DeckList.tsx
│
└── backend/                      ← Express API
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts              ← entry point
        ├── types/                ← re-export da shared + tipi server
        ├── routes/
        │   ├── cards.ts          ← GET /api/cards/search, /api/cards/:id
        │   ├── decks.ts          ← CRUD /api/decks
        │   └── commanders.ts     ← GET /api/commanders/search
        ├── controllers/
        │   ├── cardController.ts
        │   ├── deckController.ts
        │   └── commanderController.ts
        ├── services/
        │   ├── scryfallService.ts  ← wrapper Scryfall API
        │   ├── cacheService.ts     ← lettura/scrittura SQLite
        │   └── deckService.ts     ← logica mazzo (validazione, stats)
        ├── models/
        │   └── db.ts              ← init SQLite + schema
        └── data/
            └── mtg_cache.db       ← SQLite DB (gitignored)
```

---

## Regole Commander (EDH) Implementate

- [x] Il mazzo deve avere esattamente **100 carte** (commander incluso)
- [x] **Nessun duplicato** (tranne le terre base)
- [x] Tutte le carte devono rispettare la **color identity** del Commander
- [ ] Validazione legalità Commander (ban list ufficiale) — *da implementare*
- [ ] Carte con abilità "companion" — *da gestire separatamente*

---

## API Endpoints Pianificati

### Cards
| Metodo | Endpoint                    | Descrizione                     |
|--------|-----------------------------|---------------------------------|
| GET    | `/api/cards/search?q=`      | Ricerca carte (Scryfall proxy)  |
| GET    | `/api/cards/:id`            | Dettaglio carta per ID          |
| GET    | `/api/commanders/search?q=` | Ricerca solo carte commander    |

### Decks
| Metodo | Endpoint                      | Descrizione                       |
|--------|-------------------------------|-----------------------------------|
| GET    | `/api/decks`                  | Lista tutti i mazzi salvati       |
| POST   | `/api/decks`                  | Crea nuovo mazzo (+ inserisce cmdr automaticamente) |
| GET    | `/api/decks/:id`              | Dettaglio mazzo con carte         |
| PUT    | `/api/decks/:id`              | Aggiorna nome/descrizione         |
| DELETE | `/api/decks/:id`              | Elimina mazzo (cascade su carte)  |
| POST   | `/api/decks/:id/cards`        | Aggiunge carta al mazzo           |
| DELETE | `/api/decks/:id/cards/:cardId`| Rimuove carta dal mazzo           |
| GET    | `/api/decks/:id/stats`        | Statistiche mazzo                 |
| GET    | `/api/decks/:id/validate`     | Validazione regole Commander      |
| GET    | `/api/health`                 | Health check                      |

---

## Scryfall API — Note

- Base URL: `https://api.scryfall.com`
- Endpoint ricerca: `/cards/search?q={query}`
- Filtro Commander legali: `q=is:commander`
- Color identity filter: `id:{WUBRG}`
- Rate limit ricerca: **2 req/s** (500ms di pausa tra chiamate) — NOT 10!
- Rate limit altri endpoint: **10 req/s** (100ms di pausa)
- HTTP 429 → ban temporaneo di 30 secondi → il backend gestisce il throttle automaticamente
- Headers **obbligatori**: `User-Agent` (nome app), `Accept`
- Cache locale minima: **24 ore** (raccomandato da Scryfall)
- Le carte vengono cachate in SQLite dopo la prima richiesta (TTL 24h)

---

## Stato di Avanzamento

| Feature                        | Stato        |
|--------------------------------|--------------|
| Setup monorepo                 | ✅ Completato |
| Struttura frontend             | ✅ Completato |
| Struttura backend              | ✅ Completato |
| Shared types                   | ✅ Completato |
| Scryfall service               | ✅ Completato |
| SQLite cache                   | ✅ Completato |
| Deck CRUD API                  | ✅ Completato |
| Validazione color identity     | ✅ Completato |
| Deck stats API                 | ✅ Completato |
| Card search UI                 | ✅ Completato |
| Commander selector             | ✅ Completato |
| Deck builder UI                | ✅ Completato |
| Deck stats/analytics UI        | ✅ Completato |
| Export mazzo (TXT/MTGO/Moxfield)| ✅ Completato |

---

## Decisioni Architetturali

- **npm workspaces**: semplifica la condivisione dei tipi tra frontend e backend senza overhead di build complessi.
- **SQLite per cache**: leggero, zero configurazione, perfetto per cache locale delle carte già cercate. Non è il DB principale dell'app ma una cache applicativa.
- **Scryfall come fonte dati**: API gratuita, completa, con immagini delle carte incluse. Nessuna necessità di un proprio DB di carte.
- **Zustand** (pianificato per il frontend): state management leggero, adatto a React, più semplice di Redux per questo use case.
- **tsx al posto di tsc per build**: il backend usa `tsx` sia in dev (`tsx watch`) che in produzione (`tsx src/index.ts`) per evitare problemi con `rootDir` nel tsconfig del monorepo. La type-checking viene fatta separatamente con `tsc --noEmit`.
- **Rate limiter interno**: throttle semplice basato su timestamp per rispettare i limiti Scryfall (2 req/s su search, 10 req/s sugli altri endpoint). Gestione HTTP 429 con errore esplicito.
- **hydrateCards sequenziale**: le chiamate a `getCardById` vengono eseguite in sequenza (non con `Promise.all`) per evitare race condition sulla throttle condivisa e prevenire skip silenziosi di carte non ancora in cache.
- **Export**: `GET /api/decks/:id/export?format=txt|mtgo|moxfield` — risponde con `text/plain` e header `Content-Disposition: attachment` per il download automatico. Il frontend usa `fetch` → `Blob` → link click per triggerare il download.

---

## Comandi Utili

```bash
# Installare tutte le dipendenze (dalla root)
npm install

# Avviare frontend (dev)
npm run dev --workspace=frontend

# Avviare backend (dev)
npm run dev --workspace=backend

# Build produzione
npm run build --workspaces
```

---

*Ultimo aggiornamento: 2026-04-25 — Export mazzo implementato (TXT/MTGO/Moxfield): endpoint backend `GET /api/decks/:id/export?format=`, funzioni `formatDeckExport` e `hydrateCards` (fix race condition → sequenziale), pulsante esporta con dropdown nel DeckBuilder. Test end-to-end: tutti gli endpoint verificati, TypeScript 0 errori su frontend e backend.*
