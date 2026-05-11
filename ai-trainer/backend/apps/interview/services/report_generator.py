"""
Interview Report PDF Generator
Uses reportlab to produce a structured A4 PDF report for a completed
interview session.

Usage:
    from .services.report_generator import generate_report_pdf
    pdf_bytes = generate_report_pdf(session)
"""

from __future__ import annotations

import io
import json
import os
from datetime import datetime
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph,
    Spacer, Table, TableStyle, HRFlowable, KeepTogether,
    Image as RLImage,
)
from reportlab.platypus import PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT

if TYPE_CHECKING:
    from apps.interview.models import InterviewSession


# ── Colour palette ─────────────────────────────────────────────────────────
BLUE_DARK  = colors.HexColor("#1E3A8A")  # header / headings
BLUE_MID   = colors.HexColor("#3B82F6")
BLUE_LIGHT = colors.HexColor("#EFF6FF")
GREEN      = colors.HexColor("#16A34A")
GREEN_LIGHT= colors.HexColor("#F0FDF4")
AMBER      = colors.HexColor("#D97706")
AMBER_LIGHT= colors.HexColor("#FFFBEB")
RED        = colors.HexColor("#DC2626")
GRAY_DARK  = colors.HexColor("#1F2937")
GRAY_MID   = colors.HexColor("#6B7280")
GRAY_LIGHT = colors.HexColor("#F9FAFB")
WHITE      = colors.white


def _clamp(val) -> float:
    try:
        return max(0.0, min(100.0, float(val or 0)))
    except (TypeError, ValueError):
        return 0.0


def _score_colour(score: float):
    if score >= 80:
        return GREEN
    if score >= 60:
        return AMBER
    return RED


def _placement_label(key: str) -> str:
    return {
        "not_ready":    "Not Ready",
        "needs_work":   "Needs Work",
        "almost_ready": "Almost Ready",
        "ready":        "Ready",
        "highly_ready": "Highly Ready",
    }.get(key, key.replace("_", " ").title())


# ── College header image path ──────────────────────────────────────────────
HEADER_IMG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", "static", "images", "college_header.jpeg",
)

# Height of the header image area (in points)
_HEADER_IMG_H = 28 * mm
_FOOTER_H = 16 * mm


# ── Page template with header/footer callback ──────────────────────────────

def _make_doc(buf: io.BytesIO, title: str) -> BaseDocTemplate:
    W, H = A4
    margin = 18 * mm

    header_path = os.path.normpath(HEADER_IMG_PATH)

    def _header_footer(canvas, doc):
        canvas.saveState()

        # ── Header: college header image ──
        if os.path.isfile(header_path):
            # Draw the image stretched to full page width at the top
            canvas.drawImage(
                header_path,
                0, H - _HEADER_IMG_H,
                width=W,
                height=_HEADER_IMG_H,
                preserveAspectRatio=True,
                anchor="n",
                mask="auto",
            )
            # Thin separator line below the header image
            canvas.setStrokeColor(BLUE_DARK)
            canvas.setLineWidth(1)
            canvas.line(margin, H - _HEADER_IMG_H - 1, W - margin, H - _HEADER_IMG_H - 1)
        else:
            # Fallback: painted bar if image is missing
            canvas.setFillColor(BLUE_DARK)
            canvas.rect(0, H - 22 * mm, W, 22 * mm, fill=True, stroke=False)
            canvas.setFont("Helvetica-Bold", 10)
            canvas.setFillColor(WHITE)
            canvas.drawCentredString(
                W / 2, H - 13 * mm,
                "AI-Based Pre-Placement Trainer & Feedback Model",
            )
            canvas.setFont("Helvetica", 7)
            canvas.drawCentredString(W / 2, H - 18 * mm, "Interview Performance Report")

        # ── Subtitle beneath the header ──
        canvas.setFont("Helvetica-Bold", 9)
        canvas.setFillColor(BLUE_DARK)
        canvas.drawCentredString(
            W / 2, H - _HEADER_IMG_H - 10,
            "AI-Based Pre-Placement Trainer & Feedback Model — Interview Performance Report",
        )

        # ── Footer ──
        canvas.setStrokeColor(colors.HexColor("#E5E7EB"))
        canvas.setLineWidth(0.5)
        canvas.line(margin, _FOOTER_H, W - margin, _FOOTER_H)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GRAY_MID)
        canvas.drawCentredString(
            W / 2, _FOOTER_H - 6,
            f"AI Pre-Placement Trainer  |  Page {doc.page}  |  "
            f"Generated {datetime.now().strftime('%d %b %Y')}",
        )

        # ── Copyright notice ──
        canvas.setFont("Helvetica", 6)
        canvas.setFillColor(GRAY_MID)
        canvas.drawCentredString(
            W / 2, 6 * mm,
            f"© {datetime.now().year} Vedant Kumbhar, Loukik Ingale, Meeraj Krishna — "
            "AI-Based Pre-Placement Trainer & Feedback Model. All Rights Reserved.",
        )

        canvas.restoreState()

    top_margin = _HEADER_IMG_H + 14 * mm  # image + subtitle + gap
    bottom_margin = _FOOTER_H + 4 * mm

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        title=title,
        author="AI Trainer — Yashoda Technical Campus",
        topMargin=top_margin,
        bottomMargin=bottom_margin,
        leftMargin=margin,
        rightMargin=margin,
    )
    frame = Frame(
        margin, bottom_margin,
        W - 2 * margin, H - top_margin - bottom_margin,
        id="normal",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=_header_footer)])
    return doc


