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
- AI Assistant (Groq/Ollama) per suggerimenti carte con dati EDHREC e salt score
- Import mazzo da file + AI Trim per mazzi >100 carte

---

## Stack Tecnologico

| Layer     | Tecnologia                                         |
|-----------|----------------------------------------------------|
| Frontend  | React 18 + TypeScript + Vite                       |
| Backend   | Node.js + Express + TypeScript                     |
| Cache DB  | SQLite (via `better-sqlite3`)                      |
| Cards API | Scryfall REST API                                  |
| Deck data | EDHREC JSON API (pubblico, cache 24h in memoria)   |
| AI cloud  | Groq API (`llama-3.3-70b-versatile`, key in `.env`) |
| AI locale | Ollama (fallback se no GROQ_API_KEY, default `llama3.2`) |
| Icons     | mana-font (simboli mana SVG)                       |
| Monorepo  | npm workspaces                                     |

---

## Struttura del Progetto

```
MTG-deck-creater/
├── claude.md                     ← questo file (sempre aggiornato)
├── README.md
├── package.json                  ← monorepo root (npm workspaces)
├── .gitignore
│
├── shared/
│   ├── package.json
│   └── src/types/index.ts
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx              ← importa mana-font CSS
│       ├── App.tsx
│       ├── api/index.ts          ← client HTTP + tutti i tipi frontend AI
│       ├── store/deckStore.ts    ← Zustand store
│       ├── components/
│       │   ├── Card/
│       │   ├── Deck/
│       │   │   ├── DeckCardList.tsx
│       │   │   └── DeckStatsPanel.tsx
│       │   ├── Search/
│       │   │   ├── CardSearch.tsx
│       │   │   └── CommanderSearch.tsx
│       │   ├── ManaSymbol/       ← componenti ManaCost, ManaIcon, ColorIdentity
│       │   ├── AI/
│       │   │   ├── AIAssistant.tsx       ← tab AI con suggest + trim mode
│       │   │   └── AIAssistant.module.css
│       │   └── Import/
│       │       ├── ImportModal.tsx       ← modal importazione mazzo da file
│       │       └── ImportModal.module.css
│       └── pages/
│           ├── Home.tsx
│           ├── DeckBuilder.tsx   ← pulsante "📥 Importa" + wiring AI props
│           └── DeckList.tsx
│
└── backend/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        ├── routes/
        │   ├── cards.ts
        │   ├── decks.ts          ← include POST /api/decks/:id/import
        │   ├── commanders.ts
        │   └── ai.ts             ← suggest + trim + EDHREC fetch
        ├── controllers/
        ├── services/
        │   ├── scryfallService.ts
        │   ├── cacheService.ts
        │   ├── deckService.ts
        │   ├── importService.ts  ← parser testo mazzo (MTGO/Arena/Moxfield)
        │   ├── ollamaService.ts  ← prompt builder + Ollama client
        │   ├── groqService.ts    ← Groq client (cloud AI)
        │   ├── aiService.ts      ← facade dual-mode Groq/Ollama
        │   └── edhrecService.ts  ← EDHREC JSON API + cache interna
        ├── models/db.ts
        └── data/mtg_cache.db     ← SQLite (gitignored)
```

---

## Regole Commander (EDH) Implementate

- [x] Il mazzo deve avere esattamente **100 carte** (commander incluso)
- [x] **Nessun duplicato** (tranne le terre base)
- [x] Tutte le carte devono rispettare la **color identity** del Commander
- [x] Validazione legalità Commander (ban list ufficiale) — usa `card.legalities['commander'] === 'banned'` da Scryfall

---

## API Endpoints

### Cards
| Metodo | Endpoint                    | Descrizione                     |
|--------|-----------------------------|---------------------------------|
| GET    | `/api/cards/search?q=`      | Ricerca carte (Scryfall proxy)  |
| GET    | `/api/cards/:id`            | Dettaglio carta per ID          |
| GET    | `/api/commanders/search?q=` | Ricerca solo carte commander    |

