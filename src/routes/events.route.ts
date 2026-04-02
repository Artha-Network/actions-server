import { Router } from 'express';
import supabase from '../lib/supabaseAdmin';

const router = Router();

// POST /api/events - Track frontend analytics events (accepted but not persisted)
router.post('/', async (req, res) => {
  try {
    // Analytics events are accepted but not persisted (no frontend_events table)
    res.json({ success: true, stored: false });
  } catch (error) {
    console.error('Event tracking error:', error);
    // Analytics should never break the user experience
    res.status(200).json({ success: true, stored: false });
  }
});

// GET /api/events - Get events for analytics dashboard (optional)
router.get('/', async (req, res) => {
  try {
    const { user_id, deal_id, limit = 100 } = req.query;
    
    let query = supabase
      .from('frontend_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (user_id) {
      query = query.eq('user_id', user_id);
    }
    
    if (deal_id) {
      query = query.eq('deal_id', deal_id);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.json({ events: data || [] });
  } catch (error) {
    console.error('Failed to fetch events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;