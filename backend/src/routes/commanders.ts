import { Router } from 'express';
import * as scryfallService from '../services/scryfallService';

const router = Router();

// GET /api/commanders/search?q=
router.get('/search', async (req, res) => {
  const query = req.query.q as string;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ message: 'Parametro q richiesto.' });
  }

  try {
    const result = await scryfallService.searchCommanders(query.trim());
    return res.json(result);
  } catch (err: unknown) {
    console.error('Errore ricerca commander:', err);
    return res.status(502).json({ message: 'Errore durante la ricerca commander su Scryfall.' });
  }
});

export default router;
