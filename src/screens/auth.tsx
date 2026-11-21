/** Onboarding, login (with two-step code), sign-up, password reset and Face ID / fingerprint unlock. */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { DEMO_GROWER, DEMO_GROWER_PASSWORD, DEMO_TEACHER, DEMO_TEACHER_PASSWORD } from '../core/authServer';
import * as v from '../core/validator';
import { LANGUAGES, language, t } from '../i18n';
import { useApp } from '../services/app';
import { authenticate, biometricsAvailable } from '../services/native';
import { Btn, C, Card, Chips, ErrorText, Field, Heading, Note, Page, Spacer, StrengthMeter, SwitchRow, Txt } from '../ui/components';

function LanguageChips() {
  const app = useApp();
  return <Chips options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} value={language()} onChange={(c) => app.setLanguage(c)} />;
}

// ====================================================================== onboarding

const SLIDES = [
  { icon: '🔍', title: 'onb1_title', body: 'onb1_body' },
  { icon: '🪴', title: 'onb2_title', body: 'onb2_body' },
  { icon: '♻️', title: 'onb3_title', body: 'onb3_body' },
];

export function OnboardingScreen() {
  const app = useApp();
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;
  const done = () => {
    app.settings.set('onboarding_done', true);
    app.refreshRoot();
  };
  const slide = SLIDES[page];
  return (
    <Page title={t('app_name')}>
      <LanguageChips />
      <Spacer h={30} />
      <Txt size={80} center>{slide.icon}</Txt>
      <Txt size={26} bold center>{t(slide.title)}</Txt>
      <Txt size={16} center color={C.muted}>{t(slide.body)}</Txt>
      <Spacer h={20} />
      <Txt size={18} center color={C.leaf}>{SLIDES.map((_, i) => (i === page ? '●' : '○')).join('  ')}</Txt>
      <Spacer />
      <Btn primary title={t(last ? 'action_get_started' : 'action_next')} onPress={() => (last ? done() : setPage(page + 1))} />
      {!last && <Btn title={t('action_skip')} onPress={done} />}
    </Page>
  );
}

// ====================================================================== login

