import { Hono } from 'hono';

const auth = new Hono();

// נתיב לאימות משתמש מול גוגל והכנסה למסד נתונים
auth.post('/google', async (c) => {
    const body = await c.req.json();
    const { token } = body;

    if (!token) {
        return c.json({ error: 'Google token is required' }, 400);
    }

    try {
        // אימות הטוקן מול השרתים של גוגל
        const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        const userData = await googleResponse.json();

        if (userData.error) {
            return c.json({ error: 'Invalid Google token' }, 401);
        }

        const db = c.env.DB;
        
        // בדיקה אם המשתמש כבר קיים במסד הנתונים שלנו
        let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(userData.email).first();
        
        if (!user) {
            // יצירת משתמש חדש אם לא קיים
            const id = crypto.randomUUID();
            await db.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
                    .bind(id, userData.email, userData.name)
                    .run();
            user = { id, email: userData.email, name: userData.name };
        }

        return c.json({ message: 'Login successful', user });
    } catch (error) {
        return c.json({ error: 'Authentication failed', details: error.message }, 500);
    }
});

// נתיב לשליחת מיילים
auth.post('/send-email', async (c) => {
    const body = await c.req.json();
    const { to, subject, content } = body;

    if (!to || !subject || !content) {
        return c.json({ error: 'Missing email parameters (to, subject, content)' }, 400);
    }

    try {
        // מכיוון שיש לך כבר שירות מיילים, כאן אתה מבצע את הקריאה ל-API שלו.
        // דוגמה קלאסית לשליחת בקשת HTTP לשירות כמו Resend או שרת ה-SMTP הפרטי שלך:
        const emailRequest = await fetch('https://api.your-email-provider.com/send', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${c.env.EMAIL_API_KEY}` // תוכל להגדיר מפתח כסוד ב-Cloudflare
            },
            body: JSON.stringify({ to, subject, text: content })
        });

        const emailResponse = await emailRequest.json();

        return c.json({ message: 'Email sent successfully', data: emailResponse });
    } catch (error) {
        return c.json({ error: 'Failed to send email', details: error.message }, 500);
    }
});

export default auth;
