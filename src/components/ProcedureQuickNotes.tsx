import React, { useEffect, useState } from 'react';
import { StickyNote, Trash2 } from 'lucide-react';
import type { User } from 'firebase/auth';
import { addCaseNote, deleteCaseNote } from '../services/firestoreService';
import type { CaseNote } from '../types/domain';

export const MAX_NOTE_LENGTH = 2000;

interface ProcedureQuickNotesProps {
  caseId: string;
  procedureId: string;
  procedureTitle?: string;
  user: User;
  isOwner: boolean;
  isAdmin?: boolean;
  canCollaborate: boolean;
  notes: CaseNote[];
  compact?: boolean;
  autoFocus?: boolean;
  onNoteSaved?: () => void;
  onNoteDeleted?: () => void;
  onOpenProcedureDetail?: () => void;
}

export const ProcedureQuickNotes: React.FC<ProcedureQuickNotesProps> = ({
  caseId,
  procedureId,
  procedureTitle,
  user,
  isOwner,
  isAdmin = false,
  canCollaborate,
  notes,
  compact = false,
  autoFocus = false,
  onNoteSaved,
  onNoteDeleted,
  onOpenProcedureDetail,
}) => {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
  }, [procedureId]);

  const procedureNotes = notes.filter((n) => n.procedureId === procedureId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!canCollaborate || !trimmed || saving) return;

    setSaving(true);
    setErrorMsg(null);
    try {
      await addCaseNote(caseId, user, procedureId, trimmed);
      setText('');
      onNoteSaved?.();
    } catch {
      setErrorMsg('No se pudo guardar la nota en Firestore. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (deletingId) return;
    setDeletingId(noteId);
    setErrorMsg(null);
    try {
      await deleteCaseNote(caseId, noteId);
      onNoteDeleted?.();
    } catch {
      setErrorMsg('No se pudo eliminar la nota. Inténtalo de nuevo.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatNoteDate = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3.5'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-4 h-4 text-[#8F754B] shrink-0" />
          <h4 className="text-sm font-semibold text-[#141518] truncate">
            {procedureTitle ? `Notas rápidas · ${procedureTitle}` : 'Notas rápidas del trámite'}
          </h4>
        </div>
        {onOpenProcedureDetail && (
          <button
            type="button"
            onClick={onOpenProcedureDetail}
            className="text-xs font-medium text-[#7D633A] hover:underline whitespace-nowrap shrink-0 min-h-[36px] px-1"
          >
            Ver ficha completa
          </button>
        )}
      </div>

      {canCollaborate && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-1.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              autoFocus={autoFocus}
              placeholder="Ej. Nº expediente, teléfono de contacto o recordatorio breve..."
              aria-label="Añadir nota rápida al trámite"
              className="flex-1 min-h-[44px] rounded-xl border border-[#D8D0C2] bg-[#FAF8F5] px-3.5 text-sm text-[#141518] placeholder:text-[#7A7D85] focus:outline-none focus:ring-2 focus:ring-[#8F754B]/40 focus:border-[#8F754B]"
            />
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-[#141518] text-[#F6F4EF] text-xs font-semibold hover:bg-[#25272D] disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>
          {text.length > MAX_NOTE_LENGTH - 300 && (
            <p className="text-[11px] text-[#666A73] font-mono-num text-right">
              {text.length}/{MAX_NOTE_LENGTH} caracteres
            </p>
          )}
        </form>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          {errorMsg}
        </div>
      )}

      {procedureNotes.length === 0 ? (
        <p className="text-xs text-[#666A73]">
          Aún no hay notas rápidas en este trámite.
        </p>
      ) : (
        <div className="divide-y divide-[#EFECE5] rounded-xl bg-[#FAF8F5] px-3.5">
          {procedureNotes.map((note) => {
            const canDelete = isOwner || isAdmin || note.authorUid === user.uid;
            const dateLabel = formatNoteDate(note.createdAt);
            return (
              <div
                key={note.id}
                className="py-2.5 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#1C1E22] whitespace-pre-wrap break-words leading-relaxed">
                    {note.text}
                  </p>
                  <p className="text-[11px] text-[#666A73] mt-1 font-mono-num">
                    {note.authorName}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="min-h-[44px] min-w-[44px] -my-1.5 -mr-1.5 flex items-center justify-center rounded-lg text-[#7A7D85] hover:text-red-700 hover:bg-red-50/70 disabled:opacity-40 shrink-0 transition-colors"
                    aria-label="Eliminar nota"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
