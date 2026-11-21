/** My Garden, plant detail with grow journal, plant health check, moisture sensor, guides and weather. */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, View } from 'react-native';

import { emojiFor, MARKET_PRICE_PER_KG } from '../core/garden';
import { inr } from '../core/kits';
import type { FoundSensor, HealthResult, WeatherTip } from '../core/models';
import { analyzeLeaf, CITIES, DEMO_PAIRING_CODE, moistureAdviceKey, weatherTip } from '../core/others';
import { t } from '../i18n';
import { useApp } from '../services/app';
import { cancelReminder, scheduleReminder, takePhoto } from '../services/native';
import { Btn, C, Card, Chips, Emoji, ErrorText, Field, Note, Page, Row, Section, Spacer, Txt } from '../ui/components';
import { fmtDate } from './kits';

// ====================================================================== garden list

export function GardenScreen() {
  const app = useApp();
  const g = app.garden;
  const totals = g.totals();
  const plants = g.plants();
  return (
    <Page title={t('title_garden')} actions={[
      { label: '☀️', onPress: () => app.push('Weather'), accessibilityLabel: t('title_weather') },
      { label: '📖', onPress: () => app.push('Guides'), accessibilityLabel: t('title_guides') },
    ]}>
      <Card bg={C.leafLight}>
        <Txt bold>🧺 {t('garden_totals_title')}</Txt>
        <Txt>{t('garden_totals', totals.harvestG / 1000, inr(totals.savedInr))}</Txt>
        <Note>{t('garden_savings_note')}</Note>
      </Card>
      <Btn primary title={'＋ ' + t('action_add_plant')} onPress={() => app.push('AddPlant')} />
      <Spacer />
      {plants.length === 0 && <Txt color={C.muted}>🪴  {t('garden_empty')}</Txt>}
      {plants.map((p) => {
        const days = g.daysUntilWater(p);
        return (
          <Card key={p.id} onPress={() => app.push('PlantDetail', { plantId: p.id })} accessibilityLabel={p.nickname}>
            <Row>
              <Emoji size={36}>{emojiFor(p.crop)}</Emoji>
              <View style={{ flex: 1 }}>
                <Txt size={17} bold>{p.nickname}</Txt>
                <Note>{t('plant_age', p.crop, g.ageDays(p))}</Note>
                <Txt size={13} color={days === 0 ? C.orange : C.muted}>{days === 0 ? t('plant_water_today') : t('plant_water_in', days)}</Txt>
              </View>
              {days === 0 && <Btn small title={'💧 ' + t('action_watered')} onPress={() => { g.markWatered(p.id); app.emit(); }} />}
            </Row>
          </Card>
        );
      })}
    </Page>
  );
}

export function AddPlantScreen() {
  const app = useApp();
  const crops = Object.keys(MARKET_PRICE_PER_KG);
  const [crop, setCrop] = useState(crops[0]);
  const [name, setName] = useState('');
  const [days, setDays] = useState(2);

  async function save() {
    const id = app.garden.addPlant(crop, name, days);
    const plant = app.garden.plant(id)!;
    app.back();
    const reminderId = await scheduleReminder(t('notif_water_title', plant.nickname), t('notif_water_body'), days);
    app.garden.setReminderId(id, reminderId);
    app.emit();
  }

  return (
    <Page title={t('action_add_plant')}>
      <Chips options={crops.map((c) => ({ value: c, label: `${emojiFor(c)} ${c}` }))} value={crop} onChange={setCrop} />
      <Field label={t('field_plant_name')} value={name} onChangeText={setName} maxLength={24} />
      <Txt bold>{t('plant_water_every', days)}</Txt>
      <Row>
        <Btn flex title="−" onPress={() => setDays(Math.max(1, days - 1))} />
        <Btn flex title="+" onPress={() => setDays(Math.min(14, days + 1))} />
      </Row>
      <Btn primary title={t('action_add')} onPress={save} />
    </Page>
  );
}

// ====================================================================== plant detail + journal

