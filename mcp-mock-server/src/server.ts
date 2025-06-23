import express, { Request, Response } from 'express';
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

app.get('/mcp/tools', (req: Request, res: Response) => {
  res.json(tools.map(t => t.name));
});

app.get('/mcp/tool/:name', (req: Request, res: Response) => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  res.json(tool);
});

app.post('/mcp/tool/:name', (req: Request, res: Response) => {
  const tool = tools.find(t => t.name === req.params.name);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  // Return a fake result
  res.json({ result: `Fake result for ${tool.name}` });
});

app.post("/mcp", (req: Request, res: Response) => {
  let id = req.body && (typeof req.body.id === "string" || typeof req.body.id === "number")
    ? req.body.id
    : "mock-id";
    
  // Handle JSON-RPC method calls
  if (req.body && req.body.method) {
    const method = req.body.method;
    const params = req.body.params || {};
      console.log(`Received JSON-RPC method call: ${method}`, params);
      // Handle tool calls
    if (method === 'tools/call') {
      // Extract tool name and arguments
      const toolName = params.name;
      const toolArgs = params.arguments || {};
      
      console.log(`Tool call: ${toolName}`, toolArgs);
      const tool = tools.find(t => t.name === toolName);
      if (!tool) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool '${toolName}' not found` }
        });
      }
        // For calculator tool
      if (toolName === 'mcp_calculator' && toolArgs.expression) {
        try {
          // Simple eval for calculator (in a real system, you'd use a safer method)
          const result = String(eval(toolArgs.expression));
          return res.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: 'text', text: result }] }
          });
        } catch (error: any) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: `Error evaluating expression: ${error.message}` }
          });
        }
      }
      
      // For calculator tool without expression - return an error about missing parameter
      if (toolName === 'mcp_calculator' && !toolArgs.expression) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { 
            code: -32602, 
            message: "Missing required parameter 'expression' for calculator tool" 
          }
        });
      }
      
      // For other tools or fallback
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: 'text', text: `Fake result for ${toolName}` }] }
      });
    }
    
    // Handle initial connection handshake
    if (method === 'initialize') {
      return res.json({
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
    }
    
    // Handle list tools
    if (method === 'listTools') {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: tools.map(t => t.name)
      });
    }
    
    // Fallback for unimplemented methods
    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method '${method}' not implemented` }
    });
  }
  
  // Default response for non-method calls
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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9000;
app.listen(PORT, () => {
  console.log(`MCP mock server running on port ${PORT}`);
});