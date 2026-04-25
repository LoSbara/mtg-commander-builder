import { Router } from 'express';
import * as scryfallService from '../services/scryfallService';

const router = Router();

// GET /api/cards/search?q=&page=
router.get('/search', async (req, res) => {
  const query = req.query.q as string;
  const page = parseInt(req.query.page as string) || 1;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ message: 'Parametro q richiesto.' });
  }

  try {
    const result = await scryfallService.searchCards(query.trim(), page);
    return res.json(result);
  } catch (err: unknown) {
    console.error('Errore ricerca carte:', err);
    return res.status(502).json({ message: 'Errore durante la ricerca su Scryfall.' });
  }
});

// GET /api/cards/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const card = await scryfallService.getCardById(id);
    return res.json(card);
  } catch (err: unknown) {
    console.error('Errore recupero carta:', err);
    return res.status(404).json({ message: 'Carta non trovata.' });
  }
});

export default router;
