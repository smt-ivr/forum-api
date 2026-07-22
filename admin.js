import { Hono } from 'hono';
const admin = new Hono();

admin.use('*', async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') return c.json({ error: 'גישה נדחתה' }, 403);
    await next();
});

// הדלקה/כיבוי של נעילת נושא
admin.post('/toggle-lock/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_locked = CASE WHEN is_locked = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'מצב הנעילה שונה' });
});

// הדלקה/כיבוי של הצמדת נושא (Pin)
admin.post('/toggle-pin/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'מצב ההצמדה שונה' });
});

export default admin;