export function LoginScreen() {
  const app = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captcha, setCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; demoCode: string } | null>(null);
  const [code, setCode] = useState('');

  async function login() {
    if (!username.trim() || !password || loading) return;
    if (captchaRequired && !captcha) return setError(t('err_captcha'));
    setLoading(true);
    setError(null);
    const o = await app.auth.login(username, password, captcha);
    // The password is cleared from memory as soon as it has been sent.
    setPassword('');
    setCaptcha(false);
    setLoading(false);
    if (o.kind === 'success') return; // the app switches to the main screens
    if (o.kind === 'twoStep') setChallenge({ id: o.challengeId, demoCode: o.demoCode });
    else if (o.kind === 'invalid') {
      setError(t('err_login_generic'));
      setCaptchaRequired(o.captchaRequired);
    } else if (o.kind === 'locked') setError(t('err_locked', o.minutesLeft));
    else {
      setError(t('err_captcha'));
      setCaptchaRequired(true);
    }
  }

  /** One tap: signs in with a demo account (the teacher account then asks for its two-step code). */
  async function quickLogin(user: string, pass: string) {
    if (loading) return;
    setUsername(user);
    setLoading(true);
    setError(null);
    const o = await app.auth.login(user, pass, true);
    setLoading(false);
    if (o.kind === 'twoStep') setChallenge({ id: o.challengeId, demoCode: o.demoCode });
    else if (o.kind !== 'success') setError(t('err_login_generic'));
  }

  async function verify() {
    if (!challenge || code.trim().length !== 6 || loading) return;
    setLoading(true);
    const o = await app.auth.verifyLoginCode(challenge.id, code.trim());
    setLoading(false);
    setCode('');
    if (o.kind !== 'success') setError(t('err_code_invalid'));
  }

  if (challenge) {
    return (
      <Page title={t('two_step_title')}>
        <Txt size={48}>🔒</Txt>
        <Txt>{t('two_step_body')}</Txt>
        <Field label={t('field_code')} value={code} onChangeText={setCode} keyboard="number-pad" autoComplete="one-time-code" maxLength={6} />
        <Note>{t('demo_code', challenge.demoCode)}</Note>
        <Btn small title={t('demo_fill_code')} onPress={() => setCode(challenge.demoCode)} />
        {error && <ErrorText>{error}</ErrorText>}
        <Btn primary title={t('action_verify')} onPress={verify} loading={loading} disabled={code.length !== 6} />
        <Btn title={t('action_cancel')} onPress={() => { setChallenge(null); setError(null); }} />
      </Page>
    );
  }

  return (
    <Page title={t('login_title')}>
      <LanguageChips />
      <Txt size={56}>🌱</Txt>
      <Heading>{t('login_title')}</Heading>
      <Txt color={C.muted}>{t('login_subtitle')}</Txt>
      <Field label={t('field_username')} value={username} onChangeText={setUsername} autoComplete="username" maxLength={30} />
      <Field label={t('field_password')} value={password} onChangeText={setPassword} secure={!show} autoComplete="password" maxLength={128} />
      <Btn small title={t(show ? 'cd_hide_password' : 'cd_show_password')} onPress={() => setShow(!show)} />
      {captchaRequired && (
        <Card bg={C.orangeLight}>
          {/* Placeholder for a real CAPTCHA (e.g. reCAPTCHA Enterprise), checked by the server. */}
          <SwitchRow label={t('captcha_label')} value={captcha} onChange={setCaptcha} />
          <Note>{t('captcha_note')}</Note>
        </Card>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_login')} onPress={login} loading={loading} disabled={!username.trim() || !password} />
      <Btn title={t('action_forgot_password')} onPress={() => app.push('Forgot')} />
      <Btn title={t('action_create_account')} onPress={() => app.push('SignUp')} />
      <Spacer />
      <Card bg={C.surfaceVariant}>
        <Txt bold>{t('demo_accounts_title')}</Txt>
        <Btn primary title={'🌱 ' + t('demo_try_grower')} onPress={() => quickLogin(DEMO_GROWER, DEMO_GROWER_PASSWORD)} disabled={loading} />
        <Btn title={'🏫 ' + t('demo_try_teacher')} onPress={() => quickLogin(DEMO_TEACHER, DEMO_TEACHER_PASSWORD)} disabled={loading} />
        <Note>{t('demo_account_line', DEMO_GROWER, DEMO_GROWER_PASSWORD)}</Note>
        <Note>{t('demo_account_teacher_line', DEMO_TEACHER, DEMO_TEACHER_PASSWORD)}</Note>
      </Card>
    </Page>
  );
}

// ====================================================================== sign up

type Availability = 'unknown' | 'checking' | 'available' | 'taken';

export function SignUpScreen() {
  const app = useApp();
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>('unknown');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef('');

  // Live availability check, debounced until typing stops.
  useEffect(() => {
    latest.current = username;
    setAvailability('unknown');
    if (!username || v.validateUsername(username)) return;
    const timer = setTimeout(async () => {
      setAvailability('checking');
      const free = await app.auth.isUsernameAvailable(username);
      if (latest.current === username) setAvailability(free ? 'available' : 'taken');
    }, 450);
    return () => clearTimeout(timer);
  }, [username, app]);

  const usernameError = username ? v.validateUsername(username) : null;
  const issues = v.validatePassword(password, username);
  const canSubmit = !usernameError && availability === 'available' && !issues.length && confirm === password && v.isContactValid(contact) && consent && !loading;
  const hint = usernameError ? '✕ ' + t(usernameError)
    : availability === 'checking' ? t('username_checking')
      : availability === 'taken' ? '✕ ' + t('err_username_taken')
        : availability === 'available' ? '✓ ' + t('username_available') : t('username_rules');

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    app.settings.set('analytics_consent', analytics);
    const o = await app.auth.signUp(username, password, contact);
    setLoading(false);
    setPassword('');
    setConfirm('');
    if (o.kind === 'success') return;
    if (o.kind === 'taken') {
      setAvailability('taken');
      setError(t('err_username_taken'));
    } else if (o.kind === 'rejected') setError(t(o.issues[0]));
    else setError(t('err_username_chars'));
  }

  return (
    <Page title={t('signup_title')}>
      <Field label={t('field_username')} value={username} onChangeText={setUsername} autoComplete="username" hint={hint}
        error={!!usernameError || availability === 'taken'} maxLength={25} />
      <Field label={t('field_contact')} value={contact} onChangeText={setContact} keyboard="email-address" autoComplete="email" hint={t('contact_help')} maxLength={80} />
      <Field label={t('field_password')} value={password} onChangeText={setPassword} secure={!show} autoComplete="new-password"
        hint={t('password_rules', v.PASSWORD_MIN, v.PASSWORD_RECOMMENDED)} maxLength={128} />
      {password ? (
        <View>
          <StrengthMeter score={v.strength(password, username)} />
          {issues.map((i) => <Note key={i}>• {t(i)}</Note>)}
        </View>
      ) : null}
      <Field label={t('field_confirm_password')} value={confirm} onChangeText={setConfirm} secure={!show} autoComplete="new-password"
        error={!!confirm && confirm !== password} hint={confirm && confirm !== password ? t('err_password_mismatch') : undefined} maxLength={128} />
      <Btn small title={t(show ? 'cd_hide_password' : 'cd_show_password')} onPress={() => setShow(!show)} />
      <Card bg={C.surfaceVariant}>
        <Txt bold>{t('consent_title')}</Txt>
        <Note>{t('consent_body')}</Note>
        <SwitchRow label={t('consent_required')} value={consent} onChange={setConsent} />
        <SwitchRow label={t('consent_analytics')} value={analytics} onChange={setAnalytics} />
      </Card>
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_create_account')} onPress={submit} disabled={!canSubmit} loading={loading} />
    </Page>
  );
}

