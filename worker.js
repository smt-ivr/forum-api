import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

// ייבוא שטוח - כל הקבצים באותה תיקייה
import authRoutes from './auth.js';
import topicsRoutes from './topics.js';
import adminRoutes from './admin.js';

const app = new Hono().basePath('/forum/api');
const JWT_SECRET = 'your-super-secret-jwt-key'; // ודא שזהה בכל הקבצים

// מאפשר ללקוח (הדפדפן) לדבר עם השרת
app.use('/*', cors());

// תפיסת שגיאות גלובלית
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'שגיאת שרת פנימית', message: err.message }, 500);
});

// בדיקת תקינות בסיסית
app.get('/', (c) => c.json({ status: 'ok', message: 'SMTI Forum API - Advanced' }));

// 1. ראוטים של התחברות והרשמה (פתוחים לכולם)
app.route('/auth', authRoutes);

// 2. מידלוור מתוחכם לנושאים (GET פתוח לכולם/מחוברים, POST/DELETE מחייב טוקן)
app.use('/topics/*', async (c, next) => {
    if (c.req.method === 'GET') {
        try {
            const authHeader = c.req.header('Authorization');
            if (authHeader) {
                const middleware = jwt({ secret: JWT_SECRET });
                await middleware(c, next);
                return;
            }
        } catch (e) { /* מתעלם מטוקן פגום בקריאה בלבד */ }
        await next();
    } else {
        // דורש טוקן ליצירה/מחיקה
        const middleware = jwt({ secret: JWT_SECRET });
        await middleware(c, next);
    }
});
app.route('/topics', topicsRoutes);

// 3. ראוטים של ניהול (מחייב טוקן תקין, הבדיקה אם הוא admin נעשית בתוך admin.js)
app.use('/admin/*', jwt({ secret: JWT_SECRET }));
app.route('/admin', adminRoutes);

export default app;
