/**
 * T070 — POST /api/v1/chat/:token/belege  (öffentlich, Wirt)
 *
 * Der EINGANGSKANAL: Der Wirt lädt im Widget ein Beleg-Foto/eine Datei hoch.
 * Token = Credential; Tenant/Session via SECURITY-DEFINER-Lookup (T068). Die
 * Datei mündet über die GETEILTE Pipeline (processBelegUpload, sourceChannel
 * 'web_chat') in den bestehenden belege-Pfad → OCR-Worker → M03 → M05.
 *
 * Der hochgeladene Beleg wird zusätzlich als Chat-Bubble verknüpft
 * (chat_messages.beleg_id, sender_type='customer'); insertChatMessage pusht
 * dabei das SSE-'chat.message'-Event → der Wirt sieht sein Foto sofort im Thread.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { processBelegUpload } from '../../m01-receipt-intake/services/beleg-upload.service';
import { insertChatMessage } from '../services/webchat.repository';
import { toPublicChatMessage } from '../webchat.types';
import { resolveChatSession } from './_resolve-session';

export async function chatUploadHandler(
  req: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const r = await resolveChatSession(req.server.db, req.params.token);
  if (!r.ok) {
    return reply.code(r.status).send(r.body);
  }

  const file = await req.file();
  if (!file) {
    return reply.code(400).send({ error: 'no_file', message: 'Keine Datei gefunden.' });
  }
  const fileBuffer = await file.toBuffer();

  const result = await processBelegUpload(
    { db: req.server.db, s3: req.server.s3, logger: req.log },
    {
      tenantId: r.session.tenant_id,
      sourceChannel: 'web_chat',
      fileBuffer,
      filename: file.filename || 'beleg',
      uploadedByUserId: null,
    },
  );
  if (!result.ok) {
    return reply.code(result.code).send(result.body);
  }

  const message = await insertChatMessage(req.server.db, {
    tenantId: r.session.tenant_id,
    sessionId: r.session.id,
    senderType: 'customer',
    senderUserId: null,
    body: null,
    belegId: result.beleg.id,
  });

  return reply.code(result.isDuplicate ? 200 : 201).send({
    beleg_id: result.beleg.id,
    status: result.beleg.status,
    message: toPublicChatMessage(message),
    ...(result.isDuplicate ? { is_duplicate: true } : {}),
  });
}
