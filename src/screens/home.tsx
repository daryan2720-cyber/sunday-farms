/** Home, the Journey Scanner (live camera QR scanning) and the food-journey timeline. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { FieldStatus, TraceResult, WeatherTip } from '../core/models';
import { weatherTip } from '../core/others';
import * as trace from '../core/trace';
import { t } from '../i18n';
import { useApp } from '../services/app';
import { Btn, C, Card, Chips, Emoji, ErrorText, Field, Heading, Note, Page, Row, Section, Spacer, StatusBadge, Txt } from '../ui/components';

// ====================================================================== home

export function HomeScreen() {
  const app = useApp();
  const [tip, setTip] = useState<WeatherTip | null>(null);
  const city = app.settings.get('weather_city', 'Delhi');

  useEffect(() => {
    let alive = true;
    weatherTip(city).then((w) => alive && setTip(w));
    return () => { alive = false; };
  }, [city]);

  const due = app.garden.duePlants();
  const impact = app.kits.ecoImpact(app.garden.totals().harvestG / 1000);

  return (
    <Page title={t('app_name')} actions={[
      { label: '💬', onPress: () => app.push('Community'), accessibilityLabel: t('title_community') },
      { label: '👤', onPress: () => app.push('Profile'), accessibilityLabel: t('title_profile') },
    ]}>
      <Heading>{t('home_greeting', app.auth.username ?? '')}</Heading>
      <Txt color={C.muted}>{t('home_tagline')}</Txt>

      {tip && (
        <Card bg={tip.isWarning ? C.orangeLight : C.leafLight} onPress={() => app.push('Weather')} accessibilityLabel={t('title_weather')}>
          <Txt bold>{(tip.isWarning ? '⚠️ ' : '☀️ ') + t('weather_heading', tip.city, tip.condition, tip.tempC)}</Txt>
          <Txt>{tip.tip}</Txt>
        </Card>
      )}

      <Section>{t('home_reminders')}</Section>
      {due.length === 0 ? (
        <Card onPress={() => app.switchTab('garden')}><Txt>{t('home_no_reminders')}</Txt></Card>
      ) : due.map((p) => (
        <Card key={p.id}>
          <Row>
            <Txt style={{ flex: 1 }}>💧 {t('home_water_plant', p.nickname)}</Txt>
            <Btn small title={t('action_watered')} onPress={() => { app.garden.markWatered(p.id); app.emit(); }} />
          </Row>
        </Card>
      ))}

      <Section>{t('home_fresh_friends')}</Section>
      {trace.PRODUCE.filter((p) => p.id !== 'spinach').map((p) => (
        <Card key={p.id}>
          <Row>
            <Emoji>{p.emoji}</Emoji>
            <View style={{ flex: 1 }}>
              <Txt bold>{p.name}</Txt>
              <Note>{p.funFact}</Note>
            </View>
          </Row>
        </Card>
      ))}

      <Section>{t('home_how_it_works')}</Section>
      <Row>
        <Btn flex small title={'📷 ' + t('how_scan')} onPress={() => app.switchTab('scan')} />
        <Btn flex small title={'📦 ' + t('how_rent')} onPress={() => app.switchTab('kits')} />
        <Btn flex small title={'🥗 ' + t('how_grow')} onPress={() => app.switchTab('garden')} />
      </Row>
      <Spacer />
      <Card bg={C.leafLight} onPress={() => app.push('Rewards')} accessibilityLabel={t('title_rewards')}>
        <Txt bold>🌍 {t('eco_title')}</Txt>
        <Txt>{t('eco_summary', impact.plasticSavedG, impact.foodMilesSavedKm, impact.kitsReused)}</Txt>
      </Card>
    </Page>
  );
}

// ====================================================================== scan

export function ScanScreen() {
  const app = useApp();
  const produce = trace.PRODUCE.filter((p) => p.id !== 'broccoli');
  const [selected, setSelected] = useState(produce[0].id);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [code, setCode] = useState('');
  const scanned = useRef(false);

  const open = (payload: string) => {
    setCameraOn(false);
    app.push('Journey', { payload });
  };

  async function startCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    scanned.current = false;
    setCameraOn(true);
  }

  return (
    <Page title={t('title_scan')}>
      <Txt>{t('scan_intro')}</Txt>
      <Section>{t('scan_step_choose')}</Section>
      <Chips options={produce.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))} value={selected} onChange={setSelected} />
      <Section>{t('scan_step_scan')}</Section>
      {cameraOn ? (
        <View>
          <View style={{ height: 300, borderRadius: 16, overflow: 'hidden', borderWidth: 3, borderColor: C.leaf }}>
            {/* QR codes are read on the phone. No image is saved or uploaded. */}
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(result: { data: string }) => {
                if (scanned.current || !result.data) return;
                scanned.current = true;
                open(result.data);
              }}
            />
          </View>
          <Note>{t('scan_point_camera')}</Note>
          <Btn title={t('action_cancel')} onPress={() => setCameraOn(false)} />
        </View>
      ) : (
        <Card>
          <Txt>📷 {t('scan_camera_why')}</Txt>
          <Btn primary title={t('action_open_camera')} onPress={startCamera} />
          {permission && !permission.granted && !permission.canAskAgain && <ErrorText>{t('camera_unavailable')}</ErrorText>}
        </Card>
      )}
      <Note>{t('scan_enter_code')}</Note>
      <Field label={t('field_label_code')} value={code} onChangeText={setCode} />
      <Btn title={t('action_check_code')} onPress={() => code.trim() && open(code.trim())} disabled={!code.trim()} />
      <Section>{t('scan_demo_title')}</Section>
      <Note>{t('scan_demo_note')}</Note>
      <Row>
        <Btn flex title={t('scan_demo_real')} onPress={() => open(trace.demoLabelFor(selected)!)} />
        <Btn flex title={t('scan_demo_fake')} onPress={() => open(trace.demoFakeLabel())} />
      </Row>
    </Page>
  );
}

