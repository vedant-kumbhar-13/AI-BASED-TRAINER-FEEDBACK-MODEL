import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { Search, BookOpen, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { getTopics, getTopicBySlug } from '../services/learningAPI';
import type { TopicSummary, TopicDetail, CategoryGroup } from '../services/learningAPI';
import { TOPICS as QUIZ_TOPICS, getProgress } from '../data/aptitudeData';

// YouTube API returns HTML entities like &amp; in titles — decode them
const decodeHtml = (html: string): string => {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
};

export const Learning = () => {
  const { topicSlug } = useParams();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [allTopics, setAllTopics] = useState<TopicSummary[]>([]);
  const [activeTopic, setActiveTopic] = useState<TopicDetail | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [topicLoading, setTopicLoading] = useState(false);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);

  // ── Fetch topic list on mount ──
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const data = await getTopics();
        setCategories(data.categories);
        setAllTopics(data.topics);
        // Expand all categories by default
        setExpandedCats(new Set(data.categories.map((c: CategoryGroup) => c.key)));
      } catch (err) {
        console.error('Failed to load topics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTopics();
  }, []);

  // ── Fetch topic detail when slug changes ──
  useEffect(() => {
    if (!topicSlug) {
      setActiveTopic(null);
      return;
    }
    const fetchDetail = async () => {
      setTopicLoading(true);
      try {
        const detail = await getTopicBySlug(topicSlug);
        setActiveTopic(detail);
        setActiveVideoIdx(0);
      } catch (err) {
        console.error('Failed to load topic detail:', err);
        setActiveTopic(null);
      } finally {
        setTopicLoading(false);
      }
    };
    fetchDetail();
  }, [topicSlug]);

  const handleSelectTopic = (slug: string) => {
    navigate(`/learning/${slug}`);
  };

  const toggleCategory = (catKey: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  };

  // Filter topics by search and category
  const filteredCategories = categories
    .map(cat => ({
      ...cat,
      topics: cat.topics.filter(t => {
        const matchesSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCat = !selectedCategory || cat.key === selectedCategory;
        return matchesSearch && matchesCat;
      }),
    }))
    .filter(cat => cat.topics.length > 0);

  const levelColors: Record<string, string> = {
    Beginner: 'bg-green-100 text-green-700',
    Intermediate: 'bg-yellow-100 text-yellow-700',
    Advanced: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="pt-16 flex">
        {/* ═══════════════════  SIDEBAR  ═══════════════════ */}
        <aside className="w-80 min-h-screen bg-white border-r border-gray-200 overflow-y-auto sticky top-16" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-gray-800">Aptitude Topics</h2>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search topics..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                  !selectedCategory ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(selectedCategory === cat.key ? '' : cat.key)}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                    selectedCategory === cat.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Topic tree */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <div className="pb-4">
              {filteredCategories.map(cat => (
                <div key={cat.key} className="mb-1">
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    {expandedCats.has(cat.key) ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    {cat.label}
                    <span className="ml-auto text-xs text-gray-400">{cat.topics.length}</span>
                  </button>

                  {expandedCats.has(cat.key) && (
                    <ul className="ml-4">
                      {cat.topics.map(topic => (
                        <li key={topic.id}>
                          <button
                            onClick={() => handleSelectTopic(topic.slug)}
                            className={`w-full text-left flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition ${
                              activeTopic?.slug === topic.slug
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-base">{topic.icon}</span>
                            <span className="truncate">{topic.name}</span>
                            {topic.has_quiz && (
                              <span className="ml-auto text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                Quiz
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ═══════════════════  CONTENT  ═══════════════════ */}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          {topicLoading ? (
            <div className="flex flex-col items-center justify-center h-96">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-gray-500">Loading topic...</p>
            </div>
          ) : activeTopic ? (
            <div className="max-w-4xl mx-auto">
              {/* Topic Header */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-5xl">{activeTopic.icon}</span>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">{activeTopic.name}</h1>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${levelColors[activeTopic.level] || 'bg-gray-100 text-gray-600'}`}>
                        {activeTopic.level}
                      </span>
                      <span className="text-sm text-gray-400">
                        {activeTopic.category_display}
                      </span>
                      {activeTopic.video_count > 0 && (
                        <span className="text-sm text-gray-400">
                          • {activeTopic.video_count} videos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Definition */}
                <div className="bg-gradient-to-r from-primary/5 to-transparent rounded-lg p-4 border-l-4 border-primary">
                  <p className="text-sm font-medium text-gray-400 mb-1">Definition</p>
                  <p className="text-gray-800 font-medium">{activeTopic.definition}</p>
                </div>

                {/* Quiz CTA — driven by backend has_quiz flag */}
                {activeTopic.has_quiz && (() => {
                  // Try to find in static list for progress tracking; fall back gracefully
                  const quizTopic = QUIZ_TOPICS.find(qt => qt.name === activeTopic.name);
                  const quizProgress = quizTopic ? getProgress(quizTopic.id) : null;
                  // Static topics use numeric ID, admin-added topics use slug-based route
                  const quizLink = quizTopic
                    ? `/quiz/${quizTopic.id}`
                    : `/quiz/slug/${activeTopic.slug}`;
                  return (
                    <div className="mt-4 bg-gradient-to-r from-green-50 to-white rounded-lg p-4 border border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-green-800 mb-1">📝 Quiz Available</p>
                          {quizProgress && (
                            <p className="text-xs text-green-800 font-bold">
                              Best: {quizProgress.bestScore}% • {quizProgress.attempts} attempt{quizProgress.attempts !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        <Link
                          to={quizLink}
                          className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg transition shadow-sm"
                        >
                          {quizProgress ? 'Retake Quiz' : 'Take Quiz'}
                        </Link>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Video Section */}
              {activeTopic.videos.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">Video Tutorials</h2>

                  {/* Main video player */}
                  <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4">
                    <iframe
                      src={activeTopic.videos[activeVideoIdx]?.embed_url}
                      title={activeTopic.videos[activeVideoIdx]?.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>

                  {/* Video title */}
                  <p className="text-sm font-medium text-gray-800 mb-1">
                    {decodeHtml(activeTopic.videos[activeVideoIdx]?.title || '')}
                  </p>
                  <p className="text-xs text-gray-400 mb-4">
                    {activeTopic.videos[activeVideoIdx]?.channel_name}
                  </p>

                  {/* Video grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {activeTopic.videos.map((video, idx) => (
                      <button
                        key={video.id}
                        onClick={() => setActiveVideoIdx(idx)}
                        className={`group relative rounded-lg overflow-hidden border-2 transition ${
                          idx === activeVideoIdx
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-transparent hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                          alt={video.title}
                          className="w-full aspect-video object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                          <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span className="text-gray-800 text-xs font-bold ml-0.5">▶</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 p-1.5 line-clamp-2 leading-tight">
                          {decodeHtml(video.title)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Description Section */}
              {activeTopic.description && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-800">About This Topic</h2>
                    {activeTopic.wikipedia_url && (
                      <a
                        href={activeTopic.wikipedia_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Read more on Wikipedia →
                      </a>
                    )}
                  </div>
                  <div
                    className="theory-content"
                    dangerouslySetInnerHTML={{ __html: activeTopic.description }}
                  />
                  <style>{`
                    .theory-content {
                      font-size: 1rem;
                      line-height: 1.8;
                      color: #374151;
                      font-family: 'Inter', system-ui, sans-serif;
                    }
                    .theory-content p {
                      margin-bottom: 1rem;
                    }
                    .theory-content h2 {
                      font-size: 1.5rem;
                      font-weight: 800;
                      color: #111827;
                      margin-top: 2.5rem;
                      margin-bottom: 1.25rem;
                      padding-bottom: 0.5rem;
                      border-bottom: 2px solid #e5e7eb;
                    }
                    .theory-content h2:first-child {
                      margin-top: 0;
                    }
                    .theory-content h3 {
                      font-size: 1.25rem;
                      font-weight: 700;
                      color: #1f2937;
                      margin-top: 2rem;
                      margin-bottom: 1rem;
                    }
                    .theory-content ul, .theory-content ol {
                      padding-left: 1.5rem;
                      margin-bottom: 1.5rem;
                    }
                    .theory-content li {
                      margin-bottom: 0.5rem;
                    }
                    .theory-content strong {
                      color: #111827;
                      font-weight: 700;
                    }
                    /* Custom Boxes for GeeksForGeeks style structure */
                    .theory-content .formula-box {
                      background-color: #f0fdf4;
                      border-left: 4px solid #16a34a;
                      padding: 1.25rem;
                      border-radius: 0.5rem;
                      margin: 1.5rem 0;
                      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    }
                    .theory-content .example-box {
                      background-color: #f8fafc;
                      border: 1px solid #e2e8f0;
                      border-left: 4px solid #3b82f6;
                      padding: 1.5rem;
                      border-radius: 0.5rem;
                      margin: 1.5rem 0;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    }
                    .theory-content table {
                      width: 100%;
                      border-collapse: collapse;
                      margin: 1.5rem 0;
                      font-size: 0.95rem;
                    }
                    .theory-content table th,
                    .theory-content table td {
                      border: 1px solid #e5e7eb;
                      padding: 0.75rem 1rem;
                      text-align: left;
                    }
                    .theory-content table th {
                      background-color: #f9fafb;
                      font-weight: 600;
                      color: #111827;
                    }
                    .theory-content table tr:nth-child(even) {
                      background-color: #f9fafb;
                    }
                  `}</style>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-center">
              <span className="text-6xl mb-4">📚</span>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Aptitude Learning Hub</h2>
              <p className="text-gray-500 mb-2">
                {allTopics.length} topics across {categories.length} categories
              </p>
              <p className="text-gray-400 text-sm">Select a topic from the sidebar to start learning</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
