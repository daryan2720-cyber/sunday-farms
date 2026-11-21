/** Kits, kit detail, space check, checkout, orders and returns, rewards and eco impact. */
import React, { useState } from 'react';
import { Alert, View } from 'react-native';

import { inr } from '../core/kits';
import type { Kit, PaymentMethod, RentalStatus } from '../core/models';
import { t } from '../i18n';
import { useApp } from '../services/app';
import { shareText, takePhoto } from '../services/native';
import { Btn, C, Card, Chips, Emoji, ErrorText, Field, Note, Page, Progress, Row, Section, Spacer, SwitchRow, Txt } from '../ui/components';

export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function KitCard(props: { kit: Kit; onPress: () => void }) {
  const k = props.kit;
  return (
    <Card onPress={props.onPress} accessibilityLabel={k.name}>
      <Row>
        <Emoji size={40}>{k.emoji}</Emoji>
        <View style={{ flex: 1 }}>
          <Txt size={17} bold>{k.name}</Txt>
          <Txt bold color={C.leaf}>{t('kit_price_line', inr(k.monthlyPriceInr), k.minMonths)}</Txt>
          <Note>{k.crops.join(' • ')}</Note>
        </View>
        <Txt size={22} color={C.muted}>›</Txt>
      </Row>
    </Card>
  );
}

// ====================================================================== kit list

export function KitsScreen() {
  const app = useApp();
  return (
    <Page title={t('title_kits')} actions={[
      { label: '🚚', onPress: () => app.push('Orders'), accessibilityLabel: t('title_orders') },
      { label: '🏆', onPress: () => app.push('Rewards'), accessibilityLabel: t('title_rewards') },
    ]}>
      <Card bg={C.orangeLight} onPress={() => app.push('SpaceCheck')} accessibilityLabel={t('space_check_title')}>
        <Txt bold>📏 {t('space_check_title')}</Txt>
        <Note>{t('space_check_teaser')}</Note>
      </Card>
      {app.kits.kits.map((k) => <KitCard key={k.id} kit={k} onPress={() => app.push('KitDetail', { kitId: k.id })} />)}
      <Note>{t('prices_illustrative')}</Note>
    </Page>
  );
}

// ====================================================================== kit detail

export function KitDetailScreen(props: { params: { kitId: string } }) {
  const app = useApp();
  const k = app.kits.kit(props.params.kitId);
  if (!k) return <Page title=""><Txt>{t('not_found')}</Txt></Page>;
  return (
    <Page title={k.name}>
      <Row>
        <Emoji size={56}>{k.emoji}</Emoji>
        <View style={{ flex: 1 }}>
          <Txt size={22} bold color={C.leaf}>{inr(k.monthlyPriceInr) + t('per_month')}</Txt>
          <Txt>{t('kit_min_period', k.minMonths)}</Txt>
          <Note>{t('kit_deposit', inr(k.depositInr))}</Note>
        </View>
      </Row>
      <Txt size={16}>{k.description}</Txt>
      <Section>{t('kit_crops')}</Section>
      <Txt>{k.crops.join(' • ')}</Txt>
      <Section>{t('kit_contents')}</Section>
      <Card>{k.contents.map((c) => <Txt key={c}>✓ {c}</Txt>)}</Card>
      <Note>{t('kit_circular_note')}</Note>
      <Btn primary title={t('action_rent_kit')} onPress={() => app.push('Checkout', { kitId: k.id })} />
    </Page>
  );
}

// ====================================================================== space check

export function SpaceCheckScreen() {
  const app = useApp();
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [sun, setSun] = useState(5);
  const [forKids, setForKids] = useState(false);
  const area = (parseFloat(length) || 0) * (parseFloat(width) || 0);
  const matches = area > 0 ? app.kits.recommend(Math.floor(area), sun, forKids) : [];

  return (
    <Page title={t('space_check_title')}>
      <Txt>{t('space_check_intro')}</Txt>
      <Row>
        <View style={{ flex: 1 }}><Field label={t('field_length_ft')} value={length} onChangeText={setLength} keyboard="decimal-pad" maxLength={5} /></View>
        <View style={{ flex: 1 }}><Field label={t('field_width_ft')} value={width} onChangeText={setWidth} keyboard="decimal-pad" maxLength={5} /></View>
      </Row>
      <Txt bold>{t('space_sun_hours', sun)}</Txt>
      <Row>
        <Btn flex small title="−" onPress={() => setSun(Math.max(0, sun - 1))} />
        <View style={{ flex: 2 }}><Progress value={sun} max={10} color={C.orange} /></View>
        <Btn flex small title="+" onPress={() => setSun(Math.min(10, sun + 1))} />
      </Row>
      <SwitchRow label={t('space_for_kids')} value={forKids} onChange={setForKids} />
      <Btn title={'📱 ' + t('space_try_ar')} onPress={() => Alert.alert(t('space_ar_title'), t('space_ar_body'))} />
      {area > 0 && (
        <>
          <Section>{t('space_result_title', Math.floor(area))}</Section>
          {matches.length === 0 && <Card><Txt>{t('space_no_match')}</Txt></Card>}
          {matches.map((k) => <KitCard key={k.id} kit={k} onPress={() => app.push('KitDetail', { kitId: k.id })} />)}
        </>
      )}
    </Page>
  );
}