// ====================================================================== journey

export function JourneyScreen(props: { params: { payload: string } }) {
  const [result, setResult] = useState<TraceResult | null>(null);

  useEffect(() => {
    let alive = true;
    trace.lookup(props.params.payload).then((r) => alive && setResult(r));
    return () => { alive = false; };
  }, [props.params.payload]);

  if (!result) {
    return <Page title={t('title_journey')}><ActivityIndicator color={C.leaf} size="large" /></Page>;
  }
  if (result.kind === 'invalid') {
    return (
      <Page title={t('title_journey')}>
        <Card bg={C.errorLight}>
          <Txt bold>⛔ {t('journey_invalid_title')}</Txt>
          <Txt>{t('journey_invalid_body')}</Txt>
          {result.claimedBatchId && <Note>{t('journey_claimed_batch', result.claimedBatchId)}</Note>}
          <StatusBadge status="status_unverified" />
        </Card>
      </Page>
    );
  }
  if (result.kind === 'notFound') {
    return <Page title={t('title_journey')}><Card><Txt>{t('journey_not_found')}</Txt></Card></Page>;
  }

  const j = result.journey;
  const fields = j.stages.flatMap((st) => st.fields);
  const count = (s: FieldStatus) => fields.filter((f) => f.status === s).length;
  const stageIcon: Record<string, string> = { stage_farm: '🌱', stage_journey: '🚚', stage_store: '🏪', stage_plate: '🍽️' };

  return (
    <Page title={t('title_journey')}>
      <Row>
        <Emoji size={48}>{j.emoji}</Emoji>
        <View style={{ flex: 1 }}>
          <Heading>{j.produceName}</Heading>
          <Note>{t('journey_batch', j.batchId)}</Note>
        </View>
      </Row>
      <Card bg={C.leafLight}>
        <Txt bold>✅ {t('journey_label_genuine')}</Txt>
        <Txt>{t('journey_counts', count('status_available'), count('status_unverified'), count('status_missing'))}</Txt>
      </Card>
      <Card>
        <Txt bold>{t('journey_legend_title')}</Txt>
        {(['status_available', 'status_unverified', 'status_missing'] as FieldStatus[]).map((st, i) => (
          <Row key={st} style={{ marginVertical: 3 }}>
            <StatusBadge status={st} />
            <Note>{t(['legend_available', 'legend_unverified', 'legend_missing'][i])}</Note>
          </Row>
        ))}
      </Card>
      {j.stages.map((stage, n) => (
        <Card key={stage.type}>
          <Txt size={17} bold>{`${n + 1}.  ${stageIcon[stage.type]}  ${t(stage.type)}`}</Txt>
          {stage.fields.map((f) => (
            <Row key={f.label} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 6, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Note>{f.label}</Note>
                <Txt>{f.value ?? t('journey_not_available')}</Txt>
                {f.verifiedBy && <Note>{t('journey_verified_by', f.verifiedBy, f.verifiedOn ?? '')}</Note>}
              </View>
              <StatusBadge status={f.status} />
            </Row>
          ))}
        </Card>
      ))}
      <Note>{t('journey_promise')}</Note>
    </Page>
  );
}
