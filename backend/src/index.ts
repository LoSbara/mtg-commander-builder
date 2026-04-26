import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initDb } from './models/db';
import { initPgDb } from './models/pgDb';
import cardsRouter from './routes/cards';
import commandersRouter from './routes/commanders';
import decksRouter from './routes/decks';
import aiRouter from './routes/ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// In produzione il frontend è servito da qui
const isProd = process.env.NODE_ENV === 'production';
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');

app.use(cors({
  origin: isProd ? true : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes API
app.use('/api/cards', cardsRouter);
app.use('/api/commanders', commandersRouter);
app.use('/api/decks', decksRouter);
app.use('/api/ai', aiRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend statico in produzione
if (isProd) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}
// Inizializza DB e avvia il server
async function main() {
  initDb();
  if (process.env.DATABASE_URL) {
    await initPgDb();
  } else {
    console.warn('DATABASE_URL non impostata — le route /api/decks non funzioneranno.');
  }
  app.listen(PORT, () => {
    console.log(`Backend in ascolto su http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Avvio fallito:', err);
  process.exit(1);
});
