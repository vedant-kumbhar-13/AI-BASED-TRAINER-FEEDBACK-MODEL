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

### 🎙️ AI-Powered Mock Interviews & Live Chat

- **Google Cloud Speech-to-Text (STT)** — Uses GCP Speech API (Chirp 2 model) for high-accuracy Indian-English speech-to-text. Fallbacks automatically to browser-native Web Speech API.
- **Google Cloud Text-to-Speech (TTS)** — Questions are read back using natural Google Cloud TTS (Chirp 3 HD en-IN) with fallback to browser SpeechSynthesis.
- **Conversational Live Interview Mode** — An Exponent-style live mock interview generating questions dynamically one-by-one via Gemini based on response flow.
- **Auto-Calibrating Voice Activity Detector (VAD)** — In live mode, the platform automatically measures the ambient noise floor for 1 second, dynamically sets a speech threshold, and auto-submits responses after 4 seconds of silence.
- **Dynamic Question Generation** — Generates personalized interview questions (up to 8, customizable) from user's uploaded resume in a single AI call.
- **Holistic AI Evaluation** — Single-pass Gemini evaluation returning:
  - Mathematically accurate overall score (0–100 average)
  - Dimension scores: Communication, Technical, Confidence, Structure
  - Detailed feedback, strengths, and improvements per question
  - Placement readiness label + top 3 recommendations
- **Review Before Submit** — Review and edit transcriptions before final submission (in standard mode).
- **Branded Backend PDF Reports** — Professional, downloadable PDF reports generated via ReportLab on the backend. Includes institutional headers (Dept. of AI & Data Science), visual score bar-charts, guide details, and database caching for optimized downloads.
- **Interview History** — Browse past session scores, details, and feedback history.

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
| MediaRecorder API | Built-in  | Voice recording for Cloud STT|
| Web Speech API    | Built-in  | Fallback Voice Input (STT)   |
| SpeechSynthesis   | Built-in  | Fallback Voice Output (TTS)  |

### Backend

| Technology             | Version | Purpose                        |
|------------------------|---------|--------------------------------|
| Django                 | 4.2     | Web Framework                  |
| Django REST Framework  | 3.x     | REST API                       |
| Simple JWT             | 5.x     | JWT Authentication             |
| Google Generative AI   | 0.7.x   | AI Questions & Evaluation      |
| Google Cloud Speech    | 2.21.x  | Cloud STT API (Chirp 2)        |
| Google Cloud TTS       | 2.16.x  | Cloud TTS API (Chirp 3 HD)     |
| ReportLab              | 4.0.x   | Backend PDF Report Generation  |
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

# Google Cloud Settings (for Cloud STT/TTS)
GOOGLE_CLOUD_PROJECT=your-google-cloud-project-id
GOOGLE_CLOUD_REGION=us-central1
# Path to GCP service account key (if not using gcloud CLI local auth)
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/service-account.json

