# AI Trainer 🚀

AI Trainer is a full-stack platform designed to help students prepare for technical and aptitude interviews. It combines interactive aptitude quizzes, learning resources, and a real-time AI-driven interview simulator.

## ✨ Features

*   **Aptitude Quizzes & Learning**: Interactive topics (Quantitative, Logical, Verbal) with automatically evaluated quizzes and video tutorials.
*   **AI Interview Simulator**: A real-time voice and text-based mock interview system using Google's Gemini AI, featuring speech-to-text and text-to-speech capabilities.
*   **AI-Powered Admin Panel**: A secure Django admin dashboard where staff can dynamically generate topic descriptions, 10-question quizzes, and fetch relevant YouTube tutorial videos instantly using the Gemini API.
*   **Secure Authentication**: JWT-based authentication to track user progress, scores, and interview performance.

## 🛠️ Tech Stack

**Backend**
*   Django & Django REST Framework
*   SQLite (Development)
*   Google Gemini API (`google-genai`)
*   Google Cloud STT/TTS

**Frontend**
*   React 19 + Vite
*   TypeScript
*   TailwindCSS
*   Zustand (State Management)
*   React Router v7

## 🚀 How to Run Locally

### 1. Backend (Django)
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # (Windows)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```
*The backend API will be available at `http://localhost:8000/api/`*
*The admin panel is available at `http://localhost:8000/admin/`*

### 2. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
*The frontend will be available at `http://localhost:5173/`*

## 🔒 Recent Updates
*   **Admin Panel Audit**: Hardened security on admin API endpoints (CSRF protection, `IsAuthenticated` checks), added safe parameter parsing, and improved the UI/UX for AI content generation.
*   **Dynamic Routing**: Aptitude topics now support dynamic slug-based routing (`/quiz/slug/:topic-name`) to seamlessly handle newly generated AI content.
