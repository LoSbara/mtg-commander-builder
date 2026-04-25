import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import DeckBuilder from './pages/DeckBuilder';
import DeckList from './pages/DeckList';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/decks" element={<DeckList />} />
      <Route path="/decks/new" element={<DeckBuilder />} />
      <Route path="/decks/:id" element={<DeckBuilder />} />
    </Routes>
  );
}

export default App;
