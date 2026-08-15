import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Users, UserPlus, Trash2, Shield, Info, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getMembers, inviteMember, removeMember, getSubscription } from '../../services/subscriptionService.js';
import api from '../../services/api.js';
import { formatDate } from '../../utils/helpers.js';

// ── Role Definitions (what each role can do) ────────────────────────────────
const ROLES = [
  {
    value: 'tenant_member',
    label: 'Member',
    color: 'text-text-muted',
    badgeClass: 'bg-surface-secondary text-text-muted border border-border',
    description: 'Standard team member',
    permissions: [
      'View dashboard & analytics',
      'Access workspace features',
      'Use AI assistant (if plan includes it)',
    ],
    restricted: [
      'Cannot manage billing or subscriptions',
      'Cannot invite or remove members',
      'Cannot change settings',
    ],
  },
  {
    value: 'finance_member',
    label: 'Finance',
    color: 'text-success',
    badgeClass: 'bg-success/10 text-success border border-success/20',
    description: 'Billing & finance access only',
    permissions: [
      'View and download invoices',
      'Manage payment methods',
      'View billing history',
    ],
    restricted: [
      'Cannot access team/member settings',
      'Cannot change plan or subscription',
      'Limited dashboard access',
    ],
  },
  {
    value: 'tenant_admin',
    label: 'Admin',
    color: 'text-primary',
    badgeClass: 'bg-primary/10 text-primary border border-primary/20',
    description: 'Full workspace admin',
    permissions: [
      'Full access to all features',
      'Invite and remove members',
      'Change member roles',
      'Manage subscriptions & billing',
      'Access all settings',
    ],
    restricted: [],
    cannotInvite: true, // must use changeMemberRole to promote to admin
  },
];

const getRoleDef = (roleValue) => ROLES.find((r) => r.value === roleValue) || ROLES[0];

