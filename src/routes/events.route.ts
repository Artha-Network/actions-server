import { Router } from 'express';
import { z } from 'zod';
import supabase from '../lib/supabaseAdmin';

const router = Router();

// Event tracking schema
const EventSchema = z.object({
  event: z.string(),
  user_id: z.string().optional(),
  deal_id: z.string().optional(),
  case_id: z.string().optional(),
  ts: z.number(),
  extras: z.record(z.any()).optional(),
});

// POST /api/events - Track frontend analytics events
router.post('/', async (req, res) => {
  try {
    // For now, just return success without storing to avoid API key issues
    // TODO: Set up proper Supabase service role key or create frontend_events table in Prisma
    
    console.log('📊 Event tracked:', req.body);
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