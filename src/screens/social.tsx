/** Community Q&A, Kids (parent view and full-screen Kids mode) and School mode. */
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { certificateHtml } from '../core/certificate';
import type { Post } from '../core/models';
import { DEMO_TEACHER } from '../core/authServer';
import * as v from '../core/validator';
import { t } from '../i18n';
import { useApp } from '../services/app';
import { sharePdf } from '../services/native';
import { Btn, C, Card, Emoji, ErrorText, Field, Note, Page, Progress, Row, Section, Spacer, SwitchRow, Txt } from '../ui/components';
import { fmtDate } from './kits';

// ====================================================================== community

function PostCard(props: { post: Post; footer?: string; onOpen?: () => void }) {
  const app = useApp();
  const p = props.post;
  const report = () =>
    Alert.alert(t('report_title'), t('report_body'), [
      { text: t('action_cancel'), style: 'cancel' },
      { text: t('action_report'), style: 'destructive', onPress: () => { app.community.report(p.id); app.emit(); } },
    ]);
  return (
    <Card bg={p.isExpert ? C.leafLight : C.surface} onPress={props.onOpen}>
      <Row>
        <Txt size={13} bold style={{ flex: 1 }}>@{p.author}</Txt>
        {p.isExpert && <Txt size={12} color={C.leaf}>✔ {t('community_expert')}</Txt>}
        <Note>{fmtDate(p.createdAt)}</Note>
      </Row>
      {p.status === 'reported' ? <Txt color={C.muted}>{t('community_under_review')}</Txt> : <Txt>{p.text}</Txt>}
      <Row>
        <Btn small title={`${p.votedByMe ? '👍' : '👍🏻'} ${p.votes}`} onPress={() => { app.community.toggleVote(p.id); app.emit(); }} />
        {props.footer ? <Note>{props.footer}</Note> : null}
        <View style={{ flex: 1 }} />
        {p.status !== 'reported' && <Btn small title={'🚩 ' + t('action_report')} onPress={report} />}
      </Row>
    </Card>
  );
}

export function CommunityScreen() {
  const app = useApp();
  const c = app.community;
  return (
    <Page title={t('title_community')}>
      <Note>{t('community_rules')}</Note>
      <Btn primary title={'＋ ' + t('action_ask')} onPress={() => app.push('Ask')} />
      {c.questions().map((q) => {
        const answers = c.answersFor(q.id);
        const footer = t('community_answers', answers.length) + (answers.some((a) => a.isExpert) ? ' • ' + t('community_has_expert') : '');
        return <PostCard key={q.id} post={q} footer={footer} onOpen={() => app.push('Post', { postId: q.id })} />;
      })}
    </Page>
  );
}

export function AskScreen() {
  const app = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  function post() {
    const r = app.community.ask(text);
    if (r === 'ok') app.back();
    else setError(t(r));
  }
  return (
    <Page title={t('community_ask_title')}>
      <Field label={t('community_ask_hint')} value={text} onChangeText={setText} multiline maxLength={500} />
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_post')} onPress={post} />
    </Page>
  );
}

export function PostScreen(props: { params: { postId: string } }) {
  const app = useApp();
  const q = app.community.post(props.params.postId);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!q) return <Page title=""><Txt>{t('not_found')}</Txt></Page>;
  function send() {
    const r = app.community.answer(props.params.postId, reply);
    if (r === 'ok') { setReply(''); setError(null); app.emit(); } else setError(t(r));
  }
  return (
    <Page title={t('title_question')}>
      <PostCard post={q} />
      {app.community.answersFor(q.id).map((a) => <PostCard key={a.id} post={a} />)}
      <Section>{t('action_answer')}</Section>
      <Field label={t('community_answer_hint')} value={reply} onChangeText={setReply} multiline maxLength={500} />
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_send')} onPress={send} />
    </Page>
  );
}

// ====================================================================== kids (parent view)