### Decks
| Metodo | Endpoint                       | Descrizione                                            |
|--------|--------------------------------|--------------------------------------------------------|
| GET    | `/api/decks`                   | Lista tutti i mazzi salvati                            |
| POST   | `/api/decks`                   | Crea nuovo mazzo                                       |
| GET    | `/api/decks/:id`               | Dettaglio mazzo con carte                              |
| PUT    | `/api/decks/:id`               | Aggiorna nome/descrizione                              |
| DELETE | `/api/decks/:id`               | Elimina mazzo                                          |
| POST   | `/api/decks/:id/cards`         | Aggiunge carta al mazzo                                |
| DELETE | `/api/decks/:id/cards/:cardId` | Rimuove carta dal mazzo                                |
| POST   | `/api/decks/:id/import`        | Importa testo mazzo (MTGO/Arena/Moxfield) → `{imported, notFound, skipped, total}` |
| GET    | `/api/decks/:id/stats`         | Statistiche mazzo                                      |
| GET    | `/api/decks/:id/validate`      | Validazione regole Commander                           |
| GET    | `/api/decks/:id/export?format=txt\|mtgo\|moxfield` | Export mazzo      |
| GET    | `/api/health`                  | Health check                                           |

### AI
| Metodo | Endpoint                        | Descrizione                                              |
|--------|---------------------------------|----------------------------------------------------------|
| GET    | `/api/ai/status`                | `{ available, models[], provider }` da Groq/Ollama       |
| POST   | `/api/ai/decks/:id/suggest`     | body `{ model? }` → suggerimenti AI con EDHREC           |
| POST   | `/api/ai/decks/:id/trim`        | body `{ model? }` → tagli AI per mazzi >100 carte        |

---

## Scryfall API — Note

- Base URL: `https://api.scryfall.com`
- Rate limit ricerca: **2 req/s** (500ms di pausa) — NOT 10!
- Rate limit altri endpoint: **10 req/s** (100ms di pausa)
- HTTP 429 → il backend gestisce il throttle + errore esplicito
- Cache locale minima: **24 ore** in SQLite

---

## EDHREC API — Note

- Base URL: `https://json.edhrec.com/pages/commanders/{slug}.json`
- Slug: nome lowercase, spazi→trattini, punteggiatura rimossa
- Risposta: `container.json_dict.cardlists[]` con sezioni taggate (highsynergy, top, ramp, ecc.)
- Ogni carta ha: `name`, `synergy` (float), `salt` (0-4), `num_decks`, `potential_decks`
- Cache in memoria 24h, fallback silenzioso se non raggiungibile
- Non blocca il flusso AI: se EDHREC è down → l'AI funziona ugualmente senza quei dati

---

## Stato di Avanzamento

| Feature                              | Stato         |
|--------------------------------------|---------------|
| Setup monorepo                       | ✅ Completato  |
| Struttura frontend + backend         | ✅ Completato  |
| Scryfall service + SQLite cache      | ✅ Completato  |
| Deck CRUD + validazione color id.    | ✅ Completato  |
| Deck stats/analytics UI              | ✅ Completato  |
| Export mazzo (TXT/MTGO/Moxfield)     | ✅ Completato  |
| mana-font icons                      | ✅ Completato  |
| AI assistant Groq/Ollama dual-mode   | ✅ Completato  |
| Categorie multiple per suggerimento  | ✅ Completato  |
| Import mazzo da file                 | ✅ Completato  |
| AI Trim (mazzi >100 carte)           | ✅ Completato  |
| Integrazione EDHREC + salt score     | ✅ Completato  |
| Ban list Commander ufficiale         | ✅ Completato  |
| Commander Brackets (1-5) + Game Changer + Mass Land Denial | ✅ Completato |
| Card preview al hover (DeckCardList) | ✅ Completato |
| Statistiche funzionali (rampa/draw/rimozione/boardwipe/ecc.) | ✅ Completato |
| AI Analisi debolezze mazzo (`/analyze`) | ✅ Completato |
| Simulatore mano iniziale (7 carte) | ✅ Completato |
| Sostituzione carte via AI (`/replace`) | ✅ Completato |
| Partner commanders (2 commander) | ✅ Completato |
| Maybeboard | ✅ Completato |
| Condivisione mazzo (link pubblico) | ✅ Completato |
| Ricerca avanzata carte con filtri | ✅ Completato |
| Commander art + color identity in DeckList | ✅ Completato |
| Grid view nella lista mazzo | ✅ Completato |
| DeckBuilder responsive (mobile) | ✅ Completato |
| Prezzi mazzo (Scryfall USD/EUR) | ✅ Completato |
| Commander Spellbook (combo detection) | ✅ Completato |
| Ricerca nel mazzo (trova carta) | ✅ Completato |
| Stampa proxy (HTML stampabile) | ✅ Completato |

