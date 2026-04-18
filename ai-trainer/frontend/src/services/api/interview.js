// Interview API service — all axios calls for interview endpoints including the new /submit-all/ endpoint (fixes BUG-11)

// Uses the project's shared apiClient (has JWT Bearer interceptor built in)
import apiClient from '../api';

/**
 * startSession(resumeId, interviewType, totalQuestions)
 * POST /api/interview/start/
 * Returns: { session_id, questions: [{id, order, text, type}] }
 */
export async function startSession(resumeId, interviewType = 'Technical', totalQuestions = 8) {
  try {
    const response = await apiClient.post('/interview/start/', {
      resume_id:       resumeId || undefined,
      interview_type:  interviewType,
      total_questions: totalQuestions,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Failed to start interview session.'
    );
  }
}

/**
 * submitAll(sessionId, answers)
 * POST /api/interview/submit-all/
 * answers: [{questionId, questionText, questionType, answerText}]
 * Returns: full evaluation dict
 */
export async function submitAll(sessionId, answers) {
  try {
    const response = await apiClient.post('/interview/submit-all/', {
      session_id: sessionId,
      answers,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Evaluation failed. Your answers are saved.'
    );
  }
}

/**
 * getSessionHistory()
 * GET /api/interview/history/
 * Returns: paginated list of past sessions
 */
export async function getSessionHistory() {
  try {
    const response = await apiClient.get('/interview/history/');
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Failed to load interview history.'
    );
  }
}