export function KidsScreen() {
  const app = useApp();
  const k = app.kids;
  return (
    <Page title={t('title_kids')}>
      <Card bg={C.orangeLight}>
        <Row>
          <Emoji size={44}>🌱</Emoji>
          <View style={{ flex: 1 }}>
            <Txt size={20} bold>{t('kids_hero_title')}</Txt>
            <Txt>{t('kids_hero_body')}</Txt>
          </View>
        </Row>
        <Btn primary title={t('action_start_kids_mode')} onPress={() => app.push('StartKids')} />
      </Card>
      <Card>
        <Txt bold>{t('kids_progress', k.doneCount(), k.missions.length)}</Txt>
        <Progress value={k.doneCount()} max={k.missions.length} />
        <Btn small title={t('kids_new_week')} onPress={() => { k.resetWeek(); app.emit(); }} />
      </Card>
      <Card onPress={() => app.push('KitDetail', { kitId: 'little_sprouts' })}>
        <Txt bold>{t('kids_kit_title')}</Txt>
        <Txt>{t('kids_kit_body')}</Txt>
      </Card>
      <Card onPress={() => app.push('School')}>
        <Txt bold>🏫 {t('title_school')}</Txt>
        <Note>{t('school_teaser')}</Note>
      </Card>
      <Card bg={C.surfaceVariant}>
        <Txt bold>{t('kids_safety_title')}</Txt>
        <Note>{t('kids_safety_body')}</Note>
      </Card>
    </Page>
  );
}

