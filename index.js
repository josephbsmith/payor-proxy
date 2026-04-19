import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

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
