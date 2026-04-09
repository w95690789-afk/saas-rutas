
import fs from 'fs';

const HERE_API_KEY = "ImdD2y0EQeeOzX6Gd046as7iFAP82Y8lAFcimMnGNRg";
const requestPath = 'c:/Users/Familiatrabajo/OneDrive/Documentos/Saas Rutas/request.json';

async function testHereApi() {
  try {
    const problem = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    console.log("Testing HERE API with request.json...");
    
    const response = await fetch(
      `https://tourplanning.hereapi.com/v3/problems/async?apiKey=${HERE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(problem)
      }
    );

    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Request Error:", error.message);
  }
}

testHereApi();
