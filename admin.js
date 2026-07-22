import { Hono } from 'hono';
import { getIsraelTime } from './time.js';

const admin = new Hono();

// מוודאים שיש משתמש והוא מנהל
admin.use('*', async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
        return c.json({ error: 'גישה נדחתה. דרושות הרשאות הנהלה.' }, 403);
    }
    await next();
});

admin.post('/ban-user/:id', async (c) => {
    const userId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').bind(userId).run();
    return c.json({ message: 'המשתמש נחסם בהצלחה' });
});

admin.post('/blacklist', async (c) => {
    const { email, reason } = await c.req.json();
    const db = c.env.DB;
    const now = getIsraelTime();
    
    await db.prepare('INSERT INTO email_blacklist (email, reason, added_at) VALUES (?, ?, ?)')
            .bind(email, reason, now).run();
            
    return c.json({ message: 'האימייל הוסף לרשימה השחורה' });
});

admin.post('/lock-topic/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_locked = 1 WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא ננעל לתגובות' });
});

admin.delete('/hard-delete/topic/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('DELETE FROM comments WHERE topic_id = ?').bind(topicId).run();
    await db.prepare('DELETE FROM topics WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא נמחק לצמיתות' });
});

export default admin;