export function StartKidsScreen() {
  const app = useApp();
  const needsPin = !app.kids.hasPin;
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);

  function start() {
    if (needsPin) {
      if (!v.isPinValid(pin) || pin !== pin2) return setError(t('err_pin_mismatch'));
      app.kids.setPin(pin);
    }
    app.kids.enter(name);
    app.settings.set('kids_mode_active', true); // survives an app restart
    app.refreshRoot();
  }

  return (
    <Page title={t('action_start_kids_mode')}>
      <Field label={t('field_kid_nickname')} value={name} onChangeText={setName} maxLength={20} />
      <Note>{t('kids_nickname_note')}</Note>
      {needsPin && (
        <>
          <Txt>{t('kids_pin_setup')}</Txt>
          <Field label={t('field_parent_pin')} value={pin} onChangeText={setPin} secure keyboard="number-pad" maxLength={4} />
          <Field label={t('field_parent_pin_again')} value={pin2} onChangeText={setPin2} secure keyboard="number-pad" maxLength={4} />
        </>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Btn primary title={t('action_start')} onPress={start} />
    </Page>
  );
}

// ====================================================================== Kids mode (full screen)

/** No tabs, no back button, no community or sharing apart from the certificate. Leaving needs the parent PIN. */
export function KidsModeScreen() {
  const app = useApp();
  const k = app.kids;
  const [exiting, setExiting] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = k.doneCount();
  const total = k.missions.length;

  function tryExit() {
    const r = k.tryExit(pin);
    setPin('');
    if (r === 0) {
      app.settings.set('kids_mode_active', false);
      app.refreshRoot();
    } else setError(r < 0 ? t('err_pin_wrong') : t('err_pin_wait', r));
  }

  async function certificate() {
    const html = certificateHtml({
      nickname: k.nickname, heading: t('cert_heading'), awardedTo: t('cert_awarded_to'),
      forCompleting: t('cert_for_completing', done), programme: t('cert_program'), appName: t('app_name'),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    if (!(await sharePdf(html, t('kids_make_certificate')))) Alert.alert(t('kids_make_certificate'), t('error_title'));
  }

  if (exiting) {
    return (
      <Page title={t('kids_exit_title')} noBack>
        <Field label={t('field_parent_pin')} value={pin} onChangeText={setPin} secure keyboard="number-pad" maxLength={4} />
        {error && <ErrorText>{error}</ErrorText>}
        <Btn primary title={t('action_unlock')} onPress={tryExit} disabled={pin.length !== 4} />
        <Btn title={t('action_keep_playing')} onPress={() => { setExiting(false); setError(null); }} />
      </Page>
    );
  }

  return (
    <Page title={t('kids_hello', k.nickname)} noBack background={C.orangeLight}
      actions={[{ label: '🔒', onPress: () => setExiting(true), accessibilityLabel: t('kids_exit') }]}>
      <Txt size={17}>{t('kids_mode_intro')}</Txt>
      <Txt size={20} bold color={C.leaf}>{t('kids_missions_count', done, total)}</Txt>
      <Progress value={done} max={total} />
      <Spacer h={6} />
      {k.missions.map((m) => (
        <Pressable key={m.id} onPress={() => { k.toggle(m.id); app.emit(); }} accessibilityRole="checkbox" accessibilityState={{ checked: m.done }}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 20, padding: 14, marginBottom: 10, minHeight: 72 }}>
          <Text style={{ fontSize: 34, marginRight: 12 }}>{m.emoji}</Text>
          <Text style={{ flex: 1, fontSize: 17, color: C.ink, textDecorationLine: m.done ? 'line-through' : 'none' }}>{m.title}</Text>
          <Text style={{ fontSize: 30 }}>{m.done ? '✅' : '⬜'}</Text>
        </Pressable>
      ))}
      <Section>{t('kids_badges')}</Section>
      <Row style={{ justifyContent: 'space-between' }}>
        {k.badges().map((b) => (
          <View key={b.id} style={{ alignItems: 'center', flex: 1, opacity: b.earned ? 1 : 0.35 }}>
            <Text style={{ fontSize: 34 }}>{b.emoji}</Text>
            <Text style={{ fontSize: 11, textAlign: 'center', color: C.ink }}>{b.title}</Text>
          </View>
        ))}
      </Row>
      <Spacer />
      {done === total
        ? <Btn primary title={'🏅 ' + t('kids_make_certificate')} onPress={certificate} />
        : <Btn title={t('kids_certificate_locked')} disabled />}
    </Page>
  );
}

// ====================================================================== school

/** Teacher dashboard. Teacher accounts must use two-step login before class data is shown. */
export function SchoolScreen() {
  const app = useApp();
  const st = app.auth.state;
  if (st.kind !== 'loggedIn' || st.role !== 'TEACHER') {
    return (
      <Page title={t('title_school')}>
        <Txt size={48}>🏫</Txt>
        <Txt>{t('school_teachers_only')}</Txt>
        <Note>{t('school_demo_hint', DEMO_TEACHER)}</Note>
      </Page>
    );
  }
  if (!st.twoStep) {
    return (
      <Page title={t('title_school')}>
        <Txt size={48}>🔐</Txt>
        <Txt>{t('school_needs_two_step')}</Txt>
        <Btn primary title={t('action_turn_on_two_step')} onPress={() => app.push('Profile')} />
      </Page>
    );
  }
  const sc = app.school.schoolClass;
  const done = sc.missions.filter((m) => m.done).length;
  return (
    <Page title={t('title_school')}>
      <Card bg={C.leafLight}>
        <Txt size={17} bold>{sc.schoolName}</Txt>
        <Txt>{t('school_class_line', sc.className, sc.studentCount)}</Txt>
        <Note>{sc.kitName}</Note>
      </Card>
      <Txt bold>{t('school_progress', done, sc.missions.length)}</Txt>
      <Progress value={done} max={sc.missions.length} />
      <Section>{t('school_missions')}</Section>
      {sc.missions.map((m) => (
        <Card key={m.id}>
          <SwitchRow label={`${m.emoji}  ${m.title}`} value={m.done} onChange={() => { app.school.toggle(m.id); app.emit(); }} />
        </Card>
      ))}
      <Note>{t('school_privacy')}</Note>
    </Page>
  );
}
