import { Hono } from 'hono';

const topics = new Hono();

// 1. שליפת כל הנושאים (לדף הבית של הפורום)
topics.get('/', async (c) => {
    const db = c.env.DB;
    // שולפים את הנושאים ומצרפים את שם המשתמש שכתב אותם
    const { results } = await db.prepare(`
        SELECT topics.id, topics.title, topics.content, topics.created_at, users.name as author_name 
        FROM topics 
        JOIN users ON topics.user_id = users.id 
        ORDER BY topics.created_at DESC
    `).all();
    
    return c.json(results);
});

// 2. יצירת נושא חדש
topics.post('/', async (c) => {
    const body = await c.req.json();
    const { title, content, user_id } = body;

    if (!title || !content || !user_id) {
        return c.json({ error: 'Title, content, and user_id are required' }, 400);
    }

    const db = c.env.DB;
    const result = await db.prepare('INSERT INTO topics (title, content, user_id) VALUES (?, ?, ?)')
                           .bind(title, content, user_id)
                           .run();

    return c.json({ message: 'Topic created successfully', success: result.success }, 201);
});

// 3. שליפת נושא ספציפי פלוס כל התגובות שלו
topics.get('/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    
    // שליפת הנושא
    const topic = await db.prepare(`
        SELECT topics.*, users.name as author_name 
        FROM topics 
        JOIN users ON topics.user_id = users.id 
        WHERE topics.id = ?
    `).bind(topicId).first();
    
    if (!topic) {
        return c.json({ error: 'Topic not found' }, 404);
    }

    // שליפת התגובות של אותו נושא
    const { results: comments } = await db.prepare(`
        SELECT comments.id, comments.content, comments.created_at, users.name as author_name 
        FROM comments 
        JOIN users ON comments.user_id = users.id 
        WHERE topic_id = ? 
        ORDER BY comments.created_at ASC
    `).bind(topicId).all();

    return c.json({ topic, comments });
});

// 4. הוספת תגובה לנושא ספציפי
topics.post('/:id/comments', async (c) => {
    const topicId = c.req.param('id');
    const body = await c.req.json();
    const { content, user_id } = body;

    if (!content || !user_id) {
        return c.json({ error: 'Content and user_id are required' }, 400);
    }

    const db = c.env.DB;
    const result = await db.prepare('INSERT INTO comments (topic_id, user_id, content) VALUES (?, ?, ?)')
                           .bind(topicId, user_id, content)
                           .run();

    return c.json({ message: 'Comment added successfully', success: result.success }, 201);
});

export default topics;
