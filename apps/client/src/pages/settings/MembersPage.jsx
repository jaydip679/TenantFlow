import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Users, UserPlus, Trash2, Shield, ChevronDown, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getMembers, inviteMember, removeMember } from '../../services/subscriptionService.js';
import { getSubscription } from '../../services/subscriptionService.js';
import api from '../../services/api.js';
import { formatDate } from '../../utils/helpers.js';

// ── Role Definitions (what each role can do) ────────────────────────────────
const ROLES = [
  {
    value: 'tenant_member',
    label: 'Member',
    color: 'var(--color-text-muted)',
    badgeClass: 'badge badge-neutral',
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
    color: '#34d399',
    badgeClass: 'badge badge-success',
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
    color: '#a78bfa',
    badgeClass: 'badge badge-purple',
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
      showToast(`${removeTarget.firstName || removeTarget.name} removed from workspace.`);
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
      showToast(`Role updated to ${getRoleDef(roleTarget.newRole).label}`);
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
    <DashboardLayout>
      <div style={{ maxWidth: 1000 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <Users size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle' }} />
              Team Members
            </h1>
            <p className="page-subtitle">Manage who has access to your workspace</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setShowRoleInfo(!showRoleInfo)}
              title="Role access guide"
            >
              <Info size={15} /> Roles
            </button>
            {isAdmin && (
              <button
                className="btn-primary"
                onClick={() => setShowModal(true)}
                disabled={atLimit}
                title={atLimit ? 'Seat limit reached — upgrade your plan to add more members' : ''}
              >
                <UserPlus size={16} /> Invite Member
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-danger" onClick={() => setError('')}>{error}</div>}
        {toast && <div className="alert alert-success">{toast}</div>}

        {/* Role Access Guide */}
        {showRoleInfo && (
          <div className="card" style={{ marginBottom: 24, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} style={{ color: 'var(--color-primary)' }} />
              Role Access Guide
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {ROLES.map((role) => (
                <div key={role.value} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className={role.badgeClass}>{role.label}</span>
                    {role.cannotInvite && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(promote via Change Role)</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>{role.description}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
                    {role.permissions.map((p) => (
                      <li key={p} style={{ color: '#4ade80', marginBottom: 4 }}>✓ {p}</li>
                    ))}
                    {role.restricted.map((r) => (
                      <li key={r} style={{ color: '#f87171', marginBottom: 4 }}>✗ {r}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seat Usage */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>Team Seat Usage</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              {usedSeats} / {totalSeats || '∞'} seats used
            </span>
          </div>
          {totalSeats > 0 && (
            <>
              <div className="progress-bar-track">
                <div
                  className={`progress-bar-fill${seatPct >= 100 ? ' danger' : seatPct >= 80 ? ' warning' : ''}`}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
              {atLimit && (
                <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>
                  You've reached your seat limit.{' '}
                  <a href="/dashboard/settings/subscription" style={{ color: 'inherit', textDecoration: 'underline' }}>
                    Upgrade your plan
                  </a>{' '}
                  to add more members.
                </p>
              )}
            </>
          )}
        </div>

        {/* Members Table */}
        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
            </div>
          ) : members.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <Users size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p>No members yet. Invite someone to get started.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const roleDef   = getRoleDef(m.role);
                  const isSelf    = m._id === user?.id || m._id === user?._id;
                  const isOwner   = m.role === 'tenant_admin' && isSelf;
                  return (
                    <tr key={m._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--color-primary), hsl(220,90%,60%))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0,
                          }}>
                            {(m.firstName?.[0] || m.name?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>
                              {m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.name || 'Unknown'}
                            </span>
                            {isSelf && (
                              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 6 }}>(you)</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{m.email}</td>
                      <td>
                        <span className={roleDef.badgeClass}>{roleDef.label}</span>
                      </td>
                      <td>
                        <span className={m.status === 'active' ? 'badge badge-success' : m.status === 'invited' ? 'badge badge-warning' : 'badge badge-neutral'}>
                          {m.status === 'invited' ? 'Pending' : m.status === 'active' ? 'Active' : m.status || 'Active'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Never'}
                      </td>
                      {isAdmin && (
                        <td>
                          {!isOwner ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              {/* Change Role dropdown */}
                              <select
                                value={m.role}
                                onChange={(e) => {
                                  if (e.target.value !== m.role) {
                                    setRoleTarget({ member: m, newRole: e.target.value });
                                  }
                                }}
                                style={{
                                  fontSize: 12, padding: '3px 6px',
                                  background: 'var(--color-surface)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: 6, color: 'var(--color-text)',
                                  cursor: 'pointer',
                                }}
                                title="Change role"
                              >
                                <option value="tenant_admin">Admin</option>
                                <option value="tenant_member">Member</option>
                                <option value="finance_member">Finance</option>
                              </select>
                              <button
                                className="btn-ghost btn-sm"
                                style={{ color: 'var(--color-danger)' }}
                                onClick={() => setRemoveTarget(m)}
                                title="Remove member"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-subtle)', fontSize: 12 }}>Owner</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Invite Modal ─────────────────────────────────────────────────── */}
        {showModal && (
          <div className="modal-overlay" onClick={() => { setShowModal(false); reset(); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <h3 className="modal-title">Invite Team Member</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                They'll receive an email invitation to join your workspace.
              </p>
              <form onSubmit={handleSubmit(onInvite)}>
                {/* Email */}
                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    id="invite-email"
                    type="email"
                    className={`form-input ${errors.email ? 'is-invalid' : ''}`}
                    placeholder="colleague@company.com"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                    })}
                  />
                  {errors.email && <span className="form-error">{errors.email.message}</span>}
                </div>

                {/* Role */}
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select
                    id="invite-role"
                    className="form-input"
                    style={{ cursor: 'pointer' }}
                    {...register('role', { required: 'Role is required' })}
                  >
                    <option value="tenant_member">Member — Standard team access</option>
                    <option value="finance_member">Finance — Billing &amp; invoices only</option>
                  </select>
                  {errors.role && <span className="form-error">{errors.role.message}</span>}
                  {/* Role hint */}
                  {selectedRole && (
                    <div style={{
                      marginTop: 10, padding: '10px 14px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 8, fontSize: 12,
                      borderLeft: `3px solid ${getRoleDef(selectedRole).color}`,
                    }}>
                      <strong style={{ color: getRoleDef(selectedRole).color }}>
                        {getRoleDef(selectedRole).label}
                      </strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: 'var(--color-text-muted)' }}>
                        {getRoleDef(selectedRole).permissions.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                      {getRoleDef(selectedRole).restricted.length > 0 && (
                        <p style={{ marginTop: 6, color: '#f87171', fontStyle: 'italic' }}>
                          Note: {getRoleDef(selectedRole).restricted[0]}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setShowModal(false); reset(); }}
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={actionLoading}>
                    {actionLoading ? <span className="btn-spinner" /> : <><UserPlus size={15} /> Send Invite</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Change Role Confirmation Modal ───────────────────────────────── */}
        {roleTarget && (
          <div className="modal-overlay" onClick={() => setRoleTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <h3 className="modal-title">Change Role</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
                Change <strong>{roleTarget.member.firstName || roleTarget.member.name}</strong>'s role from{' '}
                <span className={getRoleDef(roleTarget.member.role).badgeClass}>
                  {getRoleDef(roleTarget.member.role).label}
                </span>{' '}
                to{' '}
                <span className={getRoleDef(roleTarget.newRole).badgeClass}>
                  {getRoleDef(roleTarget.newRole).label}
                </span>
                ?
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
                {getRoleDef(roleTarget.newRole).description}. Their access will update immediately.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setRoleTarget(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={onChangeRole} disabled={actionLoading}>
                  {actionLoading ? <span className="btn-spinner" /> : 'Confirm Change'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Remove Confirmation Modal ─────────────────────────────────────── */}
        {removeTarget && (
          <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <h3 className="modal-title">Remove {removeTarget.firstName || removeTarget.name}?</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                They will immediately lose access to this workspace. This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setRemoveTarget(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button className="btn-danger" onClick={onRemove} disabled={actionLoading}>
                  {actionLoading ? <span className="btn-spinner" /> : 'Remove Member'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
