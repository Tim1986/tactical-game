import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://tactical-game-backend-production.up.railway.app';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}
async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { return localStorage.getItem(key); }
  return SecureStore.getItemAsync(key);
}
async function storeDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken(): Promise<string | null> { return storeGet(ACCESS_TOKEN_KEY); }
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await storeSet(ACCESS_TOKEN_KEY, accessToken);
  await storeSet(REFRESH_TOKEN_KEY, refreshToken);
}
export async function clearTokens(): Promise<void> {
  await storeDelete(ACCESS_TOKEN_KEY);
  await storeDelete(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await storeGet(REFRESH_TOKEN_KEY);
  // FIX 1: Don't send a null refresh token to the server
  if (!refreshToken) return null;
  try {
    const res = await fetch(API_BASE_URL + "/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) });
    if (!res.ok) return null;
    const data = await res.json() as { data: { tokens: { accessToken: string; refreshToken: string } } };
    await saveTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
    return data.data.tokens.accessToken;
  } catch { return null; }
}

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "ApiError"; }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(API_BASE_URL + path, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...options.headers } });
  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) return apiFetch<T>(path, options, false);
    // FIX 2: Clear stale tokens so the user isn't stuck in a broken state
    await clearTokens();
    throw new ApiError("UNAUTHORIZED", "Session expired. Please log in again.");
  }
  const json = await res.json() as { success: boolean; data: T; error?: { code: string; message: string } };
  // FIX 3: Surface API errors instead of silently returning undefined
  if (!json.success && json.error) {
    throw new ApiError(json.error.code, json.error.message);
  }
  return json.data;
}

