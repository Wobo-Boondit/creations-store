import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.PLATFORM_SIGNING_SECRET!
const TOKEN_PREFIX = 'ctk'
const ACCESS_TTL = 30 * 24 * 60 * 60 // 30 days in seconds
const REFRESH_TTL = 90 * 24 * 60 * 60 // 90 days

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url')
}

function fromB64url(str: string): string {
  return Buffer.from(str, 'base64url').toString()
}

function hmac(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('base64url')
}

function sign(payload: string): string {
  const sig = hmac(payload)
  return `${payload}.${sig}`
}

function verifyAndParse<T>(token: string, expectedPrefix: string): T | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  const payload = parts.slice(0, -1).join('.')
  const sig = parts[parts.length - 1]
  const expectedSig = hmac(payload)

  // constant-time comparison
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length) return null
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const decoded = JSON.parse(fromB64url(payload))
    if (decoded.type !== expectedPrefix) return null
    if (decoded.exp && Date.now() / 1000 > decoded.exp) return null
    return decoded as T
  } catch {
    return null
  }
}

interface CreationTokenPayload {
  type: 'access'
  clientId: string
  deviceId: string
  userId: string
  iat: number
  exp: number
}

interface RefreshTokenPayload {
  type: 'refresh'
  clientId: string
  deviceId: string
  userId: string
  iat: number
  exp: number
}

export interface VerifiedCreation {
  clientId: string
  deviceId: string
  userId: string
}

/**
 * Sign a creation access token.
 * Format: ctk.{base64url(payload)}.{hmac}
 */
export function signCreationToken(
  clientId: string,
  deviceId: string,
  userId: string
): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000)
  const payload: CreationTokenPayload = {
    type: 'access',
    clientId,
    deviceId,
    userId,
    iat: now,
    exp: now + ACCESS_TTL,
  }
  const encoded = b64url(JSON.stringify(payload))
  return {
    token: `${TOKEN_PREFIX}.${sign(encoded)}`,
    expiresIn: ACCESS_TTL,
  }
}

/**
 * Verify a creation access token.
 * Returns the decoded payload if valid, null if invalid/expired.
 */
export function verifyCreationToken(token: string): VerifiedCreation | null {
  if (!token.startsWith('ctk.')) return null
  const stripped = token.slice(4) // remove "ctk."
  const decoded = verifyAndParse<CreationTokenPayload>(stripped, 'access')
  if (!decoded) return null
  return {
    clientId: decoded.clientId,
    deviceId: decoded.deviceId,
    userId: decoded.userId,
  }
}

/**
 * Sign a refresh token (90-day TTL).
 */
export function signRefreshToken(
  clientId: string,
  deviceId: string,
  userId: string
): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000)
  const payload: RefreshTokenPayload = {
    type: 'refresh',
    clientId,
    deviceId,
    userId,
    iat: now,
    exp: now + REFRESH_TTL,
  }
  const encoded = b64url(JSON.stringify(payload))
  return {
    token: `rtk.${sign(encoded)}`,
    expiresIn: REFRESH_TTL,
  }
}

/**
 * Verify a refresh token and issue new access + refresh tokens.
 */
export function refreshCreationTokens(
  refreshToken: string
): { accessToken: string; refreshToken: string; expiresIn: number } | null {
  if (!refreshToken.startsWith('rtk.')) return null
  const stripped = refreshToken.slice(4)
  const decoded = verifyAndParse<RefreshTokenPayload>(stripped, 'refresh')
  if (!decoded) return null

  const access = signCreationToken(decoded.clientId, decoded.deviceId, decoded.userId)
  const refresh = signRefreshToken(decoded.clientId, decoded.deviceId, decoded.userId)
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
  }
}
