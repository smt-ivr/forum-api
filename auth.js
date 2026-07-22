import { Hono } from 'hono';
import { sign, jwt } from 'hono/jwt';
import { getIsraelTime } from './time.js';
import { hashPassword } from './hash.js';
import { sendStyledEmail } from './email.js';

const auth = new Hono();
const JWT_SECRET = 'your-super-secret-jwt-key'; // ודא שזהה לקובץ worker.js
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// 1. הרשמה (שליחת קוד ראשוני)
auth.post('/register', async (c) => {
    const { email, name, password } = await c.req.json();
    if (!email || !name || !password) return c.json({ error: 'חסרים פרטים' }, 400);

    const db = c.env.DB;
    const isBlacklisted = await db.prepare('SELECT email FROM email_blacklist WHERE email = ?').bind(email).first();
    if (isBlacklisted) return c.json({ error: 'כתובת האימייל חסומה מגישה למערכת.' }, 403);

    let user = await db.prepare('SELECT email, is_verified FROM users WHERE email = ?').bind(email).first();
    const code = generateCode();
    const hashedPassword = await hashPassword(password);
    const now = getIsraelTime();

    if (user) {
        if (user.is_verified) return c.json({ error: 'המשתמש כבר קיים ומאומת.' }, 400);
        // עדכון משתמש קיים שטרם אומת
        await db.prepare('UPDATE users SET name = ?, password_hash = ?, verification_code = ? WHERE email = ?')
                .bind(name, hashedPassword, code, email).run();
    } else {
        const id = crypto.randomUUID();
        await db.prepare('INSERT INTO users (id, email, name, password_hash, verification_code, is_verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
                .bind(id, email, name, hashedPassword, code, now).run();
    }

    const emailBody = `<h2>שלום ${name},</h2><p>קוד האימות שלך בפורום הוא: <strong>${code}</strong></p><p>הזן אותו באתר כדי להשלים את ההרשמה.</p>`;
    await sendStyledEmail(c.env.RESEND_API_KEY, email, 'קוד אימות - פורום SMTI', emailBody);

    return c.json({ message: 'קוד אימות נשלח לאימייל' }, 201);
});

// 2. שליחת קוד מחדש (זה הנתיב שהחזיר לך 404!)
auth.post('/resend-code', async (c) => {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'אימייל חסר' }, 400);

    const db = c.env.DB;
    const user = await db.prepare('SELECT name, is_verified FROM users WHERE email = ?').bind(email).first();

    if (!user) return c.json({ error: 'משתמש לא נמצא' }, 404);
    if (user.is_verified) return c.json({ error: 'המשתמש כבר מאומת, ניתן להתחבר.' }, 400);

    const code = generateCode();
    await db.prepare('UPDATE users SET verification_code = ? WHERE email = ?').bind(code, email).run();

    const emailBody = `<h2>שלום ${user.name},</h2><p>קוד האימות החדש שלך הוא: <strong>${code}</strong></p>`;
    await sendStyledEmail(c.env.RESEND_API_KEY, email, 'קוד אימות חדש - פורום SMTI', emailBody);

    return c.json({ message: 'קוד חדש נשלח לאימייל' });
});

// 3. אימות הקוד
auth.post('/verify-code', async (c) => {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: 'חסרים פרטים' }, 400);

    const db = c.env.DB;
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND verification_code = ?').bind(email, code).first();

    if (!user) return c.json({ error: 'קוד אימות שגוי או פג תוקף' }, 401);

    // מוחקים את הקוד מהמסד והופכים למאומת
    await db.prepare('UPDATE users SET verification_code = NULL, is_verified = 1 WHERE email = ?').bind(email).run();

    const payload = { id: user.id, role: user.role, group_id: user.group_id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 };
    const token = await sign(payload, JWT_SECRET);

    return c.json({ message: 'החשבון אומת בהצלחה', token });
});

// 4. התחברות
auth.post('/login', async (c) => {
    const { email, password } = await c.req.json();
    const db = c.env.DB;
    const hashedPassword = await hashPassword(password);
    const user = await db.prepare('SELECT id, role, is_banned, group_id, is_verified FROM users WHERE email = ? AND password_hash = ?')
                       .bind(email, hashedPassword).first();

    if (!user) return c.json({ error: 'אימייל או סיסמא שגויים' }, 401);
    if (user.is_banned === 1) return c.json({ error: 'המשתמש חסום' }, 403);
    if (user.is_verified === 0) return c.json({ status: 'unverified', error: 'החשבון טרם אומת' }, 403);

    const payload = { id: user.id, role: user.role, group_id: user.group_id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 };
    const token = await sign(payload, JWT_SECRET);

    return c.json({ message: 'התחברת בהצלחה', token });
});

// 5. משיכת נתוני המשתמש המחובר (גם זה החזיר לך 404 מקודם!)
auth.get('/me', jwt({ secret: JWT_SECRET }), async (c) => {
    const payload = c.get('jwtPayload');
    const db = c.env.DB;
    const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').bind(payload.id).first();
    
    if (!user) return c.json({ error: 'משתמש לא נמצא' }, 404);
    return c.json({ user });
});

export default auth;
