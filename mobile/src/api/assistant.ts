/**
 * Branch Manager AI Assistant
 * Uses Claude API to understand natural language and take actions in the app
 * "Create a quote for Brian Heermance, two oak removals 24 inch DBH"
 * "What invoices are overdue?"
 * "Schedule a job for next Tuesday at 9am"
 */
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_STORAGE = 'bm-claude-api-key';

// ── Config ──

export async function getApiKey(): Promise<string | null> {
  return AsyncStorage.getItem(API_KEY_STORAGE);
}

export async function saveApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(API_KEY_STORAGE, key);
}

// ── Message Types ──

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: AssistantAction;
  timestamp: number;
}

export interface AssistantAction {
  type: 'create_quote' | 'create_job' | 'create_invoice' | 'lookup_client' |
        'list_overdue' | 'schedule_job' | 'search' | 'clock_in' | 'none';
  data?: any;
  status: 'pending' | 'done' | 'error';
}

// ── System Prompt ──

const SYSTEM_PROMPT = `You are Branch Manager Assistant for Second Nature Tree Service, a tree care company in Peekskill, NY.

You help the owner (Doug Brown) and crew manage their field service business. You can:

1. CREATE QUOTES — Parse job descriptions into line items with pricing:
   - Tree removal: $100 per inch of DBH (trunk diameter)
   - Tree pruning: $50-200 per tree depending on size
   - Stump grinding: $150 per stump
   - Bucket truck: $600/day, $300/half-day, $75/hr
   - Labor: $50/hr per crew member
   - Haul debris: $350 flat
   - Arborist letter: $250

2. LOOK UP CLIENTS — Search by name, address, or phone
3. CHECK INVOICES — Find overdue, unpaid, or specific invoices
4. SCHEDULE JOBS — Set up jobs with date, crew, and details
5. ANSWER QUESTIONS — About the business, pricing, or operations

When creating a quote, output a JSON block with this format:
\`\`\`json
{"action":"create_quote","client":"Client Name","property":"Address","items":[{"name":"Service","description":"Details","qty":1,"rate":100,"total":100}],"total":100}
\`\`\`

When looking up data, output:
\`\`\`json
{"action":"search","query":"search term","table":"clients|jobs|invoices|quotes"}
\`\`\`

When scheduling a job:
\`\`\`json
{"action":"schedule_job","client":"Name","date":"YYYY-MM-DD","time":"HH:MM","description":"Work description","crew":["Doug Brown"]}
\`\`\`

Keep responses concise and action-oriented. You're talking to a busy tree service owner in the field.`;

// ── Send Message to Claude ──

export async function sendMessage(
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ text: string; action?: AssistantAction }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('AI API key not configured. Go to Settings to add it.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parse any action JSON from the response
  const action = parseAction(text);

  return { text, action };
}

// ── Parse Action from Response ──

function parseAction(text: string): AssistantAction | undefined {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (!jsonMatch) return undefined;

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    switch (parsed.action) {
      case 'create_quote':
        return {
          type: 'create_quote',
          data: {
            client: parsed.client,
            property: parsed.property,
            items: parsed.items,
            total: parsed.total,
          },
          status: 'pending',
        };

      case 'search':
        return {
          type: 'search',
          data: { query: parsed.query, table: parsed.table },
          status: 'pending',
        };

      case 'schedule_job':
        return {
          type: 'schedule_job',
          data: {
            client: parsed.client,
            date: parsed.date,
            time: parsed.time,
            description: parsed.description,
            crew: parsed.crew,
          },
          status: 'pending',
        };

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

// ── Execute Actions ──

export async function executeAction(action: AssistantAction): Promise<string> {
  switch (action.type) {
    case 'create_quote': {
      const { client, property, items, total } = action.data;
      // Look up client
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', `%${client}%`)
        .limit(1);

      const clientId = clients?.[0]?.id || null;
      const clientName = clients?.[0]?.name || client;

      const { data: quote, error } = await supabase
        .from('quotes')
        .insert({
          client_id: clientId,
          client_name: clientName,
          property: property,
          description: items.map((i: any) => i.name).join(', '),
          line_items: items,
          total: total,
          status: 'draft',
        })
        .select()
        .single();

      if (error) return `Error creating quote: ${error.message}`;
      return `Quote #${quote.quote_number} created for ${clientName} — $${total.toFixed(2)}`;
    }

    case 'search': {
      const { query, table } = action.data;
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .or(`name.ilike.%${query}%,client_name.ilike.%${query}%`)
        .limit(5);

      if (error) return `Search error: ${error.message}`;
      if (!data?.length) return `No ${table} found matching "${query}"`;

      return data.map((r: any) =>
        `${r.name || r.client_name || ''} — ${r.status || ''} ${r.total ? '$' + r.total : ''}`
      ).join('\n');
    }

    case 'schedule_job': {
      const { client, date, time, description, crew } = action.data;
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, address')
        .ilike('name', `%${client}%`)
        .limit(1);

      const { data: job, error } = await supabase
        .from('jobs')
        .insert({
          client_id: clients?.[0]?.id || null,
          client_name: clients?.[0]?.name || client,
          property: clients?.[0]?.address || '',
          description,
          scheduled_date: date,
          start_time: time,
          crew: crew || ['Doug Brown'],
          status: 'scheduled',
        })
        .select()
        .single();

      if (error) return `Error scheduling job: ${error.message}`;
      return `Job #${job.job_number} scheduled for ${date} — ${description}`;
    }

    default:
      return 'Action not supported';
  }
}