export interface AuthResult { user: { id: string; username: string; email: string; elo: number; accountLevel: number }; tokens: { accessToken: string; refreshToken: string }; }
export async function register(username: string, email: string, password: string): Promise<AuthResult> { return apiFetch<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify({ username, email, password }) }); }
export async function login(usernameOrEmail: string, password: string): Promise<AuthResult> { return apiFetch<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ usernameOrEmail, password }) }); }
export async function logout(): Promise<void> { await apiFetch("/auth/logout", { method: "POST" }); }
export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<void> { await apiFetch("/auth/push-token", { method: "POST", body: JSON.stringify({ token, platform }) }); }
export interface UserProfile { id: string; username: string; email: string; elo: number; accountXp: number; accountLevel: number; createdAt: string; lastActiveAt: string; }
export async function getMe(): Promise<UserProfile> { return apiFetch<UserProfile>("/users/me"); }
export interface AbilityDef { id: string; slug: string; name: string; description: string; targetingType: string; range: number; areaRadius: number; cooldownTurns: number; }
export interface UnitDef { id: string; slug: string; name: string; maxHealth: number; movementRange: number; abilities: string[]; passives: string[]; unlockLevel: number; assetKey: string; }
export async function getUnits(): Promise<{ units: UnitDef[]; abilities: AbilityDef[] }> { return apiFetch("/units"); }
export interface Team { id: string; userId: string; name: string; unitIds: [string, string, string, string]; placement: Array<{ x: number; y: number }>; isActive: boolean; createdAt: string; }
export async function getTeams(): Promise<{ teams: Team[] }> { return apiFetch("/teams"); }
export async function createTeam(name: string, unitIds: string[], placement: Array<{ x: number; y: number }>): Promise<{ team: Team }> { return apiFetch("/teams", { method: "POST", body: JSON.stringify({ name, unitIds, placement }) }); }
export async function updateTeam(teamId: string, name: string, unitIds: string[], placement: Array<{ x: number; y: number }>): Promise<{ team: Team }> { return apiFetch("/teams/" + teamId, { method: "PUT", body: JSON.stringify({ name, unitIds, placement }) }); }
export async function deleteTeam(teamId: string): Promise<void> { await apiFetch("/teams/" + teamId, { method: "DELETE" }); }
export async function enterQueue(teamId: string): Promise<{ message: string; position: number }> { return apiFetch("/matchmaking/queue", { method: "POST", body: JSON.stringify({ teamId }) }); }
export async function leaveQueue(): Promise<void> { await apiFetch("/matchmaking/queue", { method: "DELETE" }); }
export async function getQueueStatus(): Promise<{ inQueue: boolean; enteredAt?: string; elo?: number; searchRange?: number; waitSeconds?: number; }> { return apiFetch("/matchmaking/queue"); }
export interface MatchSummary { id: string; playerOneId: string; playerTwoId: string; status: string; activePlayerId: string; turnNumber: number; turnDeadline: string | null; winnerId: string | null; isMyTurn: boolean; createdAt: string; completedAt: string | null; }
export interface BoardPosition { x: number; y: number }
export interface ActiveStatusEffect { slug: string; turnsRemaining: number; stacks: number; shieldValue?: number; }
export interface UnitInstance { instanceId: string; definitionSlug: string; ownerPlayerId: string; position: BoardPosition; currentHealth: number; maxHealth: number; isAlive: boolean; hasMovedThisTurn: boolean; hasActedThisTurn: boolean; cooldowns: Record<string, number>; statusEffects: ActiveStatusEffect[]; movementRange?: number; abilities?: string[]; }
export interface MatchState { board: { width: number; height: number }; units: UnitInstance[]; turnNumber: number; activePlayerId: string; }
export interface MatchDetail extends MatchSummary { matchState: MatchState; eloDeltaP1: number | null; eloDeltaP2: number | null; }
export async function getMatches(): Promise<{ matches: MatchSummary[] }> { return apiFetch("/matches"); }
export async function getMatch(matchId: string): Promise<MatchDetail> { return apiFetch("/matches/" + matchId); }
export type TurnAction = | { type: "MOVE"; unitInstanceId: string; destination: BoardPosition } | { type: "USE_ABILITY"; unitInstanceId: string; abilitySlug: string; target: BoardPosition } | { type: "END_TURN" };
export interface TurnResult { events: Array<{ type: string; sourceUnitInstanceId?: string; targetUnitInstanceId?: string; value?: number; position?: BoardPosition; statusSlug?: string; message?: string }>; matchOver: boolean; winnerId: string | null; updatedState: MatchState; match: { id: string; status: string; activePlayerId: string; turnNumber: number }; }
export async function submitTurn(matchId: string, actions: TurnAction[]): Promise<TurnResult> { return apiFetch("/matches/" + matchId + "/turn", { method: "POST", body: JSON.stringify({ actions }) }); }
export async function forfeitMatch(matchId: string): Promise<void> { await apiFetch("/matches/" + matchId + "/forfeit", { method: "POST" }); }
export interface ChallengeResult { challengeId: string; opponentUsername: string; status: string; }
export async function issueChallenge(opponentUsername: string, teamId: string): Promise<ChallengeResult> { return apiFetch<ChallengeResult>("/challenges", { method: "POST", body: JSON.stringify({ opponentUsername, teamId }) }); }
export async function acceptChallenge(challengeId: string, teamId: string): Promise<{ matchId: string }> { return apiFetch("/challenges/" + challengeId + "/accept", { method: "POST", body: JSON.stringify({ teamId }) }); }
export async function declineChallenge(challengeId: string): Promise<void> { await apiFetch("/challenges/" + challengeId + "/decline", { method: "POST" }); }
export interface ChallengeItem { id: string; fromUserId: string; fromUsername: string; teamId: string; status: string; createdAt: string; expiresAt?: string; }
export interface SentChallengeItem { id: string; toUserId: string; toUsername: string; teamId: string; status: string; matchId: string | null; createdAt: string; }
export async function getChallenges(): Promise<{ challenges: ChallengeItem[]; sent: SentChallengeItem[] }> { return apiFetch("/challenges"); }

