import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './models/db';
import cardsRouter from './routes/cards';
import commandersRouter from './routes/commanders';
import decksRouter from './routes/decks';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Routes
app.use('/api/cards', cardsRouter);
app.use('/api/commanders', commandersRouter);
app.use('/api/decks', decksRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Inizializza SQLite e avvia il server
initDb();
app.listen(PORT, () => {
  console.log(`Backend in ascolto su http://localhost:${PORT}`);
});
