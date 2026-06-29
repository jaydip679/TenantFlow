import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { getMembers, inviteMember, removeMember } from '../../services/subscriptionService.js';
import { getSubscription } from '../../services/subscriptionService.js';
import { formatDate, seatUtilizationPct } from '../../utils/helpers.js';

export default function MembersPage() {
  const user     = useSelector((s) => s.auth.user);
  const tenantId = user?.tenantId;

  const [members,   setMembers]   = useState([]);
  const [sub,       setSub]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,  setError]  = useState('');
  const [toast,  setToast]  = useState('');

  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [memRes, subRes] = await Promise.all([getMembers(tenantId), getSubscription(tenantId)]);
      setMembers(memRes.data.data?.members || memRes.data.data || []);
      setSub(subRes.data.data);
    } catch {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  const onInvite = async (data) => {
    setActionLoading(true);
    try {
      await inviteMember(tenantId, { email: data.email, role: 'tenant_member' });
      showToast(`Invite sent to ${data.email}`);
      setShowModal(false);
      reset();
    } catch (err) {
      setError(err.response?.data?.message || 'Invite failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const onRemove = async () => {
    if (!removeTarget) return;
    setActionLoading(true);
    try {
      await removeMember(tenantId, removeTarget._id);
      showToast(`${removeTarget.name} removed.`);
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Remove failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const usedSeats  = members.length;
  const totalSeats = sub?.planVersion?.features?.seat_limit || sub?.seats?.total || 0;
  const seatPct    = seatUtilizationPct(usedSeats, totalSeats);

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
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <UserPlus size={16} /> Invite Member
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {toast && <div className="alert alert-success">{toast}</div>}

        {/* Seat Usage */}
        {totalSeats > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 500 }}>Seat Usage</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {usedSeats} / {totalSeats} seats used
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill${seatPct >= 90 ? ' danger' : seatPct >= 70 ? ' warning' : ''}`}
                style={{ width: `${seatPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto', borderTopColor: 'var(--color-primary)' }} />
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--color-primary), hsl(220,90%,60%))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0,
                        }}>
                          {m.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span style={{ fontWeight: 500 }}>{m.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{m.email}</td>
                    <td>
                      <span className={m.role === 'tenant_admin' ? 'badge badge-purple' : 'badge badge-neutral'}>
                        {m.role === 'tenant_admin' ? 'Admin' : 'Member'}
                      </span>
                    </td>
                    <td>
                      <span className={m.isActive !== false ? 'badge badge-success' : 'badge badge-neutral'}>
                        {m.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                      {m.lastLoginAt ? formatDate(m.lastLoginAt) : 'Never'}
                    </td>
                    <td>
                      {m._id !== user?.id && m.role !== 'tenant_admin' ? (
                        <button
                          className="btn-ghost btn-sm"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => setRemoveTarget(m)}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-subtle)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Invite Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Invite Team Member</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                They will receive an email invitation to join your workspace.
              </p>
              <form onSubmit={handleSubmit(onInvite)}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
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
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)} disabled={actionLoading}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={actionLoading}>
                    {actionLoading ? <span className="btn-spinner" /> : <><UserPlus size={15} /> Send Invite</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Remove Confirmation Modal */}
        {removeTarget && (
          <div className="modal-overlay" onClick={() => setRemoveTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Remove {removeTarget.name}?</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
                They will immediately lose access to this workspace.
              </p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setRemoveTarget(null)} disabled={actionLoading}>Cancel</button>
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
