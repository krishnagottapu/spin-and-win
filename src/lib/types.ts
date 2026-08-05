// ─── Database row types ───────────────────────────────────────────────────────

export type SessionStatus = 'draft' | 'active' | 'paused' | 'ending' | 'ended';
export type ParticipantStatus = 'queued' | 'active' | 'spinning' | 'completed';
export type WheelTheme = 'corporate' | 'party' | 'holiday';
export type SoundPreset = 'drumroll' | 'gameshow' | 'casino';

export interface Session {
  id: string;
  event_name: string;
  slug: string;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  max_spins_per_user: number;
  include_no_prize: boolean;
  otp_enabled: boolean;
  theme: WheelTheme;
  sound_preset: SoundPreset;
  tv_token: string;
  status: SessionStatus;
  spin_timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface Prize {
  id: string;
  session_id: string;
  name: string;
  weight: number;
  inventory_count: number;
  is_no_prize: boolean;
  created_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  phone: string;
  status: ParticipantStatus;
  queue_position: number;
  prize_id: string | null;
  result_token: string | null;
  spins_used: number;
  is_fulfilled: boolean;
  fulfilled_by: string | null;
  fulfilled_at: string | null;
  spin_started_at: string | null;
  spin_completed_at: string | null;
  skip_count: number;
  activated_at: string | null;
  joined_at: string;
}

export interface Staff {
  id: string;
  session_id: string;
  name: string;
  invite_code: string;
  device_registered: boolean;
  registered_at: string | null;
}

export interface Admin {
  id: string;
  username: string;
  // password_hash never returned to client
}

// ─── API request/response types ──────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  admin: Pick<Admin, 'id' | 'username'>;
}

export interface CreatePrizeInput {
  name: string;
  weight: number;
  inventory_count: number;
  is_no_prize?: boolean;
}

export interface CreateSessionRequest {
  event_name: string;
  start_time: string;
  end_time: string;
  max_spins_per_user?: number;
  include_no_prize?: boolean;
  otp_enabled?: boolean;
  theme: WheelTheme;
  sound_preset: SoundPreset;
  spin_timeout_seconds?: number;
  prizes: CreatePrizeInput[];
}

export interface SessionWithPrizes extends Session {
  prizes: Prize[];
}

export interface QueueJoinRequest {
  session_id: string;
  name: string;
  phone: string;
}

export interface QueueJoinResponse {
  participant_id: string;
  status: ParticipantStatus;
  queue_position: number;
  estimated_wait_seconds: number;
}

export interface QueueStatusResponse {
  participant_id: string;
  name: string | null;
  status: ParticipantStatus;
  queue_position: number | null;
  estimated_wait_seconds: number | null;
  prize_name: string | null;
  is_no_prize: boolean | null;
  result_token: string | null;
  is_fulfilled: boolean | null;
  fulfilled_at: string | null;
}

export interface SpinRequest {
  session_id: string;
  participant_id: string;
}

export interface SpinResponse {
  prize_id: string;
  prize_name: string;
  prize_index: number; // wheel slice index for animation
  is_no_prize: boolean;
  result_token: string;
}

export interface StaffRegisterRequest {
  invite_code: string;
  name: string;
}

export interface StaffRegisterResponse {
  staff_id: string;
  session_id: string;
}

export interface ClaimVerifyResponse {
  participant_id: string;
  name: string;
  phone: string;
  prize_name: string;
  is_no_prize: boolean;
  is_fulfilled: boolean;
  fulfilled_by_name: string | null;
  fulfilled_at: string | null;
}

export interface FulfillRequest {
  participant_id: string;
}

export interface FulfillResponse {
  success: boolean;
  fulfilled_at: string;
}

export interface GenerateInviteRequest {
  session_id: string;
  count: number; // number of codes to generate (1-10)
}

export interface GenerateInviteResponse {
  codes: string[];
}

// ─── Realtime broadcast payload types ────────────────────────────────────────

export interface QueueUpdatedPayload {
  positions: Array<{ id: string; position: number }>;
}

export interface PlayerActivePayload {
  participant_id: string;
  name: string;
  position: number;
}

export interface SpinStartPayload {
  participant_id: string;
  name: string;
}

export interface SpinResultPayload {
  participant_id: string;
  name: string;
  prize_name: string;
  prize_index: number;
  is_no_prize: boolean;
}

export interface WinnerAnnouncedPayload {
  name: string;
  prize_name: string;
  timestamp: string;
}

export interface SessionEndedPayload {
  reason: 'manual' | 'time_expired' | 'queue_drained';
}

export interface PlayerSkippedPayload {
  participant_id: string;
  name: string;
  reason: 'timeout' | 'admin';
}

// Union type for all broadcast events
export type RealtimeEvent =
  | { event: 'queue:updated'; payload: QueueUpdatedPayload }
  | { event: 'player:active'; payload: PlayerActivePayload }
  | { event: 'player:skipped'; payload: PlayerSkippedPayload }
  | { event: 'spin:start'; payload: SpinStartPayload }
  | { event: 'spin:result'; payload: SpinResultPayload }
  | { event: 'winner:announced'; payload: WinnerAnnouncedPayload }
  | { event: 'session:ended'; payload: SessionEndedPayload };

// ─── Auth context types ───────────────────────────────────────────────────────

export interface AdminJwtPayload {
  sub: string; // admin.id
  username: string;
  role: 'admin';
  iat: number;
  exp: number;
}

export interface StaffJwtPayload {
  staff_id: string;
  session_id: string;
  role: 'staff';
  iat: number;
  exp: number;
}
