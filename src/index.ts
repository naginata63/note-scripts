import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { NoteClient } from './note-client.js';
import { getTools, handleTool } from './tools.js';

const server = new Server(
  { name: 'note-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } }
);
const client = new NoteClient();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getTools()
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return await handleTool(request.params.name, request.params.arguments ?? {}, client);
});

const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
})();
