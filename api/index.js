import { createHandler } from '../onda-vercel-azul-mar/lib/app.mjs';
// Vercel manages the HTTP listener. Never call listen() or write to local disk here.
export default createHandler();
