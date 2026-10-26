import React, { useState } from 'react';
import { StudentProfile } from '../types/pipboy';
import { pipAudio } from '../utils/audio';
import {
  User,
  GraduationCap,
  Building,
  Users,
  Mail,
  FileText,
  Save,
  CheckCircle,
  IdCard
} from 'lucide-react';

interface TabProfileProps {
  profile: StudentProfile;
  onUpdateProfile: (updated: StudentProfile) => void;
}

export const TabProfile: React.FC<TabProfileProps> = ({
  profile,
  onUpdateProfile
}) => {
  const [formData, setFormData] = useState<StudentProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pipAudio.playSuccess();
    onUpdateProfile(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-black/50 p-4 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="text-[var(--crt-phosphor-bright)]" size={24} />
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              КАРТОЧКА СТУДЕНТА (ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ)
            </div>
            <div className="text-xs opacity-75">
              Введите ваши реальные академические данные для персонализации рабочего пространства
            </div>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--crt-phosphor-bright)] font-bold animate-fade-in">
            <CheckCircle size={15} /> СОХРАНЕНО
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="border border-[var(--crt-phosphor-dim)] bg-black/40 p-5 rounded-lg space-y-4 text-xs font-mono">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
              <User size={13} /> ФИО СТУДЕНТА:
            </label>
            <input
              type="text"
              placeholder="Например: Иванов Иван Иванович"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
              <IdCard size={13} /> НОМЕР СТУДЕНЧЕСКОГО БИЛЕТА / ID:
            </label>
            <input
              type="text"
              placeholder="Например: СТ-2024-0481"
              value={formData.studentId}
              onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
              className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
              <Building size={13} /> УНИВЕРСИТЕТ / ВУЗ:
            </label>
            <input
              type="text"
              placeholder="Например: МГУ им. М.В. Ломоносова"
              value={formData.university}
              onChange={(e) => setFormData({ ...formData, university: e.target.value })}
              className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
              <GraduationCap size={13} /> ФАКУЛЬТЕТ / КАФЕДРА:
            </label>
            <input
              type="text"
              placeholder="Например: Исторический / Филологический факультет (Кафедра историографии)"
              value={formData.faculty}
              onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
              className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
                <Users size={13} /> ГРУППА:
              </label>
              <input
                type="text"
                placeholder="Б-21-04"
                value={formData.group}
                onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
              />
            </div>

            <div>
              <label className="block mb-1 font-bold text-[var(--crt-phosphor)]">КУРС:</label>
              <input
                type="number"
                min={1}
                max={6}
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: Number(e.target.value) || 1 })}
                className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
              <Mail size={13} /> УЧЕБНЫЙ EMAIL:
            </label>
            <input
              type="email"
              placeholder="student@university.edu"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded"
            />
          </div>
        </div>

        <div>
          <label className="block mb-1 font-bold text-[var(--crt-phosphor)] flex items-center gap-1.5">
            <FileText size={13} /> ЗАМЕТКИ, ТЕМА ДИПЛОМА ИЛИ ДЕДЛАЙНЫ:
          </label>
          <textarea
            rows={3}
            placeholder="Запишите тему курсовой, научного руководителя или важные даты текущей сессии..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 text-[var(--crt-phosphor)] outline-none rounded resize-none"
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-[var(--crt-phosphor-dim)]/50">
          <button
            type="submit"
            className="px-5 py-2.5 bg-[var(--crt-phosphor)] text-black font-extrabold rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors flex items-center gap-1.5 uppercase tracking-wider"
          >
            <Save size={14} /> СОХРАНИТЬ ДАННЫЕ ПРОФИЛЯ
          </button>
        </div>
      </form>
    </div>
  );
};
