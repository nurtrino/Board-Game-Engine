import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { SelectGame } from './pages/SelectGame';
import { Join } from './pages/Join';
import { BoardPage } from './pages/BoardPage';
import { PlayPage } from './pages/PlayPage';
import { BrassDev } from './pages/BrassDev';
import '@fontsource-variable/inter';
import './styles.css';
import { initSfx } from './sfx';

initSfx();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<SelectGame />} />
        <Route path="/join/:roomId" element={<Join />} />
        <Route path="/board/:roomId" element={<BoardPage />} />
        <Route path="/play/:roomId" element={<PlayPage />} />
        <Route path="/dev/brass" element={<BrassDev />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
