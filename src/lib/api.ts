import { offlineRequest } from "./offline";

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  admin: boolean;
};
export type Question = {
  correctOption?: number | null;
  correctOptions?: number[];
  id: string;
  type: "multiple" | "boolean" | "blank" | "short";
  prompt: string;
  questionImage?: string;
  answerImage?: string;
  options: string[];
  accepted: string[];
  explanation: string;
  points: number;
};
export type Settings = {
  guests: boolean;
  review: boolean;
  showAnswers: boolean;
  rankings: boolean;
  passing: number;
  time: number;
  randomQuestions: boolean;
  randomAnswers: boolean;
  layout: "single" | "all";
};
export type Quiz = {
  id: string;
  owner?: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  theme: string;
  cover: string;
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "published";
  settings: Settings;
  questions?: Question[];
  questionCount: number;
  creator?: string;
  plays?: number;
  demo?: number;
  created?: string;
  preview?: boolean;
};
export type History = {
  kind?: "flashcards";
  id: string;
  quiz_id: string;
  title: string;
  name: string;
  score: number;
  maximum: number;
  correct: number;
  submitted: number;
  started: number;
  pending: number;
};
export type Library = {
  quizzes: Quiz[];
  bookmarks: string[];
  saved?: Quiz[];
  attempts: History[];
};
export const categories = [
  "Education",
  "Science",
  "Mathematics",
  "Technology",
  "History",
  "Entertainment",
  "General Knowledge",
];
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  return offlineRequest<T>(path, method, body);
}
