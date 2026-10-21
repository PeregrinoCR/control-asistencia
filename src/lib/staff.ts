import { useCallback, useEffect, useState } from 'react';
import type { PermissionId, RoleId, User } from '../data/users';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { ordenarSecciones } from './secciones';

interface StaffRow {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  roles: RoleId[];
  permisos_extra: PermissionId[];
  seccion_guia: string | null;
  activo: boolean;
  usuario_id: string | null;
  horario_trabajo: User['work'];
}

/** Staff of the signed-in user's school, read from and saved to the server. */
export function useStaff() {
  const { school } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    // Signed in but not linked to a school yet: show nothing rather than the sample data.
    if (!school) return setUsers([]);
    const [staff, secs] = await Promise.all([
      supabase.from('personal').select('*').order('nombre'),
      supabase.from('secciones').select('id, nombre').order('nombre'),
    ]);
    if (staff.error || secs.error) return setError((staff.error ?? secs.error)!.message);
    const byId = new Map(secs.data.map((s) => [s.id, s.nombre]));
    setSections(ordenarSecciones(secs.data));
    setUsers(
      (staff.data as StaffRow[]).map((r) => ({
        id: r.id,
        name: r.nombre,
        contact: r.correo ?? r.telefono ?? '',
        roles: r.roles,
        section: r.seccion_guia ? byId.get(r.seccion_guia) : undefined,
        extra: r.permisos_extra,
        active: r.activo,
        lastSeen: r.usuario_id ? 'Cuenta creada' : 'Aún no crea su cuenta',
        work: r.horario_trabajo,
      })),
    );
  }, [school]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toRow = (u: Omit<User, 'id' | 'lastSeen'>) => {
    const isPhone = /^[\d\s+-]+$/.test(u.contact);
    return {
      nombre: u.name,
      correo: isPhone ? null : u.contact.toLowerCase(),
      telefono: isPhone ? u.contact : null,
      roles: u.roles,
      permisos_extra: u.extra,
      seccion_guia: sections.find((s) => s.nombre === u.section)?.id ?? null,
      activo: u.active,
      horario_trabajo: u.work ?? null,
    };
  };

  /** Returns an error message, or '' when saved. */
  const save = async (u: User) => {
    const { error } = await supabase!.from('personal').update(toRow(u)).eq('id', u.id);
    if (!error) await reload();
    return error?.message ?? '';
  };

  const invite = async (u: Omit<User, 'id'>) => {
    const { data, error } = await supabase!
      .from('personal')
      .insert({ ...toRow(u), colegio_id: school!.id })
      .select('id')
      .single();
    if (!error) await reload();
    return { id: data?.id as string | undefined, error: error?.message ?? '' };
  };

  return { live: !!supabase, users, sections: sections.map((s) => s.nombre), error, save, invite };
}
