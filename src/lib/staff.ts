import { useCallback, useEffect, useState } from 'react';
import { PERMISSION_LABEL, ROLES, withRoleOverrides, type PermissionId, type Role, type RoleId, type RoleOverride, type User } from '../data/users';
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
  creado: string | null;
}

/** One line of the change history of the staff and the roles. */
export interface HistoryEntry {
  when: string;
  who: string | null;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any;
}

/** «Hoy 6:12 p. m.», «Ayer 9:40 p. m.» or «30 jun». */
export function whenLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  const time = d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Ayer ${time}`;
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** How long ago, in days, an invitation was made. */
export function daysSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

const diff = <T>(before: T[] = [], after: T[] = []) => ({ added: after.filter((x) => !before.includes(x)), removed: before.filter((x) => !after.includes(x)) });
const roleName = (id: string) => ROLES.find((r) => r.id === id)?.name ?? id;
const permName = (id: string) => PERMISSION_LABEL[id as PermissionId] ?? id;

/** A history entry in plain words. `withName` adds the person it is about (for the school-wide list). */
export function describeChange(e: HistoryEntry, withName = false): string {
  const d = e.detail ?? {};
  const who = withName && d.nombre ? `${d.nombre}: ` : '';
  if (e.action === 'personal.crear') return `${who}Se creó la ficha${d.roles?.length ? ` como ${d.roles.map(roleName).join(' y ')}` : ''}`;
  if (e.action === 'personal.quitar') return `${d.nombre ?? 'Una persona'} salió del personal`;
  if (e.action === 'rol.cambio') {
    const c = diff<string>(d.antes, d.despues);
    const parts = [c.added.length ? `sumó ${c.added.map(permName).join(', ')}` : '', c.removed.length ? `quitó ${c.removed.map(permName).join(', ')}` : ''].filter(Boolean);
    return `Rol ${roleName(d.rol_id)}: ${parts.join('; ') || 'sin cambios en los permisos'}`;
  }
  const a = d.antes ?? {};
  const b = d.despues ?? {};
  const roles = diff<string>(a.roles, b.roles);
  const extra = diff<string>(a.extra, b.extra);
  const parts = [
    ...roles.added.map((r) => `le dio el rol ${roleName(r)}`),
    ...roles.removed.map((r) => `le quitó el rol ${roleName(r)}`),
    ...extra.added.map((p) => `le dio el permiso extra «${permName(p)}»`),
    ...extra.removed.map((p) => `le quitó el permiso extra «${permName(p)}»`),
    a.activo !== b.activo ? (b.activo ? 'reactivó la cuenta' : 'desactivó la cuenta') : '',
    a.seccion !== b.seccion ? (b.seccion ? `la puso a cargo de ${b.seccion}` : 'le quitó la sección a cargo') : '',
    a.nombre !== b.nombre ? `cambió su nombre a ${b.nombre}` : '',
  ].filter(Boolean);
  const text = parts.join('; ');
  return who + (text ? text[0].toUpperCase() + text.slice(1) : 'Actualizó la ficha');
}

/** Staff of the signed-in user's school, read from and saved to the server. */
export function useStaff() {
  const { school } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [roles, setRoles] = useState<Role[]>(ROLES);
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    // Signed in but not linked to a school yet: show nothing rather than the sample data.
    if (!school) return setUsers([]);
    const [staff, secs, access, rol] = await Promise.all([
      supabase.from('personal').select('*').order('nombre'),
      supabase.from('secciones').select('id, nombre').order('nombre'),
      supabase.rpc('ultimo_acceso'),
      supabase.from('roles_colegio').select('rol_id, permisos'),
    ]);
    if (staff.error || secs.error) return setError((staff.error ?? secs.error)!.message);
    const byId = new Map(secs.data.map((s) => [s.id, s.nombre]));
    setSections(ordenarSecciones(secs.data));
    // Before the 0021 update the last sign-in and the school's role changes simply are not there.
    const last = new Map(((access.error ? [] : access.data) as Array<{ personal_id: string; ultimo: string | null }>).map((a) => [a.personal_id, a.ultimo]));
    const overrides = (rol.error ? [] : rol.data) as RoleOverride[];
    setRoles(withRoleOverrides(overrides));
    setOverridden(new Set(overrides.map((o) => o.rol_id)));
    setUsers(
      (staff.data as StaffRow[]).map((r) => {
        const login = last.get(r.id) ?? null;
        return {
          id: r.id,
          name: r.nombre,
          contact: r.correo ?? r.telefono ?? '',
          roles: r.roles,
          section: r.seccion_guia ? byId.get(r.seccion_guia) : undefined,
          extra: r.permisos_extra,
          active: r.activo,
          account: !!r.usuario_id,
          invitedAt: r.creado ?? undefined,
          lastLogin: login,
          lastSeen: !r.usuario_id ? 'Aún no crea su cuenta' : login ? whenLabel(login) : 'Cuenta creada',
          work: r.horario_trabajo,
        };
      }),
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

  /** Removes the person from the staff. Their sign-in account stays, without access. Returns an error message, or ''. */
  const remove = async (id: string) => {
    const { error } = await supabase!.from('personal').delete().eq('id', id);
    if (!error) await reload();
    return error?.message ?? '';
  };

  /** Saves what each changed role can do for this school; `null` goes back to the default. Returns an error message, or ''. */
  const saveRoles = async (changes: Partial<Record<RoleId, PermissionId[] | null>>) => {
    const db = supabase!;
    for (const [rol, perms] of Object.entries(changes)) {
      const { error } = perms
        ? await db.from('roles_colegio').upsert({ colegio_id: school!.id, rol_id: rol, permisos: perms }, { onConflict: 'colegio_id,rol_id' })
        : await db.from('roles_colegio').delete().eq('colegio_id', school!.id).eq('rol_id', rol);
      if (error) return error.message;
    }
    await reload();
    return '';
  };

  /** Change history of one person, or of the whole staff when no id is given. */
  const history = useCallback(async (id?: string): Promise<HistoryEntry[] | null> => {
    const { data, error } = await supabase!.rpc('historial_personal', { persona: id ?? null });
    if (error) return null;
    return (data as Array<{ cuando: string; quien: string | null; accion: string; detalle: unknown }>).map((r) => ({ when: r.cuando, who: r.quien, action: r.accion, detail: r.detalle }));
  }, []);

  return { live: !!supabase, users, sections: sections.map((s) => s.nombre), roles, overridden, error, save, invite, remove, saveRoles, history, school };
}
