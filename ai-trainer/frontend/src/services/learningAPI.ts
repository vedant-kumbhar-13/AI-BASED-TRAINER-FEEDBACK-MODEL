/**
 * Learning API Service
 * ────────────────────
 * Fetches aptitude topics and videos from the backend.
 * All data is served from cached DB — no external API calls on reads.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

interface TopicSummary {
  id: number;
  name: string;
  slug: string;
  category: string;
  category_display: string;
  icon: string;
  level: string;
  definition: string;
  video_count: number;
  has_quiz: boolean;
  is_archived: boolean;
}

interface TopicVideo {
  id: number;
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  channel_name: string;
  duration: string;
  embed_url: string;
  watch_url: string;
  order: number;
}

interface TopicDetail extends TopicSummary {
  description: string;
  wikipedia_url: string;
  videos: TopicVideo[];
}

interface CategoryGroup {
  key: string;
  label: string;
  topics: TopicSummary[];
}

interface TopicsResponse {
  topics: TopicSummary[];
  categories: CategoryGroup[];
  total_count: number;
}

interface CategoriesResponse {
  categories: { key: string; label: string; topic_count: number }[];
}

/**
 * Get all topics, optionally filtered.
 */
export async function getTopics(filters?: {
  category?: string;
  level?: string;
  search?: string;
}): Promise<TopicsResponse> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.level) params.set('level', filters.level);
  if (filters?.search) params.set('search', filters.search);

  const qs = params.toString();
  const url = `${API_BASE}/api/learning/topics/${qs ? '?' + qs : ''}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load topics: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Get a single topic by slug with full description + videos.
 */
export async function getTopicBySlug(slug: string): Promise<TopicDetail> {
  const resp = await fetch(`${API_BASE}/api/learning/topics/${slug}/`);
  if (!resp.ok) {
    throw new Error(`Failed to load topic: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Get all available categories with topic counts.
 */
export async function getCategories(): Promise<CategoriesResponse> {
  const resp = await fetch(`${API_BASE}/api/learning/categories/`);
  if (!resp.ok) {
    throw new Error(`Failed to load categories: ${resp.status}`);
  }
  return resp.json();
}

export type { TopicSummary, TopicDetail, TopicVideo, CategoryGroup };
