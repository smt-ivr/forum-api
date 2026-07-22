import { Hono } from 'hono';
import { getIsraelTime } from './time.js';

const topics = new Hono();

topics.get('/', async (c) => {
    const user = c.get('user');
    const userRole = user ? user.role : 'guest';
    const db = c.env.DB;
    
    let query = `
        SELECT t.id, t.title, t.is_locked, t.is_deleted, t.is_pinned, t.created_at,
               t.user_id, u.name as author_name, c.name as category_name,
               COALESCE(SUM(tv.vote), 0) as total_votes,
               (SELECT COUNT(*) FROM comments WHERE topic_id = t.id AND is_deleted = 0) as replies_count
        FROM topics t
        JOIN users u ON t.user_id = u.id 
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN topic_votes tv ON t.id = tv.topic_id
    `;
    if (userRole !== 'admin') query += ` WHERE t.is_deleted = 0 `;
    query += ` GROUP BY t.id ORDER BY t.is_pinned DESC, t.created_at DESC`;
    
    const { results } = await db.prepare(query).all();
    return c.json(results);
});

topics.get('/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    const topic = await db.prepare(`
        SELECT t.*, u.name as author_name, COALESCE(SUM(tv.vote), 0) as total_votes
        FROM topics t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN topic_votes tv ON t.id = tv.topic_id
        WHERE t.id = ? GROUP BY t.id
    `).bind(topicId).first();
    
    if (!topic) return c.json({ error: 'נושא לא נמצא' }, 404);
    
    const { results: comments } = await db.prepare(`
        SELECT c.*, u.name as author_name, u.role as author_role 
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        WHERE c.topic_id = ? AND c.is_deleted = 0
        ORDER BY c.created_at ASC
    `).bind(topicId).all();
    
    return c.json({ topic, comments });
});

topics.post('/', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);

    const { title, content, category_id } = await c.req.json();
    const db = c.env.DB;
    const now = getIsraelTime();
    const id = crypto.randomUUID();

    await db.prepare('INSERT INTO topics (id, title, content, user_id, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, title, content, user.id, category_id, now).run();

    return c.json({ message: 'הנושא נוצר בהצלחה' }, 201);
});

topics.post('/:id/comments', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);

    const { content } = await c.req.json();
    const db = c.env.DB;
    
    const topic = await db.prepare('SELECT is_locked FROM topics WHERE id = ?').bind(topicId).first();
    if (!topic) return c.json({ error: 'נושא לא נמצא' }, 404);
    if (topic.is_locked && user.role !== 'admin') return c.json({ error: 'הנושא נעול לתגובות' }, 403);

    const id = crypto.randomUUID();
    const now = getIsraelTime();

    await db.prepare('INSERT INTO comments (id, topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, topicId, user.id, content, now).run();

    return c.json({ message: 'תגובה נוספה' }, 201);
});

topics.post('/:id/vote', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);

    const { vote } = await c.req.json();
    const db = c.env.DB;
    
    const existing = await db.prepare('SELECT vote FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user.id).first();
    
    if (existing) {
        if (existing.vote === vote) {
            await db.prepare('DELETE FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user.id).run();
        } else {
            await db.prepare('UPDATE topic_votes SET vote = ? WHERE topic_id = ? AND user_id = ?').bind(vote, topicId, user.id).run();
        }
    } else {
        await db.prepare('INSERT INTO topic_votes (topic_id, user_id, vote) VALUES (?, ?, ?)').bind(topicId, user.id, vote).run();
    }
    return c.json({ message: 'ההצבעה נרשמה' });
});

topics.delete('/:id', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    const db = c.env.DB;
    const topic = await db.prepare('SELECT user_id FROM topics WHERE id = ?').bind(topicId).first();
    if (!topic) return c.json({ error: 'לא נמצא' }, 404);
    if (topic.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'אין הרשאה' }, 403);
    await db.prepare('UPDATE topics SET is_deleted = 1 WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא נמחק' });
});

export default topics;
