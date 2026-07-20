import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { GradingBoundary, SchoolType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return `KES ${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// ---------------------------------------------------------------------------
// DB-driven grading: look up grade from boundaries loaded from the database.
// Falls back to the hardcoded KCSE scale if no boundaries are provided.
// ---------------------------------------------------------------------------
export function computeGradeFromBoundaries(
  marks: number | null,
  outOf: number,
  boundaries: GradingBoundary[],
): { grade_letter: string | null; points: number | null; remarks: string | null } {
  if (outOf <= 0 || marks == null || !boundaries.length) {
    return { grade_letter: computeGrade(marks, outOf), points: null, remarks: autoRemarks(computeGrade(marks, outOf)) };
  }
  const pct = (marks / outOf) * 100;
  // Boundaries are sorted by sort_order (highest first)
  for (const b of boundaries) {
    if (pct >= b.min_percentage && pct <= b.max_percentage) {
      return { grade_letter: b.grade_letter, points: b.points, remarks: b.remarks };
    }
  }
  // Fallback to lowest boundary
  const lowest = boundaries[boundaries.length - 1];
  return { grade_letter: lowest.grade_letter, points: lowest.points, remarks: lowest.remarks };
}

// Hardcoded fallback (KCSE standard) — used when DB boundaries aren't loaded yet
export function computeGrade(marks: number | null, outOf: number): string | null {
  if (outOf <= 0 || marks == null) return null;
  const pct = (marks / outOf) * 100;
  if (pct >= 80) return "A";
  if (pct >= 75) return "A-";
  if (pct >= 70) return "B+";
  if (pct >= 65) return "B";
  if (pct >= 60) return "B-";
  if (pct >= 55) return "C+";
  if (pct >= 50) return "C";
  if (pct >= 45) return "C-";
  if (pct >= 40) return "D+";
  if (pct >= 35) return "D";
  if (pct >= 30) return "D-";
  return "E";
}

// Compute KCSE points from grade letter (used as fallback)
export function gradeToPoints(grade: string | null): number | null {
  if (!grade) return null;
  const map: Record<string, number> = {
    "A": 12, "A-": 11, "B+": 10, "B": 9, "B-": 8,
    "C+": 7, "C": 6, "C-": 5, "D+": 4, "D": 3, "D-": 2, "E": 1,
  };
  return map[grade] ?? null;
}

// Compute mean points from an array of numeric points values
export function computeMeanPoints(points: (number | null)[]): number | null {
  const valid = points.filter((p): p is number => p != null);
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

// Compute mean grade from mean points (KCSE)
export function meanPointsToGrade(meanPts: number | null): string | null {
  if (meanPts == null) return null;
  if (meanPts >= 11.5) return "A";
  if (meanPts >= 10.5) return "A-";
  if (meanPts >= 9.5) return "B+";
  if (meanPts >= 8.5) return "B";
  if (meanPts >= 7.5) return "B-";
  if (meanPts >= 6.5) return "C+";
  if (meanPts >= 5.5) return "C";
  if (meanPts >= 4.5) return "C-";
  if (meanPts >= 3.5) return "D+";
  if (meanPts >= 2.5) return "D";
  if (meanPts >= 1.5) return "D-";
  return "E";
}

// Compute positions for students based on total marks (descending = rank 1 is highest)
export function computePositions(
  studentIds: string[],
  getTotalMarks: (id: string) => number,
): Record<string, number> {
  const ranked = studentIds
    .map((id) => ({ id, total: getTotalMarks(id) }))
    .sort((a, b) => b.total - a.total);
  const positions: Record<string, number> = {};
  ranked.forEach((r, i) => { positions[r.id] = i + 1; });
  return positions;
}

export function gradeColor(grade: string | null): string {
  if (!grade) return "bg-gray-100 text-gray-700";
  // CBC grades
  if (grade === "EE") return "bg-green-100 text-green-700";
  if (grade === "ME") return "bg-blue-100 text-blue-700";
  if (grade === "AE") return "bg-yellow-100 text-yellow-800";
  if (grade === "BE") return "bg-red-100 text-red-700";
  // KCSE / percentage grades
  if (grade.startsWith("A")) return "bg-green-100 text-green-700";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-700";
  if (grade.startsWith("C")) return "bg-yellow-100 text-yellow-800";
  if (grade.startsWith("D")) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

export function autoRemarks(grade: string | null): string {
  if (!grade) return "";
  switch (grade) {
    case "A":  return "Excellent";
    case "A-": return "Very Good";
    case "B+": return "Good";
    case "B":  return "Above Average";
    case "B-": return "Average";
    case "C+": return "Below Average";
    case "C":  return "Needs Improvement";
    case "C-": return "Poor";
    case "D+": return "Very Poor";
    case "D":  return "Terrible";
    case "D-": return "Failing";
    case "E":  return "No Grade";
    case "EE": return "Exceeding Expectations";
    case "ME": return "Meeting Expectations";
    case "AE": return "Approaching Expectations";
    case "BE": return "Below Expectations";
    default:   return "";
  }
}

// School type helpers
export function isPrimarySchool(schoolType: SchoolType): boolean {
  return schoolType === "primary" || schoolType === "mixed";
}

export function isSecondarySchool(schoolType: SchoolType): boolean {
  return schoolType === "secondary" || schoolType === "mixed";
}

export function schoolTypeLabel(schoolType: SchoolType): string {
  switch (schoolType) {
    case "primary":   return "Primary School";
    case "secondary": return "Secondary School";
    case "mixed":     return "Mixed School";
  }
}

// Default grade names for a school type
export function defaultGradeNames(schoolType: SchoolType): { name: string; level: number }[] {
  if (schoolType === "secondary" || schoolType === "mixed") {
    return [
      { name: "Form 1", level: 1 },
      { name: "Form 2", level: 2 },
      { name: "Form 3", level: 3 },
      { name: "Form 4", level: 4 },
    ];
  }
  // Primary
  return [
    { name: "PP1", level: -1 },
    { name: "PP2", level: 0 },
    { name: "Grade 1", level: 1 },
    { name: "Grade 2", level: 2 },
    { name: "Grade 3", level: 3 },
    { name: "Grade 4", level: 4 },
    { name: "Grade 5", level: 5 },
    { name: "Grade 6", level: 6 },
    { name: "Grade 7", level: 7 },
    { name: "Grade 8", level: 8 },
  ];
}

// Default stream names for a school type
export function defaultStreamNames(schoolType: SchoolType): string[] {
  if (schoolType === "secondary" || schoolType === "mixed") {
    return ["North", "South", "East", "West"];
  }
  return ["North", "South", "East", "West"];
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
