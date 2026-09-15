import { Global, Module } from '@nestjs/common';
import { CaptchaPort } from './captcha.port.js';
import { TurnstileVerifier } from './turnstile.verifier.js';

/** Turnstile is the only implementation; tests replace the port (SRS MOD 002). */
@Global()
@Module({ providers: [{ provide: CaptchaPort, useClass: TurnstileVerifier }], exports: [CaptchaPort] })
export class CaptchaModule {}
