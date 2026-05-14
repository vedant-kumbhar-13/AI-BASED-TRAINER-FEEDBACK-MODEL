import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { QuestionCard, QuizProgress, QuizTimer } from '../components/quiz';
import { getTopicById, getQuestionsByTopicId, saveProgress as saveProgressLocal } from '../data/aptitudeData';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const QUIZ_QUESTION_COUNT = 10;  // Questions per quiz attempt
const QUIZ_TIME_SECONDS = 600;   // 10 minutes

interface APIQuestion {
  id: number;
  topicId: number;
  text: string;
  options: string[];
  correctAnswer?: string;  // Only populated after submit (from API) or from static data
}

// Minimal topic shape used for display when the static list doesn't have the topic
interface DynamicTopic {
  id: number | string;
  name: string;
  icon: string;
  slug: string;
}

export const Quiz = () => {
  const { topicId, topicSlug } = useParams<{ topicId?: string; topicSlug?: string }>();
  const navigate = useNavigate();

  // ── Static topic (existing flow) ─────────────────────────────
  const staticTopic = topicId ? getTopicById(parseInt(topicId)) : null;

  // ── Dynamic topic (admin-added, slug-based) ───────────────────
  const [dynamicTopic, setDynamicTopic] = useState<DynamicTopic | null>(null);

  // Resolved topic for display — prefers static, falls back to dynamic
  const topic = staticTopic || dynamicTopic;

  const [questions, setQuestions] = useState<APIQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usingAPI, setUsingAPI] = useState(false);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  useEffect(() => {
    const fetchQuestions = async () => {
      // ── Case A: slug-based route (admin-added topic) ──────────
      if (topicSlug) {
        try {
          // 1. Fetch topic metadata from learning API to get the real name
          const topicRes = await fetch(
            `${API_BASE.replace(/\/api$/, '')}/api/learning/topics/${topicSlug}/`
          );
          if (!topicRes.ok) throw new Error('Topic not found');
          const topicData = await topicRes.json();

          setDynamicTopic({
            id: topicData.id,
            name: topicData.name,
            icon: topicData.icon || '📝',
            slug: topicSlug,
          });

          // 2. Fetch quiz questions by topic name from aptitude API
          const qRes = await fetch(
            `${API_BASE}/aptitude/questions/?topic_name=${encodeURIComponent(topicData.name)}&count=${QUIZ_QUESTION_COUNT}`
          );
          if (!qRes.ok) throw new Error('Questions API error');
          const qData = await qRes.json();

          if (qData.questions && qData.questions.length > 0) {
            setQuestions(qData.questions);
            setUsingAPI(true);
          }
          // If no questions found — state stays empty → "Topic Not Found" shown
        } catch (e) {
          console.error('Failed to load slug-based quiz:', e);
        }
        setIsLoading(false);
        return;
      }

      // ── Case B: numeric topicId route (existing static-data flow) ──
      if (!topicId) { setIsLoading(false); return; }

      try {
        const res = await fetch(
          `${API_BASE}/aptitude/questions/?topic_id=${topicId}&count=${QUIZ_QUESTION_COUNT}`
        );
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setUsingAPI(true);
          setIsLoading(false);
          return;
        }
      } catch {
        // API unavailable — fall through to static data
      }

      // Fallback: use static aptitudeData.ts
      const allLocal = getQuestionsByTopicId(parseInt(topicId));
      const shuffled = [...allLocal].sort(() => Math.random() - 0.5);
      setQuestions(shuffled.slice(0, QUIZ_QUESTION_COUNT));
      setUsingAPI(false);
      setIsLoading(false);
    };

    fetchQuestions();
  }, [topicId, topicSlug]);


  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;

  const handleAnswerSelect = (answer: string) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setIsTimerRunning(false);

    let correctCount = 0;
    let score = 0;
    let apiResults: any[] = [];

    if (usingAPI) {
      // Submit to backend — include ALL question IDs, null for unanswered
      // so backend returns correctAnswer for every question
      const fullAnswers = Object.fromEntries(
        questions.map(q => [q.id, answers[q.id] ?? null])
      );
      try {
        const res = await fetch(`${API_BASE}/aptitude/submit/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: fullAnswers }),
        });
        if (res.ok) {
          const data = await res.json();
          score = data.score;
          correctCount = data.correctCount;
          apiResults = data.results || [];
        } else {
          throw new Error('Submit failed');
        }
      } catch {
        score = 0;
        correctCount = 0;
      }
    } else {
      // Local scoring with static data
      questions.forEach(q => {
        if (answers[q.id] === q.correctAnswer) {
          correctCount++;
        }
      });
      score = Math.round((correctCount / questions.length) * 100);
    }

    // Save progress locally (only for static topics with numeric ID)
    if (topicId) {
      saveProgressLocal(parseInt(topicId), score);
    }

    // For slug-based topics, results route uses the slug
    const resultsId = topicId ?? `slug/${topicSlug}`;

    // Navigate to results with state
    navigate(`/quiz-results/${resultsId}`, {
      state: {
        answers,
        score,
        correctCount,
        totalQuestions: questions.length,
        quizQuestionIds: questions.map(q => q.id),
        questions,       // ← pass full question objects (with text + options)
        apiResults,      // ← pass per-question correctAnswer from backend
        topicName: topic?.name,  // ← pass name for display in results
      }
    });
  }, [answers, questions, topicId, topicSlug, topic, navigate, isSubmitting, usingAPI]);

  const handleTimeUp = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="pt-16 flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <span className="text-5xl mb-4 block animate-pulse">📝</span>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Quiz...</h2>
            <p className="text-gray-500">Preparing random questions for you</p>
          </div>
        </div>
      </div>
    );
  }

  if (!topic || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="pt-16 flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <span className="text-6xl mb-4 block">❌</span>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Topic Not Found</h2>
            <p className="text-gray-500 mb-6">The requested topic or quiz doesn't exist.</p>
            <Link
              to="/learning"
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition"
            >
              Back to Learning
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="pt-16">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{topic.icon}</span>
                <div>
                  <h1 className="text-lg font-bold text-gray-800">{topic.name} Quiz</h1>
                  <p className="text-xs text-gray-500">
                    {questions.length} questions • {QUIZ_TIME_SECONDS / 60} minutes
                  </p>
                </div>
              </div>
              <Link
                to={`/learning/${topic.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                className="text-sm text-primary hover:text-primary-dark font-medium"
              >
                ← Back to Topic
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Quiz Area */}
            <div className="lg:col-span-2 space-y-6">
              {/* Question Card */}
              <QuestionCard
                question={currentQuestion}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={questions.length}
                selectedAnswer={answers[currentQuestion.id] || null}
                onAnswerSelect={handleAnswerSelect}
              />

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                  className={`px-6 py-3 rounded-lg font-bold text-sm transition ${
                    currentQuestionIndex === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary hover:text-primary'
                  }`}
                >
                  ← Previous
                </button>

                {currentQuestionIndex === questions.length - 1 ? (
                  <button
                    onClick={handleSubmit}
                    className="px-8 py-3 rounded-lg font-bold text-sm transition bg-primary hover:bg-primary-dark text-white shadow-button"
                  >
                    Submit Quiz ✓
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-lg transition"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Timer */}
              <QuizTimer
                totalSeconds={QUIZ_TIME_SECONDS}
                onTimeUp={handleTimeUp}
                isRunning={isTimerRunning}
              />

              {/* Progress */}
              <QuizProgress
                current={currentQuestionIndex + 1}
                total={questions.length}
                answeredCount={answeredCount}
              />

              {/* Quick Submit */}
              {answeredCount === questions.length && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-green-700 mb-2">🎉 All questions answered!</p>
                  <button
                    onClick={handleSubmit}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg transition"
                  >
                    Submit Quiz
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
