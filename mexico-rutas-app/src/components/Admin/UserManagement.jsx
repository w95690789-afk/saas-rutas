import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Users, Shield, ShieldOff, Search, ToggleRight, ToggleLeft } from 'lucide-react';

const UserManagement = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
      alert("Hubo un error cargando los usuarios. Asegúrate de tener rol de Admin.");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (id, currentStatus) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
      
      // Actualizar estado local
      setProfiles(profiles.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    } catch (err) {
      console.error("Error al actualizar estado:", err);
      alert("Error al actualizar el usuario.");
    }
  };

  const toggleUserRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'logistic_analyst' : 'admin';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);
        
      if (error) throw error;
      
      // Actualizar estado local
      setProfiles(profiles.map(p => p.id === id ? { ...p, role: newRole } : p));
    } catch (err) {
      console.error("Error al actualizar rol:", err);
      alert("Error al actualizar el rol del usuario.");
    }
  };

  const filteredProfiles = profiles.filter(p => 
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Users size={28} color="var(--primary-electric)" />
            Administración de Usuarios
          </h2>
          <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>Control de accesos y roles del sistema (SaaS Rutas)</p>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '12px', padding: '0 16px', border: '1px solid #e2e8f0' }}>
          <Search size={18} color="#94a3b8" />
          <input 
            type="text" 
            placeholder="Buscar por correo electrónico..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              border: 'none', background: 'transparent', padding: '14px', width: '100%', outline: 'none', fontSize: '0.95rem'
            }}
          />
        </div>
      </div>

      <div className="glass-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}><div className="loader-dots"></div></div>
        ) : (
          <div className="industrial-table-wrapper">
            <table className="industrial-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '16px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontWeight: 700 }}>USUARIO</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontWeight: 700 }}>ROL</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontWeight: 700 }}>FECHA REGISTRO</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontWeight: 700 }}>ESTADO ACCESO</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontWeight: 700 }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map(profile => (
                  <tr key={profile.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', ':hover': { background: '#f8fafc' } }}>
                    <td style={{ padding: '16px', fontWeight: 600, color: '#0f172a' }}>{profile.email}</td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
                        background: profile.role === 'admin' ? '#e0e7ff' : '#f1f5f9',
                        color: profile.role === 'admin' ? '#4338ca' : '#64748b'
                      }}>
                        {profile.role === 'admin' ? <Shield size={14} /> : <ShieldOff size={14} />}
                        {profile.role === 'admin' ? 'Admin' : 'Logístico'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: '#64748b', fontSize: '0.9rem' }}>
                      {new Date(profile.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ 
                        display: 'inline-block', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800,
                        background: profile.is_active ? '#dcfce7' : '#fee2e2',
                        color: profile.is_active ? '#166534' : '#991b1b'
                      }}>
                        {profile.is_active ? 'ACTIVO' : 'SUSPENDIDO'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', display: 'flex', gap: '12px' }}>
                      <button 
                        onClick={() => toggleUserStatus(profile.id, profile.is_active)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: profile.is_active ? '#dc2626' : '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}
                        title={profile.is_active ? "Desactivar acceso" : "Activar acceso"}
                      >
                        {profile.is_active ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
                        {profile.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      
                      <button 
                        onClick={() => toggleUserRole(profile.id, profile.role)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#4338ca', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        Cambiar Rol
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProfiles.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                      No se encontraron usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
