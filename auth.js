import { Hono } from 'hono';

const auth = new Hono();

// יצירת קוד רנדומלי בן 6 ספרות
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// שלב 1: בקשת התחברות/הרשמה ושליחת קוד
auth.post('/request-code', async (c) => {
    const body = await c.req.json();
    const { email, name } = body;

    if (!email) {
        return c.json({ error: 'Email is required' }, 400);
    }

    const db = c.env.DB;
    const code = generateCode();

    // בדיקה אם המשתמש קיים
    let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

    if (!user) {
        // הרשמה חדשה
        const id = crypto.randomUUID();
        const userName = name || 'משתמש חדש';
        await db.prepare('INSERT INTO users (id, email, name, verification_code) VALUES (?, ?, ?, ?)')
                .bind(id, email, userName, code)
                .run();
    } else {
        // עדכון קוד למשתמש קיים
        await db.prepare('UPDATE users SET verification_code = ? WHERE email = ?')
                .bind(code, email)
                .run();
    }

    // שליחת המייל באמצעות Resend
    try {
        const emailReq = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // שים לב! כדי לשלוח לכל כתובת שתרצה, תצטרך לאמת את הדומיין smti.uk בלוח הבקרה של Resend.
                // לאחר האימות, תוכל לשנות את הכתובת כאן למשהו כמו: 'Forum <noreply@smti.uk>'
                from: 'Forum <onboarding@resend.dev>', 
                to: email,
                subject: 'קוד האימות שלך לפורום SMTI',
                html: `<div dir="rtl"><h2>שלום!</h2><p>קוד האימות שלך לכניסה לפורום הוא: <strong>${code}</strong></p><p>הקוד חד פעמי.</p></div>`
            })
        });

        // שולפים את התשובה המדויקת של ריסנד
        const resendResponse = await emailReq.json();

        // אם ריסנד החזיר שגיאה (למשל 403), נחזיר אותה ישירות לצד הלקוח כדי לראות מה הבעיה
        if (!emailReq.ok) {
            return c.json({ 
                error: 'Resend API Error', 
                details: resendResponse 
            }, emailReq.status);
        }

        return c.json({ message: 'Verification code sent to email' });
    } catch (error) {
        return c.json({ error: 'Failed to send email', details: error.message }, 500);
    }
});

// שלב 2: אימות הקוד וכניסה
auth.post('/verify-code', async (c) => {
    const body = await c.req.json();
    const { email, code } = body;

    if (!email || !code) {
        return c.json({ error: 'Email and code are required' }, 400);
    }

    const db = c.env.DB;
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND verification_code = ?').bind(email, code).first();

    if (!user) {
        return c.json({ error: 'Invalid verification code' }, 401);
    }

    // איפוס הקוד וסימון כמאומת
    await db.prepare('UPDATE users SET verification_code = NULL, is_verified = 1 WHERE email = ?').bind(email).run();

    // מחזירים את נתוני המשתמש
    return c.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

export default auth;
