/** Brand colours and the small set of building blocks every screen uses. */
import Constants from 'expo-constants';
import React, { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import type { FieldStatus } from '../core/models';
import { t } from '../i18n';
import { getApp } from '../services/app';

export const C = {
  leaf: '#2E7D32',
  leafLight: '#C8E6C9',
  orange: '#F57C00',
  orangeLight: '#FFE0B2',
  cream: '#FFF8E1',
  surface: '#FFFDF5',
  surfaceVariant: '#F1EBD3',
  ink: '#1B1B1B',
  muted: '#4A4636',
  error: '#B3261E',
  errorLight: '#F9DEDC',
  white: '#FFFFFF',
  line: '#E3DCC2',
};

const STATUS: Record<FieldStatus, { color: string; mark: string }> = {
  status_available: { color: '#1B5E20', mark: '✓' },
  status_unverified: { color: '#8A4B00', mark: '?' },
  status_missing: { color: '#B3261E', mark: '✕' },
};

// ---------------------------------------------------------------- page frame

export interface HeaderAction {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Standard page: top bar with back button, title and actions, then scrolling content. */
export function Page(props: { title: string; actions?: HeaderAction[]; children: ReactNode; scroll?: boolean; background?: string; noBack?: boolean }) {
  const app = getApp();
  const canGoBack = !props.noBack && app.stack.length > 1;
  return (
    <View style={[s.page, { backgroundColor: props.background ?? C.cream }]}>
      <View style={s.header}>
        {canGoBack ? (
          <Pressable onPress={() => app.back()} accessibilityRole="button" accessibilityLabel={t('cd_back')} style={s.headerBtn} hitSlop={8}>
            <Text style={s.headerBtnText}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={s.headerTitle} numberOfLines={1} accessibilityRole="header">{props.title}</Text>
        {props.actions?.map((a) => (
          <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.accessibilityLabel ?? a.label} style={s.headerBtn} hitSlop={8}>
            <Text style={s.headerAction}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      {props.scroll === false ? (
        <View style={s.body}>{props.children}</View>
      ) : (
        <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {props.children}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- text

export function Txt(props: { children: ReactNode; size?: number; bold?: boolean; color?: string; center?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{ fontSize: props.size ?? 15, fontWeight: props.bold ? '700' : '400', color: props.color ?? C.ink, textAlign: props.center ? 'center' : 'auto', marginBottom: 4, lineHeight: (props.size ?? 15) * 1.35 }, props.style]}>
      {props.children}
    </Text>
  );
}

export const Heading = (p: { children: ReactNode }) => <Txt size={22} bold>{p.children}</Txt>;
export const Section = (p: { children: ReactNode }) => <Txt size={17} bold style={{ marginTop: 14, marginBottom: 6 }}>{p.children}</Txt>;
export const Note = (p: { children: ReactNode; color?: string }) => <Txt size={12.5} color={p.color ?? C.muted}>{p.children}</Txt>;
export const ErrorText = (p: { children: ReactNode }) => (
  <View accessibilityLiveRegion="polite"><Txt size={14} color={C.error}>⚠ {p.children}</Txt></View>
);

// ---------------------------------------------------------------- containers

export function Card(props: { children: ReactNode; bg?: string; onPress?: () => void; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const style = [s.card, { backgroundColor: props.bg ?? C.surface }, props.style];
  if (props.onPress) {
    return (
      <Pressable onPress={props.onPress} style={({ pressed }: { pressed: boolean }) => [style, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel}>
        {props.children}
      </Pressable>
    );
  }
  return <View style={style}>{props.children}</View>;
}

export const Row = (p: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: p.gap ?? 8 }, p.style]}>{p.children}</View>
);

export const Spacer = (p: { h?: number }) => <View style={{ height: p.h ?? 10 }} />;

export const Emoji = (p: { children: string; size?: number }) => (
  <Text style={{ fontSize: p.size ?? 32, marginRight: 4 }} accessibilityElementsHidden importantForAccessibility="no">{p.children}</Text>
);

// ---------------------------------------------------------------- controls

export function Btn(props: { title: string; onPress?: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; loading?: boolean; flex?: boolean; small?: boolean }) {
  const disabled = props.disabled || props.loading || !props.onPress;
  const bg = props.primary ? C.leaf : C.surface;
  const fg = props.primary ? C.white : props.danger ? C.error : C.leaf;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }: { pressed: boolean }) => [
        s.btn,
        props.small && s.btnSmall,
        { backgroundColor: bg, borderColor: props.primary ? C.leaf : C.line, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        props.flex && { flex: 1 },
      ]}
    >
      {props.loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }, props.small && { fontSize: 13 }]}>{props.title}</Text>}
    </Pressable>
  );
}

/** One-of-many choice shown as chips. */
export function Chips<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => props.onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[s.chip, selected && { backgroundColor: C.leaf, borderColor: C.leaf }]}
          >
            <Text style={{ color: selected ? C.white : C.ink, fontWeight: selected ? '700' : '400' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: {
  label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; keyboard?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address' | 'phone-pad';
  autoComplete?: 'username' | 'password' | 'new-password' | 'email' | 'name' | 'postal-code' | 'street-address' | 'one-time-code' | 'off';
  multiline?: boolean; hint?: string; error?: boolean; maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        keyboardType={props.keyboard ?? 'default'}
        autoComplete={props.autoComplete ?? 'off'}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={props.multiline}
        maxLength={props.maxLength}
        accessibilityLabel={props.label}
        style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.error && { borderColor: C.error }]}
        placeholderTextColor="#8A8470"
      />
      {props.hint ? <Note color={props.error ? C.error : C.muted}>{props.hint}</Note> : null}
    </View>
  );
}

