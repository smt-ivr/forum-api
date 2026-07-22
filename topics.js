import { Hono } from 'hono';

const topics = new Hono();

// שליפת כל הנושאים (כולל סטטיסטיקות כמו ב-phpBB)
topics.get('/', async (c) => {
    const db = c.env.DB;
    const { results } = await db.prepare(`
        SELECT topics.id, topics.title, topics.content, topics.created_at, topics.category_id,
               users.name as author_name, users.id as author_id, categories.name as category_name,
               COALESCE(SUM(topic_votes.vote), 0) as total_votes,
               (SELECT COUNT(*) FROM comments WHERE comments.topic_id = topics.id) as replies_count
        FROM topics 
        JOIN users ON topics.user_id = users.id 
        JOIN categories ON topics.category_id = categories.id
        LEFT JOIN topic_votes ON topics.id = topic_votes.topic_id
        GROUP BY topics.id
        ORDER BY topics.created_at DESC
    `).all();
    return c.json(results);
});

// יצירת נושא חדש
topics.post('/', async (c) => {
    const body = await c.req.json();
    const { title, content, user_id, category_id } = body;

    if (!title || !content || !user_id || !category_id) {
        return c.json({ error: 'Missing required fields' }, 400);
    }

    const db = c.env.DB;
    const result = await db.prepare('INSERT INTO topics (title, content, user_id, category_id) VALUES (?, ?, ?, ?)')
                           .bind(title, content, user_id, category_id)
                           .run();

    return c.json({ message: 'Topic created successfully', success: result.success }, 201);
});

// מחיקת נושא (רק בעלים או מנהל)
topics.delete('/:id', async (c) => {
    const topicId = c.req.param('id');
    const userId = c.req.header('x-user-id');
    const db = c.env.DB;

    const user = await db.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
    const topic = await db.prepare('SELECT user_id FROM topics WHERE id = ?').bind(topicId).first();

    if (!user || !topic) return c.json({ error: 'Not found or unauthorized' }, 404);
    
    if (topic.user_id !== userId && user.role !== 'admin') {
        return c.json({ error: 'Unauthorized to delete this topic' }, 403);
    }

    await db.prepare('DELETE FROM comments WHERE topic_id = ?').bind(topicId).run();
    await db.prepare('DELETE FROM topic_votes WHERE topic_id = ?').bind(topicId).run();
    await db.prepare('DELETE FROM topics WHERE id = ?').bind(topicId).run();

    return c.json({ message: 'Topic deleted' });
});

// שליפת נושא יחיד עם תגובות
topics.get('/:id', async (c) => {
    const topicId = c.req.param('id');
    const db = c.env.DB;
    
    const topic = await db.prepare(`
        SELECT topics.*, users.name as author_name, users.role as author_role, categories.name as category_name,
               COALESCE(SUM(topic_votes.vote), 0) as total_votes
        FROM topics 
        JOIN users ON topics.user_id = users.id 
        JOIN categories ON topics.category_id = categories.id
        LEFT JOIN topic_votes ON topics.id = topic_votes.topic_id
        WHERE topics.id = ?
        GROUP BY topics.id
    `).bind(topicId).first();
    
    if (!topic) return c.json({ error: 'Topic not found' }, 404);

    const { results: comments } = await db.prepare(`
        SELECT comments.id, comments.content, comments.created_at, comments.user_id, 
               users.name as author_name, users.role as author_role 
        FROM comments 
        JOIN users ON comments.user_id = users.id 
        WHERE topic_id = ? 
        ORDER BY comments.created_at ASC
    `).bind(topicId).all();

    return c.json({ topic, comments });
});

// לייק / דיסלייק לנושא
topics.post('/:id/vote', async (c) => {
    const topicId = c.req.param('id');
    const body = await c.req.json();
    const { user_id, vote } = body; 

    if (!user_id || (vote !== 1 && vote !== -1)) return c.json({ error: 'Invalid vote data' }, 400);

    const db = c.env.DB;
    
    const existing = await db.prepare('SELECT vote FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user_id).first();

    if (existing) {
        if (existing.vote === vote) {
            await db.prepare('DELETE FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user_id).run();
        } else {
            await db.prepare('UPDATE topic_votes SET vote = ? WHERE topic_id = ? AND user_id = ?').bind(vote, topicId, user_id).run();
        }
    } else {
        await db.prepare('INSERT INTO topic_votes (topic_id, user_id, vote) VALUES (?, ?, ?)').bind(topicId, user_id, vote).run();
    }

    return c.json({ message: 'Vote registered' });
});

// הוספת תגובה
topics.post('/:id/comments', async (c) => {
    const topicId = c.req.param('id');
    const body = await c.req.json();
    const { content, user_id } = body;

    if (!content || !user_id) return c.json({ error: 'Content and user_id are required' }, 400);

    const db = c.env.DB;
    const result = await db.prepare('INSERT INTO comments (topic_id, user_id, content) VALUES (?, ?, ?)')
                           .bind(topicId, user_id, content)
                           .run();

    return c.json({ message: 'Comment added', success: result.success }, 201);
});

// מחיקת תגובה (רק בעלים או מנהל)
topics.delete('/:topicId/comments/:commentId', async (c) => {
    const commentId = c.req.param('commentId');
    const userId = c.req.header('x-user-id');
    const db = c.env.DB;

    const user = await db.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
    const comment = await db.prepare('SELECT user_id FROM comments WHERE id = ?').bind(commentId).first();

    if (!user || !comment) return c.json({ error: 'Not found or unauthorized' }, 404);
    
    if (comment.user_id !== userId && user.role !== 'admin') {
        return c.json({ error: 'Unauthorized' }, 403);
    }

    await db.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
    return c.json({ message: 'Comment deleted' });
});

export default topics;
