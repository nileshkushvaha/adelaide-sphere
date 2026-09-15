import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { getRequestId } from '../common/request-id.js';
import { AuthService, RateLimitedException, type RequestContext } from './auth.service.js';
import { CurrentAdmin, CurrentSession, Public, SessionOnly, type AuthenticatedRequest } from './decorators.js';
import { AcceptedEnvelopeDto, AuthenticatedEnvelopeDto } from './dto/auth-responses.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AcceptSetupDto, ChangePasswordDto, LoginChallengeDto, ReauthenticateDto, RecoveryCodesDto, SessionListItemDto, TotpChallengeDto, TotpDisableDto, TotpEnrollmentDto, TotpVerifyDto } from './dto/account.dto.js';
import { AccountService } from './account.service.js';
import { SessionService, type SessionSummary } from './session.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';

function contextOf(req: AuthenticatedRequest): RequestContext {
  return { ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'], requestId: getRequestId(req) };
}

function toAuthenticated(admin: AdminPrincipal, session: SessionSummary) {
  return {
    data: {
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        roles: admin.roles,
        // The effective set the API enforces, and the two halves it is made of,
        // so the interface can show where a capability comes from (SRS RBAC 007).
        permissions: admin.permissions,
        inheritedPermissions: admin.inheritedPermissions,
        directPermissions: admin.directPermissions,
        totpEnabled: admin.totpEnabled,
      },
      session: { id: session.id, createdAt: session.createdAt.toISOString(), idleExpiresAt: session.idleExpiresAt.toISOString(), expiresAt: session.expiresAt.toISOString() },
    },
  };
}

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly account: AccountService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sign in with email and password; sets the session cookie' })
  @ApiOkResponse({ type: AuthenticatedEnvelopeDto })
  @ApiResponse({ status: 202, type: LoginChallengeDto, description: 'Password accepted; a second factor is required' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS (same for unknown, wrong password, disabled)' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED with Retry-After' })
  @ApiResponse({ status: 503, description: 'SERVICE_UNAVAILABLE when the rate limiter store is down' })
  async login(@Body() body: LoginDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const result = await this.auth.login(body.email, body.password, contextOf(req));
      if (result.kind === 'challenge') {
        const { challenge, expiresAt } = await this.account.createLoginChallenge(result.adminId, contextOf(req));
        res.status(202);
        return { data: { requires: 'totp' as const, challenge, expiresAt: expiresAt.toISOString() } };
      }
      this.sessions.setCookie(res, result.token);
      return toAuthenticated(result.admin, result.session);
    } catch (error) {
      if (error instanceof RateLimitedException) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
  }

  @SessionOnly()
  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Revoke the current session and clear the cookie' })
  async logout(@CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(admin, session, contextOf(req));
    this.sessions.clearCookie(res);
  }

  @SessionOnly()
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current administrator and session' })
  @ApiOkResponse({ type: AuthenticatedEnvelopeDto })
  me(@CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary) {
    return toAuthenticated(admin, session);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Request a password reset link (always accepted)' })
  @ApiResponse({ status: 202, type: AcceptedEnvelopeDto })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED with Retry-After' })
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    try {
      await this.auth.forgotPassword(body.email, contextOf(req));
    } catch (error) {
      if (error instanceof RateLimitedException) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
    return { data: { accepted: true } };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Set a new password with a reset token; revokes all sessions' })
  @ApiBadRequestResponse({ description: 'INVALID_RESET_TOKEN or VALIDATION_ERROR' })
  async resetPassword(@Body() body: ResetPasswordDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.auth.resetPassword(body.token, body.newPassword, contextOf(req));
  }

  @Public()
  @Post('totp/challenge')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Complete sign-in with an authenticator or recovery code' })
  @ApiOkResponse({ type: AuthenticatedEnvelopeDto })
  async totpChallenge(@Body() body: TotpChallengeDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const adminId = await this.account.completeLoginChallenge(body.challenge, body.code, contextOf(req));
    const result = await this.auth.issueSession(adminId, contextOf(req));
    this.sessions.setCookie(res, result.token);
    return toAuthenticated(result.admin, result.session);
  }

  @Public()
  @Post('accept-setup')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Activate an invited account by setting its password' })
  async acceptSetup(@Body() body: AcceptSetupDto, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.account.acceptSetup(body.token, body.password, contextOf(req));
  }

  @SessionOnly()
  @Post('change-password')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change own password; other sessions are revoked' })
  async changePassword(@Body() body: ChangePasswordDto, @CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.account.changePassword(admin, session, body.currentPassword, body.newPassword, contextOf(req));
  }

  @SessionOnly()
  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [SessionListItemDto] })
  async listSessions(@CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary) {
    return { data: await this.account.listOwnSessions(admin, session) };
  }

  @SessionOnly()
  @Delete('sessions/:id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async revokeSession(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.account.revokeOwnSession(admin, id, contextOf(req));
  }

  @SessionOnly()
  @Post('totp/enroll')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Start TOTP enrolment (recent authentication or current password required)' })
  @ApiOkResponse({ type: TotpEnrollmentDto })
  async totpEnroll(@Body() body: ReauthenticateDto, @CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary, @Req() req: AuthenticatedRequest) {
    return { data: await this.account.enrollTotp(admin, session, body.currentPassword, contextOf(req)) };
  }

  @SessionOnly()
  @Post('totp/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Confirm enrolment with a code; returns recovery codes once' })
  @ApiOkResponse({ type: RecoveryCodesDto })
  async totpVerify(@Body() body: TotpVerifyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: AuthenticatedRequest) {
    return { data: await this.account.verifyTotpEnrollment(admin, body.code, contextOf(req)) };
  }

  @SessionOnly()
  @Post('totp/disable')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Disable TOTP (recent authentication + a valid code)' })
  async totpDisable(@Body() body: TotpDisableDto, @CurrentAdmin() admin: AdminPrincipal, @CurrentSession() session: SessionSummary, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.account.disableTotp(admin, session, body.currentPassword, body.code, contextOf(req));
  }
}
