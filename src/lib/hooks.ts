import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Grade, Stream, Subject, Student, Exam } from "./types";

export function useGrades() {
  return useQuery({
    queryKey: ["grades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("grades").select("*").order("level");
      if (error) throw error;
      return data as Grade[];
    },
  });
}

export function useStreams(gradeId?: string) {
  return useQuery({
    queryKey: ["streams", gradeId],
    queryFn: async () => {
      let q = supabase.from("streams").select("*, grade:grades(name, level)").order("name");
      if (gradeId) q = q.eq("grade_id", gradeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as (Stream & { grade: { name: string; level: number } })[];
    },
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });
}

export function useStudents(gradeId?: string, streamId?: string) {
  return useQuery({
    queryKey: ["students", gradeId, streamId],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("*, grade:grades(name), stream:streams(name)")
        .order("full_name");
      if (gradeId) q = q.eq("grade_id", gradeId);
      if (streamId) q = q.eq("stream_id", streamId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as (Student & {
        grade: { name: string };
        stream: { name: string };
      })[];
    },
  });
}

export function useExams() {
  return useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams").select("*").order("exam_date", { ascending: false });
      if (error) throw error;
      return data as Exam[];
    },
  });
}
