import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth.js';
import topicsRoutes from './routes/topics.js';

const app = new Hono();

// נאפשר גישה מכל דומיין כדי שתוכל לחבר את צד הלקוח בקלות
app.use('/*', cors());

// נתיב בדיקה שהשרת עובד
app.get('/', (c) => c.json({ status: 'ok', message: 'Welcome to SMTI Forum API' }));

// חיבור הקבצים המפוצלים לנתיבים הראשיים
app.route('/api/auth', authRoutes);
app.route('/api/topics', topicsRoutes);

export default app;
