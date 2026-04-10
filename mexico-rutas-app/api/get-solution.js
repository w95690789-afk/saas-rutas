export default async function handler(req, res) {
  const { taskId } = req.query;
  const apiKey = process.env.VITE_HERE_API_KEY;

  if (!taskId) {
    return res.status(400).json({ error: 'taskId is required' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'HERE API Key is not configured' });
  }

  const url = `https://tourplanning.hereapi.com/v3/problems/async/${taskId}/solution?apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: `HERE API returned ${response.status}`,
        details: errorData
      });
    }
    const data = await response.json();
    
    // Add CORS headers just in case Vercel doesn't handle them automatically for same-origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
