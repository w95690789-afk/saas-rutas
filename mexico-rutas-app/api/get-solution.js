export default async function handler(req, res) {
  const { taskId } = req.query;
  
  // Lógica blindada: Si la env var es nula, vacía o sospechosamente corta, usamos el fallback
  let apiKey = process.env.VITE_HERE_API_KEY;
  const fallbackKey = 'ImdD2y0EQeeOzX6Gd046as7iFAP82Y8lAFcimMnGNRg';
  
  if (!apiKey || apiKey.trim().length < 5 || apiKey === 'undefined') {
    apiKey = fallbackKey;
  }
  
  if (!taskId) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  const url = `https://tourplanning.hereapi.com/v3/problems/async/${taskId}/solution?apiKey=${apiKey}`;

  console.log(`[Proxy] Fetching solution for taskId: ${taskId}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Vercel Proxy)'
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[Proxy] HERE API Error: ${response.status}`, data);
      return res.status(response.status).json({ 
        error: `HERE API returned ${response.status}`,
        message: response.status === 404 ? 'Resource not found. Check if the taskId belongs to the providing apiKey.' : 'External API Error',
        details: data,
        proxySource: 'Vercel-Proxy-V2'
      });
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Proxy] Critical Error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
