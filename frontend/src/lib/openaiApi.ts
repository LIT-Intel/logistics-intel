// OpenAI API helper
// This file provides a wrapper around the OpenAI Chat Completions API. It
// generates an AI brief for the selected company using the provided API
// key. In production, calls should be proxied through a backend to avoid
// exposing secret keys on the client.

const OPENAI_API_KEY = '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';

/**
 * Generate a company brief using OpenAI's Chat Completions API. This helper
 * accepts a payload describing the company and returns the model's
 * summarized output. You can adjust the prompt and model parameters as
 * needed. The API key must have appropriate permissions to call GPT-4.
 *
 * @param companySummary A textual summary of the company (name, industry, trade routes, KPIs).
 */
export async function generateCompanyBrief(companySummary: string): Promise<string> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a freight intelligence assistant. Generate a concise but informative brief summarizing key shipment and market metrics, financial status and potential risks for the given company. Highlight unusual trends and actionable insights.',
          },
          {
            role: 'user',
            content: companySummary,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }
    const data = await response.json();
    const message = data.choices?.[0]?.message?.content;
    return message || '';
  } catch (error) {
    console.error('Error generating company brief via OpenAI:', error);
    return '';
  }
}
