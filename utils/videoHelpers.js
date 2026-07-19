// ============================================================
// VIDEO HELPERS - Extract Info from URLs
// ============================================================

/**
 * Get video platform and embed URL from any video link
 * Supports: YouTube, TikTok, Instagram, Facebook, Dailymotion, Vimeo
 */
export const parseVideoUrl = (url) => {
  if (!url || url.trim() === '') return null;

  const trimmedUrl = url.trim();

  // ========== YOUTUBE ==========
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of youtubePatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'youtube',
        platformName: 'YouTube',
        videoId: videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        thumbnailMedium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        thumbnailHigh: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        icon: 'fab fa-youtube',
        color: '#FF0000'
      };
    }
  }

  // ========== TIKTOK ==========
  const tiktokPatterns = [
    /(?:tiktok\.com\/@[\w-]+\/video\/|vm\.tiktok\.com\/)(\d+)/,
    /(?:tiktok\.com\/.*\/video\/)(\d+)/
  ];

  for (const pattern of tiktokPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'tiktok',
        platformName: 'TikTok',
        videoId: videoId,
        embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
        thumbnail: null, // TikTok thumbnails via oEmbed
        watchUrl: trimmedUrl,
        icon: 'fab fa-tiktok',
        color: '#000000'
      };
    }
  }

  // ========== INSTAGRAM ==========
  const instagramPatterns = [
    /(?:instagram\.com\/p\/|instagram\.com\/reel\/)([a-zA-Z0-9_-]+)/,
    /(?:instagr\.am\/p\/)([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of instagramPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'instagram',
        platformName: 'Instagram',
        videoId: videoId,
        embedUrl: `https://www.instagram.com/p/${videoId}/embed`,
        thumbnail: null,
        watchUrl: `https://www.instagram.com/p/${videoId}/`,
        icon: 'fab fa-instagram',
        color: '#E4405F'
      };
    }
  }

  // ========== FACEBOOK ==========
  const facebookPatterns = [
    /(?:facebook\.com\/.*\/videos\/|fb\.watch\/)(\d+)/,
    /(?:facebook\.com\/watch\/\?v=)(\d+)/
  ];

  for (const pattern of facebookPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'facebook',
        platformName: 'Facebook',
        videoId: videoId,
        embedUrl: `https://www.facebook.com/plugins/video.php?href=https://www.facebook.com/watch/?v=${videoId}`,
        thumbnail: null,
        watchUrl: `https://www.facebook.com/watch/?v=${videoId}`,
        icon: 'fab fa-facebook',
        color: '#1877F2'
      };
    }
  }

  // ========== DAILYMOTION ==========
  const dailymotionPatterns = [
    /(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/
  ];

  for (const pattern of dailymotionPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'dailymotion',
        platformName: 'Dailymotion',
        videoId: videoId,
        embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`,
        thumbnail: `https://www.dailymotion.com/thumbnail/video/${videoId}`,
        watchUrl: `https://www.dailymotion.com/video/${videoId}`,
        icon: 'fas fa-video',
        color: '#0066DC'
      };
    }
  }

  // ========== VIMEO ==========
  const vimeoPatterns = [
    /(?:vimeo\.com\/)(\d+)/
  ];

  for (const pattern of vimeoPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'vimeo',
        platformName: 'Vimeo',
        videoId: videoId,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        thumbnail: null, // Vimeo thumbnails via API
        watchUrl: `https://vimeo.com/${videoId}`,
        icon: 'fab fa-vimeo',
        color: '#1AB7EA'
      };
    }
  }

  // ========== TWITTER/X ==========
  const twitterPatterns = [
    /(?:twitter\.com\/[\w-]+\/status\/|x\.com\/[\w-]+\/status\/)(\d+)/
  ];

  for (const pattern of twitterPatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'twitter',
        platformName: 'Twitter/X',
        videoId: videoId,
        embedUrl: `https://twitter.com/i/status/${videoId}`,
        thumbnail: null,
        watchUrl: trimmedUrl,
        icon: 'fab fa-twitter',
        color: '#1DA1F2'
      };
    }
  }

  // ========== RUMBLE ==========
  const rumblePatterns = [
    /(?:rumble\.com\/v)([a-zA-Z0-9]+)/
  ];

  for (const pattern of rumblePatterns) {
    const match = trimmedUrl.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        platform: 'rumble',
        platformName: 'Rumble',
        videoId: videoId,
        embedUrl: `https://rumble.com/embed/v${videoId}`,
        thumbnail: null,
        watchUrl: `https://rumble.com/v${videoId}`,
        icon: 'fas fa-video',
        color: '#85C742'
      };
    }
  }

  // ========== Direct Video URL (MP4, WebM, etc.) ==========
  const directVideoPatterns = /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|3gp)(\?.*)?$/i;
  if (directVideoPatterns.test(trimmedUrl)) {
    return {
      platform: 'direct',
      platformName: 'Direct Video',
      videoId: null,
      embedUrl: trimmedUrl,
      thumbnail: null,
      watchUrl: trimmedUrl,
      icon: 'fas fa-play-circle',
      color: '#4F6F52'
    };
  }

  return null;
};

// ============================================================
// GET VIDEO THUMBNAIL
// ============================================================
export const getVideoThumbnail = (platform, videoId) => {
  switch (platform) {
    case 'youtube':
      return {
        default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
        medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      };
    
    case 'dailymotion':
      return {
        default: `https://www.dailymotion.com/thumbnail/video/${videoId}`
      };
    
    default:
      return null;
  }
};

// ============================================================
// IS VALID VIDEO URL
// ============================================================
export const isValidVideoUrl = (url) => {
  if (!url) return false;
  const parsed = parseVideoUrl(url);
  return parsed !== null;
};

// ============================================================
// SUPPORTED PLATFORMS LIST
// ============================================================
export const SUPPORTED_PLATFORMS = [
  { id: 'youtube', name: 'YouTube', icon: 'fab fa-youtube', color: '#FF0000', placeholder: 'https://youtube.com/watch?v=...' },
  { id: 'tiktok', name: 'TikTok', icon: 'fab fa-tiktok', color: '#000000', placeholder: 'https://tiktok.com/@user/video/...' },
  { id: 'instagram', name: 'Instagram', icon: 'fab fa-instagram', color: '#E4405F', placeholder: 'https://instagram.com/p/...' },
  { id: 'facebook', name: 'Facebook', icon: 'fab fa-facebook', color: '#1877F2', placeholder: 'https://facebook.com/watch?v=...' },
  { id: 'dailymotion', name: 'Dailymotion', icon: 'fas fa-video', color: '#0066DC', placeholder: 'https://dailymotion.com/video/...' },
  { id: 'vimeo', name: 'Vimeo', icon: 'fab fa-vimeo', color: '#1AB7EA', placeholder: 'https://vimeo.com/...' },
  { id: 'twitter', name: 'Twitter/X', icon: 'fab fa-twitter', color: '#1DA1F2', placeholder: 'https://twitter.com/user/status/...' },
  { id: 'rumble', name: 'Rumble', icon: 'fas fa-video', color: '#85C742', placeholder: 'https://rumble.com/v...' },
  { id: 'direct', name: 'Direct Video', icon: 'fas fa-play-circle', color: '#4F6F52', placeholder: 'https://example.com/video.mp4' },
];
