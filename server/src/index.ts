import express from 'express';
import { ConfigStore } from './config/store.js';
import { makeRouter } from './api/routes.js';
import { CONFIG_PATH } from './config/defaults.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
const cfg = new ConfigStore();

app.use('/api', makeRouter(cfg));

app.listen(PORT, () => {
  console.log(`[skills-hub] server http://localhost:${PORT}`);
  console.log(`[skills-hub] config  ${CONFIG_PATH}`);
});