export function PlantDetailScreen(props: { params: { plantId: number } }) {
  const app = useApp();
  const g = app.garden;
  const p = g.plant(props.params.plantId);
  if (!p) return <Page title=""><Txt>{t('not_found')}</Txt></Page>;
  const last = g.readings(p.id, 1)[0];
  const entries = g.journal(p.id);

  const remove = () =>
    Alert.alert(t('plant_delete_title'), t('plant_delete_body'), [
      { text: t('action_cancel'), style: 'cancel' },
      { text: t('action_delete'), style: 'destructive', onPress: () => { cancelReminder(p.reminderId); g.deletePlant(p.id); app.back(); } },
    ]);

  return (
    <Page title={p.nickname} actions={[{ label: '🗑', onPress: remove, accessibilityLabel: t('action_delete') }]}>
      <Row>
        <Emoji size={48}>{emojiFor(p.crop)}</Emoji>
        <View style={{ flex: 1 }}>
          <Txt size={20} bold>{p.crop}</Txt>
          <Note>{t('plant_sown_on', fmtDate(p.sownAt))}</Note>
          {last && <Note>{t('plant_last_moisture', last.moisturePct)}</Note>}
        </View>
      </Row>
      <Row>
        <Btn flex small title={'🩺 ' + t('action_health_check')} onPress={() => app.push('HealthCheck')} />
        <Btn flex small title={'📶 ' + t(p.sensorId ? 'action_view_sensor' : 'action_pair_sensor')} onPress={() => app.push('Sensor', { plantId: p.id })} />
      </Row>
      <Btn primary title={'＋ ' + t('action_add_entry')} onPress={() => app.push('JournalEntry', { plantId: p.id })} />
      <Section>{t('journal_title')}</Section>
      {entries.length === 0 && <Note>{t('journal_empty')}</Note>}
      {entries.map((e) => {
        const facts: string[] = [];
        if (e.heightCm != null) facts.push(t('journal_height', e.heightCm));
        if (e.moisturePct != null) facts.push(t('journal_moisture', e.moisturePct));
        if (e.harvestG) facts.push(t('journal_harvest', e.harvestG, inr(e.savedInr ?? 0)));
        return (
          <Card key={e.id}>
            <Note>{fmtDate(e.createdAt)}</Note>
            {e.photoUri && <Image source={{ uri: e.photoUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginVertical: 6 }} accessibilityLabel={t('cd_journal_photo')} />}
            {e.note ? <Txt>{e.note}</Txt> : null}
            {facts.length > 0 && <Txt size={13} color={C.leaf}>{facts.join('  •  ')}</Txt>}
          </Card>
        );
      })}
    </Page>
  );
}

export function JournalEntryScreen(props: { params: { plantId: number } }) {
  const app = useApp();
  const [note, setNote] = useState('');
  const [height, setHeight] = useState('');
  const [moisture, setMoisture] = useState('');
  const [harvest, setHarvest] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() && !isNaN(Number(s)) ? Number(s) : null);

  async function addPhoto(fromLibrary: boolean) {
    const uri = await takePhoto(fromLibrary); // removes location (EXIF) before saving
    if (uri) { setPhoto(uri); setError(null); } else setError(t('camera_unavailable'));
  }

  function save() {
    app.garden.addEntry(props.params.plantId, {
      note, heightCm: num(height), moisturePct: num(moisture) === null ? null : Math.round(num(moisture)!),
      harvestG: num(harvest) === null ? null : Math.round(num(harvest)!), photoUri: photo,
    });
    app.back();
  }

  return (
    <Page title={t('action_add_entry')}>
      <Field label={t('field_note')} value={note} onChangeText={setNote} multiline maxLength={300} />
      <Field label={t('field_height_cm')} value={height} onChangeText={setHeight} keyboard="decimal-pad" maxLength={5} />
      <Field label={t('field_moisture')} value={moisture} onChangeText={setMoisture} keyboard="number-pad" maxLength={3} />
      <Field label={t('field_harvest_g')} value={harvest} onChangeText={setHarvest} keyboard="number-pad" maxLength={5} />
      {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel={t('cd_journal_photo')} />}
      <Row>
        <Btn flex small title={'📷 ' + t(photo ? 'photo_added' : 'action_take_photo')} onPress={() => addPhoto(false)} />
        <Btn flex small title={'🖼 ' + t('action_add_photo')} onPress={() => addPhoto(true)} />
      </Row>
      <Note>{t('photo_privacy_note')}</Note>
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_save')} onPress={save} />
    </Page>
  );
}