---

## Decisioni Architetturali

- **npm workspaces**: condivisione tipi tra frontend e backend senza overhead di build.
- **SQLite per cache carte**: leggero, zero config, TTL 24h per le carte Scryfall.
- **tsx per build backend**: usato sia in dev (`tsx watch`) che in prod per evitare problemi con `rootDir` nel tsconfig del monorepo. Type-checking separata con `tsc --noEmit`.
- **Rate limiter Scryfall interno**: throttle basato su timestamp (2 req/s search, 10 req/s altri). HTTP 429 → errore esplicito.
- **hydrateCards sequenziale**: chiamate `getCardById` in sequenza (non `Promise.all`) per rispettare il rate limit condiviso.
- **Export**: `GET /api/decks/:id/export?format=txt|mtgo|moxfield` → `text/plain` + `Content-Disposition: attachment`. Frontend usa `fetch` → `Blob` → link click.
- **AI dual-mode Groq/Ollama**: se `GROQ_API_KEY` è presente nel `.env` → usa Groq (cloud, ~10s); altrimenti Ollama locale (60-120s). Il frontend mostra il provider attivo con un badge ⚡/🤖.
- **AI Trim**: `POST /api/ai/decks/:id/trim` — valida >100 carte, calcola `cutCount = total - 100`, deduplicato sulle terre basilari, restituisce `{ cutCount, analysis, cuts[] }`.
- **Categorie AI multiple**: `CardSuggestion.categories: string[]` (es. `["Rampa","Draw"]`). Backward-compat: se il modello risponde con `category: string` viene normalizzato a `[string]`.
- **Import mazzo**: `parseDeckList(text)` in `importService.ts` gestisce MTGO (`1 Nome`), Arena (`1 Nome (SET) 123`), Moxfield, testo semplice. Risoluzione sequenziale su Scryfall per rispettare il rate limit. Salta commander e carte già presenti.
- **EDHREC**: `getCommanderRecommendations(name)` in `edhrecService.ts` — fetch del JSON pubblico EDHREC, cache in memoria 24h, estrazione da sezioni prioritarie (highsynergy, top, ramp, ecc.). I dati vengono iniettati nel prompt AI come contesto aggiuntivo. Il salt score (0-4) viene incluso per aiutare l'AI a bilanciare potenza vs friendliness al tavolo. Fallback silenzioso se non disponibili.
- **Commander Brackets AI**: ogni `CardSuggestion` ora include `bracket: 1|2|3|4|5` (potenza carta), `isGameChanger: boolean` (Mana Crypt, Thassa's Oracle, Demonic Tutor, Dockside, Necropotence, Rhystic Study, Smothering Tithe, ecc.) e `isMassLandDenial: boolean` (Armageddon, Ravages of War, Jokulhaups, Obliterate, Winter Orb, Stasis, ecc.). Il prompt AI include la definizione completa del sistema Bracket 1-5. Normalizzazione nei servizi: bracket default 2, booleani default false. Frontend mostra badge colorati B1-B5 (verde→rosso), badge "⚡ Game Changer" viola, badge "🌍 Land Denial" rosso scuro.
- **Ban list Commander**: la validazione usa `card.legalities['commander'] === 'banned'` dai dati Scryfall — sempre aggiornata automaticamente. Il risultato del `GET /api/decks/:id/validate` viene mostrato nel pannello statistiche: banner verde "✅ Mazzo valido" o banner rosso con la lista degli errori (carte bannate, duplicati, color identity, conteggio errato).

---

## Comandi Utili

```bash
# Installare tutte le dipendenze
npm install

# Avviare frontend (dev) — porta 5173
npm run dev --workspace=frontend

# Avviare backend (dev) — porta 3001
npm run dev --workspace=backend

# TypeScript check
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

## File .env (backend)

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx   # attiva la modalità Groq
OLLAMA_HOST=http://localhost:11434       # opzionale, default localhost
OLLAMA_MODEL=llama3.2                   # opzionale
```

---

*Ultimo aggiornamento: 2026-05-08 — Completate tutte le feature roadmap: prezzi USD+EUR (Scryfall), ricerca nel mazzo (DeckCardList filter), stampa proxy (print window con immagini carte), combo detection Commander Spellbook (backend service + route + ComboPanel frontend con tab "Nel mazzo"/"Potenziali"). TypeScript 0 errori.*
