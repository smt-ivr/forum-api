import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { getIsraelTime } from './time.js';
import { hashPassword } from './hash.js';
import { sendStyledEmail } from './email.js';

const auth = new Hono();
const JWT_SECRET = 'your-super-secret-jwt-key'; 

auth.post('/register', async (c) => {
    const { email, name, password } = await c.req.json();
    if (!email || !name || !password) return c.json({ error: 'חסרים פרטים' }, 400);

    const db = c.env.DB;

    const isBlacklisted = await db.prepare('SELECT email FROM email_blacklist WHERE email = ?').bind(email).first();
    if (isBlacklisted) return c.json({ error: 'כתובת האימייל חסומה מגישה למערכת.' }, 403);

    const existingUser = await db.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
    if (existingUser) return c.json({ error: 'המשתמש כבר קיים' }, 400);

    const id = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);
    const now = getIsraelTime();

    await db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, email, name, hashedPassword, now).run();

    await sendStyledEmail(c.env.RESEND_API_KEY, email, 'ברוכים הבאים לפורום SMTI!', `<h2>שלום ${name},</h2><p>אנו שמחים שהצטרפת אלינו!</p>`);

    return c.json({ message: 'ההרשמה בוצעה בהצלחה' }, 201);
});

auth.post('/login', async (c) => {
    const { email, password } = await c.req.json();
    const db = c.env.DB;

    const hashedPassword = await hashPassword(password);
    const user = await db.prepare('SELECT id, name, role, is_banned, group_id FROM users WHERE email = ? AND password_hash = ?')
                       .bind(email, hashedPassword).first();

    if (!user) return c.json({ error: 'אימייל או סיסמא שגויים' }, 401);
    if (user.is_banned === 1) return c.json({ error: 'המשתמש שלך נחסם מהמערכת' }, 403);

    const payload = {
        id: user.id,
        role: user.role,
        group_id: user.group_id,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 
    };
    
    const token = await sign(payload, JWT_SECRET);

    return c.json({ message: 'התחברת בהצלחה', token, user: { name: user.name, role: user.role } });
});

export default auth;
