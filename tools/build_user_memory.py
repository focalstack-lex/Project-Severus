#!/usr/bin/env python3
"""
tools/build_user_memory.py
Severus Structured Memory Generator & Validator.

Populates and validates the 23-node structured memory store under USER/
based on USER_KNOWLEDGE_BASE.md (September 2026).
"""

import os
import json
from datetime import datetime

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "USER"))
TIMESTAMP = "2026-09-13T20:00:00+08:00"
SOURCE = "USER_KNOWLEDGE_BASE.md"

DATA = {
    "identity.json": [
        {
            "id": "ident-001",
            "category": "identity",
            "content": "Preferred name: Lex Matondo (short name: Lex). Born December 27, 2005 (age 20 as of 2026).",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "ident-002",
            "category": "identity",
            "content": "Geographic location: Philippines, Davao Region, Digos City, Davao del Sur. CRITICAL: Strictly never describe Lex as based in Manila.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "ident-003",
            "category": "identity",
            "content": "Academic identity: Computer Engineering student pursuing Bachelor of Science in Computer Engineering (BSCpE) at Cor Jesu College of Digos.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "ident-004",
            "category": "identity",
            "content": "Holistic identity: Technologist who creates. Combines computer engineering, software systems, AI, and UI/UX with photography, cinematography, filmmaking, graphic design, and hybrid endurance athletics.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        }
    ],

    "education.json": [
        {
            "id": "edu-001",
            "category": "education",
            "content": "Currently studying Bachelor of Science in Computer Engineering (BSCpE) at Cor Jesu College of Digos, Davao del Sur.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "edu-002",
            "category": "education",
            "content": "Educational philosophy: Project-first learning. Learns by building real-world software and hardware prototypes rather than passive theoretical absorption.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "edu-003",
            "category": "education",
            "content": "Secondary education: Graduated from Holy Cross of Malita, Inc., conducting institutional research during his studies.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        },
        {
            "id": "edu-004",
            "category": "education",
            "content": "University of Santo Tomas (UST) was an older aspirational target; do not treat UST as current or attended education.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ],

    "skills.json": [
        {
            "id": "skill-001",
            "category": "skills",
            "content": "Systems & Programming: Java (Swing, JavaFX, FXML, JDBC), Web (TypeScript, React, Node.js, Express, HTML/CSS, Tailwind), Python, Rust, SQL (PostgreSQL, Supabase, MySQL), Git/GitHub.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "skill-002",
            "category": "skills",
            "content": "AI & Agentic Architectures: Local LLM orchestration (Ollama, Qwen2.5-Coder), Claude, Codex, agentic coding workflows, prompt engineering, and autonomous multi-tool integration.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "skill-003",
            "category": "skills",
            "content": "UI/UX & Design: Figma, design token systems, typography hierarchy, responsive layouts, micro-animations, component architecture, and clean dark-mode interfaces.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "skill-004",
            "category": "skills",
            "content": "Media & Cinematography: Adobe Photoshop, Lightroom, Premiere Pro, DaVinci Resolve, After Effects, gimbal camera operation (Ronin-SC), color grading, and narrative editing.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "medium"
        },
        {
            "id": "skill-005",
            "category": "skills",
            "content": "Endurance & Hybrid Athletics: Zone 2 aerobic base building, half-marathon pacing, trail elevation management, functional strength, and injury resilience routines.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "preferences.json": [
        {
            "id": "pref-001",
            "category": "preferences",
            "content": "Systems over motivation: Prefers actionable daily habits, feedback loops, and automated systems (Atomic Habits) over generic motivational speeches.",
            "status": "preference",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "pref-002",
            "category": "preferences",
            "content": "Aesthetics: Demands human-crafted, intentional design. Rejects generic 'AI slop', over-saturated gradients, and generic templates. Prefers restrained palettes, strong typography, and purposeful motion.",
            "status": "preference",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "pref-003",
            "category": "preferences",
            "content": "Engineering workflow: Practical, lightweight, cost-effective tech stack suitable for a student builder (local models, open-source engines, Supabase, Vercel).",
            "status": "preference",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "pref-004",
            "category": "preferences",
            "content": "Audio & Music: Indie Filipino artists (Ben&Ben, Munimuni), uplifting indie folk ('Riptide' energy), acoustic textures that evoke nostalgia and emotional resonance.",
            "status": "preference",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ],

    "hard_constraints.json": [
        {
            "id": "hc-001",
            "category": "hard_constraint",
            "content": "Do not change my structure: When modifying or fixing existing code, change only what is strictly necessary and preserve Lex's existing file and architecture structure.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "hc-002",
            "category": "hard_constraint",
            "content": "Navigation preservation: Never modify existing navigation layouts or routes unless explicitly requested by Lex.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "hc-003",
            "category": "hard_constraint",
            "content": "UI element behavior: Grizz is intentionally draggable. Do not freeze or make Grizz static.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "hc-004",
            "category": "hard_constraint",
            "content": "Geographic accuracy: Strictly never describe Lex as based in Manila. He is based in the Davao Region / Digos City, Davao del Sur.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "hc-005",
            "category": "hard_constraint",
            "content": "Persona and honorific: Address Lex with dignity and append ', Sir.' at the conclusion of assistant responses in voice / assistant mode.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "hc-006",
            "category": "hard_constraint",
            "content": "Title accuracy: Do not describe Lex as a 'professional photographer' unless explicitly requested.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "hc-007",
            "category": "hard_constraint",
            "content": "Coffee Box client constraint: Strictly avoid the phrase 'golden hour' in copy for Coffee Box unless explicitly requested.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Coffee Box",
            "importance": "medium"
        },
        {
            "id": "hc-008",
            "category": "hard_constraint",
            "content": "Defensive programming: No silent error swallowing; no bare except: pass. Validate inputs at every system boundary.",
            "status": "hard_constraint",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        }
    ],

    "communication_style.json": [
        {
            "id": "comm-001",
            "category": "communication_style",
            "content": "High signal-to-noise ratio: Concise, clear, direct, and zero corporate fluff.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "comm-002",
            "category": "communication_style",
            "content": "Multilingual adaptability: Seamlessly comprehends and engages in English, Tagalog, and Bisaya (relatable student slang, e.g. 'yawa', regional expressions).",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "comm-003",
            "category": "communication_style",
            "content": "Severus Snape academic mentor persona: Perceptive, stoic, rigorous, intellectually sharp, deeply loyal to the user's progress.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        }
    ],

    "projects/active.json": [
        {
            "id": "proj-act-001",
            "category": "projects",
            "content": "Project Severus: Personal JARVIS cognitive operating system and desktop Second Brain (Tauri v2 + Rust backend, React + TypeScript frontend, voice commands, knowledge graph, system control).",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "proj-act-002",
            "category": "projects",
            "content": "Smart Trash Bin: Computer Engineering embedded IoT hardware/software system with automatic sorting, ultrasonic sensors, and MCU control.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Smart Trash Bin",
            "importance": "high"
        },
        {
            "id": "proj-act-003",
            "category": "projects",
            "content": "Coffee Box System: Web ordering, point-of-sale, inventory tracking, and client marketing system for local cafe client.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Coffee Box",
            "importance": "high"
        },
        {
            "id": "proj-act-004",
            "category": "projects",
            "content": "Code x Create Portfolio: Personal portfolio uniting software engineering projects with photography/cinematography galleries under a unified minimalist brand.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "medium"
        }
    ],

    "projects/completed.json": [
        {
            "id": "proj-comp-001",
            "category": "projects",
            "content": "Holy Cross of Malita Institutional Research: Academic software and research paper for secondary school.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        },
        {
            "id": "proj-comp-002",
            "category": "projects",
            "content": "Java Desktop Point of Sale Prototype: Java Swing / NetBeans / MySQL desktop application for retail transactions.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        },
        {
            "id": "proj-comp-003",
            "category": "projects",
            "content": "Client Portrait & Event Shoots: Professional photography coverage for weddings, graduations, pre-debuts, and school publications.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "projects/ideas.json": [
        {
            "id": "proj-idea-001",
            "category": "projects",
            "content": "Local Whisper AI Transcriber: Lightweight desktop tool for transcribing college lectures and voice notes directly into markdown vault notes.",
            "status": "uncertain",
            "confidence": "medium",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "proj-idea-002",
            "category": "projects",
            "content": "Smart Hybrid Runner Log: Offline-first tracker combining running shoe mileage, Zone 2 heart rate drift, trail elevation profiles, and strength training logs.",
            "status": "uncertain",
            "confidence": "medium",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "proj-idea-003",
            "category": "projects",
            "content": "Automated Cinematic B-Roll Sync: Script to auto-detect musical beats and slice camera footage transitions in DaVinci Resolve / Premiere.",
            "status": "uncertain",
            "confidence": "medium",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ],

    "projects/archived.json": [
        {
            "id": "proj-arch-001",
            "category": "projects",
            "content": "Leavian Visuals: Former media brand name, currently transitioned toward the unified 'Code x Create' / 'Focal Stack' identity.",
            "status": "deprecated",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ],

    "goals/technical.json": [
        {
            "id": "goal-tech-001",
            "category": "goals",
            "content": "Graduate with BSCpE honors from Cor Jesu College of Digos with strong hardware-software portfolio.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "goal-tech-002",
            "category": "goals",
            "content": "Master agentic software engineering and local AI cognitive systems embedded in desktop workflows.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "goal-tech-003",
            "category": "goals",
            "content": "Build scalable, production-grade cloud architectures utilizing Supabase, Rust, and modern React frameworks.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "goals/creative.json": [
        {
            "id": "goal-creat-001",
            "category": "goals",
            "content": "Direct and produce emotionally resonant short films addressing youth, student struggles, and nostalgia.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "goal-creat-002",
            "category": "goals",
            "content": "Establish a recognized personal creative brand ('Code x Create') demonstrating both technical mastery and visual artistry.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "medium"
        },
        {
            "id": "goal-creat-003",
            "category": "goals",
            "content": "Long-term ambition: Own and operate a dedicated photography/cinematography studio when financially stable.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "goals/fitness.json": [
        {
            "id": "goal-fit-001",
            "category": "goals",
            "content": "Complete official half-marathon (21.1k) and regional mountain trail races injury-free.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "goal-fit-002",
            "category": "goals",
            "content": "Build and maintain a sub-5:00/km 5K baseline while preserving hybrid athlete strength and aesthetic physique.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "goal-fit-003",
            "category": "goals",
            "content": "Develop unbreakable lower-leg durability (tibia, calves, plantar fascia) to eliminate shin splints under heavy mileage.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        }
    ],

    "goals/personal.json": [
        {
            "id": "goal-pers-001",
            "category": "goals",
            "content": "Achieve full financial self-reliance through software engineering, systems consulting, and selective client work.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "goal-pers-002",
            "category": "goals",
            "content": "Operate by Atomic Habits: Prioritize daily routine execution over fleeting emotional motivation.",
            "status": "goal",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        }
    ],

    "routines.json": [
        {
            "id": "rout-001",
            "category": "routines",
            "content": "Morning Routine: Early wake-up, hydration, Zone 2 endurance run or mobility activation, post-run shower, coffee, high-protein meal.",
            "status": "routine",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "rout-002",
            "category": "routines",
            "content": "Engineering Deep Work: Dedicated 90-120 minute blocks of high-focus programming with zero phone distractions.",
            "status": "routine",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "rout-003",
            "category": "routines",
            "content": "Evening Wind-Down: Strength training, reflection in daily journal, reviewing Second Brain notes, and setting tomorrow's priorities.",
            "status": "routine",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "rout-004",
            "category": "routines",
            "content": "Weekly System Calibration: Sunday evening git review, note graph inspection, training volume review, and shoe mileage check.",
            "status": "routine",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "fitness.json": [
        {
            "id": "fit-001",
            "category": "fitness",
            "content": "Hybrid athlete philosophy: Merging high-volume aerobic endurance with compound resistance training.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "fit-002",
            "category": "fitness",
            "content": "Training distribution: 80% easy Zone 2 runs to build cardiovascular mitochondria and prevent burnout; 20% tempo/speedwork.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "fit-003",
            "category": "fitness",
            "content": "Injury prevention protocol: Regular tibialis raises, calf eccentrics, single-leg glute bridges, foam rolling, and adequate sleep.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        }
    ],

    "equipment.json": [
        {
            "id": "eq-001",
            "category": "equipment",
            "content": "Cameras & Lenses: Nikon D3200 DSLR (reliable workhorse), Yongnuo 50mm f/1.8 prime lens, kit lenses; interest/access to Sony ZV-E10, Canon M50, and GoPro.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "eq-002",
            "category": "equipment",
            "content": "Camera Support: DJI Ronin-SC 3-axis gimbal stabilizer, sturdy tripods, high-speed SD cards, and external storage drives.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "eq-003",
            "category": "equipment",
            "content": "Engineering Station: Windows 11 workstation running VS Code, PowerShell, Node.js, Rust toolchain, Cursor/Antigravity, and Tauri v2 dev environment.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "eq-004",
            "category": "equipment",
            "content": "Running Gear: Cushioned road daily trainers, trail shoes, GPS running watch, running belt, and anti-chafe gear.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ],

    "creative_work.json": [
        {
            "id": "creat-001",
            "category": "creative_work",
            "content": "Visual theme: Grounded, emotional, authentic, and nostalgic. Captures real human emotion rather than sterile artificial setups.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "high"
        },
        {
            "id": "creat-002",
            "category": "creative_work",
            "content": "Subject interests: School memories, youth transition, graduation, personal perseverance, friendship, and quiet introspective moments.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        },
        {
            "id": "creat-003",
            "category": "creative_work",
            "content": "Post-production standard: High attention to color grade, 24fps cinematic pacing, natural skin tones, and narrative-first sound design.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "portfolio.json": [
        {
            "id": "port-001",
            "category": "portfolio",
            "content": "Portfolio structure: Dual-axis presentation distinguishing 'Tech / Code' from 'Create / Media' while presenting a cohesive builder identity.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "high"
        },
        {
            "id": "port-002",
            "category": "portfolio",
            "content": "Portfolio design criteria: Minimalist black-and-white aesthetic, crisp typography, responsive layout, blazing-fast load times, and authentic proof-of-work.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "medium"
        }
    ],

    "businesses.json": [
        {
            "id": "biz-001",
            "category": "businesses",
            "content": "Coffee Box: Active client engagement. Building customized POS / online ordering system and creative collateral. Strictly no 'golden hour' in copy.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Coffee Box",
            "importance": "high"
        },
        {
            "id": "biz-002",
            "category": "businesses",
            "content": "Freelance Media Production: Event and portrait photography, graduation video edits, and branding campaigns across Davao del Sur.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "decisions.json": [
        {
            "id": "dec-001",
            "category": "decisions",
            "content": "Severus Architecture: Selected Tauri v2 (Rust backend + React frontend) for local speed, native OS window controls, zero bloat, and low latency over web-only or heavy Electron.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "dec-002",
            "category": "decisions",
            "content": "Brand Transition: Evolved from 'Leavian Visuals' to 'Code x Create' / 'Focal Stack' to integrate software engineering and creative technology under one umbrella.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Code x Create",
            "importance": "high"
        },
        {
            "id": "dec-003",
            "category": "decisions",
            "content": "Relational Data Layer: Adopted PostgreSQL and Supabase over NoSQL alternatives for structured schemas, relational integrity, and robust Row Level Security.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "workflows.json": [
        {
            "id": "flow-001",
            "category": "workflows",
            "content": "Agentic Coding Workflow: Thorough inspection -> Implementation plan -> Defensive coding -> Local automated verification -> Daily journal log -> Git commit.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "flow-002",
            "category": "workflows",
            "content": "Second Brain Maintenance: Capture observation -> Tag with inline #tags -> Link with [[wiki-links]] -> Rebuild PageRank graph -> Review freshness.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": "Project Severus",
            "importance": "high"
        },
        {
            "id": "flow-003",
            "category": "workflows",
            "content": "Endurance Running Workflow: Dynamic mobility warmup -> GPS recording -> Hydration with electrolytes -> Cool-down walk -> Foam roll and stretch.",
            "status": "current",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "medium"
        }
    ],

    "historical_context.json": [
        {
            "id": "hist-001",
            "category": "historical_context",
            "content": "High School: Completed studies at Holy Cross of Malita, Inc., establishing early roots in research and multimedia production.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        },
        {
            "id": "hist-002",
            "category": "historical_context",
            "content": "UST Aspirations: Early college research explored UST Manila; current confirmed path is thriving at Cor Jesu College of Digos.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        },
        {
            "id": "hist-003",
            "category": "historical_context",
            "content": "Evolution of Camera Gear: Began with basic kit lenses on Nikon D3200, mastered 50mm f/1.8 prime portraiture, and progressively added Ronin-SC stabilization.",
            "status": "historical",
            "confidence": "high",
            "created_at": TIMESTAMP,
            "updated_at": TIMESTAMP,
            "source": SOURCE,
            "related_project": None,
            "importance": "low"
        }
    ]
}

def build_memory():
    os.makedirs(os.path.join(BASE_DIR, "projects"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "goals"), exist_ok=True)
    
    total_memories = 0
    for rel_path, items in DATA.items():
        file_path = os.path.join(BASE_DIR, rel_path.replace("/", os.sep))
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        total_memories += len(items)
        print(f"  [OK] {rel_path}: {len(items)} items")

    print(f"\nSuccessfully populated {len(DATA)} memory files with {total_memories} structured memories.")

if __name__ == "__main__":
    build_memory()
