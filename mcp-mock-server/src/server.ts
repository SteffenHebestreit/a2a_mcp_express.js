import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const tools = [
  {
    name: 'mcp_calculator',
    description: 'A fake calculator tool',
    schema: { type: 'object', properties: { expression: { type: 'string' } } }
  },
  {
    name: 'mcp_weather',
    description: 'A fake weather tool',
    schema: { type: 'object', properties: { location: { type: 'string' } } }
  }
];

app.get('/mcp/tools', (req, res) => {
  res.json(tools.map(t => t.name));
});

app.get('/mcp/tool/:name', (req, res) => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  res.json(tool);
});

app.post('/mcp/tool/:name', (req, res) => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  // Return a fake result
  res.json({ result: `Fake result for ${tool.name}` });
});

app.post("/mcp", (req, res) => {
  let id = req.body && (typeof req.body.id === "string" || typeof req.body.id === "number")
    ? req.body.id
    : "mock-id";
  res.json({
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: "Mock MCP Server",
        version: "1.0.0"
      }
    }
  });
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`MCP mock server running on port ${PORT}`);
});