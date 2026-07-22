import { Hono } from 'hono';

const categories = new Hono();

categories.get('/', async (c) => {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT * FROM categories ORDER BY id ASC').all();
    return c.json(results);
});

export default categories;