// ====================================================================== checkout

export function CheckoutScreen(props: { params: { kitId: string } }) {
  const app = useApp();
  const k = app.kits.kit(props.params.kitId)!;
  const [months, setMonths] = useState(k.minMonths);
  const [usePoints, setUsePoints] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('pay_upi');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points = usePoints ? app.kits.maxPointsUsable(k) : 0;
  const discount = app.kits.pointsToInr(points);
  const total = k.monthlyPriceInr + k.depositInr - discount;

  async function pay() {
    if (!name.trim() || address.trim().length < 10 || pincode.replace(/\D/g, '').length !== 6) {
      setError(`${t('checkout_address_note')} (${t('field_name')}, ${t('field_address')}, ${t('field_pincode')})`);
      return;
    }
    setPaying(true);
    // Real app: App Attest (iOS) / Play Integrity (Android) token checked by the server first,
    // then the payment gateway's SDK. Card details never touch this app.
    await app.kits.rent(k, months, points, method);
    setPaying(false);
    app.popToRootAndPush('Orders');
  }

  return (
    <Page title={t('title_checkout')}>
      <Txt size={20} bold>{`${k.emoji} ${k.name}`}</Txt>
      <Section>{t('checkout_months')}</Section>
      <Row>
        <Btn small title="−" onPress={() => setMonths(Math.max(k.minMonths, months - 1))} />
        <Txt style={{ flex: 1 }} center>{t('checkout_months_value', months)}</Txt>
        <Btn small title="+" onPress={() => setMonths(Math.min(12, months + 1))} />
      </Row>
      <Section>{t('checkout_address')}</Section>
      <Note>{t('checkout_address_note')}</Note>
      <Field label={t('field_name')} value={name} onChangeText={setName} autoComplete="name" maxLength={60} />
      <Field label={t('field_address')} value={address} onChangeText={setAddress} autoComplete="street-address" multiline maxLength={200} />
      <Field label={t('field_pincode')} value={pincode} onChangeText={setPincode} keyboard="number-pad" autoComplete="postal-code" maxLength={6} />
      <Section>{t('checkout_payment')}</Section>
      <Chips options={(['pay_upi', 'pay_card', 'pay_autopay'] as PaymentMethod[]).map((m) => ({ value: m, label: t(m) }))} value={method} onChange={setMethod} />
      <SwitchRow label={t('checkout_use_points', app.kits.pointsBalance)} value={usePoints} onChange={setUsePoints} disabled={app.kits.pointsBalance <= 0} />
      <Note>{t('checkout_points_rule')}</Note>
      <Card bg={C.surfaceVariant}>
        <Row><Txt style={{ flex: 1 }}>{t('checkout_first_month')}</Txt><Txt>{inr(k.monthlyPriceInr)}</Txt></Row>
        <Row><Txt style={{ flex: 1 }}>{t('checkout_deposit')}</Txt><Txt>{inr(k.depositInr)}</Txt></Row>
        {discount > 0 && <Row><Txt style={{ flex: 1 }}>{t('checkout_points_discount')}</Txt><Txt>{'−' + inr(discount)}</Txt></Row>}
        <Row style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, marginTop: 4 }}>
          <Txt bold style={{ flex: 1 }}>{t('checkout_total')}</Txt><Txt bold>{inr(total)}</Txt>
        </Row>
        <Note>{t('checkout_then_monthly', inr(k.monthlyPriceInr), months - 1)}</Note>
      </Card>
      <Note>🔒 {t('checkout_secure_note')}</Note>
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_pay', inr(total))} onPress={pay} loading={paying} />
    </Page>
  );
}

// ====================================================================== orders and returns

const STEPS: RentalStatus[] = ['status_placed', 'status_packed', 'status_out_for_delivery', 'status_delivered'];