// ====================================================================== plant health check

export function HealthCheckScreen() {
  const app = useApp();
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function take(fromLibrary: boolean) {
    setPhoto(await takePhoto(fromLibrary));
    setResult(null);
  }

  async function analyze() {
    if (!photo) return;
    setBusy(true);
    // Runs on the phone; the photo is not uploaded. Demo stand-in until the real model is ready.
    let fingerprint = 0;
    for (let i = 0; i < photo.length; i++) fingerprint = (fingerprint * 31 + photo.charCodeAt(i)) | 0;
    setResult(await analyzeLeaf(fingerprint));
    setBusy(false);
  }

  return (
    <Page title={t('title_health_check')}>
      <Txt>{t('health_intro')}</Txt>
      <Row>
        <Btn flex small title={'📷 ' + t('action_take_photo')} onPress={() => take(false)} />
        <Btn flex small title={'🖼 ' + t('action_add_photo')} onPress={() => take(true)} />
      </Row>
      {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: 16, marginVertical: 6 }} accessibilityLabel={t('cd_leaf_photo')} />}
      <Note>{t('health_privacy')}</Note>
      <Btn primary title={t('action_check_leaf')} onPress={analyze} disabled={!photo} loading={busy} />
      {result && (
        <Card bg={C.orangeLight}>
          <Txt size={17} bold>{result.issue}</Txt>
          <Note>{t('health_confidence', Math.round(result.confidence * 100))}</Note>
          <Txt>{result.advice}</Txt>
          <Txt size={13} bold>{t('health_disclaimer')}</Txt>
          <Btn small title={t('action_ask_community')} onPress={() => app.push('Community')} />
        </Card>
      )}
    </Page>
  );
}

// ====================================================================== moisture sensor

