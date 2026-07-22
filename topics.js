import { Hono } from 'hono';
import { getIsraelTime } from './time.js';

const topics = new Hono();

topics.get('/', async (c) => {
    const userRole = c.get('jwtPayload')?.role || 'guest';
    const db = c.env.DB;
    
    let query = `
        SELECT topics.id, topics.title, topics.is_locked, topics.is_deleted, topics.created_at,
               users.name as author_name, categories.name as category_name
        FROM topics 
        JOIN users ON topics.user_id = users.id 
        JOIN categories ON topics.category_id = categories.id
    `;
    
    if (userRole !== 'admin') {
        query += ` WHERE topics.is_deleted = 0 `;
    }
    
    query += ` ORDER BY topics.created_at DESC`;
    
    const { results } = await db.prepare(query).all();
    return c.json(results);
});

topics.post('/', async (c) => {
    const payload = c.get('jwtPayload');
    if (!payload) return c.json({ error: 'לא מורשה' }, 401);

    const { title, content, category_id } = await c.req.json();
    const db = c.env.DB;
    const now = getIsraelTime();
    const id = crypto.randomUUID();

    await db.prepare('INSERT INTO topics (id, title, content, user_id, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, title, content, payload.id, category_id, now).run();

    return c.json({ message: 'הנושא נוצר בהצלחה' }, 201);
});

topics.delete('/:id', async (c) => {
    const topicId = c.req.param('id');
    const payload = c.get('jwtPayload');
    const db = c.env.DB;

    const topic = await db.prepare('SELECT user_id FROM topics WHERE id = ?').bind(topicId).first();
    if (!topic) return c.json({ error: 'לא נמצא' }, 404);

    if (topic.user_id !== payload.id && payload.role !== 'admin') {
        return c.json({ error: 'אין לך הרשאה למחוק נושא זה' }, 403);
    }

    await db.prepare('UPDATE topics SET is_deleted = 1 WHERE id = ?').bind(topicId).run();
    
    return c.json({ message: 'הנושא הועבר לארכיון (נמחק)' });
});

export default topics;