export default function MembersPage() {
  const user     = useSelector((s) => s.auth.user);
  const tenantId = user?.tenantId;
  const isAdmin  = user?.role === 'tenant_admin';

  const [members,      setMembers]      = useState([]);
  const [sub,          setSub]          = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [roleTarget,   setRoleTarget]   = useState(null); // { member, newRole }
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,  setError]  = useState('');
  const [toast,  setToast]  = useState('');

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    defaultValues: { email: '', role: 'tenant_member' },
  });
  const selectedRole = watch('role');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [memRes, subRes] = await Promise.all([getMembers(tenantId), getSubscription(tenantId).catch(() => null)]);
      setMembers(memRes.data.data?.members || memRes.data.data || []);
      const raw = subRes?.data?.data;
      setSub(raw?.subscription ?? raw ?? null);
    } catch {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  // Invite a new member
  const onInvite = async (data) => {
    setActionLoading(true);
    setError('');
    try {
      await inviteMember(tenantId, { email: data.email, role: data.role });
      showToast(`✅ Invite sent to ${data.email} as ${getRoleDef(data.role).label}`);
      setShowModal(false);
      reset();
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Invite failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Remove a member
  const onRemove = async () => {
    if (!removeTarget) return;
    setActionLoading(true);
    try {
      await removeMember(tenantId, removeTarget._id);
      showToast(`✅ ${removeTarget.firstName || removeTarget.name} removed from workspace.`);
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Remove failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Change a member's role
  const onChangeRole = async () => {
    if (!roleTarget) return;
    setActionLoading(true);
    try {
      await api.patch(`/tenants/${tenantId}/members/${roleTarget.member._id}/role`, { role: roleTarget.newRole });
      showToast(`✅ Role updated to ${getRoleDef(roleTarget.newRole).label}`);
      setRoleTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Role change failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Seat stats
  const usedSeats  = members.length;
  const totalSeats = sub?.planVersionId?.features?.max_seats
                  || sub?.planId?.features?.max_seats
                  || 0;
  const seatPct    = totalSeats > 0 ? Math.min(100, Math.round((usedSeats / totalSeats) * 100)) : 0;
  const atLimit    = totalSeats > 0 && usedSeats >= totalSeats;

  return (
    <DashboardLayout title="Team Members">
      <div className="max-w-[1000px] font-sans text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
              <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Users size={18} className="text-primary" />
              </div>
              Team Members
            </h1>
            <p className="m-0 mt-1.5 text-sm text-text-muted">Manage who has access to your workspace</p>
          </div>
          <div className="flex gap-2.5 items-center">
            <button
              className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors flex items-center gap-1.5"
              onClick={() => setShowRoleInfo(!showRoleInfo)}
              title="Role access guide"
            >
              <Info size={15} /> Roles
            </button>
            {isAdmin && (
              <button
                className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                onClick={() => setShowModal(true)}
                disabled={atLimit}
                title={atLimit ? 'Seat limit reached — upgrade your plan to add more members' : ''}
              >
                <UserPlus size={16} /> Invite Member
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium cursor-pointer" onClick={() => setError('')}>{error}</div>}
        {toast && <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm font-medium">{toast}</div>}

        {/* Role Access Guide */}
        {showRoleInfo && (
          <div className="bg-surface border border-border rounded-2xl p-6 mb-6 shadow-sm">
            <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2 m-0">
              <Shield size={16} className="text-primary" />
              Role Access Guide
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              {ROLES.map((role) => (
                <div key={role.value} className="bg-surface-secondary/40 border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${role.badgeClass}`}>{role.label}</span>
                    {role.cannotInvite && (
                      <span className="text-[10px] text-text-muted">(promote via Change Role)</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mb-2.5">{role.description}</p>
                  <ul className="list-none p-0 m-0 text-xs space-y-1">
                    {role.permissions.map((p) => (
                      <li key={p} className="text-success flex items-start gap-1"><span className="shrink-0 mt-0.5">✓</span> <span>{p}</span></li>
                    ))}
                    {role.restricted.map((r) => (
                      <li key={r} className="text-danger flex items-start gap-1"><span className="shrink-0 mt-0.5">✗</span> <span>{r}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seat Usage */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-2.5">
            <span className="font-semibold text-sm">Team Seat Usage</span>
            <span className="text-[13px] text-text-muted">
              {usedSeats} / {totalSeats || '∞'} seats used
            </span>
          </div>
          {totalSeats > 0 && (
            <>
              <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${seatPct >= 100 ? 'bg-danger' : seatPct >= 80 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
              {atLimit && (
                <p className="text-xs text-danger mt-2">
                  You've reached your seat limit.{' '}
                  <a href="/dashboard/settings/subscription" className="text-danger underline hover:text-danger/80">
                    Upgrade your plan
                  </a>{' '}
                  to add more members.
                </p>
              )}
            </>
          )}
        </div>

        {/* Members Table */}
        <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary/50 border-b border-border">
                  {['Name', 'Email', 'Role', 'Status', 'Last Login', isAdmin && 'Actions'].filter(Boolean).map((h) => (
                    <th key={h} className="px-4 py-3.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td colSpan={isAdmin ? 6 : 5} className="p-0">
                        <div className="h-16 bg-surface-secondary/40 animate-pulse my-0.5" />
                      </td>
                    </tr>
                  ))
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="text-center py-16 text-text-muted">
                      <Users size={48} className="mx-auto mb-3 text-text-muted/40" />
                      <p className="text-sm m-0">No members yet. Invite someone to get started.</p>
                    </td>
                  </tr>
                ) : (
                  members.map((m) => {
                    const roleDef   = getRoleDef(m.role);
                    const isSelf    = m._id === user?.id || m._id === user?._id;
                    const isOwner   = m.role === 'tenant_admin' && isSelf;
                    return (
                      <tr key={m._id} className="border-b border-border transition-colors hover:bg-surface-secondary/30 last:border-0">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                              {(m.firstName?.[0] || m.name?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <span className="font-semibold text-sm">
                                {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.name || 'Unknown'}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] text-text-muted ml-1.5">(you)</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-text-muted text-[13px]">
                          {m.email}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${roleDef.badgeClass}`}>
                            {roleDef.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                            m.status === 'active' ? 'bg-success/10 text-success border border-success/20' : 
                            m.status === 'invited' ? 'bg-warning/10 text-warning border border-warning/20' : 
                            'bg-surface-secondary text-text-muted border border-border'
                          }`}>
                            {m.status === 'invited' ? 'Pending' : m.status === 'active' ? 'Active' : m.status || 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-text-muted text-[13px]">
                          {m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Never'}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {!isOwner ? (
                              <div className="flex gap-1.5 items-center">
                                <select
                                  value={m.role}
                                  onChange={(e) => {
                                    if (e.target.value !== m.role) {
                                      setRoleTarget({ member: m, newRole: e.target.value });
                                    }
                                  }}
                                  className="text-xs px-1.5 py-1 bg-surface border border-border rounded text-text-primary cursor-pointer hover:border-primary transition-colors outline-none"
                                  title="Change role"
                                >
                                  <option value="tenant_admin">Admin</option>
                                  <option value="tenant_member">Member</option>
                                  <option value="finance_member">Finance</option>
                                </select>
                                <button
                                  className="p-1.5 rounded bg-transparent border-none text-danger hover:bg-danger/10 cursor-pointer transition-colors flex items-center justify-center"
                                  onClick={() => setRemoveTarget(m)}
                                  title="Remove member"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-text-muted/50 text-xs">Owner</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Invite Modal ─────────────────────────────────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => { setShowModal(false); reset(); }}>
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-[440px] p-6 text-text-primary" onClick={(e) => e.stopPropagation()}>
              <h3 className="m-0 text-xl font-bold mb-2">Invite Team Member</h3>
              <p className="text-sm text-text-muted mb-5">
                They'll receive an email invitation to join your workspace.
              </p>
              <form onSubmit={handleSubmit(onInvite)}>
                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-text-primary mb-1.5">Email Address *</label>
                  <input
                    id="invite-email"
                    type="email"
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-surface text-text-primary text-[13px] outline-none transition-colors ${errors.email ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'}`}
                    placeholder="colleague@company.com"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                    })}
                  />
                  {errors.email && <span className="text-xs text-danger mt-1 block">{errors.email.message}</span>}
                </div>

                <div className="mb-6">
                  <label className="block text-[13px] font-semibold text-text-primary mb-1.5">Role *</label>
                  <select
                    id="invite-role"
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-surface text-text-primary text-[13px] outline-none transition-colors cursor-pointer ${errors.role ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger' : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'}`}
                    {...register('role', { required: 'Role is required' })}
                  >
                    <option value="tenant_member">Member — Standard team access</option>
                    <option value="finance_member">Finance — Billing &amp; invoices only</option>
                  </select>
                  {errors.role && <span className="text-xs text-danger mt-1 block">{errors.role.message}</span>}
                  
                  {selectedRole && (
                    <div className="mt-2.5 p-3 rounded-lg bg-surface-secondary/40 text-xs border-l-2" style={{ borderColor: getRoleDef(selectedRole).color === 'text-text-muted' ? 'var(--color-text-muted)' : `var(--color-${getRoleDef(selectedRole).color.replace('text-', '')})` }}>
                      <strong className={getRoleDef(selectedRole).color}>
                        {getRoleDef(selectedRole).label}
                      </strong>
                      <ul className="mt-1.5 mb-0 pl-4 text-text-muted list-disc">
                        {getRoleDef(selectedRole).permissions.map((p) => (
                          <li key={p} className="mb-0.5">{p}</li>
                        ))}
                      </ul>
                      {getRoleDef(selectedRole).restricted.length > 0 && (
                        <p className="mt-1.5 mb-0 text-danger italic">
                          Note: {getRoleDef(selectedRole).restricted[0]}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    onClick={() => { setShowModal(false); reset(); }}
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed" disabled={actionLoading}>
                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <><UserPlus size={15} /> Send Invite</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Change Role Confirmation Modal ───────────────────────────────── */}
        {roleTarget && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setRoleTarget(null)}>
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-[400px] p-6 text-text-primary" onClick={(e) => e.stopPropagation()}>
              <h3 className="m-0 text-xl font-bold mb-2">Change Role</h3>
              <p className="text-[13px] text-text-muted mb-4 leading-relaxed">
                Change <strong>{roleTarget.member.firstName || roleTarget.member.name}</strong>'s role from{' '}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getRoleDef(roleTarget.member.role).badgeClass}`}>
                  {getRoleDef(roleTarget.member.role).label}
                </span>{' '}
                to{' '}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getRoleDef(roleTarget.newRole).badgeClass}`}>
                  {getRoleDef(roleTarget.newRole).label}
                </span>
                ?
              </p>
              <p className="text-xs text-text-muted mb-5 leading-relaxed">
                {getRoleDef(roleTarget.newRole).description}. Their access will update immediately.
              </p>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setRoleTarget(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button className="px-4 py-2 rounded-lg border-none bg-primary hover:bg-primary-hover text-white cursor-pointer text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 min-w-[120px] disabled:opacity-70 disabled:cursor-not-allowed" onClick={onChangeRole} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Remove Confirmation Modal ─────────────────────────────────────── */}
        {removeTarget && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setRemoveTarget(null)}>
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-[400px] p-6 text-text-primary" onClick={(e) => e.stopPropagation()}>
              <h3 className="m-0 text-xl font-bold mb-2">Remove {removeTarget.firstName || removeTarget.name}?</h3>
              <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
                They will immediately lose access to this workspace. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded-lg border border-border bg-transparent text-text-muted hover:text-text-primary hover:border-text-muted cursor-pointer text-[13px] font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed" onClick={() => setRemoveTarget(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button className="px-4 py-2 rounded-lg border-none bg-danger hover:bg-red-600 text-white cursor-pointer text-[13px] font-bold transition-colors flex items-center justify-center min-w-[120px] disabled:opacity-70 disabled:cursor-not-allowed" onClick={onRemove} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : 'Remove Member'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
