# AI-Based Trainer & Feedback Model 🎯

<div align="center">

![AI Trainer](https://img.shields.io/badge/AI-Powered-blueviolet?style=for-the-badge&logo=google&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.0-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Django](https://img.shields.io/badge/Django-4.2-092E20?style=for-the-badge&logo=django&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Web Speech API](https://img.shields.io/badge/Voice-Web_Speech_API-orange?style=for-the-badge&logo=googlechrome&logoColor=white)

An intelligent training platform that leverages Google Gemini AI to conduct personalised mock interviews, provide holistic feedback, and help users master aptitude concepts through interactive video-based learning.

[Features](#-features) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [API Reference](#-api-reference) • [Project Structure](#-project-structure)

</div>

---

## ✨ Features

### 🎙️ AI-Powered Mock Interviews (Voice Mode)

- **Browser-Native Voice Input** — Uses the **Web Speech API** (built into Chrome/Edge) for real-time speech-to-text. No API key required.
- **Text-to-Speech Read-Back** — Interview questions are read aloud by the browser automatically.
- **Dynamic Question Generation** — Google Gemini generates 1 to 8 personalised interview questions (configured by user) from the uploaded resume in a single AI call.
- **Holistic AI Evaluation** — All answers submitted at once for a single-pass Gemini evaluation, returning:
  - Overall score (mathemathically accurate 0–100 average)
  - Per-dimension scores: Communication, Technical, Confidence
  - Per-question feedback, strength, and improvement
  - Placement readiness label + top 3 recommendations
- **Review Before Submit** — Review and edit any answer before final submission.
- **Robust PDF Reports** — A complete, downloadable PDF report of the interview performance using native jsPDF drawing, ensuring perfectly aligned text, branded headers, and clean page layouts.
- **Interview History** — Full history of past sessions with scores and feedback.

### 📚 Aptitude Training Module

- **5 Core Topics** — Percentage, Number Series, Profit & Loss, Ratio & Proportion, Time & Work
- **Video Tutorials** — Embedded YouTube lectures for each topic
- **Interactive Quizzes** — Topic-wise assessments with instant scoring
- **Progress Tracking** — Monitor improvement over time

### 📊 Personalised Dashboard

- Performance metrics with visual charts
- Interview history with status filters
- Resume analysis with AI-parsed skills/experience
- Quick-start interview button

### 🔐 Secure Authentication

- JWT token-based authentication (access + refresh tokens)
- Protected API routes
- Persistent login sessions

---

## 🛠️ Tech Stack

### Frontend

| Technology        | Version   | Purpose                      |
|-------------------|-----------|------------------------------|
| React             | 19.2.0    | UI Library                   |
| TypeScript        | 5.9       | Type Safety                  |
| Vite              | 7.x       | Build Tool                   |
| Tailwind CSS      | 3.4       | Styling                      |
| React Router      | v7        | Client-side Routing          |
| Recharts          | latest    | Charts & Analytics           |
| Axios             | latest    | HTTP Client                  |
| Lucide React      | latest    | Icon Library                 |
| Web Speech API    | Built-in  | Voice Input (STT)            |
| SpeechSynthesis   | Built-in  | Voice Output (TTS)           |

### Backend

| Technology             | Version | Purpose                        |
|------------------------|---------|--------------------------------|
| Django                 | 4.2     | Web Framework                  |
| Django REST Framework  | 3.x     | REST API                       |
| Simple JWT             | 5.x     | JWT Authentication             |
| Google Generative AI   | 0.7.x   | AI Questions & Evaluation      |
| python-decouple        | 3.x     | Environment Config             |
| PyMuPDF / pdfminer     | latest  | Resume PDF Parsing             |
| SQLite                 | built-in| Database                       |

---

## 📦 Installation

### Prerequisites

- **Node.js** >= 18.x
- **Python** >= 3.10
- **pip**
- **Git**
- A **Google Gemini API key** — [Get one free](https://aistudio.google.com/app/apikey)

### 1. Clone the Repository

```bash
git clone https://github.com/vedant-kumbhar-13/AI-BASED-TRAINER-FEEDBACK-MODEL_voice_mode.git
cd AI-BASED-TRAINER-FEEDBACK-MODEL_voice_mode
```

### 2. Backend Setup

```bash
# Navigate to backend
cd ai-trainer/backend

# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Create `.env` file** in `ai-trainer/backend/`:

```env
# Required
SECRET_KEY=your-django-secret-key-here
GEMINI_API_KEY=your-google-gemini-api-key-here

# Optional (defaults work for local dev)
DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
MAX_INTERVIEW_QUESTIONS=8
INTERVIEW_DURATION_MINUTES=30
DEFAULT_INTERVIEW_TYPE=Technical
MAX_RESUME_SIZE_MB=10
```

```bash
# Apply database migrations
python manage.py migrate

# Create superuser (optional, for admin access)
python manage.py createsuperuser

# Start the backend server
python manage.py runserver
```

Backend API runs at → **http://localhost:8000**

### 3. Frontend Setup

```bash
# Navigate to frontend (from repo root)
cd ai-trainer/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at → **http://localhost:5173**

---

## 🚀 Usage

1. **Register / Login** at `http://localhost:5173`
2. **Dashboard** — see your stats and quick-start buttons
3. **🎙️ Start Interview**:
   - Upload your resume (PDF)
   - Choose interview type (Technical / HR / Behavioral / Mixed)
   - AI generates 8 personalised questions — reads them aloud
   - Click **Speak** to answer by voice (real-time transcript) or type manually
   - Review & edit all answers before submitting
   - Get a full AI feedback report with scores and recommendations
4. **Aptitude** — watch topic videos, take quizzes
5. **History** — review all past interview sessions

> **Voice Input Note:** Voice input requires a Chromium browser (Chrome, Edge, Brave). The Web Speech API is not supported in Firefox for continuous speech recognition.

---

## 📁 Project Structure

```
AI-BASED-TRAINER-FEEDBACK-MODEL_voice_mode/
├── ai-trainer/
│   ├── frontend/                   # React + TypeScript SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── dashboard/      # Navigation, sidebar, section cards
│   │   │   ├── pages/
│   │   │   │   ├── AIInterviewLanding.tsx   # Interview entry page
│   │   │   │   ├── ResumeUpload.tsx         # Resume upload step
│   │   │   │   ├── ResumeSummary.tsx        # Interview config step
│   │   │   │   ├── InterviewSession.tsx     # Voice interview session
│   │   │   │   └── InterviewFeedback.tsx    # Results & feedback
│   │   │   ├── services/
│   │   │   │   ├── authService.ts           # JWT auth helpers
│   │   │   │   ├── interviewAPI.ts          # Interview API calls
│   │   │   │   └── api/interview.js         # startSession / submitAll
│   │   │   └── App.tsx                      # Router config
│   │   └── package.json
│   │
│   └── backend/                    # Django REST API
│       ├── apps/
│       │   └── interview/
│       │       ├── models.py        # Resume, Session, Question, Answer, EvaluationResult
│       │       ├── views.py         # start_interview, submit_all, transcribe_audio
│       │       └── urls.py
│       ├── services/
│       │   └── openai_service.py    # Gemini question generation & evaluation
│       ├── ai_trainer/
│       │   └── settings.py
│       ├── manage.py
│       └── requirements.txt
│
└── data_set/
    └── Aptitude_Final.xlsx         # Aptitude questions dataset
```

---

## 🔧 API Reference

### Authentication

| Method | Endpoint                    | Description       |
|--------|-----------------------------|-------------------|
| POST   | `/api/auth/register/`       | Register user     |
| POST   | `/api/auth/login/`          | Login (JWT)       |
| POST   | `/api/auth/token/refresh/`  | Refresh token     |

### Interview

| Method | Endpoint                          | Description                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/interview/resume/`          | Upload & parse resume (PDF)              |
| GET    | `/api/interview/resume/`          | List user's resumes                      |
| POST   | `/api/interview/start/`           | Start session → returns `{session_id, questions[]}` |
| POST   | `/api/interview/submit-all/`      | Submit all 8 answers → full AI evaluation |
| GET    | `/api/interview/history/`         | Get paginated session history            |
| GET    | `/api/interview/stats/`           | Get aggregate interview stats            |
| DELETE | `/api/interview/<session_id>/`    | Delete a session                         |

### Dashboard & Aptitude

| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/dashboard/stats/`           | User statistics          |
| GET    | `/api/aptitude/topics/`           | Aptitude topic list      |
| POST   | `/api/aptitude/submit/`           | Submit quiz answers      |

---

## 🎙️ How Voice Input Works

The interview uses the browser-native **Web Speech API** — no external service or API key needed.

```
User clicks "Speak"
      ↓
SpeechRecognition starts (continuous mode)
      ↓
Interim transcript displayed in real time below textarea
      ↓
Final words appended to answer textarea
      ↓
User clicks "Stop" or moves to next question
```

**Supported browsers:** Chrome 33+, Edge 79+, Opera 20+
**Not supported:** Firefox, Safari (partial)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Vedant Kumbhar**
**Loukik Ingale**
**Meeraj Krishna MR**

- GitHub: [@vedant-kumbhar-13](https://github.com/vedant-kumbhar-13)

---

<div align="center">

Made with ❤️ for better interview preparation

⭐ Star this repo if you find it helpful!

</div>
