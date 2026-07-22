import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

import authRoutes from './auth.js';
import topicsRoutes from './topics.js';
import adminRoutes from './admin.js';

const app = new Hono().basePath('/forum/api');
const JWT_SECRET = 'your-super-secret-jwt-key'; 

app.use('/*', cors());

app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'שגיאת שרת פנימית', message: err.message }, 500);
});

app.get('/', (c) => c.json({ status: 'ok', message: 'SMTI Forum API v3 (Advanced)' }));

app.route('/auth', authRoutes);

app.use('/topics/*', async (c, next) => {
    if (c.req.method === 'GET') {
        try {
            const authHeader = c.req.header('Authorization');
            if (authHeader) {
                const middleware = jwt({ secret: JWT_SECRET });
                await middleware(c, next);
                return;
            }
        } catch (e) { }
        await next();
    } else {
        const middleware = jwt({ secret: JWT_SECRET });
        await middleware(c, next);
    }
});

app.route('/topics', topicsRoutes);

app.use('/admin/*', jwt({ secret: JWT_SECRET }));
app.route('/admin', adminRoutes);

export default app;
