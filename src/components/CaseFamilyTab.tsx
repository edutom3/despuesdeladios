import React, { useState } from 'react';
import { Copy, Lock, Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { auth } from '../firebase';
import {
  createFamilyInvitation,
  removeCaseMember,
  revokeFamilyInvitation,
  updateMemberPermission,
} from '../services/firestoreService';
import type {
  BereavementCase,
  CaseMember,
  FamilyInvitation,
  PersonalizedProcedure,
} from '../types/domain';

interface CaseFamilyTabProps {
  bereavementCase: BereavementCase;
  members: CaseMember[];
  invitations: FamilyInvitation[];
  procedures: PersonalizedProcedure[];
  isOwner: boolean;
  onOpenUnlock: () => void;
}

export const CaseFamilyTab: React.FC<CaseFamilyTabProps> = ({
  bereavementCase,
  members,
  invitations,
  procedures,
  isOwner,
  onOpenUnlock,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'collaborate' | 'view'>('collaborate');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bereavementCase.unlocked) {
      onOpenUnlock();
      return;
    }
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const inv = await createFamilyInvitation(bereavementCase, inviteEmail, inviteRole);
      const inviteUrl = `${window.location.origin}/?invite=${inv.id}`;
      const token = await auth.currentUser?.getIdToken();
      const resp = await fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          to: inv.invitedEmail,
          subject: `${bereavementCase.ownerName} te ha invitado al caso de ${bereavementCase.deceasedName}`,
          bodyText:
            `Hola,\n\n${bereavementCase.ownerName} te ha invitado a colaborar en el caso de ${bereavementCase.deceasedName} en «Después del adiós».\n\n` +
            `Permiso asignado: ${inv.role === 'collaborate' ? 'Colaborar' : 'Solo ver'}.\n\n` +
            `Abre este enlace para entrar:\n${inviteUrl}\n`,
          kind: 'invite',
          appOrigin: window.location.origin,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { dispatched?: string; error?: string };
      setInviteEmail('');
      setStatusMsg(
        resp.ok && data.dispatched === 'sent'
          ? `Invitación guardada y correo enviado a ${inv.invitedEmail}.`
          : data.error
          ? `Invitación creada, aunque el envío automático falló (${data.error}). Copia el enlace de abajo para enviárselo a ${inv.invitedEmail}.`
          : `Invitación creada. Copia el enlace de abajo para enviárselo por WhatsApp o correo a ${inv.invitedEmail}.`
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'No se pudo crear la invitación.');
    } finally {
      setBusy(false);
    }
  };

  const unassignedProcs = procedures.filter((p) => !bereavementCase.taskStates[p.id]?.assigneeUid);

  return (
    <div className="space-y-6">
      {!bereavementCase.unlocked && (
        <div className="rounded-2xl border border-[#D6C3A5] bg-[#F7F2E8] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#4F3D22]">
              Desbloquea el caso para invitar a tu familia
            </p>
            <p className="text-xs text-[#6B532E] mt-1">
              Con un único pago de 19 €, toda la familia puede repartirse trámites, notas y
              documentos.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenUnlock}
            className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-semibold inline-flex items-center gap-2 shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-[#D6C3A5]" />
            <span>Desbloquear caso</span>
          </button>
        </div>
      )}

      {/* Invite Form (Owner only) */}
      {isOwner && (
        <form
          onSubmit={handleSendInvite}
          className="rounded-2xl bg-white border border-[#E7E2D8] p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#141518]">
              Invitar a un familiar
            </h2>
            <p className="mt-1 text-sm text-[#5B5E65]">
              Elige si la persona podrá colaborar (marcar hechos, encargarse de trámites, subir
              documentos y escribir notas) o solo ver el avance.
            </p>
          </div>

          <div className="grid sm:grid-cols-12 gap-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Correo electrónico de tu familiar"
              className="sm:col-span-6 min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-4 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'collaborate' | 'view')}
              className="sm:col-span-3 min-h-[48px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-sm"
            >
              <option value="collaborate">Colaborar</option>
              <option value="view">Solo ver</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="sm:col-span-3 min-h-[48px] rounded-xl bg-[#141518] text-[#F6F4EF] text-sm font-semibold hover:bg-[#25272D] inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4 text-[#D6C3A5]" />
              <span>{busy ? 'Invitando...' : 'Enviar invitación'}</span>
            </button>
          </div>

          {statusMsg && (
            <p className="text-xs sm:text-sm text-[#4F3D22] bg-[#F7F2E8] border border-[#D6C3A5] rounded-xl px-4 py-2.5">
              {statusMsg}
            </p>
          )}
        </form>
      )}

      {/* Pending Invitations */}
      {isOwner && invitations.filter((i) => i.status === 'pending').length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#141518]">Invitaciones pendientes</h3>
          {invitations
            .filter((i) => i.status === 'pending')
            .map((inv) => {
              const link = `${window.location.origin}/?invite=${inv.id}`;
              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-[#EFECE5] bg-[#FAF8F5] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[#141518]">{inv.invitedEmail}</p>
                    <p className="text-xs text-[#666A73]">
                      Permiso: {inv.role === 'collaborate' ? 'Colaborar' : 'Solo ver'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(link);
                        setCopiedId(inv.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className="min-h-[38px] px-3 rounded-lg border border-[#D8D0C2] bg-white text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedId === inv.id ? 'Enlace copiado' : 'Copiar enlace'}</span>
                    </button>
                    <a
                      href={`mailto:${encodeURIComponent(inv.invitedEmail)}?subject=${encodeURIComponent(
                        `Invitación al caso de ${bereavementCase.deceasedName}`
                      )}&body=${encodeURIComponent(`Abre este enlace para entrar al caso: ${link}`)}`}
                      className="min-h-[38px] px-3 rounded-lg border border-[#D8D0C2] bg-white text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Correo</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void revokeFamilyInvitation(inv.id)}
                      className="min-h-[38px] px-3 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Anular
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Members List */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#8F754B]" />
          <h3 className="text-base font-semibold text-[#141518]">
            Personas en este caso ({members.length})
          </h3>
        </div>

        <div className="divide-y divide-[#EFECE5]">
          {members.map((m) => (
            <div
              key={m.uid}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium text-[#141518]">{m.displayName}</p>
                <p className="text-xs text-[#666A73]">
                  {m.email} ·{' '}
                  {m.role === 'owner'
                    ? 'Titular del caso'
                    : m.role === 'collaborate'
                    ? 'Puede colaborar'
                    : 'Solo ver'}
                </p>
              </div>

              {isOwner && m.role !== 'owner' && (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      void updateMemberPermission(
                        bereavementCase,
                        m.uid,
                        e.target.value as 'collaborate' | 'view'
                      )
                    }
                    className="min-h-[40px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3 text-xs font-medium"
                  >
                    <option value="collaborate">Colaborar</option>
                    <option value="view">Solo ver</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void removeCaseMember(bereavementCase, m.uid)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#D8D0C2] text-[#7A7D85] hover:text-red-700 hover:bg-red-50"
                    aria-label={`Quitar a ${m.displayName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Task Distribution Summary */}
      <div className="rounded-2xl bg-white border border-[#E7E2D8] p-5 space-y-4">
        <h3 className="text-base font-semibold text-[#141518]">Reparto de trámites</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {members.map((m) => {
            const assigned = procedures.filter(
              (p) => bereavementCase.taskStates[p.id]?.assigneeUid === m.uid
            );
            return (
              <div key={m.uid} className="rounded-xl border border-[#EFECE5] bg-[#FAF8F5] p-4">
                <p className="text-sm font-semibold text-[#141518]">{m.displayName}</p>
                <p className="text-xs text-[#666A73] mt-0.5 font-mono-num">
                  {assigned.length} {assigned.length === 1 ? 'trámite asignado' : 'trámites asignados'}
                </p>
                {assigned.length > 0 && (
                  <ul className="mt-2.5 space-y-1 text-xs text-[#45484F]">
                    {assigned.map((p) => (
                      <li key={p.id}>
                        {bereavementCase.taskStates[p.id]?.done ? '✓ ' : '• '}
                        {p.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[#666A73] font-mono-num">
          Trámites sin asignar todavía: {unassignedProcs.length}
        </p>
      </div>
    </div>
  );
};
