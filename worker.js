import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes from './auth.js';
import topicsRoutes from './topics.js';
import adminRoutes from './admin.js';

const app = new Hono().basePath('/forum/api');

app.use('/*', cors());

app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'שגיאת שרת פנימית', message: err.message }, 500);
});

// פונקציית מידלוור חכמה לאימות טוקנים ממסד הנתונים
const dbAuthMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const db = c.env.DB;
        // מחפשים את המשתמש שיש לו את הטוקן הזה
        const user = await db.prepare('SELECT * FROM users WHERE token = ?').bind(token).first();
        if (user) {
            c.set('user', user); // שומרים את המשתמש להמשך הבקשה
        }
    }
    await next();
};

app.get('/', (c) => c.json({ status: 'ok', message: 'SMTI Forum API - DB Token Version' }));

// החלת המידלוור על כל ראוט שדורש זיהוי
app.use('/auth/me', dbAuthMiddleware);
app.use('/topics/*', dbAuthMiddleware);
app.use('/admin/*', dbAuthMiddleware);

app.route('/auth', authRoutes);

// בקריאה (GET) של נושאים נאפשר גישה גם למי שלא מחובר, אבל ליצירה/מחיקה נחייב זיהוי
app.use('/topics/*', async (c, next) => {
    if (c.req.method !== 'GET' && !c.get('user')) {
        return c.json({ error: 'לא מורשה' }, 401);
    }
    await next();
});
app.route('/topics', topicsRoutes);

app.route('/admin', adminRoutes);

export default app;