export function SwitchRow(props: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: 15, color: props.disabled ? C.muted : C.ink }}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} disabled={props.disabled} trackColor={{ true: C.leaf, false: '#CFC8B0' }} accessibilityLabel={props.label} />
    </Row>
  );
}

export function Progress(props: { value: number; max: number; color?: string }) {
  const pct = props.max ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  return (
    <View style={s.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: props.max, now: props.value }}>
      <View style={[s.progressFill, { width: `${pct * 100}%`, backgroundColor: props.color ?? C.leaf }]} />
    </View>
  );
}

/** Traceability badge: colour, symbol AND word, so it works for colour-blind users and screen readers. */
export function StatusBadge(props: { status: FieldStatus }) {
  const st = STATUS[props.status];
  return (
    <View style={[s.badge, { backgroundColor: st.color }]} accessibilityLabel={t(props.status)}>
      <Text style={s.badgeText}>{st.mark} {t(props.status)}</Text>
    </View>
  );
}

export function StrengthMeter(props: { score: number }) {
  const labels = ['strength_0', 'strength_1', 'strength_2', 'strength_3', 'strength_4'];
  const colors = [C.error, C.error, C.orange, C.leaf, C.leaf];
  return (
    <View style={{ marginBottom: 6 }}>
      <Progress value={props.score + 1} max={5} color={colors[props.score]} />
      <Note color={colors[props.score]}>{t('strength_label', t(labels[props.score]))}</Note>
    </View>
  );
}

/** Blocks screenshots while a sensitive screen is shown (see services/native). */
export function useOnMount(fn: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, []);
}

export const s = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: (Constants.statusBarHeight ?? 24) + 6, paddingBottom: 8, paddingHorizontal: 10, backgroundColor: C.cream, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: '700', color: C.ink, marginHorizontal: 6 },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 34, color: C.leaf, lineHeight: 36 },
  headerAction: { fontSize: 22 },
  body: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  btn: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  btnSmall: { minHeight: 40, paddingHorizontal: 10 },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center' },
  label: { fontSize: 13, color: C.muted, marginBottom: 4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, backgroundColor: C.white, color: C.ink },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.surfaceVariant, overflow: 'hidden', marginVertical: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { color: C.white, fontSize: 12, fontWeight: '700' },
});

export default React;
