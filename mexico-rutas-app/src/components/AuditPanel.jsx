import React, { useState } from 'react';
import { Code, Download, Copy, Check, FileJson } from 'lucide-react';

const AuditPanel = ({ problem, solution, onClose }) => {
  const [activeTab, setActiveTab] = useState('problem');
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(JSON.stringify(text, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    link.click();
  };

  const currentContent = activeTab === 'problem' ? problem : solution;

  return (
    <div className="audit-overlay">
      <div className="audit-modal">
        <header className="audit-header">
          <div className="audit-title-group">
            <div className="audit-icon-box"><FileJson size={20} /></div>
            <div>
              <h3>Auditoría de Protocolo HERE</h3>
              <p>Validación de esquemas y respuestas v3.1</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </header>

        <div className="audit-tabs">
          <button 
            className={`audit-tab ${activeTab === 'problem' ? 'active' : ''}`}
            onClick={() => setActiveTab('problem')}
          >
            Problema (Request JSON)
          </button>
          <button 
            className={`audit-tab ${activeTab === 'solution' ? 'active' : ''}`}
            onClick={() => setActiveTab('solution')}
          >
            Solución (Response JSON)
          </button>
        </div>

        <div className="audit-toolbar">
          <button onClick={() => copyToClipboard(currentContent)} disabled={!currentContent}>
            {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
            <span>{copied ? 'Copiado' : 'Copiar JSON'}</span>
          </button>
          <button onClick={() => downloadJSON(currentContent, activeTab)} disabled={!currentContent}>
            <Download size={16} />
            <span>Descargar</span>
          </button>
        </div>

        <div className="code-container">
          {currentContent ? (
            <pre className="code-block">
              {JSON.stringify(currentContent, null, 2)}
            </pre>
          ) : (
            <div className="empty-audit">
              <Code size={48} opacity={0.2} />
              <p>No hay datos registrados para esta sesión.</p>
              <span>Ejecute una optimización para capturar el tráfico.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditPanel;
