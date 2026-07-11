import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@fontsource-variable/inter';
import './styles.css';
import { initSfx } from './sfx';

initSfx();

const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const SelectGame = lazy(() => import('./pages/SelectGame').then((module) => ({ default: module.SelectGame })));
const Join = lazy(() => import('./pages/Join').then((module) => ({ default: module.Join })));
const BoardPage = lazy(() => import('./pages/BoardPage').then((module) => ({ default: module.BoardPage })));
const PlayPage = lazy(() => import('./pages/PlayPage').then((module) => ({ default: module.PlayPage })));
const BrassDev = lazy(() => import('./pages/BrassDev').then((module) => ({ default: module.BrassDev })));
const AxisModels = lazy(() => import('./axis/AxisModels'));

function RouteLoading() {
  return <div className="route-loading" role="status"><span />Loading table…</div>;
}

const rootHost = document.getElementById('root')!;
const rootWindow = window as typeof window & { __bgeRoot?: ReturnType<typeof ReactDOM.createRoot> };
const root = rootWindow.__bgeRoot ??= ReactDOM.createRoot(rootHost);

root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<SelectGame />} />
          <Route path="/join/:roomId" element={<Join />} />
          <Route path="/board/:roomId" element={<BoardPage />} />
          <Route path="/play/:roomId" element={<PlayPage />} />
          <Route path="/dev/brass" element={<BrassDev />} />
          <Route path="/dev/axis-models" element={<AxisModels />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
