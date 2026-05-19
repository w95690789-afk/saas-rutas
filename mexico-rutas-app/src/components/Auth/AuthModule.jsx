import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Mail, Lock, LogIn, UserPlus, AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';

const AuthModule = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Por favor, ingresa tu correo electrónico para recuperar tu contraseña.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setMessage("Se han enviado las instrucciones de recuperación a tu correo electrónico.");
    } catch (error) {
      let errorMsg = error.message;
      if (errorMsg.includes('User not found')) errorMsg = 'No encontramos una cuenta con este correo.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          // Evitamos que requiera confirmación de email temporalmente en desarrollo local
          options: { data: { role: 'logistic_analyst' } }
        });
        if (error) throw error;
        setMessage("¡Registro exitoso! Ya puedes iniciar sesión con tu nueva cuenta.");
        setIsLogin(true);
      }
    } catch (error) {
      // Traducir algunos errores comunes de Supabase al español
      let errorMsg = error.message;
      if (errorMsg.includes('Invalid login credentials')) errorMsg = 'Correo o contraseña incorrectos.';
      if (errorMsg.includes('User already registered')) errorMsg = 'Este correo ya está registrado.';
      if (errorMsg.includes('Password should be at least 6 characters')) errorMsg = 'La contraseña debe tener al menos 6 caracteres.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #031636 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decoración superior */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'var(--primary-electric)' }}></div>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ 
            width: '60px', height: '60px', borderRadius: '16px', background: 'rgba(0,88,190,0.1)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            color: 'var(--primary-electric)'
          }}>
            {isResetMode ? <KeyRound size={32} /> : (isLogin ? <LogIn size={32} /> : <UserPlus size={32} />)}
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            {isResetMode ? 'Recuperar Contraseña' : (isLogin ? 'Acceso Corporativo' : 'Crear Cuenta')}
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '8px' }}>
            SaaS Rutas - Plataforma de Inteligencia Logística
          </p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={isResetMode ? handleResetPassword : handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>CORREO EMPRESARIAL</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="email" 
                required
                placeholder="analista@logistica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', border: '2px solid #e2e8f0',
                  fontSize: '0.95rem', transition: 'border-color 0.2s', outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          {!isResetMode && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', margin: 0 }}>CONTRASEÑA</label>
                {isLogin && (
                  <button 
                    type="button" 
                    onClick={() => { setIsResetMode(true); setError(null); setMessage(null); }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-electric)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '14px 44px 14px 44px', borderRadius: '12px', border: '2px solid #e2e8f0',
                    fontSize: '0.95rem', transition: 'border-color 0.2s', outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--primary-electric)'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ 
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{
              background: 'var(--primary-electric)', color: 'white', padding: '16px', borderRadius: '12px',
              border: 'none', fontSize: '1rem', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '10px', boxShadow: '0 10px 25px -5px rgba(0, 88, 190, 0.4)', transition: 'transform 0.2s, box-shadow 0.2s',
              opacity: loading ? 0.7 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'
            }}
          >
            {loading ? <div className="loader-dots"></div> : (isResetMode ? 'Enviar Instrucciones' : (isLogin ? 'Iniciar Sesión' : 'Registrar Cuenta'))}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #f1f5f9' }}>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            {isResetMode ? "¿Recordaste tu contraseña?" : (isLogin ? "¿No tienes una cuenta?" : "¿Ya tienes una cuenta?")}
            <button 
              onClick={() => { 
                if (isResetMode) {
                  setIsResetMode(false);
                  setIsLogin(true);
                } else {
                  setIsLogin(!isLogin); 
                }
                setError(null); 
                setMessage(null); 
              }}
              style={{
                background: 'none', border: 'none', color: 'var(--primary-electric)', fontWeight: 800,
                cursor: 'pointer', marginLeft: '6px', fontSize: '0.85rem'
              }}
            >
              {isResetMode ? "Vuelve a Iniciar Sesión" : (isLogin ? "Regístrate aquí" : "Inicia Sesión")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthModule;
