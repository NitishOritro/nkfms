import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Users, UserCheck, Plus, Trash2 } from 'lucide-react';

export function CollectorSignatoryView() {
  const { data, updateCollectors, updateSignatories, addToast } = useData();
  const { isReadOnly } = useAuth();

  const [collectors, setCollectors] = useState(data.settings.collectors || []);
  const [signatories, setSignatories] = useState(data.settings.signatories || []);

  const [newCollector, setNewCollector] = useState({ honorific: 'জনাব', bn: '', en: '' });
  const [newSignatory, setNewSignatory] = useState({ name: '', designation: '' });

  const handleAddCollector = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!newCollector.bn.trim()) return;

    const newId = 'c' + Date.now().toString(36);
    const updated = [
      ...collectors,
      {
        id: newId,
        honorific: newCollector.honorific.trim(),
        bn: newCollector.bn.trim(),
        en: newCollector.en.trim()
      }
    ];
    setCollectors(updated);
    updateCollectors(updated);
    setNewCollector({ honorific: 'জনাব', bn: '', en: '' });
    addToast('নতুন আদায়কারী সফলভাবে যোগ করা হয়েছে।');
  };

  // সম্বোধন বদলানো — রিপোর্টে "জনাব/মিসেস ... কর্তৃক আদায়" এভাবে বসে
  const handleHonorific = (id, honorific) => {
    if (isReadOnly) return;
    const updated = collectors.map((c) => (c.id === id ? { ...c, honorific } : c));
    setCollectors(updated);
    updateCollectors(updated);
  };

  const handleDeleteCollector = (id) => {
    if (isReadOnly) return;
    if (collectors.length <= 1) {
      addToast('কমপক্ষে একজন আদায়কারী থাকতে হবে।', 'error');
      return;
    }
    const updated = collectors.filter((c) => c.id !== id);
    setCollectors(updated);
    updateCollectors(updated);
  };

  const handleAddSignatory = (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!newSignatory.name.trim()) return;

    const newId = 'sig' + Date.now().toString(36);
    const updated = [...signatories, { id: newId, name: newSignatory.name.trim(), designation: newSignatory.designation.trim() }];
    setSignatories(updated);
    updateSignatories(updated);
    setNewSignatory({ name: '', designation: '' });
    addToast('নতুন স্বাক্ষরকারী সফলভাবে যোগ করা হয়েছে।');
  };

  const handleDeleteSignatory = (id) => {
    if (isReadOnly) return;
    const updated = signatories.filter((s) => s.id !== id);
    setSignatories(updated);
    updateSignatories(updated);
  };

  return (
    <div className="page-body">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Collectors Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Users size={18} color="var(--primary)" />
              <span>টাকা আদায়কারীদের তালিকা (Collectors)</span>
            </div>
          </div>
          <div className="card-body">
            {!isReadOnly && (
              <form onSubmit={handleAddCollector} style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                <select
                  className="form-input"
                  value={newCollector.honorific}
                  onChange={(e) => setNewCollector({ ...newCollector, honorific: e.target.value })}
                  aria-label="সম্বোধন"
                  style={{ flexShrink: 0, width: '104px' }}
                >
                  <option value="জনাব">জনাব</option>
                  <option value="মিসেস">মিসেস</option>
                  <option value="">(কিছু নয়)</option>
                </select>
                <input
                  type="text"
                  className="form-input"
                  placeholder="বাংলা নাম (যেমন: সীমা চন্দ)"
                  value={newCollector.bn}
                  onChange={(e) => setNewCollector({ ...newCollector, bn: e.target.value })}
                  required
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="ইংরেজি নাম (Sima Chanda)"
                  value={newCollector.en}
                  onChange={(e) => setNewCollector({ ...newCollector, en: e.target.value })}
                />
                <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>
                  <Plus size={16} />
                  <span>যোগ করুন</span>
                </button>
              </form>
            )}

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '96px' }}>সম্বোধন</th>
                    <th>বাংলা নাম</th>
                    <th>ইংরেজি নাম</th>
                    {!isReadOnly && <th style={{ width: '60px', textAlign: 'center' }}>মুছুন</th>}
                  </tr>
                </thead>
                <tbody>
                  {collectors.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {isReadOnly ? (
                          <span style={{ color: '#64748b' }}>{c.honorific || '—'}</span>
                        ) : (
                          <select
                            className="form-input"
                            value={c.honorific || ''}
                            onChange={(e) => handleHonorific(c.id, e.target.value)}
                            aria-label={`${c.bn} এর সম্বোধন`}
                            style={{ padding: '4px 6px', fontSize: '11.5px' }}
                          >
                            <option value="জনাব">জনাব</option>
                            <option value="মিসেস">মিসেস</option>
                            <option value="">(কিছু নয়)</option>
                          </select>
                        )}
                      </td>
                      <td><b>{c.bn}</b></td>
                      <td style={{ color: '#64748b' }}>{c.en || '—'}</td>
                      {!isReadOnly && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteCollector(c.id)}
                            className="btn btn-icon"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Signatories Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <UserCheck size={18} color="var(--success)" />
              <span>বর্তমান কমিটি'র সদস্যবৃন্দ</span>
            </div>
          </div>
          <div className="card-body">
            {!isReadOnly && (
              <form onSubmit={handleAddSignatory} style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="সদস্যের নাম"
                  value={newSignatory.name}
                  onChange={(e) => setNewSignatory({ ...newSignatory, name: e.target.value })}
                  required
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="পদবী (যেমন: সদস্য সচিব)"
                  value={newSignatory.designation}
                  onChange={(e) => setNewSignatory({ ...newSignatory, designation: e.target.value })}
                  required
                />
                <button type="submit" className="btn btn-success" style={{ flexShrink: 0 }}>
                  <Plus size={16} />
                  <span>যোগ করুন</span>
                </button>
              </form>
            )}

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>নাম</th>
                    <th>পদবী</th>
                    {!isReadOnly && <th style={{ width: '60px', textAlign: 'center' }}>মুছুন</th>}
                  </tr>
                </thead>
                <tbody>
                  {signatories.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b></td>
                      <td><span className="pill ok">{s.designation}</span></td>
                      {!isReadOnly && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteSignatory(s.id)}
                            className="btn btn-icon"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
