// Composition root: wires every layer together (unlayered on purpose).
import { renderApp } from './ui/app';
import { startServer } from './infrastructure/http/server';
import { createClient } from './infrastructure/db/client';

startServer(createClient());
renderApp();
