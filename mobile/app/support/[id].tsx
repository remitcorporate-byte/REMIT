import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { api, formatDateTime } from '@/src/api/client';
import { useAuth } from '@/src/auth/auth-provider';
import { Badge, Button, Card, ErrorMessage, Field, Screen } from '@/src/components/ui';
import { colors } from '@/src/constants/theme';
export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const ticket = useQuery({ queryKey: ['support-ticket', id], queryFn: () => api.supportTicket(id), enabled: Boolean(user) && Boolean(id) && can('support.read') });
  const [reply, setReply] = useState('');
  const send = useMutation({ mutationFn: () => api.replyToSupportTicket(id, reply.trim()), onSuccess: async () => { setReply(''); await qc.invalidateQueries({ queryKey: ['support-ticket', id] }); await qc.invalidateQueries({ queryKey: ['support-tickets'] }); } });
  if (!can('support.read')) return <Screen><ErrorMessage message="You do not have support access." /></Screen>;
  if (ticket.isLoading) return <Screen><ActivityIndicator color={colors.primary} /></Screen>;
  const data = ticket.data;
  if (!data) return <Screen><ErrorMessage message={ticket.error instanceof Error ? ticket.error.message : 'Ticket not found'} /></Screen>;
  return <Screen><Card style={styles.hero}><Text style={styles.reference}>{data.reference}</Text><Text style={styles.title}>{data.subject}</Text><Badge label={data.status} /></Card><Card style={styles.thread}>{data.messages.filter((message) => !((message as any).isInternal)).map((message) => <Card key={message.id} style={styles.message}><Text style={styles.author}>{message.senderType === 'SUPPORT' ? 'REMIT Support' : message.author ? message.author.firstName + ' ' + message.author.lastName : 'You'}</Text><Text style={styles.muted}>{formatDateTime(message.createdAt)}</Text><Text style={styles.body}>{message.body}</Text></Card>)}{data.status !== 'CLOSED' && can('support.reply') ? <><Field label="Reply" multiline value={reply} onChangeText={setReply} /><ErrorMessage message={send.error instanceof Error ? send.error.message : null} /><Button disabled={!reply.trim()} loading={send.isPending} title="Send reply" onPress={() => send.mutate()} /></> : null}</Card></Screen>;
}
const styles = StyleSheet.create({ hero: { gap: 8 }, reference: { color: colors.primary, fontSize: 12, fontWeight: '800' }, title: { color: colors.ink, fontSize: 22, fontWeight: '900' }, thread: { gap: 10 }, message: { gap: 5, padding: 12 }, author: { color: colors.ink, fontSize: 14, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 12 }, body: { color: colors.ink, fontSize: 14, lineHeight: 20 } });
