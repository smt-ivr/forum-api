import { Hono } from 'hono';
import { getIsraelTime } from './time.js';

const topics = new Hono();

// רשימת נושאים - טיפול במחיקה רכה
topics.get('/', async (c) => {
    const user = c.get('user');
    const userRole = user ? user.role : 'guest';
    const db = c.env.DB;
    
    // שולפים את הכל, כולל המחוקים
    const query = `
        SELECT t.id, t.title, t.is_locked, t.is_deleted, t.is_pinned, t.created_at,
               t.user_id, u.name as author_name, c.name as category_name,
               COALESCE(SUM(tv.vote), 0) as total_votes,
               (SELECT COUNT(*) FROM comments WHERE topic_id = t.id) as replies_count
        FROM topics t
        JOIN users u ON t.user_id = u.id 
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN topic_votes tv ON t.id = tv.topic_id
        GROUP BY t.id ORDER BY t.is_pinned DESC, t.created_at DESC
    `;
    
    const { results } = await db.prepare(query).all();
    
    // מיסוך נושאים מחוקים למשתמשים רגילים
    const safeResults = results.map(t => {
        if (t.is_deleted === 1 && userRole !== 'admin') {
            t.title = '🚫 נושא נמחק';
            t.author_name = 'מערכת';
        }
        return t;
    });

    return c.json(safeResults);
});

// צפייה בנושא ספציפי - כולל לייקים לתגובות ומחיקות
topics.get('/:id', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    const userRole = user ? user.role : 'guest';
    const db = c.env.DB;
    
    let topic = await db.prepare(`
        SELECT t.*, u.name as author_name, COALESCE(SUM(tv.vote), 0) as total_votes
        FROM topics t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN topic_votes tv ON t.id = tv.topic_id
        WHERE t.id = ? GROUP BY t.id
    `).bind(topicId).first();
    
    if (!topic) return c.json({ error: 'נושא לא נמצא' }, 404);
    
    if (topic.is_deleted === 1 && userRole !== 'admin') {
        topic.title = '🚫 נושא נמחק';
        topic.content = 'תוכן הנושא נמחק ואינו זמין יותר לקריאה.';
        topic.author_name = 'מערכת';
    }
    
    const { results: comments } = await db.prepare(`
        SELECT c.*, u.name as author_name, u.role as author_role, COALESCE(SUM(cv.vote), 0) as total_votes
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        LEFT JOIN comment_votes cv ON c.id = cv.comment_id
        WHERE c.topic_id = ?
        GROUP BY c.id
        ORDER BY c.created_at ASC
    `).bind(topicId).all();
    
    const safeComments = comments.map(cm => {
        if (cm.is_deleted === 1 && userRole !== 'admin') {
            cm.content = '🚫 תגובה זו נמחקה.';
            cm.author_name = 'מערכת';
        }
        return cm;
    });

    return c.json({ topic, comments: safeComments });
});

// פרסום נושא חדש
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

// הוספת תגובה
topics.post('/:id/comments', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);
    const { content } = await c.req.json();
    const db = c.env.DB;
    const topic = await db.prepare('SELECT is_locked, is_deleted FROM topics WHERE id = ?').bind(topicId).first();
    if (!topic || topic.is_deleted === 1) return c.json({ error: 'נושא לא קיים או מחוק' }, 404);
    if (topic.is_locked === 1 && user.role !== 'admin') return c.json({ error: 'הנושא נעול לתגובות' }, 403);
    const id = crypto.randomUUID();
    const now = getIsraelTime();
    await db.prepare('INSERT INTO comments (id, topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, topicId, user.id, content, now).run();
    return c.json({ message: 'תגובה נוספה' }, 201);
});

// הצבעה לנושא
topics.post('/:id/vote', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);
    const { vote } = await c.req.json();
    const db = c.env.DB;
    const existing = await db.prepare('SELECT vote FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user.id).first();
    if (existing) {
        if (existing.vote === vote) await db.prepare('DELETE FROM topic_votes WHERE topic_id = ? AND user_id = ?').bind(topicId, user.id).run();
        else await db.prepare('UPDATE topic_votes SET vote = ? WHERE topic_id = ? AND user_id = ?').bind(vote, topicId, user.id).run();
    } else {
        await db.prepare('INSERT INTO topic_votes (topic_id, user_id, vote) VALUES (?, ?, ?)').bind(topicId, user.id, vote).run();
    }
    return c.json({ message: 'ההצבעה נרשמה' });
});

// הצבעה לתגובה (חדש!)
topics.post('/:id/comments/:commentId/vote', async (c) => {
    const commentId = c.req.param('commentId');
    const user = c.get('user');
    if (!user) return c.json({ error: 'לא מורשה' }, 401);
    const { vote } = await c.req.json();
    const db = c.env.DB;
    const existing = await db.prepare('SELECT vote FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(commentId, user.id).first();
    if (existing) {
        if (existing.vote === vote) await db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').bind(commentId, user.id).run();
        else await db.prepare('UPDATE comment_votes SET vote = ? WHERE comment_id = ? AND user_id = ?').bind(vote, commentId, user.id).run();
    } else {
        await db.prepare('INSERT INTO comment_votes (comment_id, user_id, vote) VALUES (?, ?, ?)').bind(commentId, user.id, vote).run();
    }
    return c.json({ message: 'ההצבעה נרשמה' });
});

// מחיקת נושא רכה (למשתמש בעצמו או למנהל)
topics.delete('/:id', async (c) => {
    const topicId = c.req.param('id');
    const user = c.get('user');
    const db = c.env.DB;
    const topic = await db.prepare('SELECT user_id FROM topics WHERE id = ?').bind(topicId).first();
    if (!topic) return c.json({ error: 'לא נמצא' }, 404);
    if (topic.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'אין הרשאה' }, 403);
    await db.prepare('UPDATE topics SET is_deleted = 1 WHERE id = ?').bind(topicId).run();
    return c.json({ message: 'הנושא נמחק (מחיקה רכה)' });
});

// מחיקת תגובה רכה
topics.delete('/:id/comments/:commentId', async (c) => {
    const commentId = c.req.param('commentId');
    const user = c.get('user');
    const db = c.env.DB;
    const comment = await db.prepare('SELECT user_id FROM comments WHERE id = ?').bind(commentId).first();
    if (!comment) return c.json({ error: 'לא נמצא' }, 404);
    if (comment.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'אין הרשאה' }, 403);
    await db.prepare('UPDATE comments SET is_deleted = 1 WHERE id = ?').bind(commentId).run();
    return c.json({ message: 'התגובה נמחקה (מחיקה רכה)' });
});

export default topics;