export function OrdersScreen() {
  const app = useApp();
  const act = (fn: () => void) => () => { fn(); app.emit(); };
  if (!app.kits.rentals.length) {
    return <Page title={t('title_orders')}><Txt size={48} center>📦</Txt><Txt center>{t('orders_empty')}</Txt></Page>;
  }
  return (
    <Page title={t('title_orders')}>
      {app.kits.rentals.map((r) => {
        const progress = STEPS.includes(r.status) ? STEPS.indexOf(r.status) + 1 : STEPS.length;
        return (
          <Card key={r.id}>
            <Txt size={17} bold>{`${r.kit.emoji} ${r.kit.name}`}</Txt>
            <Note>{t('order_meta', r.id, fmtDate(r.startedAt), inr(r.paidInr))}</Note>
            <Txt bold color={C.leaf}>{t(r.status)}</Txt>
            <Progress value={progress} max={STEPS.length} />
            <Note>{t(r.depositStatus)}</Note>
            {r.returnPickupDate && <Note>{t('order_pickup_on', r.returnPickupDate, r.returnPhotos)}</Note>}
            {STEPS.slice(0, 3).includes(r.status) && <Btn small title={t('demo_next_update')} onPress={act(() => app.kits.advanceDemoStatus(r.id))} />}
            {r.status === 'status_delivered' && <Btn primary title={t('action_book_return')} onPress={() => app.push('Return', { rentalId: r.id })} />}
            {r.status === 'status_return_booked' && (
              <>
                <Btn small title={t('demo_returned_good')} onPress={act(() => app.kits.completeDemoReturn(r.id, true))} />
                <Btn small title={t('demo_returned_damaged')} onPress={act(() => app.kits.completeDemoReturn(r.id, false))} />
              </>
            )}
          </Card>
        );
      })}
    </Page>
  );
}

export function ReturnScreen(props: { params: { rentalId: string } }) {
  const app = useApp();
  const dates = [1, 2, 3].map((d) => fmtDate(Date.now() + d * 86400000));
  const [date, setDate] = useState(dates[0]);
  const [photos, setPhotos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto() {
    const uri = await takePhoto();
    if (uri) setPhotos((n) => Math.min(4, n + 1));
    else setError(t('camera_unavailable'));
  }

  return (
    <Page title={t('return_title')}>
      <Txt bold>{t('return_pick_date')}</Txt>
      <Chips options={dates.map((d) => ({ value: d, label: d }))} value={date} onChange={setDate} />
      <Spacer />
      <Txt>{t('return_photos_why')}</Txt>
      <Btn title={'📷 ' + t('return_add_photos', photos)} onPress={addPhoto} disabled={photos >= 4} />
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_confirm')} onPress={() => { app.kits.bookReturn(props.params.rentalId, date, photos); app.back(); }} />
    </Page>
  );
}

// ====================================================================== rewards

export function RewardsScreen() {
  const app = useApp();
  const k = app.kits;
  const i = k.ecoImpact(app.garden.totals().harvestG / 1000);
  const balance = k.pointsBalance;
  return (
    <Page title={t('title_rewards')}>
      <Card bg={C.orangeLight}>
        <Txt size={24} bold>{t('rewards_balance', balance)}</Txt>
        <Txt>{t('rewards_worth', inr(k.pointsToInr(balance)))}</Txt>
        <Note>{t('rewards_rules')}</Note>
      </Card>
      <Card bg={C.leafLight}>
        <Txt size={17} bold>🌍 {t('eco_title')}</Txt>
        <Txt>{t('eco_plastic', i.plasticSavedG)}</Txt>
        <Txt>{t('eco_miles', i.foodMilesSavedKm)}</Txt>
        <Txt>{t('eco_reused', i.kitsReused)}</Txt>
        <Txt>{t('eco_harvest', i.harvestKg)}</Txt>
        <Note>{t('eco_estimate_note')}</Note>
        {/* Shared only when the user chooses to. */}
        <Btn small title={'↗ ' + t('action_share')} onPress={() => shareText(t('eco_share_text', i.plasticSavedG, i.foodMilesSavedKm))} />
      </Card>
      <Section>{t('rewards_history')}</Section>
      {k.rewards.map((e, idx) => (
        <Row key={idx} style={{ paddingVertical: 4 }}>
          <View style={{ flex: 1 }}>
            <Txt>{e.reason}</Txt>
            <Note>{fmtDate(e.at)}</Note>
          </View>
          <Txt bold color={e.points > 0 ? C.leaf : C.muted}>{(e.points > 0 ? '+' : '') + e.points}</Txt>
        </Row>
      ))}
    </Page>
  );
}
