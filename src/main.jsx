import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App.jsx';

const params = new URLSearchParams(location.search);
if (params.has('isolated')) document.body.classList.add('isolated');
// initial fold from ?fold=, clamped 0–1 with NaN guard (matches the original entry behavior)
let initialFold = Number(params.get('fold') ?? .3333);
if (!Number.isFinite(initialFold)) initialFold = .3333;
initialFold = Math.min(Math.max(initialFold, 0), 1);

// No StrictMode: it double-invokes effects in dev, which would run the async
// WebGL initialization twice (duplicate renderers, loaders and contexts).
createRoot(document.getElementById('root')).render(<App initialFold={initialFold} />);
