import { Hono } from 'hono';
const admin = new Hono();

admin.use('*', async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') return c.json({ error: 'גישה נדחתה' }, 403);
    await next();
});

admin.post('/toggle-lock/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_locked = CASE WHEN is_locked = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'מצב הנעילה שונה' });
});

admin.post('/toggle-pin/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'מצב ההצמדה שונה' });
});

// שחזור נושא מחוק (מחזיר למצב רגיל)
admin.post('/restore-topic/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE topics SET is_deleted = 0 WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא שוחזר בהצלחה' });
});

// מחיקת נושא לצמיתות! (מוחק הכל - נושא, תגובות, והצבעות)
admin.delete('/hard-delete-topic/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('DELETE FROM topic_votes WHERE topic_id = ?').bind(topicId).run();
    await db.prepare('DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM comments WHERE topic_id = ?)').bind(topicId).run();
    await db.prepare('DELETE FROM comments WHERE topic_id = ?').bind(topicId).run();
    await db.prepare('DELETE FROM topics WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא נמחק לצמיתות' });
});

// שחזור תגובה מחוקה
admin.post('/restore-comment/:id', async (c) => {
    const commentId = c.req.param('id');
    const db = c.env.DB;
    await db.prepare('UPDATE comments SET is_deleted = 0 WHERE id = ?').bind(commentId).run();
    return c.json({ message: 'התגובה שוחזרה' });
});

export default admin;
