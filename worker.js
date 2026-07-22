import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './auth.js';
import topicsRoutes from './topics.js';

// הגדרת נתיב הבסיס כך שיתאים בדיוק לניתוב שיצרת בקלאודפלייר
const app = new Hono().basePath('/forum/api');

// נאפשר גישה מכל דומיין כדי שתוכל לחבר את צד הלקוח בקלות
app.use('/*', cors());

// נתיב בדיקה שהשרת עובד - עכשיו הוא יהיה זמין בכתובת https://smti.uk/forum/api/
app.get('/', (c) => c.json({ status: 'ok', message: 'Welcome to SMTI Forum API' }));

// חיבור הקבצים המפוצלים לנתיבים
app.route('/auth', authRoutes);
app.route('/topics', topicsRoutes);

export default app;
