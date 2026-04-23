/**
 * Interview API Service
 * Handles all API calls for the AI Interview module
 */

import AuthService from './authService';

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'}/interview`;

// Types
export interface Resume {
  id: string;
  filename: string;
  skills: string[];
  experience: any[];
  education: any[];
  projects: any[];
  summary: string;
  is_parsed: boolean;
}

export interface InterviewSession {
  id: string;
  interview_type: 'HR' | 'Technical' | 'Behavioral' | 'Mixed';
  status: string;
  total_questions: number;
  current_question_index: number;
  overall_score?: number;
  communication_score?: number;
  technical_score?: number;
  confidence_score?: number;
  start_time?: string;
  end_time?: string;
  created_at?: string;
}

export interface InterviewQuestion {
  id: string;
  question_text: string;
  question_number: number;
  category: string;
  difficulty: number;
  suggested_time_seconds: number;
}

export interface AnswerFeedback {
  id: string;
  score: number;
  ai_feedback: string;
  strengths: string[];
  improvements: string[];
  relevance_score?: number;
  clarity_score?: number;
  depth_score?: number;
}

export interface InterviewFeedback {
  overall_summary: string;
  overall_rating: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  topic_scores: Record<string, number>;
  recommended_resources: string[];
  practice_areas: string[];
}

class InterviewAPI {
  /**
   * Get authorization headers
   */
  private static getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...AuthService.getAuthHeaders()
    };
  }

  /**
   * Upload and parse resume
   */
  static async uploadResume(file: File): Promise<{
    success: boolean;
    resume?: Resume;
    error?: string;
    parsing_warning?: string;
    parsing_error?: string;
  }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/resume/`, {
        method: 'POST',
        headers: AuthService.getAuthHeaders(),
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          resume: result,
          // Surface backend warnings/errors so the UI can inform the user
          parsing_warning: result.parsing_warning,
          parsing_error: result.parsing_error,
        };
      }
      return { success: false, error: result.detail || result.error || 'Failed to upload resume' };
    } catch (error) {
      return { success: false, error: 'Network error. Please check your connection and try again.' };
    }
  }

  /**
   * Get resume by ID
   */
  static async getResume(resumeId: string): Promise<{ success: boolean; resume?: Resume; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/resume/${resumeId}/`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, resume: result };
      }
      return { success: false, error: result.detail || 'Failed to fetch resume' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get all user resumes
   */
  static async getResumes(): Promise<{ success: boolean; resumes?: Resume[]; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/resume/`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, resumes: result };
      }
      return { success: false, error: result.detail || 'Failed to fetch resumes' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Start a new interview session
   */
  static async startInterview(params: {
    interview_type: string;
    resume_id?: string;
    total_questions?: number;
    duration_minutes?: number;
  }): Promise<{ success: boolean; session?: InterviewSession; current_question?: InterviewQuestion; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/start/`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, session: result.session, current_question: result.current_question };
      }
      return { success: false, error: result.detail || result.error || 'Failed to start interview' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get current question for session
   */
  static async getCurrentQuestion(sessionId: string): Promise<{ success: boolean; question?: InterviewQuestion; questions_remaining?: number; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/question/${sessionId}/`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, question: result.question, questions_remaining: result.questions_remaining };
      }
      return { success: false, error: result.detail || 'Failed to get question' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Submit answer and get feedback
   */
  static async submitAnswer(params: {
    session_id: string;
    question_id: string;
    answer_text: string;
    answer_duration_seconds?: number;
  }): Promise<{ success: boolean; answer?: AnswerFeedback; next_question?: InterviewQuestion; is_last_question?: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/submit-answer/`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
      });

      const result = await response.json();
      
      if (response.ok) {
        return { 
          success: true, 
          answer: result.answer, 
          next_question: result.next_question,
          is_last_question: result.is_last_question 
        };
      }
      return { success: false, error: result.detail || result.error || 'Failed to submit answer' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * End interview and get final feedback
   */
  static async endInterview(sessionId: string): Promise<{ success: boolean; session?: InterviewSession; feedback?: InterviewFeedback; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/end/${sessionId}/`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, session: result.session, feedback: result.feedback };
      }
      return { success: false, error: result.detail || result.error || 'Failed to end interview' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get detailed feedback for a session
   */
  static async getFeedback(sessionId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/feedback/${sessionId}/`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, data: result };
      }
      return { success: false, error: result.detail || 'Failed to get feedback' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get interview history
   */
  static async getHistory(params?: {
    type?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ success: boolean; results?: InterviewSession[]; total?: number; error?: string }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.type) queryParams.append('type', params.type);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.page_size) queryParams.append('page_size', params.page_size.toString());

      const response = await fetch(`${API_BASE_URL}/history/?${queryParams}`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, results: result.results, total: result.total };
      }
      return { success: false, error: result.detail || 'Failed to get history' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get interview statistics
   */
  static async getStats(): Promise<{ success: boolean; stats?: any; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/stats/`, {
        headers: this.getHeaders()
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, stats: result };
      }
      return { success: false, error: result.detail || 'Failed to get stats' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Delete interview session
   */
  static async deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/${sessionId}/`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (response.ok) {
        return { success: true };
      }
      const result = await response.json();
      return { success: false, error: result.detail || 'Failed to delete session' };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

}

export default InterviewAPI;
