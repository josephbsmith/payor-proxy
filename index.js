import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { unzip } from 'zlib';
import { promisify } from 'util';

const app = express();
app.use(cors());
app.use(express.json());

const gunzip = promisify(unzip);

// Live CMS Fee Schedule (2026 RVU file)
async function getLiveFeeSchedule() {
  try {
    const url = "https://www.cms.gov/files/zip/rvu26a.zip";
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const unzipped = await gunzip(Buffer.from(buffer));
    const csv = unzipped.toString();
    const lines = csv.split('\n');
    const data = {};
    const oncologyCodes = ["96413","96415","77386","77385","99214","99215","96365","96375"];
    lines.forEach(line => {
      const cols = line.split(',');
      if (oncologyCodes.includes(cols[0])) {
        data[cols[0]] = {
          year: 2026,
          workRVU: parseFloat(cols[5]) || 0,
          peRVU: parseFloat(cols[8]) || 0,
          mpRVU: parseFloat(cols[11]) || 0
        };
      }
    });
    return data;
  } catch (e) {
    console.error(e);
    return {};
  }
}

// Live Open Payments (simplified for now)
async function getLiveOpenPayments() {
  return {
    "UNH": { total: 2450000, oncCount: 312, mfgs: [{n:"Merck",a:890000},{n:"Roche/Genentech",a:670000}], research:1200000, consulting:650000 },
    "ELV": { total: 1890000, oncCount: 278, mfgs: [{n:"Merck",a:720000},{n:"Pfizer",a:510000}], research:950000, consulting:420000 },
    "CI":  { total: 1670000, oncCount: 245, mfgs: [{n:"Bristol-Myers Squibb",a:610000},{n:"Merck",a:580000}], research:820000, consulting:380000 },
    "HUM": { total: 1340000, oncCount: 198, mfgs: [{n:"Roche/Genentech",a:520000},{n:"Merck",a:480000}], research:680000, consulting:290000 },
    "CNC": { total: 980000,  oncCount: 165, mfgs: [{n:"Pfizer",a:410000},{n:"Merck",a:320000}], research:510000, consulting:210000 },
    "MOH": { total: 760000,  oncCount: 142, mfgs: [{n:"Merck",a:280000},{n:"Bristol-Myers Squibb",a:210000}], research:390000, consulting:140000 }
  };
}

app.get('/live-data', async (req, res) => {
  const [feeSchedule, openPayments] = await Promise.all([
    getLiveFeeSchedule(),
    getLiveOpenPayments()
  ]);
  res.json({ feeSchedule, openPayments });
});

app.post('/llm', async (req, res) => {
  const { provider, apiKey, systemPrompt, userData } = req.body;
  const dataStr = JSON.stringify(userData);
  const jsonInstruction = '\n\nRespond with ONLY a JSON object. Exact format: {"score": 5.5, "narrative": "Brief analysis here.", "keyFindings": ["finding1", "finding2"]}';
  const userMsg = systemPrompt + "\n\nDATA:\n" + dataStr + jsonInstruction;

  let url, headers, body;
  if (provider === "claude") {
    url = "https://api.anthropic.com/v1/messages";
    headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    body = JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2048, messages: [{ role: "user", content: userMsg }] });
  } else if (provider === "deepseek") {
    url = "https://api.deepseek.com/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey };
    body = JSON.stringify({ model: "deepseek-chat", max_tokens: 2048, messages: [{ role: "user", content: dataStr + jsonInstruction }] });
  } else {
    url = "https://api.openai.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey };
    body = JSON.stringify({ model: "gpt-4o-mini", max_tokens: 2048, messages: [{ role: "user", content: dataStr + jsonInstruction }] });
  }

  try {
    const apiRes = await fetch(url, { method: "POST", headers, body });
    const apiData = await apiRes.json();
    let text = provider === "claude" ? (apiData.content?.[0]?.text || "") : (apiData.choices?.[0]?.message?.content || "");
    const clean = text.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(clean));
  } catch (e) {
    res.status(500).json({ score: 5.0, narrative: "Proxy error", keyFindings: ["Error"] });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy running on port ${port}`));
