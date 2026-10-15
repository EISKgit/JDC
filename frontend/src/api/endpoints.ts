/**
 * Every backend endpoint the app uses, as typed functions grouped by resource.
 *
 * Pages and components call these (`goalsApi.create(...)`), never raw URLs: a route
 * change in the backend is a one-line change here, and each page reads as a list of
 * operations rather than HTTP plumbing. The transport (fetch, auth header, errors)
 * stays in ./client.ts.
 */
import { api } from "./client";
import type {
  AskResponse,
  Category,
  CategoryOption,
  ChatTurn,
  Dashboard,
  DaySummary,
  EventItem,
  Goal,
  GoalStatus,
  LifeProfile,
  PublicConfig,
  Token,
  UpdateItem,
  User,
} from "./types";

export const authApi = {
  login: (email: string, password: string) => api.post<Token>("/auth/login", { email, password }),
  register: (email: string, password: string, fullName: string | null) =>
    api.post<Token>("/auth/register", { email, password, full_name: fullName }),
  me: () => api.get<User>("/auth/me"),
  changePassword: (currentPassword: string | null, newPassword: string) =>
    api.post<Token>("/auth/change-password", { current_password: currentPassword, new_password: newPassword }),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post<Token>("/auth/reset-password", { token, new_password: newPassword }),
  logoutEverywhere: () => api.post<Token>("/auth/logout-all"),
  deleteAccount: (password: string | null, confirm: string) => api.delete("/auth/me", { password, confirm }),
};

export const configApi = {
  get: () => api.get<PublicConfig>("/config"),
};

export const categoriesApi = {
  list: () => api.get<CategoryOption[]>("/categories"),
};

export interface ProfileFields {
  about: string | null;
  goals_text: string | null;
  challenges: string | null;
  focus_categories: Category[];
}

export const profileApi = {
  get: () => api.get<LifeProfile | null>("/onboarding"),
  save: (fields: ProfileFields) => api.put<LifeProfile>("/onboarding", fields),
};

export const updatesApi = {
  list: () => api.get<UpdateItem[]>("/updates"),
  create: (content: string) => api.post<UpdateItem>("/updates", { content }),
  edit: (id: number, content: string) => api.patch<UpdateItem>(`/updates/${id}`, { content }),
  remove: (id: number) => api.delete(`/updates/${id}`),
};

export type EventCorrection = Partial<Pick<EventItem, "category" | "description" | "type" | "sentiment">>;

export const eventsApi = {
  correct: (id: number, changes: EventCorrection) => api.patch<EventItem>(`/events/${id}`, changes),
  remove: (id: number) => api.delete(`/events/${id}`),
};

export interface NewGoal {
  title: string;
  category: Category;
  description: string | null;
}

export const goalsApi = {
  list: () => api.get<Goal[]>("/goals"),
  create: (goal: NewGoal) => api.post<Goal>("/goals", goal),
  setStatus: (id: number, status: GoalStatus) => api.patch<Goal>(`/goals/${id}`, { status }),
  remove: (id: number) => api.delete(`/goals/${id}`),
};

export const dashboardApi = {
  get: () => api.get<Dashboard>("/dashboard"),
};

export const assistantApi = {
  ask: (question: string, history: ChatTurn[], tzOffsetMinutes: number) =>
    api.post<AskResponse>("/assistant/ask", { question, history, tz_offset_minutes: tzOffsetMinutes }),
  daySummary: (day: string, tzOffsetMinutes: number) =>
    api.post<DaySummary>("/assistant/day-summary", { day, tz_offset_minutes: tzOffsetMinutes }),
};
