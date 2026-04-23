/**
 * Authentication Service
 * Handles API calls for login, register, and token management
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// Types
interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

interface User {
  id: number;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
}

interface AuthResponse {
  success?: boolean;
  access?: string;
  refresh?: string;
  user?: User;
  message?: string;
  error?: string;
}

class AuthService {
  /**
   * Register a new user
   */
  static async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          password_confirm: data.password,
          username: data.email.split('@')[0],
          first_name: data.fullName.split(' ')[0],
          last_name: data.fullName.split(' ').slice(1).join(' ') || ''
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        return { success: true, message: 'Registration successful', ...result };
      }
      
      return { success: false, error: result.detail || result.error || 'Registration failed' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Login user and store tokens
   */
  static async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password
        })
      });

      const result = await response.json();

      if (response.ok && result.access) {
        // Store tokens
        localStorage.setItem('access_token', result.access);
        localStorage.setItem('refresh_token', result.refresh);
        
        // Store user data if available
        if (result.user) {
          localStorage.setItem('user', JSON.stringify(result.user));
        }
        
        return { success: true, ...result };
      }

      return { success: false, error: result.detail || result.error || 'Invalid credentials' };
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  /**
   * Logout user and clear tokens
   */
  static logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }

  /**
   * Get stored access token
   */
  static getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  /**
   * Get stored user data
   */
  static getUser(): User | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    
    // Basic JWT expiry check
    try {
      const base64 = token.split('.')[1]
        .replace(/-/g, '+')   // base64url → base64
        .replace(/_/g, '/');  // base64url → base64
      const payload = JSON.parse(atob(base64));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  /**
   * Get authorization headers for API requests
   */
  static getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /**
   * Refresh token if expired
   */
  static async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken })
      });

      if (response.ok) {
        const result = await response.json();
        localStorage.setItem('access_token', result.access);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export default AuthService;