// ====================================================================== forgot password

export function ForgotScreen() {
  const app = useApp();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function request() {
    if (!username.trim()) return;
    setDemoCode(await app.auth.requestPasswordReset(username));
    setStep(2); // same message whether or not the account exists
  }

  async function confirm() {
    const o = await app.auth.confirmPasswordReset(username, code, password);
    setPassword('');
    if (o.kind === 'success') setDone(true);
    else setError(o.kind === 'rejected' ? t(o.issues[0]) : t('err_code_invalid'));
  }

  return (
    <Page title={t('reset_title')}>
      {done ? (
        <>
          <Txt>{t('reset_done')}</Txt>
          <Btn primary title={t('action_login')} onPress={() => app.back()} />
        </>
      ) : step === 1 ? (
        <>
          <Txt>{t('reset_step1')}</Txt>
          <Field label={t('field_username')} value={username} onChangeText={setUsername} autoComplete="username" />
          <Btn primary title={t('action_send_code')} onPress={request} disabled={!username.trim()} />
        </>
      ) : (
        <>
          <Txt>{t('reset_code_sent')}</Txt>
          {demoCode && <Note>{t('demo_code', demoCode)}</Note>}
          <Field label={t('field_code')} value={code} onChangeText={setCode} keyboard="number-pad" autoComplete="one-time-code" maxLength={6} />
          <Field label={t('field_new_password')} value={password} onChangeText={setPassword} secure autoComplete="new-password" />
          {password ? <StrengthMeter score={v.strength(password, username)} /> : null}
          {error && <ErrorText>{error}</ErrorText>}
          <Btn primary title={t('action_reset_password')} onPress={confirm} disabled={code.length !== 6 || !password} />
        </>
      )}
    </Page>
  );
}

// ====================================================================== Face ID / fingerprint unlock

export function UnlockScreen() {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const name = app.auth.state.kind === 'needsUnlock' ? app.auth.state.username : '';

  async function unlock() {
    if (await authenticate(t('unlock_prompt_subtitle'))) app.auth.unlock();
    else if (!(await biometricsAvailable())) setError(t('biometric_unavailable_short'));
  }

  useEffect(() => {
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page title={t('app_name')}>
      <Spacer h={40} />
      <Txt size={64} center>🔐</Txt>
      <Txt size={22} bold center>{t('unlock_welcome', name)}</Txt>
      {error && <ErrorText>{error}</ErrorText>}
      <Spacer />
      <Btn primary title={t('unlock_action')} onPress={unlock} />
      <Btn title={t('unlock_use_password')} onPress={() => app.auth.logoutLocal()} />
    </Page>
  );
}