export function SensorScreen(props: { params: { plantId: number } }) {
  const app = useApp();
  const plant = app.garden.plant(props.params.plantId);
  const [state, setState] = useState<'idle' | 'scanning' | 'found' | 'connected'>(plant?.sensorId ? 'connected' : 'idle');
  const [found, setFound] = useState<FoundSensor[]>([]);
  const [pairing, setPairing] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pairError, setPairError] = useState(false);
  const [live, setLive] = useState<number | null>(null);
  const sensorId = plant?.sensorId ?? pairing;

  // Live readings every 2 s while this screen is open; one in five is saved.
  useEffect(() => {
    if (state !== 'connected') return;
    let count = 0;
    const timer = setInterval(() => {
      const value = app.sensor.read();
      setLive(value);
      if (count++ % 5 === 0) {
        app.garden.saveReading(props.params.plantId, value);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [state, app, props.params.plantId]);

  async function scan() {
    // In a development build, the Bluetooth permission prompt appears here, only when pairing.
    setState('scanning');
    setFound(await app.sensor.scan());
    setState('found');
  }

  async function pair() {
    if (!pairing) return;
    if (await app.sensor.pair(pairing, code)) {
      app.garden.linkSensor(props.params.plantId, pairing);
      setPairError(false);
      setState('connected');
    } else setPairError(true);
  }

  const history = app.garden.readings(props.params.plantId, 10);

  return (
    <Page title={t('title_sensor')}>
      {state === 'idle' && (
        <>
          <Txt>{t('sensor_intro')}</Txt>
          <Note>{t('sensor_permission_why')}</Note>
          <Btn primary title={t('action_find_sensor')} onPress={scan} />
        </>
      )}
      {state === 'scanning' && (
        <Row><ActivityIndicator color={C.leaf} /><Txt>📡 {t('sensor_scanning')}</Txt></Row>
      )}
      {state === 'found' && (
        <>
          <Section>{t('sensor_found')}</Section>
          {found.map((s) => (
            <Card key={s.id} onPress={() => { setPairing(s.id); setCode(''); setPairError(false); }} bg={pairing === s.id ? C.leafLight : C.surface}>
              <Txt bold>{s.name}</Txt>
              <Note>{t('sensor_signal', s.signal)}</Note>
            </Card>
          ))}
          {pairing && (
            <>
              <Section>{t('sensor_pair_with', pairing)}</Section>
              <Txt>{t('sensor_pair_body')}</Txt>
              <Note>{t('demo_code', DEMO_PAIRING_CODE)}</Note>
              <Field label={t('field_pairing_code')} value={code} onChangeText={setCode} keyboard="number-pad" maxLength={6} />
              {pairError && <ErrorText>{t('sensor_pair_failed')}</ErrorText>}
              <Btn primary title={t('action_pair')} onPress={pair} />
            </>
          )}
        </>
      )}
      {state === 'connected' && (
        <>
          <Card bg={C.leafLight}>
            <Note>{t('sensor_connected', sensorId ?? '')}</Note>
            <Txt size={40} bold color={C.leaf}>{live === null ? '…' : `${live}%`}</Txt>
            <Txt>{t('sensor_moisture_label')}</Txt>
            <Txt>{t(moistureAdviceKey(live ?? 50))}</Txt>
          </Card>
          {app.sensor.batteryPct < 20
            ? <ErrorText>{t('sensor_battery_low', app.sensor.batteryPct)}</ErrorText>
            : <Note>{t('sensor_battery', app.sensor.batteryPct)}</Note>}
          <Section>{t('sensor_history')}</Section>
          {history.length === 0 && <Note>{t('sensor_history_empty')}</Note>}
          {history.map((r, i) => (
            <Row key={i}><Note>{new Date(r.readAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Note><Txt>{`  ${r.moisturePct}%`}</Txt></Row>
          ))}
        </>
      )}
    </Page>
  );
}

// ====================================================================== guides and weather

export function GuidesScreen() {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Page title={t('title_guides')}>
      <Note>📴 {t('guides_offline')}</Note>
      {app.garden.guides().map((g) => (
        <Card key={g.id} onPress={() => setOpen(open === g.id ? null : g.id)} accessibilityLabel={g.title}>
          <Row>
            <Emoji size={28}>{g.emoji}</Emoji>
            <View style={{ flex: 1 }}>
              <Txt bold>{g.title}</Txt>
              <Note>{g.crop}</Note>
            </View>
            <Txt color={C.muted}>{open === g.id ? '▲' : '▼'}</Txt>
          </Row>
          {open === g.id && g.steps.map((step, i) => <Txt key={i}>{`${i + 1}. ${step}`}</Txt>)}
        </Card>
      ))}
    </Page>
  );
}

export function WeatherScreen() {
  const app = useApp();
  const city = app.settings.get('weather_city', 'Delhi');
  const [tip, setTip] = useState<WeatherTip | null>(null);

  useEffect(() => {
    let alive = true;
    setTip(null);
    weatherTip(city).then((w) => alive && setTip(w));
    return () => { alive = false; };
  }, [city]);

  return (
    <Page title={t('title_weather')}>
      <Txt>{t('weather_choose_city')}</Txt>
      <Note>{t('weather_privacy')}</Note>
      <Chips options={CITIES.map((c) => ({ value: c, label: c }))} value={city} onChange={(c) => { app.settings.set('weather_city', c); app.emit(); }} />
      <Spacer />
      {tip ? (
        <Card bg={tip.isWarning ? C.orangeLight : C.leafLight}>
          <Txt size={17} bold>{t('weather_heading', tip.city, tip.condition, tip.tempC)}</Txt>
          <Txt>{tip.tip}</Txt>
        </Card>
      ) : <ActivityIndicator color={C.leaf} />}
    </Page>
  );
}
