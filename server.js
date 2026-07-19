const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ========== SUPABASE CONNECTION ==========
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ========== MULTER SETUP ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const types = /jpeg|jpg|png|gif|webp/;
    const ext = types.test(path.extname(file.originalname).toLowerCase());
    const mime = types.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images allowed'));
  }
});

// ========== MIDDLEWARE ==========
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// ========== AUTH ROUTES ==========

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, city, location } = req.body;
    
    const { data: existing } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();
    
    if (existing) return res.status(400).json({ msg: 'User already exists' });
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const { data: user, error } = await supabase
      .from('users')
      .insert([{ 
        name, 
        email, 
        password: hashedPassword, 
        phone, 
        city,
        lat: location?.lat || null,
        lng: location?.lng || null
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name, email, phone, city } });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user) return res.status(400).json({ msg: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, city: user.city } });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get current user
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, phone, city, lat, lng, created_at')
      .eq('id', req.user.id)
      .single();
    
    if (error) throw error;
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Update user profile
app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, phone, city, lat, lng } = req.body;
    const { data: user, error } = await supabase
      .from('users')
      .update({ name, phone, city, lat, lng })
      .eq('id', req.user.id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ========== ADS ROUTES ==========

// Create ad
app.post('/api/ads', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, category, subcategory, city, location, isPremium } = req.body;
    
    const { data: user } = await supabase
      .from('users')
      .select('name, phone, lat, lng')
      .eq('id', req.user.id)
      .single();
    
    const images = req.files ? req.files.map(f => f.filename) : [];
    
    // Parse location
    let lat = null, lng = null;
    if (location) {
      const loc = JSON.parse(location);
      lat = loc.lat;
      lng = loc.lng;
    }
    
    const { data: ad, error } = await supabase
      .from('ads')
      .insert([{
        title,
        description,
        price: Number(price),
        category,
        subcategory: subcategory || null,
        city,
        images,
        user_id: req.user.id,
        user_name: user.name,
        user_phone: user.phone,
        lat: lat || user.lat,
        lng: lng || user.lng,
        is_premium: isPremium === 'true' || isPremium === true,
        status: 'active'
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.json(ad);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get ads with location-based sorting
app.get('/api/ads', async (req, res) => {
  try {
    const { 
      category, 
      subcategory, 
      city, 
      search, 
      page = 1, 
      limit = 20,
      lat,
      lng,
      radius = 50 // km
    } = req.query;
    
    let query = supabase
      .from('ads')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('is_premium', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (category && category !== 'all') query = query.eq('category', category);
    if (subcategory && subcategory !== 'all') query = query.eq('subcategory', subcategory);
    if (city && city !== 'all') query = query.eq('city', city);
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    // Location-based sorting (near me)
    if (lat && lng) {
      // Get all ads first, then filter by distance
      const { data: ads, error } = await query;
      if (error) throw error;
      
      // Calculate distance and sort
      const withDistance = ads.map(ad => {
        if (ad.lat && ad.lng) {
          const distance = calculateDistance(
            parseFloat(lat), 
            parseFloat(lng), 
            ad.lat, 
            ad.lng
          );
          return { ...ad, distance };
        }
        return { ...ad, distance: Infinity };
      });
      
      // Sort by distance
      withDistance.sort((a, b) => a.distance - b.distance);
      
      // Filter by radius
      const filtered = withDistance.filter(ad => ad.distance <= radius);
      
      // Paginate
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);
      
      return res.json({
        ads: paginated,
        total: filtered.length,
        page: Number(page),
        totalPages: Math.ceil(filtered.length / limit)
      });
    }
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
    
    const { data: ads, error, count } = await query;
    if (error) throw error;
    
    res.json({
      ads,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get single ad
app.get('/api/ads/:id', async (req, res) => {
  try {
    await supabase.rpc('increment_views', { ad_id: req.params.id });
    
    const { data: ad, error } = await supabase
      .from('ads')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !ad) return res.status(404).json({ msg: 'Ad not found' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get user's ads
app.get('/api/ads/user/me', auth, async (req, res) => {
  try {
    const { data: ads, error } = await supabase
      .from('ads')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(ads);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Delete ad
app.delete('/api/ads/:id', auth, async (req, res) => {
  try {
    const { data: ad } = await supabase
      .from('ads')
      .select('user_id')
      .eq('id', req.params.id)
      .single();
    
    if (!ad) return res.status(404).json({ msg: 'Ad not found' });
    if (ad.user_id !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    
    await supabase.from('ads').delete().eq('id', req.params.id);
    res.json({ msg: 'Ad deleted' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ========== CHAT ROUTES ==========

// Get or create chat
app.post('/api/chat/initiate', auth, async (req, res) => {
  try {
    const { adId, receiverId } = req.body;
    const senderId = req.user.id;
    
    // Check if chat exists
    let { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('ad_id', adId)
      .eq('buyer_id', senderId)
      .eq('seller_id', receiverId)
      .single();
    
    if (!chat) {
      // Create new chat
      const { data: newChat, error } = await supabase
        .from('chats')
        .insert([{
          ad_id: adId,
          buyer_id: senderId,
          seller_id: receiverId,
          last_message: null,
          last_message_time: null
        }])
        .select()
        .single();
      
      if (error) throw error;
      chat = newChat;
    }
    
    res.json(chat);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Send message
app.post('/api/chat/message', auth, async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    const { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();
    
    if (!chat) return res.status(404).json({ msg: 'Chat not found' });
    
    // Update chat with last message
    await supabase
      .from('chats')
      .update({ 
        last_message: message,
        last_message_time: new Date().toISOString()
      })
      .eq('id', chatId);
    
    // Save message
    const { data: msg, error } = await supabase
      .from('messages')
      .insert([{
        chat_id: chatId,
        sender_id: req.user.id,
        receiver_id: req.user.id === chat.buyer_id ? chat.seller_id : chat.buyer_id,
        message,
        read: false
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.json(msg);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get chat messages
app.get('/api/chat/:chatId', auth, async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', req.params.chatId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    res.json(messages);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get user's chats
app.get('/api/chat/user/chats', auth, async (req, res) => {
  try {
    const { data: chats, error } = await supabase
      .from('chats')
      .select('*')
      .or(`buyer_id.eq.${req.user.id},seller_id.eq.${req.user.id}`)
      .order('last_message_time', { ascending: false });
    
    if (error) throw error;
    
    // Get other user details for each chat
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      const otherId = chat.buyer_id === req.user.id ? chat.seller_id : chat.buyer_id;
      const { data: user } = await supabase
        .from('users')
        .select('id, name, phone')
        .eq('id', otherId)
        .single();
      
      return { ...chat, other_user: user };
    }));
    
    res.json(enrichedChats);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ========== PREMIUM PAYMENT ==========

app.post('/api/premium/create-payment', auth, async (req, res) => {
  try {
    const { adId, packageType } = req.body;
    const prices = { basic: 499, standard: 999, premium: 1999 };
    const amount = prices[packageType] || 499;
    
    res.json({
      success: true,
      amount,
      package: packageType,
      orderId: 'SALEPUR-' + Date.now(),
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

app.post('/api/premium/verify-payment', auth, async (req, res) => {
  try {
    const { adId, packageType } = req.body;
    
    const { data: ad, error } = await supabase
      .from('ads')
      .update({ 
        is_premium: true,
        premium_package: packageType,
        premium_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      })
      .eq('id', adId)
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ========== START SERVER ==========

app.listen(PORT, () => {
  console.log(`🚀 SALEPUR Server running on port ${PORT}`);
});