# Optional (defaults work for local dev)
DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
MAX_INTERVIEW_QUESTIONS=8
INTERVIEW_DURATION_MINUTES=30
DEFAULT_INTERVIEW_TYPE=Technical
MAX_RESUME_SIZE_MB=10
```

#### Google Cloud Credentials Setup

To use the high-fidelity Google Cloud STT/TTS services:
1. Enable the **Cloud Speech-to-Text API** (v2) and **Cloud Text-to-Speech API** in your Google Cloud Console.
2. Authenticate locally using Application Default Credentials (ADC) via:
   ```bash
   gcloud auth application-default login
   ```
   Or create a service account with the **Cloud Speech Client** (`roles/speech.client`) and **Cloud Text-to-Speech API** roles, download the JSON key, and specify its path in `GOOGLE_APPLICATION_CREDENTIALS` in your `.env`.
3. Verify `GOOGLE_CLOUD_PROJECT` is set to your correct Google Cloud Project ID.

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
3. **🎙️ Standard AI Interview**:
   - Upload your resume (PDF)
   - Choose interview type and question count (e.g. 1-8 questions)
   - AI reads questions aloud (Cloud TTS or Browser synthesis)
   - Speak to answer (or type manually), review/edit transcriptions, then submit.
4. **💬 Live Interview Chat (Conversational Mode)**:
   - Exponent-style dynamic conversation where Gemini asks questions one-by-one.
   - Microphones capture answers, with auto-calibration for room noise and automatic submission after 4 seconds of silence.
   - Full conversational transcripts are generated via Cloud STT.
5. **Aptitude** — watch topic videos, take quizzes.
6. **History & Reports** — review all past sessions and download branded PDF evaluation reports.

> **Voice Input Fallback Note:** If Google Cloud STT/TTS credentials are not configured, the platform falls back to browser-native Web Speech API (supported in Chromium browsers: Chrome, Edge, Brave).

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
│   │   │   │   ├── InterviewSession.tsx     # Standard voice session page
│   │   │   │   ├── LiveInterviewSession.tsx # Conversational live interview session
│   │   │   │   └── InterviewFeedback.tsx    # Results, feedback, & PDF download
│   │   │   ├── services/
│   │   │   │   ├── authService.ts           # JWT auth helpers
│   │   │   │   └── interviewAPI.ts          # Interview API calls
│   │   │   └── App.tsx                      # Router config
│   │   └── package.json
│   │
│   └── backend/                    # Django REST API
│       ├── apps/
│       │   └── interview/
│       │       ├── models.py        # Resume, Session, Question, Answer, EvaluationResult
│       │       ├── views.py         # start_interview, submit_all, transcribe_audio, download_report
│       │       ├── urls.py
│       │       └── services/
│       │           ├── cloud_stt_service.py  # GCP Speech-to-Text integration (Chirp 2)
│       │           ├── cloud_tts_service.py  # GCP Text-to-Speech integration (Chirp 3)
│       │           ├── report_generator.py   # ReportLab PDF report generation
│       │           └── openai_service.py     # Gemini question generation & evaluation
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

### Interview (Standard & Live)

| Method | Endpoint                          | Description                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/interview/resume/`          | Upload & parse resume (PDF)              |
| GET    | `/api/interview/resume/`          | List user's resumes                      |
| POST   | `/api/interview/start/`           | Start standard session → returns `{session_id, questions[]}` |
| POST   | `/api/interview/submit-all/`      | Submit all standard answers → Gemini evaluation |
| POST   | `/api/interview/transcribe/`      | Convert raw audio bytes to text via GCP Speech-to-Text |
| POST   | `/api/interview/tts/`             | Convert text to MP3 audio bytes via GCP Text-to-Speech |
| POST   | `/api/interview/live/start/`      | Initialize live chat session → returns first question |
| POST   | `/api/interview/live/chat/`       | Submit live answer → returns dynamic next question |
| POST   | `/api/interview/live/submit-all/` | Complete live session & trigger final evaluation |
| GET    | `/api/interview/report/<session_id>/` | Download generated ReportLab PDF report (streams from cache) |
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

Depending on availability, the system chooses between backend Google Cloud integration and frontend browser APIs:

```
                  [ Audio Recording / Speech ]
                                ↓
        Is Google Cloud STT configured & authorized?
                 /                     \
             [Yes]                     [No]
               /                         \
    • Record via MediaRecorder API     • Web Speech API (SpeechRecognition)
    • Stream / Upload audio bytes      • Real-time browser transcription
    • Transcribe via GCP Chirp 2       • Insert directly into input box
    • Apply auto-punctuation           • Requires Chrome/Edge/Brave
```

### Auto-Calibrating Voice Activity Detection (VAD)

In Live Chat mode, a web audio analyzer calibrates itself to the room's noise levels:
1. **Calibrate (1s)**: Measures the ambient noise floor using an AudioContext frequency band.
2. **Threshold**: Sets a dynamic volume threshold above the noise floor.
3. **Continuous Listen**: Keeps microphone open; if voice is detected and is then followed by **4 seconds of continuous silence**, the system automatically stops recording, transcribes, and submits the answer to request the next question from Gemini.

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
