// controllers/adController.js
import { query } from '../server.js';
import { parseVideoUrl, getVideoThumbnail } from '../utils/videoHelpers.js';

// ============================================================
// CREATE AD WITH VIDEO
// ============================================================
export const createAd = async (req, res) => {
  try {
    const { 
      title, description, price, category, 
      city, videoUrl, isPremium, location 
    } = req.body;

    // Get user info
    const userResult = await query(
      'SELECT name, phone, lat, lng FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // Parse video URL
    let videoData = null;
    if (videoUrl && videoUrl.trim() !== '') {
      videoData = parseVideoUrl(videoUrl.trim());
      if (!videoData) {
        return res.status(400).json({ 
          msg: 'Invalid video URL. Supported: YouTube, TikTok, Instagram, Facebook, Dailymotion, Vimeo' 
        });
      }
    }

    // Get image files
    const images = req.files ? req.files.map(f => f.filename) : [];

    // Parse location
    let lat = null, lng = null;
    if (location) {
      const loc = JSON.parse(location);
      lat = loc.lat || user.lat;
      lng = loc.lng || user.lng;
    }

    // Insert ad
    const result = await query(
      `INSERT INTO ads (
        title, description, price, category, city, images,
        user_id, user_name, user_phone, lat, lng,
        video_url, video_platform, video_embed_url, video_thumbnail, video_id,
        is_premium, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        title, description, price, category, city, images,
        req.user.id, user.name, user.phone, lat, lng,
        videoData?.watchUrl || null,
        videoData?.platform || null,
        videoData?.embedUrl || null,
        videoData?.thumbnail || null,
        videoData?.videoId || null,
        isPremium === 'true' || isPremium === true,
        'active'
      ]
    );

    const ad = result.rows[0];

    // Add video data to response
    ad.videoData = videoData;

    res.status(201).json({
      success: true,
      ad,
      message: 'Ad posted successfully!'
    });

  } catch (err) {
    console.error('Create ad error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET ADS WITH VIDEO SUPPORT
// ============================================================
export const getAds = async (req, res) => {
  try {
    const { 
      category, city, search, page = 1, limit = 20,
      lat, lng, hasVideo 
    } = req.query;

    let queryText = `
      SELECT a.*, 
             CASE 
               WHEN a.video_url IS NOT NULL THEN true 
               ELSE false 
             END AS has_video,
             a.video_platform,
             a.video_thumbnail,
             a.video_embed_url
      FROM ads a
      WHERE a.status = 'active'
    `;
    
    const params = [];
    let paramIndex = 1;

    if (category && category !== 'all') {
      queryText += ` AND a.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (city && city !== 'all') {
      queryText += ` AND a.city = $${paramIndex}`;
      params.push(city);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (a.title ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (hasVideo === 'true') {
      queryText += ` AND a.video_url IS NOT NULL`;
    }

    // Premium first
    queryText += ` ORDER BY a.is_premium DESC, a.created_at DESC`;

    // Pagination
    const offset = (page - 1) * limit;
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(queryText, params);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM ads WHERE status = 'active'`,
      []
    );

    // Parse video data for each ad
    const ads = result.rows.map(ad => {
      if (ad.video_url) {
        ad.videoData = {
          platform: ad.video_platform,
          embedUrl: ad.video_embed_url,
          thumbnail: ad.video_thumbnail,
          url: ad.video_url
        };
      }
      return ad;
    });

    res.json({
      success: true,
      ads,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });

  } catch (err) {
    console.error('Get ads error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// ============================================================
// GET SINGLE AD WITH VIDEO
// ============================================================
export const getAdById = async (req, res) => {
  try {
    const { id } = req.params;

    // Increment views
    await query(
      `UPDATE ads SET views = views + 1 WHERE id = $1`,
      [id]
    );

    const result = await query(
      `SELECT a.*, u.name as seller_name, u.email as seller_email, u.phone as seller_phone
       FROM ads a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: 'Ad not found' });
    }

    const ad = result.rows[0];

    // Parse video data
    if (ad.video_url) {
      ad.videoData = {
        platform: ad.video_platform,
        embedUrl: ad.video_embed_url,
        thumbnail: ad.video_thumbnail,
        url: ad.video_url
      };
    }

    res.json({
      success: true,
      ad
    });

  } catch (err) {
    console.error('Get ad error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};
