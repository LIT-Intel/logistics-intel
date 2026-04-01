// Lusha API helper functions
// These functions encapsulate calls to the Lusha REST API. They are used to
// enrich company and contact data inside the Command Center. The API key is
// provided by the user. In a production environment, sensitive keys should
// not be stored in the frontend; they should be proxied via a backend.

const LUSHA_API_KEY = '84e6a96a-822c-4621-b1d0-8caaaf55c23e';
const LUSHA_BASE_URL_V2 = 'https://api.lusha.com/v2';
const LUSHA_BASE_URL_V3 = 'https://api.lusha.com/v3';

// Helper function to perform GET requests with the API key header
async function lushaFetch(path: string, params: Record<string, any> = {}): Promise<any> {
  const url = new URL(path, path.startsWith('http') ? '' : LUSHA_BASE_URL_V2);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) {
      url.searchParams.append(key, String(value));
    }
  });
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': LUSHA_API_KEY,
    },
  });
  if (!response.ok) {
    throw new Error(`Lusha request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Search for contacts associated with a company. This uses Lusha's person
 * search and enrichment capabilities. The API is flexible; we pass the
 * company name as a query parameter. Returns a list of contacts.
 *
 * @param companyName The company name to search for.
 */
export async function searchCompanyContacts(companyName: string): Promise<any[]> {
  if (!companyName) return [];
  try {
    // According to Lusha documentation, the contact search endpoint is
    // `/person` with appropriate query parameters. We use the company
    // name as the search term. Adjust parameters if documentation changes.
    const result = await lushaFetch(`${LUSHA_BASE_URL_V2}/person`, {
      companyName,
      // Additional filtering options can be added here, e.g. countryCode, title, etc.
    });
    // Many endpoints return an array under `results` or `contacts`.
    if (Array.isArray(result)) {
      return result;
    }
    if (Array.isArray(result?.contacts)) {
      return result.contacts;
    }
    if (Array.isArray(result?.results)) {
      return result.results;
    }
    return [];
  } catch (error) {
    console.error('Error fetching company contacts from Lusha:', error);
    return [];
  }
}

/**
 * Fetch companies similar to the provided company name. Uses the Lusha
 * lookalikes endpoint (v3). Returns a list of companies with at least
 * basic identifying information.
 *
 * @param companyName The company name to find similar companies for.
 */
export async function getCompanyLookalikes(companyName: string): Promise<any[]> {
  if (!companyName) return [];
  try {
    // According to Lusha docs, company lookalikes are fetched via POST /v3/lookalike/companies.
    // We send the companyName in the request body. The response may contain a list of
    // companies or lookalikes. Adjust the parsing logic as needed.
    const response = await fetch(`${LUSHA_BASE_URL_V3}/lookalike/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: LUSHA_API_KEY,
      },
      body: JSON.stringify({ companyName }),
    });
    if (!response.ok) {
      throw new Error(`Lusha company lookalikes request failed: ${response.status}`);
    }
    const result = await response.json();
    if (Array.isArray(result)) {
      return result;
    }
    if (Array.isArray(result?.companies)) {
      return result.companies;
    }
    if (Array.isArray(result?.lookalikes)) {
      return result.lookalikes;
    }
    return [];
  } catch (error) {
    console.error('Error fetching similar companies from Lusha:', error);
    return [];
  }
}

// Additional helper functions (e.g. getContactSignals, getCompanySignals) can be added here
// when needed to expose more Lusha capabilities such as signals and enrichment.
