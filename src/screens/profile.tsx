/** Profile: language, notifications, consent, Face ID / fingerprint unlock, two-step login,
 * devices, security alerts, data export, privacy, log out and account deletion. */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import type { DeviceSession, SecurityEvent } from '../core/models';
import { LANGUAGES, language, t } from '../i18n';
import { useApp } from '../services/app';
import { authenticate, biometricsAvailable, cancelReminder, shareText } from '../services/native';
import { Btn, C, Card, Chips, ErrorText, Field, Note, Page, Section, SwitchRow, Txt } from '../ui/components';
import { fmtDate } from './kits';

function confirmAsync(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: t('action_cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export function ProfileScreen() {
  const app = useApp();
  const st = app.auth.state;
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [canBio, setCanBio] = useState(false);
  const [setupCode, setSetupCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDevices(await app.auth.activeSessions());
    setEvents(await app.auth.securityEvents());
  }, [app]);

  useEffect(() => {
    load();
    biometricsAvailable().then(setCanBio);
  }, [load]);

  if (st.kind !== 'loggedIn') return <Page title={t('title_profile')}>{null}</Page>;

  async function toggleBiometric(on: boolean) {
    // Confirm it's really the owner before turning it on.
    app.auth.setBiometricEnabled(on ? await authenticate(t('biometric_enable_subtitle')) : false);
    app.emit();
  }

  async function toggleTwoStep(on: boolean) {
    if (on) setSetupCode(await app.auth.startTwoStepSetup());
    else {
      await app.auth.disableTwoStep();
      await load();
    }
  }

  async function confirmTwoStep() {
    if (await app.auth.confirmTwoStepSetup(code)) {
      setSetupCode(null);
      setCode('');
      setError(null);
      await load();
    } else setError(t('err_code_invalid'));
  }

  async function exportData() {
    // DPDP Act: right to access. A plain-text copy of the user's data.
    const plants = app.garden.plants();
    const lines = [
      'Sunday Farms data export', `Username: ${app.auth.username}`, `Plants: ${plants.length}`,
      ...plants.map((p) => ` - ${p.nickname} (${p.crop}), sown ${fmtDate(p.sownAt)}`),
      `Rentals: ${app.kits.rentals.length}`, ...app.kits.rentals.map((r) => ` - ${r.id}: ${r.kit.name}, ${t(r.status)}`),
      `Reward points: ${app.kits.pointsBalance}`,
    ];
    await shareText(lines.join('\n'));
  }

  async function logoutEverywhere() {
    if (await confirmAsync(t('action_logout_everywhere'), t('logout_all_body'), t('action_logout'))) await app.auth.logoutEverywhere();
  }

  async function deleteAccount() {
    if (await confirmAsync(t('delete_title'), t('delete_body', app.auth.username ?? ''), t('action_delete_account'))) {
      for (const p of app.garden.plants()) await cancelReminder(p.reminderId);
      app.garden.deleteAll();
      await app.auth.deleteAccount();
    }
  }

  if (setupCode) {
    return (
      <Page title={t('two_step_setup_title')}>
        <Txt>{t('two_step_setup_body')}</Txt>
        <Note>{t('demo_code', setupCode)}</Note>
        <Field label={t('field_code')} value={code} onChangeText={setCode} keyboard="number-pad" autoComplete="one-time-code" maxLength={6} />
        {error && <ErrorText>{error}</ErrorText>}
        <Btn primary title={t('action_verify')} onPress={confirmTwoStep} disabled={code.length !== 6} />
        <Btn title={t('action_cancel')} onPress={() => setSetupCode(null)} />
      </Page>
    );
  }

  return (
    <Page title={t('title_profile')}>
      <Card bg={C.leafLight}>
        <Txt size={20} bold>@{st.username}</Txt>
        <Txt>{t(st.role === 'TEACHER' ? 'role_teacher' : 'role_grower')}</Txt>
      </Card>

      <Section>{t('profile_preferences')}</Section>
      <Card>
        <Txt bold>🌐 {t('profile_language')}</Txt>
        <Chips options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} value={language()} onChange={(c) => app.setLanguage(c)} />
        <SwitchRow label={'🔔 ' + t('profile_notifications')} value={app.settings.get('notifications_on', true)} onChange={(on) => { app.settings.set('notifications_on', on); app.emit(); }} />
        <SwitchRow label={'📊 ' + t('consent_analytics')} value={app.settings.get('analytics_consent', false)} onChange={(on) => { app.settings.set('analytics_consent', on); app.emit(); }} />
      </Card>

      <Section>{t('profile_security')}</Section>
      <Card>
        <SwitchRow label={'🔐 ' + t('profile_biometric')} value={app.auth.biometricEnabled} onChange={toggleBiometric} disabled={!canBio} />
        {!canBio && <Note>{t('profile_biometric_unavailable')}</Note>}
        <SwitchRow label={'🔑 ' + t('profile_two_step')} value={st.twoStep} onChange={toggleTwoStep} />
        <Note>{t('profile_two_step_note')}</Note>
      </Card>

      <Section>{t('profile_devices')}</Section>
      {devices.map((d) => (
        <Card key={d.id}>
          <Txt bold>{'📱 ' + d.deviceName + (d.isThisDevice ? ' ' + t('profile_this_device') : '')}</Txt>
          <Note>{t('profile_last_active', fmtDate(d.lastActive))}</Note>
        </Card>
      ))}
      <Btn title={t('action_logout_everywhere')} onPress={logoutEverywhere} />

      <Section>{t('profile_alerts')}</Section>
      {events.length === 0 && <Note>{t('profile_no_alerts')}</Note>}
      {events.map((e, i) => (
        <Card key={i}>
          <Txt size={14}>{e.message}</Txt>
          <Note>{new Date(e.at).toLocaleString('en-IN')}</Note>
        </Card>
      ))}

      <Section>{t('profile_your_data')}</Section>
      <Card bg={C.surfaceVariant}>
        <Btn small title={'⬇ ' + t('action_download_data')} onPress={exportData} />
        <Btn small title={'🛡 ' + t('action_privacy')} onPress={() => Alert.alert(t('action_privacy'), t('privacy_summary'))} />
        <Btn small danger title={'🗑 ' + t('action_delete_account')} onPress={deleteAccount} />
      </Card>
      <Btn title={t('action_logout')} onPress={() => app.auth.logout()} />
    </Page>
  );
}