def generate_report_pdf(session: "InterviewSession") -> bytes:
    """
    Generate a PDF report for a completed interview session.

    Args:
        session: Django InterviewSession model instance (must be completed)

    Returns:
        PDF file contents as bytes
    """
    buf = io.BytesIO()
    styles = getSampleStyleSheet()

    # ── Custom paragraph styles ────────────────────────────────────────────
    h1 = ParagraphStyle("h1", parent=styles["Heading1"],
                        fontSize=16, textColor=BLUE_DARK, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"],
                        fontSize=11, textColor=BLUE_DARK, spaceAfter=3)
    body = ParagraphStyle("body", parent=styles["Normal"],
                          fontSize=9, textColor=GRAY_DARK,
                          leading=13, spaceAfter=2)
    small = ParagraphStyle("small", parent=styles["Normal"],
                           fontSize=8, textColor=GRAY_MID, leading=11)
    label = ParagraphStyle("label", parent=styles["Normal"],
                           fontSize=8, textColor=GRAY_MID)
    center = ParagraphStyle("center", parent=body, alignment=TA_CENTER)

    W, _ = A4
    content_w = W - 36 * mm  # left + right margins

    story = []

    # ── Fetch evaluation and answers ───────────────────────────────────────
    try:
        evaluation = session.evaluation  # EvaluationResult OneToOne
    except Exception:
        evaluation = None

    questions_qs = list(session.questions.order_by("question_number"))
    user = session.user

    # ── Candidate name ─────────────────────────────────────────────────────
    first = getattr(user, "first_name", "") or ""
    last  = getattr(user, "last_name",  "") or ""
    candidate_name = f"{first} {last}".strip() or getattr(user, "username", "Candidate")

    # ── Section 1: Candidate info + overall score ──────────────────────────
    overall_score = _clamp(getattr(evaluation, "overall_score", session.overall_score))
    placement_raw = getattr(evaluation, "placement_readiness", "needs_work")
    placement_label = _placement_label(placement_raw)
    interview_date = (session.start_time or session.created_at).strftime("%d %b %Y")

    info_data = [
        ["Candidate", candidate_name,
         "Interview Type", session.interview_type],
        ["Date", interview_date,
         "Questions", str(session.total_questions)],
        ["Overall Score",
         Paragraph(f'<font size="18" color="{_score_colour(overall_score).hexval()}"><b>{overall_score:.0f}%</b></font>', center),
         "Placement Readiness",
         Paragraph(f'<b>{placement_label}</b>', center)],
    ]
    info_table = Table(
        info_data,
        colWidths=[content_w * 0.18, content_w * 0.32, content_w * 0.18, content_w * 0.32],
    )
    info_table.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), GRAY_LIGHT),
        ("BACKGROUND",  (0, 2), (-1, 2), BLUE_LIGHT),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",    (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",   (0, 0), (0, -1), GRAY_MID),
        ("TEXTCOLOR",   (2, 0), (2, -1), GRAY_MID),
        ("ALIGN",       (1, 0), (1, -1), "LEFT"),
        ("ALIGN",       (3, 0), (3, -1), "CENTER"),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",        (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [GRAY_LIGHT, WHITE]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(info_table)
    story.append(Spacer(1, 5 * mm))

    # ── Section 2: Score breakdown bars ───────────────────────────────────
    story.append(Paragraph("Score Breakdown", h2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BLUE_LIGHT, spaceAfter=4))

    score_pairs = [
        ("Communication", _clamp(getattr(evaluation, "communication_score", session.communication_score))),
        ("Technical",     _clamp(getattr(evaluation, "technical_score",     session.technical_score))),
        ("Confidence",    _clamp(getattr(evaluation, "confidence_score",    session.confidence_score))),
        ("Overall",       overall_score),
    ]

    BAR_W = content_w * 0.55
    for label_str, score in score_pairs:
        bar_fill = BAR_W * score / 100
        col = _score_colour(score)
        row_data = [
            [Paragraph(f'<b>{label_str}</b>', label),
             _bar_table(BAR_W, bar_fill, col),
             Paragraph(f'<b>{score:.0f}%</b>', label)],
        ]
        t = Table(row_data, colWidths=[content_w * 0.2, BAR_W, content_w * 0.1])
        t.setStyle(TableStyle([
            ("VALIGN",  (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",   (2, 0), (2, 0), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)

    story.append(Spacer(1, 4 * mm))

    # ── Section 3: Summary + Recommendations ──────────────────────────────
    summary_text = getattr(evaluation, "summary_feedback", "") or ""
    top_strength = getattr(evaluation, "top_strength",    "") or ""
    top_weakness = getattr(evaluation, "top_weakness",    "") or ""
    recs_raw     = getattr(evaluation, "top_3_recommendations", "[]") or "[]"
    try:
        recs = json.loads(recs_raw) if isinstance(recs_raw, str) else recs_raw
    except Exception:
        recs = []

    if summary_text or top_strength or top_weakness:
        story.append(Paragraph("Overall Assessment", h2))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BLUE_LIGHT, spaceAfter=4))

        if summary_text:
            story.append(Paragraph(summary_text, body))
            story.append(Spacer(1, 3 * mm))

        si_data = []
        if top_strength:
            si_data.append([
                Paragraph("✓ Strength", ParagraphStyle("s", parent=label, textColor=GREEN)),
                Paragraph(top_strength, body),
            ])
        if top_weakness:
            si_data.append([
                Paragraph("→ Improve", ParagraphStyle("i", parent=label, textColor=AMBER)),
                Paragraph(top_weakness, body),
            ])
        if si_data:
            t = Table(si_data, colWidths=[content_w * 0.2, content_w * 0.8])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), GREEN_LIGHT),
                ("BACKGROUND", (0, 1), (-1, 1), AMBER_LIGHT) if len(si_data) > 1 else ("NOP", (0,0),(0,0), None),
                ("VALIGN",     (0, 0), (-1, -1), "TOP"),
                ("GRID",       (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)
            story.append(Spacer(1, 4 * mm))

    if recs:
        story.append(Paragraph("Recommendations", h2))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BLUE_LIGHT, spaceAfter=4))
        for i, rec in enumerate(recs[:5], 1):
            story.append(Paragraph(f"{i}. {rec}", body))
        story.append(Spacer(1, 4 * mm))

    # ── Section 4: Per-question breakdown ─────────────────────────────────
    story.append(Paragraph("Question-by-Question Breakdown", h2))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BLUE_LIGHT, spaceAfter=4))

    for q in questions_qs:
        try:
            answer = q.answer
        except Exception:
            answer = None

        q_score   = _clamp(answer.score if answer else 0)
        q_col     = _score_colour(q_score)
        feedback  = (answer.ai_feedback if answer else "") or ""
        strengths = (answer.strengths   if answer else []) or []
        imprvmnts = (answer.improvements if answer else []) or []
        a_text    = (answer.answer_text  if answer else "[No answer provided]") or "[No answer provided]"

        q_block = [
            # Question header row
            [
                Paragraph(f'<b>Q{q.question_number}</b> &nbsp; <font size="8" color="{GRAY_MID.hexval()}">[{q.category.title()}]</font>', body),
                Paragraph(f'<font color="{q_col.hexval()}"><b>{q_score:.0f}%</b></font>', center),
            ],
            # Question text
            [Paragraph(q.question_text, body), ""],
            # Answer
            [Paragraph(f'<font color="{GRAY_MID.hexval()}">Your answer:</font> {_escape(a_text[:300])}{"…" if len(a_text) > 300 else ""}', small), ""],
        ]
        if feedback:
            q_block.append([Paragraph(f'<i><font color="#1D4ED8">{_escape(feedback)}</font></i>', small), ""])
        if strengths:
            q_block.append([Paragraph(f'<font color="{GREEN.hexval()}">✓ {strengths[0]}</font>', small), ""])
        if imprvmnts:
            q_block.append([Paragraph(f'<font color="{AMBER.hexval()}">→ {imprvmnts[0]}</font>', small), ""])

        qt = Table(q_block, colWidths=[content_w * 0.85, content_w * 0.15])
        qt.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), BLUE_LIGHT),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("SPAN",          (0, 1), (-1, 1)),
            ("SPAN",          (0, 2), (-1, 2)),
            ("SPAN",          (0, 3), (-1, 3)) if len(q_block) > 3 else ("NOP", (0,0),(0,0), None),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("ALIGN",         (1, 0), (1, 0), "CENTER"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ]))
        story.append(KeepTogether([qt, Spacer(1, 3 * mm)]))

    # ── Build PDF ──────────────────────────────────────────────────────────
    title = f"AI Interview Report — {candidate_name}"
    doc = _make_doc(buf, title)
    doc.build(story)
    return buf.getvalue()


# ── Helpers ────────────────────────────────────────────────────────────────

def _bar_table(total_w, fill_w, colour):
    """Return a thin bar chart Table flowable."""
    inner = Table(
        [["", ""]],
        colWidths=[max(0, fill_w), max(0, total_w - fill_w)],
        rowHeights=[5],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colour),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#E5E7EB")),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    return inner


def _escape(text: str) -> str:
    """Escape XML special chars for ReportLab Paragraph."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))
