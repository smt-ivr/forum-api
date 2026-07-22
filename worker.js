import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './auth.js';
import topicsRoutes from './topics.js';
import categoriesRoutes from './categories.js';

const app = new Hono().basePath('/forum/api');

app.use('/*', cors());

app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

app.get('/', (c) => c.json({ status: 'ok', message: 'SMTI Forum API v2' }));

// חיבור כל הנתיבים המפוצלים
app.route('/auth', authRoutes);
app.route('/topics', topicsRoutes);
app.route('/categories', categoriesRoutes);

export default app;
